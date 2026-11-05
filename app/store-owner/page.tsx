'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  PlusIcon,
  PackageIcon,
  TrendingUpIcon,
  BagIcon,
  SearchIcon,
  BellIcon,
  CloseIcon,
  TrashIcon,
  UploadCloudIcon,
  CheckIcon,
  ClockIcon,
  PinIcon,
  ChevronDownIcon,
  ReceiptIcon,
  EditIcon,
  StoreIcon,
  UserIcon,
  LogOutIcon,
} from '@/components/icons'
import { BottomSheet } from '@/components/uni-eats/sheet'
import { formatPrice, isGroceryCategory, type StoreType } from '@/lib/data'
import { DEPARTMENTS } from '@/lib/grocery-catalog'
import { MEAL_CATEGORIES } from '@/lib/meal-catalog'
import {
  type Coordinates,
  type DeliveryLocation,
  searchAddresses,
  searchInstantLocations,
  geocodeStoreAddress,
  reverseGeocodeCoords,
  SERVICE_DELIVERY_RADIUS_KM,
} from '@/lib/location'
import Image from 'next/image'
import {
  useFirebaseProducts,
  createProduct,
  updateProduct,
  updateProductPrice,
  deleteProduct,
  subscribeToMerchantOrders,
  updateOrderStatus,
  type Order,
  type OrderStatus,
} from '@/lib/firebase-db'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { fetchUserRole } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { cn } from '@/lib/utils'

type MerchantTab = 'orders' | 'products' | 'store' | 'account'
type OrderFilter = 'all' | 'pending' | 'preparing' | 'ready' | 'completed'

const statusStyles: Record<OrderStatus, { pill: string; label: string }> = {
  pending: {
    pill: 'bg-accent/15 text-accent-foreground',
    label: 'New',
  },
  preparing: {
    pill: 'bg-primary/10 text-primary',
    label: 'Preparing',
  },
  ready: {
    pill: 'bg-primary text-primary-foreground',
    label: 'Ready',
  },
  completed: {
    pill: 'bg-secondary text-muted-foreground',
    label: 'Collected',
  },
  cancelled: {
    pill: 'bg-destructive/10 text-destructive',
    label: 'Cancelled',
  },
}

const statusPriority: Record<OrderStatus, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  completed: 3,
  cancelled: 4,
}

const orderFilters: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'New' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Collected' },
]

export default function StoreOwnerDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<MerchantTab>('orders')
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [merchantName, setMerchantName] = useState<string>('My Store')
  const [storeType, setStoreType] = useState<StoreType>('restaurant')
  const [storeLocation, setStoreLocation] = useState<string>('Set store address')
  const [storeCoords, setStoreCoords] = useState<Coordinates | null>(null)
  const [storePickupTime, setStorePickupTime] = useState<string>('15-25 min')

  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreType, setNewStoreType] = useState<StoreType>('restaurant')
  const [newStoreLocation, setNewStoreLocation] = useState('')
  const [newStoreCoords, setNewStoreCoords] = useState<Coordinates | null>(null)
  const [newStorePickupTime, setNewStorePickupTime] = useState('15-25 min')
  const [storeAddressQuery, setStoreAddressQuery] = useState('')
  const [storeAddressResults, setStoreAddressResults] = useState<DeliveryLocation[]>([])
  const [isSearchingStoreAddress, setIsSearchingStoreAddress] = useState(false)
  const [isLocatingStoreGps, setIsLocatingStoreGps] = useState(false)
  const [isSavingStore, setIsSavingStore] = useState(false)
  const [savedStoreSuccess, setSavedStoreSuccess] = useState(false)
  const [uploadDefaultStoreType, setUploadDefaultStoreType] = useState<StoreType | null>(null)

  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)

  const { products: fbProducts, mutate } = useFirebaseProducts()
  const allProducts = useMemo(
    () =>
      merchantId
        ? fbProducts.filter((p) => p.merchantId === merchantId)
        : fbProducts,
    [fbProducts, merchantId],
  )
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState<string>('')
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)

  useEffect(() => {
    let unsubOrders: (() => void) | null = null

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (unsubOrders) {
        unsubOrders()
        unsubOrders = null
      }

      if (!user) {
        router.replace('/login')
        return
      }

      const role = await fetchUserRole(user.uid)
      if (role !== 'merchant') {
        router.replace('/')
        return
      }

      setCurrentUser(user)
      setMerchantId(user.uid)

      try {
        let currentName = 'My Store'
        let loc = 'Johannesburg'
        let pickup = '15-25 min'
        let resolvedType: StoreType = 'restaurant'
        let coords: Coordinates | null = null

        const [userDoc, restDoc] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)),
          getDoc(doc(db, 'restaurants', user.uid)),
        ])

        if (userDoc.exists()) {
          const data = userDoc.data()
          currentName =
            data.storeName || data.businessName || data.name || 'My Store'
          if (data.storeLocation || data.location)
            loc = data.storeLocation || data.location
          if (data.storeType === 'grocery' || data.storeType === 'restaurant') {
            resolvedType = data.storeType
          }
          if (data.coords && Number.isFinite(data.coords.lat) && Number.isFinite(data.coords.lng)) {
            coords = data.coords
          }
        }

        if (restDoc.exists()) {
          const rData = restDoc.data()
          if (rData.name) currentName = rData.name
          if (rData.location) loc = rData.location
          if (rData.pickupTime) pickup = rData.pickupTime
          if (rData.storeType === 'grocery' || rData.storeType === 'restaurant') {
            resolvedType = rData.storeType
          } else if (isGroceryCategory(rData.cuisine) || isGroceryCategory(rData.name)) {
            resolvedType = 'grocery'
          }
          if (rData.coords && Number.isFinite(rData.coords.lat) && Number.isFinite(rData.coords.lng)) {
            coords = rData.coords
          }
        }

        setMerchantName(currentName)
        setNewStoreName(currentName)
        setStoreType(resolvedType)
        setNewStoreType(resolvedType)
        setStoreLocation(loc)
        setNewStoreLocation(loc)
        setStoreCoords(coords)
        setNewStoreCoords(coords)
        setStorePickupTime(pickup)
        setNewStorePickupTime(pickup)
      } catch (error) {
        console.error('Error fetching merchant details:', error)
      }

      setIsLoadingOrders(true)
      unsubOrders = subscribeToMerchantOrders(user.uid, (liveOrders) => {
        setOrders(liveOrders)
        setIsLoadingOrders(false)
      })

      setIsCheckingAccess(false)
    })

    return () => {
      unsub()
      if (unsubOrders) {
        unsubOrders()
      }
    }
  }, [router])

  // Super-fast store address search: 0ms instant fuzzy match + 120ms multi-API geocoder
  useEffect(() => {
    const q = storeAddressQuery.trim()
    if (q.length < 1) {
      setStoreAddressResults([])
      setIsSearchingStoreAddress(false)
      return
    }
    const instant = searchInstantLocations(q)
    setStoreAddressResults(instant)
    if (q.length < 2) {
      setIsSearchingStoreAddress(false)
      return
    }
    const controller = new AbortController()
    setIsSearchingStoreAddress(true)
    const timer = setTimeout(async () => {
      try {
        const res = await searchAddresses(q, controller.signal)
        if (!controller.signal.aborted) {
          setStoreAddressResults(res)
        }
      } catch {
        if (!controller.signal.aborted) {
          setStoreAddressResults(instant)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingStoreAddress(false)
        }
      }
    }, 120)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [storeAddressQuery])

  const handleUseStoreGpsLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      alert('GPS location is not supported in this browser.')
      return
    }
    setIsLocatingStoreGps(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const resolved = await reverseGeocodeCoords(pos.coords.latitude, pos.coords.longitude)
          setNewStoreLocation(resolved.label)
          setNewStoreCoords(resolved.coords)
          setStoreAddressQuery('')
          setStoreAddressResults([])
        } catch {
          alert('Could not resolve address from GPS.')
        } finally {
          setIsLocatingStoreGps(false)
        }
      },
      () => {
        setIsLocatingStoreGps(false)
        alert('Location permission denied. Please search your street address.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleQuickSwitchStoreType = async (nextType: StoreType) => {
    setStoreType(nextType)
    setNewStoreType(nextType)
    if (!merchantId) return
    try {
      await Promise.all([
        setDoc(doc(db, 'users', merchantId), { storeType: nextType }, { merge: true }),
        setDoc(doc(db, 'restaurants', merchantId), { storeType: nextType }, { merge: true }),
      ])
    } catch (e) {
      console.warn('Could not persist storeType switch:', e)
    }
  }

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus)
    } catch (error) {
      console.error('Error updating order status:', error)
      alert('Failed to update order status')
    }
  }

  const handleProductSaved = async (newProductData: any, imageFiles: File[]) => {
    if (!merchantId) {
      alert('You must be logged in as a merchant to manage products.')
      return
    }

    try {
      if (newProductData.storeType && newProductData.storeType !== storeType) {
        setStoreType(newProductData.storeType)
        setNewStoreType(newProductData.storeType)
      }
      if (editingProduct) {
        await updateProduct(
          editingProduct.id,
          merchantId,
          newProductData,
          imageFiles,
        )
      } else {
        await createProduct(merchantId, newProductData, imageFiles)
      }
      mutate()
      setIsModalOpen(false)
      setEditingProduct(null)
      setUploadDefaultStoreType(null)
    } catch (e) {
      console.error(e)
      alert(
        editingProduct
          ? 'Failed to update product.'
          : 'Failed to upload product.',
      )
    }
  }

  // Prioritize new (pending) orders first, then preparing, ready, completed, and newest first within each status
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matching = orders.filter((o) => {
      if (orderFilter !== 'all' && o.status !== orderFilter) {
        return false
      }
      if (!q) return true
      const idMatch = (o.orderId || o.id || '').toLowerCase().includes(q)
      const customerMatch = (o.customerName || '').toLowerCase().includes(q)
      const itemsMatch = (o.items || []).some((it) =>
        (it.name || '').toLowerCase().includes(q),
      )
      return idMatch || customerMatch || itemsMatch
    })

    return [...matching].sort((a, b) => {
      const prioA = statusPriority[a.status as OrderStatus] ?? 99
      const prioB = statusPriority[b.status as OrderStatus] ?? 99
      if (prioA !== prioB) return prioA - prioB

      const timeA =
        a.createdAt?.toMillis?.() ||
        (typeof a.createdAt === 'number' ? a.createdAt : 0)
      const timeB =
        b.createdAt?.toMillis?.() ||
        (typeof b.createdAt === 'number' ? b.createdAt : 0)
      return timeB - timeA
    })
  }, [orders, orderFilter, searchQuery])

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allProducts
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    )
  }, [allProducts, searchQuery])

  const handleStartEditPrice = (product: { id: string; price: number }) => {
    setEditingProductId(product.id)
    setEditingPriceValue(product.price.toString())
  }

  const handleSavePrice = async (productId: string) => {
    const parsed = parseFloat(editingPriceValue)
    if (isNaN(parsed) || parsed <= 0) {
      alert('Please enter a valid price greater than zero.')
      return
    }
    setIsUpdatingPrice(true)
    try {
      await updateProductPrice(productId, parsed)
      setEditingProductId(null)
      mutate()
    } catch (e) {
      console.error(e)
      alert('Failed to update product price.')
    } finally {
      setIsUpdatingPrice(false)
    }
  }

  const handleDeleteProduct = async (productId: string, name: string) => {
    if (!confirm(`Delete "${name}" from your menu?`)) return
    try {
      await deleteProduct(productId)
      mutate()
    } catch (e) {
      console.error(e)
      alert('Failed to delete product.')
    }
  }

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!merchantId || !newStoreName.trim()) return
    setIsSavingStore(true)
    setSavedStoreSuccess(false)
    try {
      const cleanName = newStoreName.trim()
      const cleanLoc = newStoreLocation.trim() || 'Johannesburg'
      const cleanPickup = newStorePickupTime.trim() || '15-25 min'

      let resolvedCoords = newStoreCoords
      if (!resolvedCoords && cleanLoc) {
        resolvedCoords = await geocodeStoreAddress(cleanLoc)
      }

      const userPayload: Record<string, any> = {
        name: cleanName,
        storeName: cleanName,
        storeLocation: cleanLoc,
        storeType: newStoreType,
        deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
      }
      const restPayload: Record<string, any> = {
        name: cleanName,
        location: cleanLoc,
        pickupTime: cleanPickup,
        storeType: newStoreType,
        deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
      }
      if (resolvedCoords) {
        userPayload.coords = resolvedCoords
        restPayload.coords = resolvedCoords
        setNewStoreCoords(resolvedCoords)
      }

      await Promise.all([
        setDoc(doc(db, 'users', merchantId), userPayload, { merge: true }),
        setDoc(doc(db, 'restaurants', merchantId), restPayload, { merge: true }),
      ])

      setMerchantName(cleanName)
      setStoreType(newStoreType)
      setStoreLocation(cleanLoc)
      setStoreCoords(newStoreCoords)
      setStorePickupTime(cleanPickup)
      setSavedStoreSuccess(true)
      setTimeout(() => setSavedStoreSuccess(false), 2500)
    } catch (err) {
      console.error('Error saving store details:', err)
      alert('Failed to save store details.')
    } finally {
      setIsSavingStore(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    router.replace('/login')
  }

  const pendingOrdersCount = orders.filter((o) => o.status === 'pending').length
  const preparingOrdersCount = orders.filter(
    (o) => o.status === 'preparing',
  ).length
  const readyOrdersCount = orders.filter((o) => o.status === 'ready').length
  const completedOrdersCount = orders.filter(
    (o) => o.status === 'completed',
  ).length
  const activeOrdersCount =
    pendingOrdersCount + preparingOrdersCount + readyOrdersCount

  const filterCounts: Record<OrderFilter, number> = {
    all: orders.length,
    pending: pendingOrdersCount,
    preparing: preparingOrdersCount,
    ready: readyOrdersCount,
    completed: completedOrdersCount,
  }

  const totalRevenue = orders
    .filter((o) => o.status === 'completed' || o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

  const storeTypeLabel =
    storeType === 'grocery' ? 'Shop / Grocery Owner' : 'Restaurant Owner'

  return (
    <div className="flex h-dvh justify-center bg-[oklch(0.16_0.03_150)] md:h-auto md:min-h-dvh md:py-8">
      {/* Same Phone Frame Shell as Student App */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl md:h-[860px] md:rounded-[2.75rem] md:ring-8 md:ring-[oklch(0.12_0.02_150)]">
        {isCheckingAccess ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
              {/* Top Header (matches HomeScreen) */}
              <header className="bg-[oklch(0.22_0.04_150)] px-5 pb-6 pt-5 text-[oklch(0.97_0.02_120)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[oklch(0.97_0.02_120)]/10">
                      <Image
                        src="/dash-logo.jpg"
                        alt="Dash"
                        width={36}
                        height={36}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-[oklch(0.97_0.02_120)]/70">
                        Dash Partner Portal · {storeTypeLabel}
                      </p>
                      <p className="truncate text-sm font-extrabold tracking-tight">
                        {merchantName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[oklch(0.97_0.02_120)]/10 text-sm font-bold text-[oklch(0.97_0.02_120)]"
                    aria-label="Store account"
                  >
                    {merchantName.charAt(0).toUpperCase()}
                  </button>
                </div>

                {/* Location & Store Type Pill */}
                <button
                  type="button"
                  onClick={() => setActiveTab('store')}
                  className="mt-4 flex items-center gap-2 rounded-full bg-[oklch(0.97_0.02_120)]/10 px-3.5 py-1.5 text-xs font-semibold text-[oklch(0.97_0.02_120)]"
                >
                  <PinIcon className="h-3.5 w-3.5 text-accent" />
                  <span className="truncate">
                    {storeLocation} · {storePickupTime}
                  </span>
                  <ChevronDownIcon className="h-3.5 w-3.5 opacity-80" />
                </button>

                {/* Search Input for Orders & Menu tabs */}
                {(activeTab === 'orders' || activeTab === 'products') && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-card px-4 py-3 text-card-foreground shadow-sm">
                    <SearchIcon className="h-5 w-5 text-muted-foreground" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        activeTab === 'orders'
                          ? 'Search order ID, student, or meal...'
                          : 'Search your menu items...'
                      }
                      className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="rounded-full bg-secondary p-1 text-muted-foreground"
                        aria-label="Clear search"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </header>

              {/* TAB 1: ORDERS */}
              {activeTab === 'orders' && (
                <div>
                  {/* Priority New Orders Banner when new orders are waiting */}
                  {pendingOrdersCount > 0 && (
                    <div className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-accent/15 px-4 py-3 ring-1 ring-accent/40">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                          <BellIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-foreground">
                            {pendingOrdersCount} New Order
                            {pendingOrdersCount === 1 ? '' : 's'} Waiting
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            Accept to start preparing for pickup
                          </p>
                        </div>
                      </div>
                      {orderFilter !== 'pending' && (
                        <button
                          type="button"
                          onClick={() => setOrderFilter('pending')}
                          className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold text-accent-foreground shadow-sm"
                        >
                          View New
                        </button>
                      )}
                    </div>
                  )}

                  {/* Compact 2-Card Summary Strip */}
                  <div className="mt-4 grid grid-cols-2 gap-3 px-5">
                    <button
                      type="button"
                      onClick={() =>
                        setOrderFilter(
                          pendingOrdersCount > 0 ? 'pending' : 'all',
                        )
                      }
                      className={cn(
                        'rounded-3xl bg-card p-3.5 text-left shadow-sm ring-1 transition-colors',
                        pendingOrdersCount > 0
                          ? 'ring-accent/60'
                          : 'ring-border',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          New Orders
                        </span>
                        <span
                          className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full',
                            pendingOrdersCount > 0
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          <BellIcon className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-1.5 text-xl font-extrabold text-foreground">
                        {pendingOrdersCount}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {activeOrdersCount} active in kitchen
                      </p>
                    </button>

                    <div className="rounded-3xl bg-card p-3.5 shadow-sm ring-1 ring-border">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Revenue
                        </span>
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <TrendingUpIcon className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-xl font-extrabold text-foreground">
                        {formatPrice(totalRevenue)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {orders.length} total orders
                      </p>
                    </div>
                  </div>

                  {/* Order Status Filter Pills with Live Counts */}
                  <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
                    {orderFilters.map((f) => {
                      const active = orderFilter === f.key
                      const count = filterCounts[f.key]
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setOrderFilter(f.key)}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : f.key === 'pending' && count > 0
                                ? 'bg-accent/15 text-foreground ring-1 ring-accent/40'
                                : 'bg-card text-foreground ring-1 ring-border',
                          )}
                        >
                          <span>{f.label}</span>
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.2 text-[10px] font-extrabold',
                              active
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : f.key === 'pending' && count > 0
                                  ? 'bg-accent text-accent-foreground'
                                  : 'bg-secondary text-muted-foreground',
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Orders List (New Orders always sorted to the top) */}
                  <div className="mt-4 flex flex-col gap-3 px-5">
                    {isLoadingOrders ? (
                      <div className="rounded-3xl bg-card p-10 text-center shadow-sm ring-1 ring-border">
                        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        <p className="mt-3 text-xs font-medium text-muted-foreground">
                          Loading live orders...
                        </p>
                      </div>
                    ) : filteredOrders.length > 0 ? (
                      filteredOrders.map((order) => {
                        const isNewOrder = order.status === 'pending'
                        const statusInfo =
                          statusStyles[order.status as OrderStatus] ||
                          statusStyles.pending
                        const isPaid = order.paymentStatus === 'paid'

                        return (
                          <div
                            key={order.id}
                            className={cn(
                              'flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm transition-all',
                              isNewOrder
                                ? 'ring-2 ring-accent shadow-md'
                                : 'ring-1 ring-border',
                            )}
                          >
                            {/* Top Row: ID + Customer + Status Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-extrabold text-card-foreground">
                                    {order.orderId || order.id.slice(0, 8)}
                                  </h3>
                                  {isPaid ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                      <CheckIcon className="h-3 w-3" />
                                      <span>Paid</span>
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      Cash
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {order.customerName || 'Campus Student'} ·{' '}
                                  {order.pickupTime || storePickupTime}
                                </p>
                              </div>

                              <span
                                className={cn(
                                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
                                  isNewOrder
                                    ? 'bg-accent text-accent-foreground'
                                    : statusInfo.pill,
                                )}
                              >
                                {isNewOrder ? 'New Order' : statusInfo.label}
                              </span>
                            </div>

                            {/* Items Box */}
                            <div className="flex flex-col gap-1.5 rounded-2xl bg-secondary/60 p-3">
                              {(order.items || []).map((it: any, idx: number) => (
                                <div
                                  key={`${order.id}-item-${idx}`}
                                  className="flex items-start justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-bold text-foreground">
                                      {it.quantity}x {it.name}
                                    </span>
                                    {Array.isArray(it.modifiers) &&
                                      it.modifiers.length > 0 && (
                                        <p className="truncate text-[11px] text-muted-foreground">
                                          {it.modifiers
                                            .map((m: any) => m.label)
                                            .filter(Boolean)
                                            .join(', ')}
                                        </p>
                                      )}
                                  </div>
                                  {Number(it.price) > 0 && (
                                    <span className="shrink-0 font-semibold text-muted-foreground">
                                      {formatPrice(
                                        Number(it.price) *
                                          (Number(it.quantity) || 1),
                                      )}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Total + Action Row */}
                            <div className="flex items-center justify-between gap-3 pt-0.5">
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Total
                                </span>
                                <span className="text-base font-extrabold text-foreground">
                                  {formatPrice(order.total)}
                                </span>
                              </div>

                              {order.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(order.id, 'preparing')
                                  }
                                  className="rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
                                >
                                  Accept & Prepare
                                </button>
                              )}
                              {order.status === 'preparing' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(order.id, 'ready')
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-accent-foreground shadow-sm transition-transform active:scale-95"
                                >
                                  <BellIcon className="h-3.5 w-3.5" />
                                  <span>Mark Ready</span>
                                </button>
                              )}
                              {order.status === 'ready' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStatusUpdate(order.id, 'completed')
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                  <span>Mark Collected</span>
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary">
                                  <CheckIcon className="h-3.5 w-3.5" />
                                  <span>Completed</span>
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-3xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                          <BagIcon className="h-7 w-7" />
                        </span>
                        <p className="mt-3 text-base font-bold text-foreground">
                          No orders found
                        </p>
                        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                          Student orders placed for {merchantName} will appear here in real time.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: MENU / PRODUCTS */}
              {activeTab === 'products' && (
                <div className="mt-4 px-5">
                  {/* Business Mode Switcher: Upload as Restaurant Owner vs Shop Owner */}
                  <div className="mb-4 rounded-3xl bg-card p-3.5 shadow-sm ring-1 ring-border">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Operating & Uploading Mode
                      </span>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold text-primary">
                        {storeType === 'grocery' ? 'Shop (Stores)' : 'Eat (Meals)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
                      <button
                        type="button"
                        onClick={() => handleQuickSwitchStoreType('restaurant')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all',
                          storeType === 'restaurant'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <StoreIcon className="h-3.5 w-3.5" />
                        <span>Restaurant Owner</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickSwitchStoreType('grocery')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all',
                          storeType === 'grocery'
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <BagIcon className="h-3.5 w-3.5" />
                        <span>Shop / Grocery Owner</span>
                      </button>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                        {storeType === 'grocery' ? 'Shop Inventory' : 'Menu Catalog'}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {allProducts.length} item{allProducts.length === 1 ? '' : 's'} live in your{' '}
                        {storeType === 'grocery' ? 'shop' : 'restaurant'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(null)
                        setUploadDefaultStoreType(storeType)
                        setIsModalOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform active:scale-95"
                    >
                      <PlusIcon className="h-4 w-4" />
                      <span>
                        {storeType === 'grocery' ? 'Add Shop Product' : 'Add Meal'}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => {
                        const modCount = Array.isArray(p.modifierGroups)
                          ? p.modifierGroups.length
                          : 0
                        const isGroceryItem =
                          p.storeType === 'grocery' || isGroceryCategory(p.category)

                        return (
                          <div
                            key={p.id}
                            className="flex flex-col gap-3 rounded-3xl bg-card p-3.5 shadow-sm ring-1 ring-border"
                          >
                            <div className="flex gap-3.5">
                              <div className="flex min-w-0 flex-1 flex-col">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                      isGroceryItem
                                        ? 'bg-emerald-500/15 text-emerald-700'
                                        : 'bg-accent/20 text-accent-foreground',
                                    )}
                                  >
                                    {isGroceryItem ? 'Shop' : 'Restaurant'}
                                  </span>
                                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                                    {p.category || 'Menu'}
                                  </span>
                                  {p.size && (
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                                      {p.size}
                                    </span>
                                  )}
                                  {modCount > 0 && (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                      +{modCount} option{modCount === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-1 truncate text-base font-bold text-card-foreground">
                                  {p.name}
                                </h3>

                                {p.description && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                    {p.description}
                                  </p>
                                )}

                                <div className="mt-auto flex items-baseline gap-2 pt-2">
                                  <span className="text-sm font-extrabold text-primary">
                                    {formatPrice(p.price)}
                                  </span>
                                  {p.oldPrice && Number(p.oldPrice) > Number(p.price) && (
                                    <span className="text-xs font-semibold text-muted-foreground line-through">
                                      {formatPrice(Number(p.oldPrice))}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-secondary ring-1 ring-border">
                                {p.images && p.images.length > 0 && p.images[0] && p.images[0].trim() ? (
                                  <Image
                                    src={p.images[0].trim()}
                                    alt={p.name}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <PackageIcon className="h-6 w-6 opacity-40" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Inline Price Editor or Action Bar */}
                            {editingProductId === p.id ? (
                              <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
                                <span className="text-xs font-bold text-muted-foreground">
                                  R
                                </span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  value={editingPriceValue}
                                  onChange={(e) =>
                                    setEditingPriceValue(e.target.value)
                                  }
                                  className="flex-1 rounded-xl border bg-background px-3 py-1.5 text-sm font-bold text-foreground outline-none focus:border-primary"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePrice(p.id)}
                                  disabled={isUpdatingPrice}
                                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingProductId(null)}
                                  disabled={isUpdatingPrice}
                                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(p)
                                      setIsModalOpen(true)
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary"
                                  >
                                    <EditIcon className="h-3.5 w-3.5" />
                                    <span>Edit Item</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditPrice(p)}
                                    className="rounded-full bg-secondary px-3.5 py-1.5 text-xs font-bold text-foreground"
                                  >
                                    Change Price
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteProduct(p.id, p.name)
                                  }
                                  className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Delete ${p.name}`}
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div className="rounded-3xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                          <PackageIcon className="h-7 w-7" />
                        </span>
                        <p className="mt-3 text-base font-bold text-foreground">
                          Your {storeType === 'grocery' ? 'shop catalog' : 'menu'} is empty
                        </p>
                        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                          Upload as a Restaurant Owner (meals) or Shop Owner (groceries & essentials) so nearby customers can order.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(null)
                              setUploadDefaultStoreType('restaurant')
                              setIsModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm"
                          >
                            <PlusIcon className="h-4 w-4" />
                            <span>Upload Restaurant Meal</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(null)
                              setUploadDefaultStoreType('grocery')
                              setIsModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 text-xs font-bold text-foreground ring-1 ring-border"
                          >
                            <PlusIcon className="h-4 w-4" />
                            <span>Upload Shop Product</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: STORE DETAILS & SETTINGS */}
              {activeTab === 'store' && (
                <div className="mt-5 px-5">
                  <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                    Store Settings
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Configure your business type and real-time GPS address so nearby customers see your store first.
                  </p>

                  <form
                    onSubmit={handleSaveStoreSettings}
                    className="mt-4 flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border"
                  >
                    {/* Business Type Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Business Type
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setNewStoreType('restaurant')}
                          className={cn(
                            'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all',
                            newStoreType === 'restaurant'
                              ? 'border-primary bg-primary/10 ring-1 ring-primary'
                              : 'border-border bg-background hover:bg-secondary/50',
                          )}
                        >
                          <StoreIcon className="h-5 w-5 text-primary" />
                          <span className="text-xs font-extrabold text-foreground">
                            Restaurant Owner
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Meals, Burgers, Kotas & Takeaways
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setNewStoreType('grocery')}
                          className={cn(
                            'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all',
                            newStoreType === 'grocery'
                              ? 'border-primary bg-primary/10 ring-1 ring-primary'
                              : 'border-border bg-background hover:bg-secondary/50',
                          )}
                        >
                          <BagIcon className="h-5 w-5 text-primary" />
                          <span className="text-xs font-extrabold text-foreground">
                            Shop / Grocery Owner
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Groceries, Spaza, Butcher & Produce
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-foreground">
                        {newStoreType === 'grocery'
                          ? 'Shop / Supermarket Name'
                          : 'Restaurant Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={newStoreName}
                        onChange={(e) => setNewStoreName(e.target.value)}
                        placeholder={
                          newStoreType === 'grocery'
                            ? 'e.g. Doornfontein Spaza & Fresh Mart'
                            : 'e.g. SML Restaurant & Grill'
                        }
                        className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Real-Time Store Street Address & GPS Coordinates */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Store Street Address & GPS Location
                      </label>
                      <input
                        type="text"
                        value={newStoreLocation}
                        onChange={(e) => {
                          setNewStoreLocation(e.target.value)
                          setStoreAddressQuery(e.target.value)
                        }}
                        placeholder="Search your store street address or suburb..."
                        className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />

                      {storeAddressQuery.trim().length >= 1 && (
                        <div className="mt-1 flex max-h-48 flex-col overflow-y-auto rounded-2xl border border-border bg-background p-1 shadow-md">
                          {isSearchingStoreAddress && storeAddressResults.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">
                              Searching addresses...
                            </p>
                          ) : storeAddressResults.length === 0 ? (
                            <p className="py-3 text-center text-xs text-muted-foreground">
                              No matching address found.
                            </p>
                          ) : (
                            storeAddressResults.map((loc, idx) => (
                              <button
                                key={`${loc.label}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setNewStoreLocation(loc.label)
                                  setNewStoreCoords(loc.coords)
                                  setStoreAddressQuery('')
                                  setStoreAddressResults([])
                                }}
                                className="flex w-full items-start gap-2 rounded-xl p-2.5 text-left hover:bg-secondary"
                              >
                                <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-bold text-foreground">
                                    {loc.label}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {loc.address}
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleUseStoreGpsLocation}
                        disabled={isLocatingStoreGps}
                        className="mt-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
                      >
                        <PinIcon className="h-3.5 w-3.5" />
                        <span>
                          {isLocatingStoreGps
                            ? 'Detecting store GPS...'
                            : 'Use my current GPS location for store'}
                        </span>
                      </button>

                      {newStoreCoords && (
                        <p className="text-[11px] font-semibold text-primary">
                          GPS pinned ({newStoreCoords.lat.toFixed(4)}, {newStoreCoords.lng.toFixed(4)}) · Customers within {SERVICE_DELIVERY_RADIUS_KM} km will see your store prioritized by distance.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Estimated Prep Time
                      </label>
                      <input
                        type="text"
                        value={newStorePickupTime}
                        onChange={(e) => setNewStorePickupTime(e.target.value)}
                        placeholder="e.g. 15-25 min"
                        className="w-full rounded-2xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingStore || !newStoreName.trim()}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {savedStoreSuccess ? (
                        <>
                          <CheckIcon className="h-4 w-4" />
                          <span>Store Settings Saved</span>
                        </>
                      ) : isSavingStore ? (
                        <span>Saving...</span>
                      ) : (
                        <span>Save Store Settings</span>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* TAB 4: ACCOUNT */}
              {activeTab === 'account' && (
                <div className="mt-5 px-5">
                  <div className="flex flex-col items-center rounded-3xl bg-card p-6 text-center shadow-sm ring-1 ring-border">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-extrabold text-primary">
                      {merchantName.slice(0, 2).toUpperCase()}
                    </div>
                    <h2 className="mt-3 text-lg font-extrabold text-foreground">
                      {merchantName}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {currentUser?.email}
                    </p>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      <StoreIcon className="h-3.5 w-3.5" />
                      <span>Verified {storeTypeLabel}</span>
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('store')}
                      className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <PinIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground">
                          Store Type & GPS Address
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {storeTypeLabel} · {storeLocation}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('products')}
                      className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <PackageIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground">
                          Manage Menu Catalog
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {allProducts.length} active product
                          {allProducts.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-left font-bold text-destructive"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                        <LogOutIcon className="h-5 w-5" />
                      </span>
                      <span className="text-sm">Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </main>

            {/* Bottom Navigation Bar (matches Student BottomNav) */}
            <nav className="border-t border-border bg-card/95 backdrop-blur">
              <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-6 pt-2">
                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                      activeTab === 'orders'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <span className="relative">
                      <ReceiptIcon className="h-6 w-6" />
                      {activeOrdersCount > 0 && (
                        <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                          {activeOrdersCount}
                        </span>
                      )}
                    </span>
                    Orders
                  </button>
                </li>

                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('products')}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                      activeTab === 'products'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <PackageIcon className="h-6 w-6" />
                    Menu
                  </button>
                </li>

                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('store')}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                      activeTab === 'store'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <StoreIcon className="h-6 w-6" />
                    Store
                  </button>
                </li>

                <li className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                      activeTab === 'account'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    <UserIcon className="h-6 w-6" />
                    Account
                  </button>
                </li>
              </ul>
            </nav>

            {/* Add / Edit Product BottomSheet inside the Phone Frame */}
            <AddProductSheet
              open={isModalOpen}
              initialProduct={editingProduct}
              defaultStoreType={uploadDefaultStoreType || storeType}
              onClose={() => {
                setIsModalOpen(false)
                setEditingProduct(null)
                setUploadDefaultStoreType(null)
              }}
              onSave={handleProductSaved}
            />
          </>
        )}
      </div>
    </div>
  )
}

type ModifierOption = { id: string; label: string; price: string }
type ModifierGroup = {
  id: string
  title: string
  required: boolean
  type: 'single' | 'multi'
  options: ModifierOption[]
}

const RESTAURANT_CATEGORY_OPTIONS = [
  'Burgers',
  'Kotas & Chips',
  'Chicken',
  'Pizza',
  'Bowls & Salads',
  'Wraps & Drinks',
  'Shisa Nyama',
  'Breakfast',
  'Desserts',
]

const GROCERY_CATEGORY_OPTIONS = DEPARTMENTS.map((d) => d.title)

function AddProductSheet({
  open,
  initialProduct,
  defaultStoreType,
  onClose,
  onSave,
}: {
  open: boolean
  initialProduct?: any
  defaultStoreType: StoreType
  onClose: () => void
  onSave: (data: any, files: File[]) => Promise<void>
}) {
  const [uploadStoreType, setUploadStoreType] = useState<StoreType>(defaultStoreType)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [oldPrice, setOldPrice] = useState('')
  const [size, setSize] = useState('')
  const [category, setCategory] = useState('Burgers')
  const [subcategory, setSubcategory] = useState('')
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [customCategoryInput, setCustomCategoryInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [existingImages, setExistingImages] = useState<string[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])

  const activeCategoryOptions =
    uploadStoreType === 'grocery'
      ? GROCERY_CATEGORY_OPTIONS
      : RESTAURANT_CATEGORY_OPTIONS

  const activeSubcategoryOptions = useMemo(() => {
    if (uploadStoreType === 'grocery') {
      const dept = DEPARTMENTS.find(
        (d) => d.title.toLowerCase() === category.toLowerCase(),
      )
      return dept ? dept.subcategories : []
    }
    const mealCat = MEAL_CATEGORIES.find(
      (c) => c.title.toLowerCase() === category.toLowerCase(),
    )
    return mealCat ? mealCat.subcategories : []
  }, [uploadStoreType, category])

  useEffect(() => {
    if (!open) return
    const inferredType: StoreType = initialProduct
      ? initialProduct.storeType === 'grocery' ||
        isGroceryCategory(initialProduct.category)
        ? 'grocery'
        : 'restaurant'
      : defaultStoreType

    setUploadStoreType(inferredType)
    setName(initialProduct?.name || '')
    setDescription(initialProduct?.description || '')
    setPrice(initialProduct ? initialProduct.price.toString() : '')
    setOldPrice(
      initialProduct?.oldPrice && Number(initialProduct.oldPrice) > 0
        ? initialProduct.oldPrice.toString()
        : '',
    )
    setSize(initialProduct?.size || '')
    setSubcategory(initialProduct?.subcategory || '')

    const optionsForType =
      inferredType === 'grocery'
        ? GROCERY_CATEGORY_OPTIONS
        : RESTAURANT_CATEGORY_OPTIONS
    const fallbackCat = optionsForType[0]
    const initialCat = initialProduct?.category?.trim() || fallbackCat
    const custom = initialProduct?.category
      ? !optionsForType.includes(initialCat)
      : false

    setCategory(initialCat)
    setIsCustomCategory(custom)
    setCustomCategoryInput(custom ? initialCat : '')
    setExistingImages(initialProduct?.images || [])
    setImageFiles([])
    setImagePreviews([])
    setModifierGroups(initialProduct?.modifierGroups || [])
  }, [open, initialProduct, defaultStoreType])

  const handleSwitchUploadType = (nextType: StoreType) => {
    setUploadStoreType(nextType)
    setIsCustomCategory(false)
    setCustomCategoryInput('')
    if (nextType === 'grocery') {
      setCategory(GROCERY_CATEGORY_OPTIONS[0])
      setSubcategory(DEPARTMENTS[0]?.subcategories[0] || '')
    } else {
      setCategory(RESTAURANT_CATEGORY_OPTIONS[0])
      setSubcategory(MEAL_CATEGORIES[0]?.subcategories[0] || '')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setImageFiles((prev) => [...prev, ...newFiles])
      const newUrls = newFiles.map((file) => URL.createObjectURL(file))
      setImagePreviews((prev) => [...prev, ...newUrls])
    }
  }

  const removeExistingImage = (indexToRemove: number) => {
    setExistingImages((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const removeImage = (indexToRemove: number) => {
    setImageFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleAddGroup = () => {
    setModifierGroups([
      ...modifierGroups,
      {
        id: Math.random().toString(),
        title: '',
        required: false,
        type: 'single',
        options: [],
      },
    ])
  }

  const updateGroup = (id: string, updates: Partial<ModifierGroup>) => {
    setModifierGroups(
      modifierGroups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    )
  }

  const removeGroup = (id: string) => {
    setModifierGroups(modifierGroups.filter((g) => g.id !== id))
  }

  const handleAddOption = (groupId: string) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            options: [
              ...g.options,
              { id: Math.random().toString(), label: '', price: '0' },
            ],
          }
        }
        return g
      }),
    )
  }

  const updateOption = (
    groupId: string,
    optionId: string,
    updates: Partial<ModifierOption>,
  ) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            options: g.options.map((o) =>
              o.id === optionId ? { ...o, ...updates } : o,
            ),
          }
        }
        return g
      }),
    )
  }

  const removeOption = (groupId: string, optionId: string) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            options: g.options.filter((o) => o.id !== optionId),
          }
        }
        return g
      }),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const parsedOldPrice = parseFloat(oldPrice)
    await onSave(
      {
        name,
        description,
        price: parseFloat(price) || 0,
        oldPrice:
          Number.isFinite(parsedOldPrice) && parsedOldPrice > (parseFloat(price) || 0)
            ? parsedOldPrice
            : undefined,
        size: size.trim() || undefined,
        category,
        subcategory: subcategory.trim() || undefined,
        storeType: uploadStoreType,
        modifierGroups,
        images: existingImages,
      },
      imageFiles,
    )
    setIsSubmitting(false)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        initialProduct
          ? uploadStoreType === 'grocery'
            ? 'Edit Shop Product'
            : 'Edit Restaurant Meal'
          : uploadStoreType === 'grocery'
            ? 'Upload Shop Product'
            : 'Upload Restaurant Meal'
      }
      footer={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full bg-secondary px-5 py-3 text-xs font-bold text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="merchant-product-form"
            disabled={isSubmitting}
            className="flex-1 rounded-full bg-primary py-3 text-xs font-bold text-primary-foreground shadow-sm disabled:opacity-50"
          >
            {isSubmitting
              ? 'Saving...'
              : initialProduct
                ? 'Save Changes'
                : uploadStoreType === 'grocery'
                  ? 'Upload Shop Product'
                  : 'Upload Restaurant Meal'}
          </button>
        </div>
      }
    >
      <form
        id="merchant-product-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 py-2"
      >
        {/* Upload Mode Switcher: Upload as Restaurant Owner vs Shop Owner */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-foreground">
            Upload As
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary p-1">
            <button
              type="button"
              onClick={() => handleSwitchUploadType('restaurant')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all',
                uploadStoreType === 'restaurant'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <StoreIcon className="h-3.5 w-3.5" />
              <span>Restaurant Owner</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchUploadType('grocery')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all',
                uploadStoreType === 'grocery'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <BagIcon className="h-3.5 w-3.5" />
              <span>Shop Owner</span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {uploadStoreType === 'grocery'
              ? 'Appears in Shop (Stores) departments & local grocery delivery.'
              : 'Appears in Eat (Meals) restaurant menus & meal categories.'}
          </p>
        </div>

        {/* Product Photos */}
        <div>
          <label className="mb-1.5 block text-xs font-bold text-foreground">
            Photos
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-background text-muted-foreground hover:border-primary hover:text-primary">
              <UploadCloudIcon className="h-5 w-5" />
              <span className="text-[11px] font-bold">Upload</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>

            {existingImages.map((src, index) => (
              <div
                key={`existing-${index}`}
                className="relative aspect-square overflow-hidden rounded-2xl bg-secondary ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Item ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingImage(index)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card/90 text-destructive shadow-sm"
                  aria-label="Remove photo"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {imagePreviews.map((src, index) => (
              <div
                key={`new-${index}`}
                className="relative aspect-square overflow-hidden rounded-2xl bg-secondary ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Upload ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card/90 text-destructive shadow-sm"
                  aria-label="Remove photo"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Name & Price */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-xs font-bold text-foreground">
              {uploadStoreType === 'grocery' ? 'Product Name' : 'Meal Name'}
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                uploadStoreType === 'grocery'
                  ? 'e.g. Full Cream Fresh Milk'
                  : 'e.g. Chicken Burger & Chips'
              }
              className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-foreground">
              Price (R)
            </label>
            <input
              required
              type="number"
              min="0.01"
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={uploadStoreType === 'grocery' ? '34.99' : '59.95'}
              className="rounded-2xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Pack Size / Weight & Optional Special Old Price */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-foreground">
              {uploadStoreType === 'grocery'
                ? 'Pack Size / Weight'
                : 'Portion / Combo Label'}
            </label>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder={
                uploadStoreType === 'grocery'
                  ? 'e.g. 2L, 700g, 6 Pack'
                  : 'e.g. Combo Meal, Quarter Loaf'
              }
              className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-foreground">
              Was Price (Optional Special)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={oldPrice}
              onChange={(e) => setOldPrice(e.target.value)}
              placeholder="e.g. 39.99"
              className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Category / Department Pills */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-foreground">
            {uploadStoreType === 'grocery' ? 'Shop Department' : 'Meal Category'}
          </label>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {activeCategoryOptions.map((catOption) => {
              const isSelected = !isCustomCategory && category === catOption
              return (
                <button
                  key={catOption}
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false)
                    setCategory(catOption)
                    setSubcategory('')
                  }}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground',
                  )}
                >
                  {catOption}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setIsCustomCategory(true)
                setCategory(customCategoryInput.trim() || 'Other')
              }}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors',
                isCustomCategory
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground',
              )}
            >
              + Custom
            </button>
          </div>
          {isCustomCategory && (
            <input
              required
              value={customCategoryInput}
              onChange={(e) => {
                setCustomCategoryInput(e.target.value)
                setCategory(e.target.value.trim() || 'Other')
              }}
              placeholder="Custom category name"
              className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
            />
          )}
        </div>

        {/* Sub-aisle / Subcategory Pills */}
        {!isCustomCategory && activeSubcategoryOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground">
              {uploadStoreType === 'grocery' ? 'Sub-Aisle' : 'Subcategory'}
            </label>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
              {activeSubcategoryOptions.map((subOpt) => {
                const active = subcategory === subOpt
                return (
                  <button
                    key={subOpt}
                    type="button"
                    onClick={() =>
                      setSubcategory(active ? '' : subOpt)
                    }
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {subOpt}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-foreground">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe ingredients or sides included..."
            className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>

        {/* Modifiers */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">
              Modifiers & Extras
            </span>
            <button
              type="button"
              onClick={handleAddGroup}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span>Add Group</span>
            </button>
          </div>

          {modifierGroups.map((group) => (
            <div
              key={group.id}
              className="flex flex-col gap-2.5 rounded-2xl bg-secondary/50 p-3 ring-1 ring-border"
            >
              <div className="flex items-center gap-2">
                <input
                  required
                  value={group.title}
                  onChange={(e) =>
                    updateGroup(group.id, { title: e.target.value })
                  }
                  placeholder="Group title (e.g. Drink choice)"
                  className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-1.5 text-xs font-semibold outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeGroup(group.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                  aria-label="Remove group"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs">
                <select
                  value={group.type}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      type: e.target.value as 'single' | 'multi',
                    })
                  }
                  className="rounded-xl border bg-card px-2.5 py-1 text-xs outline-none"
                >
                  <option value="single">Single choice</option>
                  <option value="multi">Multiple choice</option>
                </select>

                <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) =>
                      updateGroup(group.id, { required: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded accent-primary"
                  />
                  <span>Required</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5 border-l-2 border-primary/25 pl-2.5">
                {group.options.map((option) => (
                  <div key={option.id} className="flex items-center gap-1.5">
                    <input
                      required
                      value={option.label}
                      onChange={(e) =>
                        updateOption(group.id, option.id, {
                          label: e.target.value,
                        })
                      }
                      placeholder="Option name"
                      className="min-w-0 flex-1 rounded-xl border bg-card px-2.5 py-1.5 text-xs outline-none"
                    />
                    <div className="relative w-20 shrink-0">
                      <span className="absolute left-2 top-1.5 text-[11px] font-bold text-muted-foreground">
                        R
                      </span>
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={option.price}
                        onChange={(e) =>
                          updateOption(group.id, option.id, {
                            price: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border bg-card py-1.5 pl-5 pr-1.5 text-xs outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOption(group.id, option.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
                      aria-label="Remove option"
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handleAddOption(group.id)}
                  className="self-start text-xs font-bold text-primary"
                >
                  + Add Option
                </button>
              </div>
            </div>
          ))}
        </div>
      </form>
    </BottomSheet>
  )
}