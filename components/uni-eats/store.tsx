'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { campuses, restaurants, type Restaurant } from '@/lib/data'

const SERVICE_FEE = 0.99

export type Screen = 'home' | 'restaurant' | 'cart' | 'checkout' | 'tracking'

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
  placeOrder: () => void
}

export type PlacedOrder = {
  id: string
  lines: CartLine[]
  total: number
  restaurantName: string
  pickupTime: string
  campusName: string
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [campusId, setCampusId] = useState(campuses[0].id)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [pickupTime, setPickupTime] = useState('As soon as possible')
  const [paymentMethod, setPaymentMethod] = useState('Campus Card •••• 4821')
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)

  const activeRestaurant = useMemo(
    () => restaurants.find((r) => r.id === activeId) ?? null,
    [activeId],
  )

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart],
  )
  const itemCount = useMemo(
    () => cart.reduce((sum, l) => sum + l.quantity, 0),
    [cart],
  )

  const value: Store = {
    screen,
    campusId,
    setCampus: setCampusId,
    activeRestaurant,
    openRestaurant: (id) => {
      setActiveId(id)
      setScreen('restaurant')
    },
    goHome: () => setScreen('home'),
    goToScreen: setScreen,
    cart,
    addLine: (line) =>
      setCart((prev) => {
        const key = line.itemId + '|' + line.modifierLabels.join(',')
        const existing = prev.find(
          (l) => l.itemId + '|' + l.modifierLabels.join(',') === key,
        )
        if (existing) {
          return prev.map((l) =>
            l.lineId === existing.lineId
              ? { ...l, quantity: l.quantity + line.quantity }
              : l,
          )
        }
        return [...prev, { ...line, lineId: crypto.randomUUID() }]
      }),
    updateQty: (lineId, delta) =>
      setCart((prev) =>
        prev
          .map((l) =>
            l.lineId === lineId
              ? { ...l, quantity: Math.max(0, l.quantity + delta) }
              : l,
          )
          .filter((l) => l.quantity > 0),
      ),
    clearCart: () => setCart([]),
    subtotal,
    itemCount,
    pickupTime,
    setPickupTime,
    paymentMethod,
    setPaymentMethod,
    placedOrder,
    placeOrder: () => {
      if (cart.length === 0) return
      const campusName =
        campuses.find((c) => c.id === campusId)?.name ?? campuses[0].name
      setPlacedOrder({
        id: 'UE-' + Math.floor(1000 + Math.random() * 9000),
        lines: cart,
        total: subtotal + SERVICE_FEE,
        restaurantName: cart[0].restaurantName,
        pickupTime,
        campusName,
      })
      setCart([])
      setScreen('tracking')
    },
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

