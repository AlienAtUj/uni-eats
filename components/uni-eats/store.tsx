'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import { campuses, restaurants, type Restaurant } from '@/lib/data'
import {
  type DeliveryLocation,
  SERVICE_DELIVERY_RADIUS_KM,
  reverseGeocodeCoords,
  calculateDistanceKm,
  resolveStoreCoords,
  geocodeStoreAddress,
  calculateDeliveryFee,
  calculateDeliveryTime,
} from '@/lib/location'
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { fetchUserRole, type UserRole } from '@/lib/firebase-auth'

import {
  useFirebaseRestaurants,
  createOrder,
  getCustomerOrders,
  type Order,
} from '@/lib/firebase-db'

const SERVICE_FEE = 0.99

export type Screen =
  | 'home'
  | 'restaurant'
  | 'shop-category'
  | 'cart'
  | 'checkout'
  | 'tracking'
  | 'profile'

export type CartLine = {
  lineId: string
  itemId: string
  name: string
  image: string
  quantity: number
  unitPrice: number
  modifierLabels: string[]
  restaurantId: string
  restaurantName: string
}

export type HomeMode = 'eat' | 'shop'

type Store = {
  screen: Screen
  homeMode: HomeMode
  setHomeMode: (m: HomeMode) => void
  userLocation: DeliveryLocation | null
  setUserLocation: (loc: DeliveryLocation | null) => void
  recentLocations: DeliveryLocation[]
  isLocatingGps: boolean
  locationError: string | null
  detectUserLocation: () => Promise<DeliveryLocation | null>
  getStoreDistanceKm: (store: Restaurant) => number
  getStoreDeliveryFee: (store: Restaurant) => string
  getStoreDeliveryTime: (store: Restaurant) => string
  isStoreInRange: (store: Restaurant) => boolean
  campusId: string
  setCampus: (id: string) => void
  customLocationLabel: string | null
  setCustomLocation: (label: string | null) => void
  activeRestaurant: Restaurant | null
  openRestaurant: (id: string) => void
  goHome: () => void
  activeDepartmentId: string | null
  openDepartment: (id: string) => void
  goToScreen: (s: Screen) => void
  cart: CartLine[]
  addLine: (line: Omit<CartLine, 'lineId'>) => void
  updateQty: (lineId: string, delta: number) => void
  clearCart: () => void
  subtotal: number
  itemCount: number
  pickupTime: string
  setPickupTime: (t: string) => void
  paymentMethod: string
  setPaymentMethod: (p: string) => void
  placedOrder: PlacedOrder | null
  placeOrder: (paymentMeta?: {
    paymentReference?: string
    paymentStatus?: 'paid' | 'pending' | 'cash_on_pickup'
    paymentChannel?: string
    verifiedTotalZar?: number
  }) => Promise<void>
  // Auth state
  user: User | null
  userRole: UserRole | null
  isAuthLoading: boolean
  reloadUserRole: () => Promise<void>
  signOut: () => Promise<void>
}

export type PlacedOrder = {
  id: string
  firestoreId?: string
  lines: CartLine[]
  total: number
  restaurantName: string
  pickupTime: string
  campusName: string
  status?: string
  paymentReference?: string
  paymentStatus?: 'paid' | 'pending' | 'cash_on_pickup'
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [homeMode, setHomeMode] = useState<HomeMode>('eat')
  const [campusId, setCampusId] = useState(campuses[0].id)
  const [customLocationLabel, setCustomLocationLabel] = useState<string | null>(null)
  const [userLocation, setUserLocationState] = useState<DeliveryLocation | null>(null)
  const [recentLocations, setRecentLocations] = useState<DeliveryLocation[]>([])
  const [isLocatingGps, setIsLocatingGps] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [pickupTime, setPickupTime] = useState('As soon as possible')
  const [paymentMethod, setPaymentMethod] = useState('Paystack (Card / EFT / SnapScan)')
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)

  const saveRecentLocation = (loc: DeliveryLocation) => {
    setRecentLocations((prev) => {
      const filtered = prev.filter((item) => item.label.toLowerCase() !== loc.label.toLowerCase())
      const next = [loc, ...filtered].slice(0, 5)
      try {
        localStorage.setItem('dash_recent_locations', JSON.stringify(next))
      } catch (_e) {}
      return next
    })
  }

  const setUserLocation = (loc: DeliveryLocation | null) => {
    setUserLocationState(loc)
    setLocationError(null)
    setCustomLocationLabel(loc ? loc.label : null)
    try {
      if (loc) {
        localStorage.setItem('dash_live_location', JSON.stringify(loc))
        saveRecentLocation(loc)
      } else {
        localStorage.removeItem('dash_live_location')
      }
    } catch (_e) {}
  }

  const detectUserLocation = async (): Promise<DeliveryLocation | null> => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocationError('Geolocation is not supported by your browser. Please search and select your delivery address.')
      setIsLocatingGps(false)
      return null
    }
    setIsLocatingGps(true)
    setLocationError(null)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords
            const resolved = await reverseGeocodeCoords(latitude, longitude)
            setUserLocation(resolved)
            resolve(resolved)
          } catch (err) {
            console.warn('Geolocation reverse geocode failed:', err)
            setLocationError('Could not resolve your street address. Please search and enter your address.')
            resolve(null)
          } finally {
            setIsLocatingGps(false)
          }
        },
        (err) => {
          console.warn('Geolocation permission or lookup error:', err?.message || err)
          setLocationError('Location access was denied or unavailable. Please enter your delivery address to see stores near you.')
          setIsLocatingGps(false)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  // Hydrate cart, active order, and real-time location on mount
  useEffect(() => {
    try {
      // Remove any legacy fake fallback keys
      localStorage.removeItem('dash_delivery_location')
      localStorage.removeItem('dash_selected_radius')

      const savedRecents = localStorage.getItem('dash_recent_locations')
      if (savedRecents) {
        const parsedRecents = JSON.parse(savedRecents)
        if (Array.isArray(parsedRecents)) {
          setRecentLocations(
            parsedRecents.filter(
              (r: any) => r && r.coords && Number.isFinite(r.coords.lat) && Number.isFinite(r.coords.lng)
            )
          )
        }
      }

      const savedLoc = localStorage.getItem('dash_live_location')
      if (savedLoc) {
        const parsed = JSON.parse(savedLoc)
        if (parsed && parsed.coords && Number.isFinite(parsed.coords.lat) && Number.isFinite(parsed.coords.lng)) {
          setUserLocationState(parsed)
          setCustomLocationLabel(parsed.label)
          setIsLocatingGps(false)
        } else {
          detectUserLocation()
        }
      } else {
        detectUserLocation()
      }

      const savedCart = localStorage.getItem('unieats_cart')
      if (savedCart) {
        const parsed = JSON.parse(savedCart)
        if (Array.isArray(parsed)) {
          const validLines = parsed
            .filter(
              (l: any) =>
                l &&
                typeof l.itemId === 'string' &&
                typeof l.restaurantId === 'string' &&
                Number.isFinite(Number(l.unitPrice)) &&
                Number(l.unitPrice) > 0 &&
                Number.isInteger(Number(l.quantity)) &&
                Number(l.quantity) > 0
            )
            .map((l: any) => ({
              ...l,
              image:
                typeof l.image === 'string' && l.image.trim()
                  ? l.image.trim()
                  : '/food/featured-burger.jpg',
              unitPrice: Number(l.unitPrice),
              quantity: Math.min(99, Number(l.quantity)),
              modifierLabels: Array.isArray(l.modifierLabels) ? l.modifierLabels : [],
            }))
          // Ensure cart only contains items from a single restaurant
          if (validLines.length > 0) {
            const primaryRestId = validLines[0].restaurantId
            setCart(validLines.filter((l: CartLine) => l.restaurantId === primaryRestId))
          }
        }
      }
      const savedOrder = localStorage.getItem('unieats_active_order')
      if (savedOrder) {
        setPlacedOrder(JSON.parse(savedOrder))
      }
      const savedScreen = sessionStorage.getItem('unieats_screen') as Screen
      const savedDept = sessionStorage.getItem('dash_department')
      const savedMode = sessionStorage.getItem('dash_home_mode') as HomeMode | null
      if (savedMode === 'eat' || savedMode === 'shop') {
        setHomeMode(savedMode)
      }
      if (savedScreen === 'shop-category') {
        if (savedDept) {
          setActiveDepartmentId(savedDept)
          setScreen(savedScreen)
        }
      } else if (savedScreen) {
        setScreen(savedScreen)
      }
    } catch (e) {
      console.warn('Storage hydration notice:', e)
    }
  }, [])

  // Persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('unieats_cart', JSON.stringify(cart))
    } catch (e) {
      console.warn('Failed to persist cart:', e)
    }
  }, [cart])

  // Persist placedOrder to localStorage whenever it changes
  useEffect(() => {
    try {
      if (placedOrder) {
        localStorage.setItem('unieats_active_order', JSON.stringify(placedOrder))
      } else {
        localStorage.removeItem('unieats_active_order')
      }
    } catch (e) {
      console.warn('Failed to persist placedOrder:', e)
    }
  }, [placedOrder])

  const handleSetScreen = (newScreen: Screen) => {
    setScreen(newScreen)
    try {
      sessionStorage.setItem('unieats_screen', newScreen)
    } catch (_e) {
      // Ignore storage errors
    }
  }

  const { restaurants: liveRestaurants } = useFirebaseRestaurants()
  const currentRestaurants: Restaurant[] =
    liveRestaurants && liveRestaurants.length > 0 ? liveRestaurants : restaurants

  // Auth state
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  const reloadUserRole = async () => {
    if (auth.currentUser) {
      const role = await fetchUserRole(auth.currentUser.uid)
      setUserRole(role)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        const role = await fetchUserRole(currentUser.uid)
        setUserRole(role)

        // Restore active or most recent order from Firestore
        try {
          const liveOrders = await getCustomerOrders(currentUser.uid)
          if (liveOrders && liveOrders.length > 0) {
            const activeOrder =
              liveOrders.find(
                (o: Order) =>
                  o.status === 'pending' ||
                  o.status === 'preparing' ||
                  o.status === 'ready',
              ) || liveOrders[0]

            if (activeOrder) {
              setPlacedOrder({
                id: activeOrder.orderId || activeOrder.id,
                firestoreId: activeOrder.id,
                lines: (activeOrder.items || []).map((it: any) => ({
                  lineId: it.id || it.name,
                  itemId: it.id || '',
                  name: it.name,
                  image:
                    typeof it.image === 'string' && it.image.trim()
                      ? it.image.trim()
                      : '/food/featured-burger.jpg',
                  quantity: it.quantity || 1,
                  unitPrice: it.price || 0,
                  modifierLabels: (it.modifiers || []).map((m: any) => m.label),
                  restaurantId: activeOrder.merchantId,
                  restaurantName: activeOrder.merchantName || 'Restaurant',
                })),
                total: activeOrder.total,
                restaurantName: activeOrder.merchantName || 'Restaurant',
                pickupTime: activeOrder.pickupTime || '10-15 min',
                campusName: 'Campus Center',
                status: activeOrder.status,
                paymentReference: activeOrder.paymentReference,
                paymentStatus: activeOrder.paymentStatus,
              })
            }
          }
        } catch (orderErr) {
          console.warn('Could not restore orders from Firestore:', orderErr)
        }
      } else {
        setUserRole(null)
      }
      setIsAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await firebaseSignOut(auth)
    handleSetScreen('home')
  }

  const activeRestaurant = useMemo(
    () => currentRestaurants.find((r: Restaurant) => r.id === activeId) ?? null,
    [activeId, currentRestaurants],
  )

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0),
    [cart],
  )
  const itemCount = useMemo(
    () => cart.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [cart],
  )

  const [, setGeoTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function geocodeMissingStores() {
      let updated = false
      for (const r of currentRestaurants) {
        if (!r.coords && r.location) {
          const found = await geocodeStoreAddress(r.location)
          if (found) updated = true
        }
      }
      if (updated && !cancelled) {
        setGeoTick((t) => t + 1)
      }
    }
    geocodeMissingStores()
    return () => {
      cancelled = true
    }
  }, [currentRestaurants])

  const getStoreDistanceKm = (store: Restaurant): number => {
    if (!userLocation || !userLocation.coords) return Infinity
    const coords = resolveStoreCoords(store)
    return calculateDistanceKm(userLocation.coords, coords)
  }

  const getStoreDeliveryFee = (store: Restaurant): string => {
    const dist = getStoreDistanceKm(store)
    return calculateDeliveryFee(dist, store.storeType === 'grocery')
  }

  const getStoreDeliveryTime = (store: Restaurant): string => {
    const dist = getStoreDistanceKm(store)
    return calculateDeliveryTime(dist, store.storeType === 'grocery')
  }

  const isStoreInRange = (store: Restaurant): boolean => {
    if (!userLocation || !userLocation.coords) return false
    const dist = getStoreDistanceKm(store)
    if (!Number.isFinite(dist)) return false
    const maxRadius = Math.min(
      store.deliveryRadiusKm || SERVICE_DELIVERY_RADIUS_KM,
      SERVICE_DELIVERY_RADIUS_KM
    )
    return dist <= maxRadius
  }

  const value: Store = {
    screen,
    homeMode,
    setHomeMode: (m) => {
      setHomeMode(m)
      try {
        sessionStorage.setItem('dash_home_mode', m)
      } catch (_e) {
        // Ignore storage errors
      }
    },
    userLocation,
    setUserLocation,
    recentLocations,
    isLocatingGps,
    locationError,
    detectUserLocation,
    getStoreDistanceKm,
    getStoreDeliveryFee,
    getStoreDeliveryTime,
    isStoreInRange,
    campusId,
    setCampus: (id) => {
      setCampusId(id)
      setCustomLocationLabel(null)
    },
    customLocationLabel,
    setCustomLocation: setCustomLocationLabel,
    activeRestaurant,
    openRestaurant: (id) => {
      setActiveId(id)
      handleSetScreen('restaurant')
    },
    goHome: () => handleSetScreen('home'),
    activeDepartmentId,
    openDepartment: (id) => {
      setActiveDepartmentId(id)
      try {
        sessionStorage.setItem('dash_department', id)
      } catch (_e) {
        // Ignore storage errors
      }
      handleSetScreen('shop-category')
    },
    goToScreen: handleSetScreen,
    cart,
    addLine: (line) =>
      setCart((prev) => {
        const safeUnitPrice = Math.max(0, Number(line.unitPrice) || 0)
        const safeQty = Math.max(1, Math.min(99, Math.round(Number(line.quantity) || 1)))
        const safeImage =
          typeof line.image === 'string' && line.image.trim()
            ? line.image.trim()
            : '/food/featured-burger.jpg'

        if (prev.length > 0 && prev[0].restaurantId !== line.restaurantId) {
          const replace =
            typeof window !== 'undefined'
              ? window.confirm(
                  `Your cart contains items from ${prev[0].restaurantName}. Clear cart and start a new order from ${line.restaurantName}?`
                )
              : true
          if (!replace) return prev
          return [
            {
              ...line,
              image: safeImage,
              unitPrice: safeUnitPrice,
              quantity: safeQty,
              lineId: crypto.randomUUID(),
            },
          ]
        }

        const key = line.itemId + '|' + line.modifierLabels.join(',')
        const existing = prev.find(
          (l) => l.itemId + '|' + l.modifierLabels.join(',') === key,
        )
        if (existing) {
          return prev.map((l) =>
            l.lineId === existing.lineId
              ? { ...l, quantity: Math.min(99, l.quantity + safeQty) }
              : l,
          )
        }
        return [
          ...prev,
          {
            ...line,
            image: safeImage,
            unitPrice: safeUnitPrice,
            quantity: safeQty,
            lineId: crypto.randomUUID(),
          },
        ]
      }),
    updateQty: (lineId, delta) =>
      setCart((prev) =>
        prev
          .map((l) =>
            l.lineId === lineId
              ? { ...l, quantity: Math.min(99, Math.max(0, l.quantity + delta)) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      ),
    clearCart: () => {
      setCart([])
      try {
        localStorage.removeItem('unieats_cart')
      } catch (_e) {
        // Ignore storage errors
      }
    },
    subtotal,
    itemCount,
    pickupTime,
    setPickupTime,
    paymentMethod,
    setPaymentMethod,
    placedOrder,
    placeOrder: async (paymentMeta) => {
      if (cart.length === 0) return
      const campusName =
        customLocationLabel ||
        (campuses.find((c) => c.id === campusId)?.name ?? campuses[0].name)
      const orderDisplayId = 'DSH-' + Math.floor(1000 + Math.random() * 9000)
      const total =
        typeof paymentMeta?.verifiedTotalZar === 'number' && paymentMeta.verifiedTotalZar > 0
          ? paymentMeta.verifiedTotalZar
          : subtotal + SERVICE_FEE
      const merchantId = cart[0].restaurantId
      const merchantName = cart[0].restaurantName

      let firestoreDocId: string | undefined = undefined

      try {
        firestoreDocId = await createOrder({
          orderId: orderDisplayId,
          customerId: user?.uid || 'guest-user',
          customerName: user?.displayName || user?.email?.split('@')[0] || 'Campus Student',
          merchantId,
          merchantName,
          items: cart.map((line) => ({
            id: line.itemId,
            name: line.name,
            price: line.unitPrice,
            quantity: line.quantity,
            modifiers: line.modifierLabels.map((lbl) => ({ label: lbl, price: 0 })),
          })),
          total,
          status: 'pending',
          pickupTime,
          paymentReference: paymentMeta?.paymentReference || '',
          paymentStatus: paymentMeta?.paymentStatus || 'cash_on_pickup',
          paymentChannel: paymentMeta?.paymentChannel || paymentMethod,
        })
      } catch (err: any) {
        if (err?.code !== 'permission-denied') {
          console.warn('Local fallback used for order:', err?.message || err)
        }
      }

      setPlacedOrder({
        id: orderDisplayId,
        firestoreId: firestoreDocId,
        lines: cart,
        total,
        restaurantName: merchantName,
        pickupTime,
        campusName,
        status: 'pending',
        paymentReference: paymentMeta?.paymentReference,
        paymentStatus: paymentMeta?.paymentStatus || 'cash_on_pickup',
      })
      setCart([])
      try {
        localStorage.removeItem('unieats_cart')
      } catch (_e) {
        // Ignore storage errors
      }
      handleSetScreen('tracking')
    },
    user,
    userRole,
    isAuthLoading,
    reloadUserRole,
    signOut: handleSignOut,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

