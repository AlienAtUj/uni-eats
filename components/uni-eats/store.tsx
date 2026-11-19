'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { campuses, type Restaurant } from '@/lib/data'
import {
  type DeliveryLocation,
  SERVICE_DELIVERY_RADIUS_KM,
  detectAccurateUserLocation,
  reverseGeocodeCoords,
  calculateDistanceKm,
  resolveStoreCoords,
  geocodeStoreAddress,
  calculateDeliveryFee,
  calculateDeliveryTime,
} from '@/lib/location'
import { generateDeliveryOtp, DASH_SERVICE_FEE_ZAR, getDeliveryFeeByRoadDistance, formatZar, fetchBatchRoadDistancesKm } from '@/lib/dash-engine'
import { isValidPlacedOrder } from '@/lib/coord-validation'
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { fetchUserRole, type UserRole } from '@/lib/firebase-auth'

import {
  useFirebaseRestaurants,
  createOrder,
  generateUniqueOrderOtp,
  getCustomerOrders,
  type Order,
} from '@/lib/firebase-db'

const SERVICE_FEE = DASH_SERVICE_FEE_ZAR
const FALLBACK_IMAGE = '/food/featured-burger.jpg'

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
  addedAt?: number // optional so old saved carts and existing callers still work
}

export type HomeMode = 'eat' | 'shop'

type Store = {
  screen: Screen
  homeMode: HomeMode
  setHomeMode: (m: HomeMode) => void
  // Location
  userLocation: DeliveryLocation | null
  setUserLocation: (loc: DeliveryLocation | null) => void
  recentLocations: DeliveryLocation[]
  isLocatingGps: boolean
  locationError: string | null
  detectUserLocation: (force?: boolean) => Promise<DeliveryLocation | null>
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
  // Cart (multi-store)
  cart: CartLine[] // lines of the ACTIVE cart
  carts: Record<string, CartLine[]> // all carts keyed by restaurantId
  activeCartId: string | null
  setActiveCartId: (id: string) => void
  addLine: (line: Omit<CartLine, 'lineId'>) => void
  updateQty: (lineId: string, delta: number) => void
  clearCart: (restaurantId?: string) => void // no arg = clear ALL carts
  subtotal: number // active cart only
  itemCount: number // active cart only
  totalItemCount: number // across all carts (use for the badge)
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
    deliveryFeeZar?: number
    roadDistanceKm?: number
    smallOrderFeeZar?: number
    dashPlusApplied?: boolean
  }) => Promise<void>
  // Auth & hydration state
  user: User | null
  userRole: UserRole | null
  isAuthLoading: boolean
  isHydrated: boolean
  isRestaurantsLoading: boolean
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
  deliveryOtp?: string
  pickupAddress?: string
  pickupCoords?: { lat: number; lng: number }
  dropoffAddress?: string
  dropoffCoords?: { lat: number; lng: number }
}

type Carts = Record<string, CartLine[]>

function sanitizeLines(raw: any): CartLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (l: any) =>
        l &&
        typeof l.itemId === 'string' &&
        typeof l.restaurantId === 'string' &&
        Number.isFinite(Number(l.unitPrice)) &&
        Number(l.unitPrice) > 0 &&
        Number.isInteger(Number(l.quantity)) &&
        Number(l.quantity) > 0,
    )
    .map((l: any) => ({
      ...l,
      image:
        typeof l.image === 'string' && l.image.trim() ? l.image.trim() : FALLBACK_IMAGE,
      unitPrice: Number(l.unitPrice),
      quantity: Math.min(99, Number(l.quantity)),
      modifierLabels: Array.isArray(l.modifierLabels) ? l.modifierLabels : [],
    }))
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [isHydrated, setIsHydrated] = useState(false)
  const hasHydratedRef = useRef(false)
  const [homeMode, setHomeMode] = useState<HomeMode>('eat')
  const [campusId, setCampusId] = useState(campuses[0].id)
  const [customLocationLabel, setCustomLocationLabel] = useState<string | null>(null)
  const [userLocation, setUserLocationState] = useState<DeliveryLocation | null>(null)
  const userLocationRef = useRef<DeliveryLocation | null>(null)
  const manualSelectionVersionRef = useRef(0)
  const [recentLocations, setRecentLocations] = useState<DeliveryLocation[]>([])
  const [isLocatingGps, setIsLocatingGps] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null)
  const [carts, setCarts] = useState<Carts>({})
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null)
  const [pickupTime, setPickupTime] = useState('As soon as possible')
  const [paymentMethod, setPaymentMethod] = useState('Paystack (Card / EFT / SnapScan)')
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)

  // Resolved active cart: selected one if it still exists, else the first cart
  const activeCartId =
    selectedCartId && carts[selectedCartId]
      ? selectedCartId
      : Object.keys(carts)[0] ?? null
  const cart: CartLine[] = activeCartId ? carts[activeCartId] ?? [] : []

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

  const setUserLocation = (loc: DeliveryLocation | null, isAutoGps = false) => {
    if (!isAutoGps) {
      manualSelectionVersionRef.current += 1
    }
    userLocationRef.current = loc
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

  const detectUserLocation = async (force = false): Promise<DeliveryLocation | null> => {
    if (typeof window === 'undefined') {
      return null
    }
    const startVersion = manualSelectionVersionRef.current
    setIsLocatingGps(true)
    setLocationError(null)
    try {
      const resolved = await detectAccurateUserLocation()
      // Never overwrite a location the user manually selected while GPS was resolving
      if (!force && (manualSelectionVersionRef.current !== startVersion || userLocationRef.current !== null)) {
        return userLocationRef.current
      }
      if (resolved) {
        setUserLocation(resolved, !force)
        return resolved
      } else {
        setLocationError(
          'Location access was denied or unavailable. Please enter your delivery address to see stores near you.'
        )
        return null
      }
    } catch (err) {
      console.warn('Geolocation detection error:', err)
      setLocationError(
        'Could not detect your exact address automatically. Please search and select your delivery address.'
      )
      return null
    } finally {
      setIsLocatingGps(false)
    }
  }

  // Hydrate location, carts and active order from storage on mount (per-key isolated try/catch - LOC-014)
  useEffect(() => {
    try {
      localStorage.removeItem('dash_delivery_location')
      localStorage.removeItem('dash_selected_radius')
    } catch {}

    try {
      const savedRecents = localStorage.getItem('dash_recent_locations')
      if (savedRecents) {
        const parsedRecents = JSON.parse(savedRecents)
        if (Array.isArray(parsedRecents)) {
          setRecentLocations(
            parsedRecents.filter(
              (r: any) =>
                r && r.coords && Number.isFinite(r.coords.lat) && Number.isFinite(r.coords.lng),
            ),
          )
        }
      }
    } catch (e) {
      console.warn('Recent locations hydration notice:', e)
    }

    try {
      const savedLoc = localStorage.getItem('dash_live_location')
      if (savedLoc) {
        const parsed = JSON.parse(savedLoc)
        if (
          parsed &&
          parsed.coords &&
          Number.isFinite(parsed.coords.lat) &&
          Number.isFinite(parsed.coords.lng)
        ) {
          userLocationRef.current = parsed
          setUserLocationState(parsed)
          setCustomLocationLabel(parsed.label)
          setIsLocatingGps(false)

          if (typeof parsed.label === 'string' && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(parsed.label.trim())) {
            const healVersion = manualSelectionVersionRef.current
            reverseGeocodeCoords(parsed.coords.lat, parsed.coords.lng)
              .then((resolved) => {
                if (
                  manualSelectionVersionRef.current === healVersion &&
                  resolved &&
                  resolved.label &&
                  !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(resolved.label.trim())
                ) {
                  setUserLocation(
                    {
                      ...resolved,
                      isApproximate: parsed.isApproximate,
                      accuracy: parsed.accuracy,
                    },
                    true
                  )
                }
              })
              .catch(() => {})
          }
        } else {
          detectUserLocation()
        }
      } else {
        detectUserLocation()
      }
    } catch (e) {
      console.warn('Live location hydration notice:', e)
      detectUserLocation()
    }

    try {
      const loaded: Carts = {}
      const savedCarts = localStorage.getItem('unieats_carts')
      if (savedCarts) {
        const parsed = JSON.parse(savedCarts)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [rid, lines] of Object.entries(parsed)) {
            const valid = sanitizeLines(lines).filter((l) => l.restaurantId === rid)
            if (valid.length) loaded[rid] = valid
          }
        }
      } else {
        const oldCart = localStorage.getItem('unieats_cart')
        if (oldCart) {
          for (const l of sanitizeLines(JSON.parse(oldCart))) {
            loaded[l.restaurantId] = [...(loaded[l.restaurantId] ?? []), l]
          }
          localStorage.removeItem('unieats_cart')
        }
      }
      if (Object.keys(loaded).length) setCarts(loaded)
    } catch (e) {
      console.warn('Cart hydration notice:', e)
    }

    try {
      const savedOrder = localStorage.getItem('unieats_active_order')
      if (savedOrder) {
        const parsedOrder = JSON.parse(savedOrder)
        if (isValidPlacedOrder(parsedOrder)) {
          setPlacedOrder(parsedOrder)
        } else {
          localStorage.removeItem('unieats_active_order')
        }
      }
    } catch (e) {
      console.warn('Active order hydration notice:', e)
      try {
        localStorage.removeItem('unieats_active_order')
      } catch {}
    }

    try {
      const savedScreen = sessionStorage.getItem('unieats_screen') as Screen
      const savedDept = sessionStorage.getItem('dash_department')
      const savedActiveId = sessionStorage.getItem('dash_active_restaurant')
      const savedMode = sessionStorage.getItem('dash_home_mode') as HomeMode | null
      if (savedMode === 'eat' || savedMode === 'shop') {
        setHomeMode(savedMode)
      }
      if (savedActiveId) {
        setActiveId(savedActiveId)
      }
      if (savedScreen === 'shop-category') {
        if (savedDept) {
          setActiveDepartmentId(savedDept)
          setScreen(savedScreen)
        }
      } else if (savedScreen === 'restaurant') {
        if (savedActiveId) {
          setScreen('restaurant')
        }
      } else if (savedScreen) {
        setScreen(savedScreen)
      }
    } catch (e) {
      console.warn('Session state hydration notice:', e)
    }

    hasHydratedRef.current = true
    setIsHydrated(true)

    // Watch live browser geolocation permission changes (LOC-003)
    let permStatus: PermissionStatus | null = null
    const handlePermChange = () => {
      if (!permStatus) return
      if (permStatus.state === 'denied') {
        setLocationError('Location permission was revoked. Search and select your delivery address.')
      } else if (permStatus.state === 'granted') {
        setLocationError(null)
        detectUserLocation()
      }
    }
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          permStatus = status
          status.addEventListener('change', handlePermChange)
        })
        .catch(() => {})
    }
    return () => {
      if (permStatus) {
        permStatus.removeEventListener('change', handlePermChange)
      }
    }
  }, [])

  // Persist carts to localStorage whenever they change (guarded until storage hydration completes)
  useEffect(() => {
    if (!hasHydratedRef.current) return
    try {
      localStorage.setItem('unieats_carts', JSON.stringify(carts))
    } catch (e) {
      console.warn('Failed to persist carts:', e)
    }
  }, [carts])

  // Persist placedOrder to localStorage whenever it changes (guarded until storage hydration completes)
  useEffect(() => {
    if (!hasHydratedRef.current) return
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

  const { restaurants: liveRestaurants, isLoading: isRestaurantsLoading } = useFirebaseRestaurants()
  const currentRestaurants: Restaurant[] = liveRestaurants || []

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
                      : FALLBACK_IMAGE,
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
        // Logged out: don't keep showing a previous user's order
        setPlacedOrder(null)
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
  const totalItemCount = useMemo(
    () =>
      Object.values(carts)
        .flat()
        .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [carts],
  )
  const itemCount = totalItemCount

  // Geocode stores that have an address but no coordinates (deduped & parallelized)
  const [, setGeoTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const missingAddresses = Array.from(
      new Set(
        currentRestaurants
          .filter((r) => !r.coords && r.location)
          .map((r) => r.location.trim())
          .filter(Boolean),
      ),
    ).slice(0, 12)

    if (missingAddresses.length === 0) return

    async function geocodeMissingStores() {
      const results = await Promise.allSettled(
        missingAddresses.map((loc) => geocodeStoreAddress(loc)),
      )
      const updated = results.some((r) => r.status === 'fulfilled' && Boolean(r.value))
      if (updated && !cancelled) {
        setGeoTick((t) => t + 1)
      }
    }
    geocodeMissingStores()
    return () => {
      cancelled = true
    }
  }, [currentRestaurants])

  const [roadDistancesByStore, setRoadDistancesByStore] = useState<
    Record<string, { km: number; isApproximate: boolean }>
  >({})
  const lastBatchOriginRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const origin = userLocation?.coords
    if (!origin || currentRestaurants.length === 0) return

    // ±150m hysteresis buffer (LOC-010): avoid re-fetching batch matrix on GPS jitter
    if (
      lastBatchOriginRef.current &&
      calculateDistanceKm(lastBatchOriginRef.current, origin) <= 0.15 &&
      Object.keys(roadDistancesByStore).length > 0
    ) {
      return
    }

    const destinations = currentRestaurants.flatMap((store) => {
      try {
        const coords = resolveStoreCoords(store)
        return [{ id: store.id, lat: coords.lat, lng: coords.lng }]
      } catch {
        return []
      }
    })
    if (destinations.length === 0) return

    let cancelled = false
    lastBatchOriginRef.current = origin
    fetchBatchRoadDistancesKm(origin, destinations).then((map) => {
      if (!cancelled) {
        setRoadDistancesByStore(map)
      }
    })

    return () => {
      cancelled = true
    }
  }, [userLocation?.coords?.lat, userLocation?.coords?.lng, currentRestaurants])

  const getStoreDistanceKm = (store: Restaurant): number => {
    if (!userLocation || !userLocation.coords) return Infinity
    const batched = roadDistancesByStore[store.id]
    if (batched) return batched.km
    try {
      const coords = resolveStoreCoords(store)
      return Number((calculateDistanceKm(userLocation.coords, coords) * 1.3).toFixed(2))
    } catch {
      return Infinity
    }
  }

  const getStoreDeliveryFee = (store: Restaurant): string => {
    const dist = getStoreDistanceKm(store)
    if (!Number.isFinite(dist)) return formatZar(15)
    if (dist > 12) return 'Unavailable (>12km)'
    const feeStr = formatZar(getDeliveryFeeByRoadDistance(dist))
    return roadDistancesByStore[store.id]?.isApproximate ? `~${feeStr}` : feeStr
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
      SERVICE_DELIVERY_RADIUS_KM,
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
      try {
        sessionStorage.setItem('dash_active_restaurant', id)
      } catch (_e) {}
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
    carts,
    activeCartId,
    setActiveCartId: setSelectedCartId,
    addLine: (line) => {
      const safeUnitPrice = Math.max(0, Number(line.unitPrice) || 0)
      const safeQty = Math.max(1, Math.min(99, Math.round(Number(line.quantity) || 1)))
      const safeImage =
        typeof line.image === 'string' && line.image.trim()
          ? line.image.trim()
          : FALLBACK_IMAGE
      const rid = line.restaurantId

      setCarts((prev) => {
        const now = Date.now()
        const lines = prev[rid] ?? []
        const key = line.itemId + '|' + line.modifierLabels.join(',')
        const existing = lines.find(
          (l) => l.itemId + '|' + l.modifierLabels.join(',') === key,
        )
        const nextLines = existing
          ? lines.map((l) =>
              l.lineId === existing.lineId
                ? { ...l, quantity: Math.min(99, l.quantity + safeQty), addedAt: now }
                : l,
            )
          : [
              ...lines,
              {
                ...line,
                image: safeImage,
                unitPrice: safeUnitPrice,
                quantity: safeQty,
                lineId: crypto.randomUUID(),
                addedAt: now,
              },
            ]
        return { ...prev, [rid]: nextLines }
      })
      // Switch to the cart you just added to
      setSelectedCartId(rid)
    },
    updateQty: (lineId, delta) => {
      setCarts((prev) => {
        let targetRid: string | null = null
        for (const [rid, lines] of Object.entries(prev)) {
          if (lines.some((l) => l.lineId === lineId)) {
            targetRid = rid
            break
          }
        }
        if (!targetRid) return prev
        const lines = (prev[targetRid] ?? [])
          .map((l) =>
            l.lineId === lineId
              ? { ...l, quantity: Math.min(99, Math.max(0, l.quantity + delta)) }
              : l,
          )
          .filter((l) => l.quantity > 0)
        const next = { ...prev }
        if (lines.length) next[targetRid] = lines
        else delete next[targetRid]
        return next
      })
    },
    clearCart: (restaurantId) => {
      if (!restaurantId) {
        setCarts({})
        setSelectedCartId(null)
        try {
          localStorage.removeItem('unieats_carts')
        } catch (_e) {
          // Ignore storage errors
        }
        return
      }
      setCarts((prev) => {
        const next = { ...prev }
        delete next[restaurantId]
        return next
      })
    },
    subtotal,
    itemCount,
    totalItemCount,
    pickupTime,
    setPickupTime,
    paymentMethod,
    setPaymentMethod,
    placedOrder,
    placeOrder: async (paymentMeta) => {
      if (!user) {
        throw new Error('You must be signed in to place an order')
      }
      if (cart.length === 0 || !activeCartId) return

      const orderLines = cart
      const orderCartId = activeCartId
      const campusName =
        customLocationLabel ||
        (campuses.find((c) => c.id === campusId)?.name ?? campuses[0].name)
      const orderDisplayId = 'DSH-' + Math.floor(1000 + Math.random() * 9000)
      const total =
        typeof paymentMeta?.verifiedTotalZar === 'number' && paymentMeta.verifiedTotalZar > 0
          ? paymentMeta.verifiedTotalZar
          : subtotal + SERVICE_FEE
      const merchantId = orderLines[0].restaurantId
      const merchantName = orderLines[0].restaurantName

      let firestoreDocId: string | undefined = undefined
      const deliveryOtp = await generateUniqueOrderOtp()
      const pickupPin = await generateUniqueOrderOtp([deliveryOtp])

      const orderStore = currentRestaurants.find(
        (r) => r.id === merchantId || r.name === merchantName
      )
      const pickupAddress = orderStore?.location?.trim() || merchantName
      let pickupCoords = orderStore?.coords
      if (!pickupCoords && orderStore?.location) {
        try {
          pickupCoords = (await geocodeStoreAddress(orderStore.location)) ?? resolveStoreCoords(orderStore)
        } catch {
          try {
            pickupCoords = resolveStoreCoords(orderStore)
          } catch {
            pickupCoords = undefined
          }
        }
      } else if (!pickupCoords && orderStore) {
        try {
          pickupCoords = resolveStoreCoords(orderStore)
        } catch {
          pickupCoords = undefined
        }
      }
      let activeLoc = userLocationRef.current ?? userLocation
      if (!activeLoc && typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('dash_live_location')
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed?.coords && Number.isFinite(parsed.coords.lat) && Number.isFinite(parsed.coords.lng)) {
              activeLoc = parsed
            }
          }
        } catch {}
      }
      const dropoffAddress =
        activeLoc?.address?.trim() ||
        activeLoc?.label?.trim() ||
        campusName
      const dropoffCoords = activeLoc?.coords

      try {
        firestoreDocId = await createOrder({
          orderId: orderDisplayId,
          customerId: user.uid,
          customerName: user.displayName || user.email?.split('@')[0] || 'Dash Customer',
          merchantId,
          merchantName,
          items: orderLines.map((line) => ({
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
          deliveryOtp,
          pickupPin,
          deliveryFeeZar: paymentMeta?.deliveryFeeZar,
          roadDistanceKm: paymentMeta?.roadDistanceKm,
          smallOrderFeeZar: paymentMeta?.smallOrderFeeZar,
          serviceFeeZar: DASH_SERVICE_FEE_ZAR,
          dashPlusApplied: paymentMeta?.dashPlusApplied ?? false,
          batchDispatch: false,
          pickupVerified: false,
          pickupAddress,
          ...(pickupCoords ? { pickupCoords } : {}),
          dropoffAddress,
          ...(dropoffCoords ? { dropoffCoords } : {}),
        })
      } catch (err: any) {
        if (err?.code !== 'permission-denied') {
          console.warn('Local fallback used for order:', err?.message || err)
        }
      }

      setPlacedOrder({
        id: orderDisplayId,
        firestoreId: firestoreDocId,
        lines: orderLines,
        total,
        restaurantName: merchantName,
        pickupTime,
        campusName,
        status: 'pending',
        paymentReference: paymentMeta?.paymentReference,
        paymentStatus: paymentMeta?.paymentStatus || 'cash_on_pickup',
        deliveryOtp,
        pickupAddress,
        pickupCoords,
        dropoffAddress,
        dropoffCoords,
      })

      // Remove only the cart that was ordered; other store carts stay
      setCarts((prev) => {
        const next = { ...prev }
        delete next[orderCartId]
        return next
      })
      handleSetScreen('tracking')
    },
    user,
    userRole,
    isAuthLoading,
    isHydrated,
    isRestaurantsLoading,
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