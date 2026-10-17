export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed'

export type StoreOrder = {
  id: string
  customerName: string
  items: { name: string; quantity: number }[]
  total: number
  status: OrderStatus
  time: string
}

export const mockOrders: StoreOrder[] = [
  {
    id: 'ORD-7231',
    customerName: 'Sandile',
    items: [{ name: 'Classic Chicken Burger', quantity: 1 }, { name: 'Loaded Cheese Fries', quantity: 1 }],
    total: 152.50,
    status: 'pending',
    time: '10:42 AM',
  },
  {
    id: 'ORD-7232',
    customerName: 'Sarah M.',
    items: [{ name: 'Loaded Cheese Fries', quantity: 2 }],
    total: 110.00,
    status: 'preparing',
    time: '10:35 AM',
  },
  {
    id: 'ORD-7233',
    customerName: 'Thabo Ndlovu',
    items: [{ name: 'Classic Chicken Burger', quantity: 1 }],
    total: 97.50,
    status: 'ready',
    time: '10:28 AM',
  },
  {
    id: 'ORD-7234',
    customerName: 'Jessica L.',
    items: [{ name: 'Classic Chicken Burger', quantity: 2 }, { name: 'Loaded Cheese Fries', quantity: 2 }],
    total: 305.00,
    status: 'completed',
    time: '09:15 AM',
  },
]

export const storeStats = {
  revenue: 4250.00,
  ordersToday: 24,
  activeProducts: 12,
  rating: 4.8,
}
