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

export type Screen = 'home' | 'restaurant' | 'cart' | 'checkout' | 'tracking' | 'profile'

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

type Store = {
  screen: Screen
  campusId: string
  setCampus: (id: string) => void
  activeRestaurant: Restaurant | null
  openRestaurant: (id: string) => void
  goHome: () => void
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
  const [campusId, setCampusId] = useState(campuses[0].id)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [pickupTime, setPickupTime] = useState('As soon as possible')
  const [paymentMethod, setPaymentMethod] = useState('Paystack (Card / EFT / SnapScan)')
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)

  // Hydrate cart and active order from localStorage on mount
  useEffect(() => {
    try {
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
      if (savedScreen) {
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
                  image: '',
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

  const value: Store = {
    screen,
    campusId,
    setCampus: setCampusId,
    activeRestaurant,
    openRestaurant: (id) => {
      setActiveId(id)
      handleSetScreen('restaurant')
    },
    goHome: () => handleSetScreen('home'),
    goToScreen: handleSetScreen,
    cart,
    addLine: (line) =>
      setCart((prev) => {
        const safeUnitPrice = Math.max(0, Number(line.unitPrice) || 0)
        const safeQty = Math.max(1, Math.min(99, Math.round(Number(line.quantity) || 1)))

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
        campuses.find((c) => c.id === campusId)?.name ?? campuses[0].name
      const orderDisplayId = 'UE-' + Math.floor(1000 + Math.random() * 9000)
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

