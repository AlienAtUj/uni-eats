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
import { MerchantFinanceDashboard } from '@/components/uni-eats/merchant-finance-dashboard'
import { StoreDashboard } from '@/components/uni-eats/store-kds-dashboard'
import { validateInStorePrice } from '@/lib/dash-engine'
import { formatPrice, isGroceryCategory, type StoreType } from '@/lib/data'
import { DEPARTMENTS } from '@/lib/grocery-catalog'
import { MEAL_CATEGORIES } from '@/lib/meal-catalog'
import {
  type Coordinates,
  type DeliveryLocation,
  isValidSACoord,
  correctLocationTypos,
  searchAddresses,
  searchInstantLocations,
  geocodeStoreAddress,
  detectAccurateUserLocation,
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
  updateMerchantCompliance,
  verifyOrderPickupPin,
  useFirebaseRestaurants,
  type Order,
  type OrderStatus,
} from '@/lib/firebase-db'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { fetchUserRole } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { cn } from '@/lib/utils'

type MerchantTab = 'orders' | 'products' | 'store' | 'account'
type OrderFilter = 'all' | 'pending' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed'

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
  out_for_delivery: {
    pill: 'bg-[#e07a2e] text-white',
    label: 'Out for Delivery',
  },
  completed: {
    pill: 'bg-secondary text-muted-foreground',
    label: 'Delivered',
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
  out_for_delivery: 3,
  completed: 4,
  cancelled: 5,
}

const orderFilters: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'New' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'completed', label: 'Delivered' },
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

  const { products: fbProducts, mutate } = useFirebaseProducts(merchantId)
  const { restaurants: allRestaurants, mutate: mutateRestaurants } = useFirebaseRestaurants()
  const currentMerchantRecord = useMemo(
    () => allRestaurants.find((r) => r.id === merchantId),
    [allRestaurants, merchantId]
  )
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
  const [pickupPinInputs, setPickupPinInputs] = useState<Record<string, string>>({})
  const [pickupPinErrors, setPickupPinErrors] = useState<Record<string, string>>({})
  const [verifyingPickupId, setVerifyingPickupId] = useState<string | null>(null)

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
    }, 260)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [storeAddressQuery])

  const correctedStoreQueryHint = useMemo(() => {
    const raw = storeAddressQuery.trim()
    if (raw.length < 3) return null
    const fixed = correctLocationTypos(raw)
    return fixed.toLowerCase() !== raw.toLowerCase() ? fixed : null
  }, [storeAddressQuery])

  const handleSelectStoreLocation = (loc: DeliveryLocation) => {
    setNewStoreLocation(loc.label)
    setNewStoreCoords(loc.coords)
    setStoreAddressQuery('')
    setStoreAddressResults([])
  }

  const handleManualStoreAddressSubmit = async () => {
    const q = storeAddressQuery.trim()
    if (!q) return
    if (storeAddressResults.length > 0) {
      handleSelectStoreLocation(storeAddressResults[0])
      return
    }
    setIsSearchingStoreAddress(true)
    try {
      const results = await searchAddresses(q)
      if (results.length > 0) {
        handleSelectStoreLocation(results[0])
      }
    } finally {
      setIsSearchingStoreAddress(false)
    }
  }

  const handleUseStoreGpsLocation = async () => {
    setIsLocatingStoreGps(true)
    try {
      const resolved = await detectAccurateUserLocation()
      if (resolved) {
        setNewStoreLocation(resolved.label)
        setNewStoreCoords(resolved.coords)
        setStoreAddressQuery('')
        setStoreAddressResults([])
      } else {
        alert('Location permission denied or unavailable. Please search your street address.')
      }
    } catch {
      alert('Could not resolve address from GPS.')
    } finally {
      setIsLocatingStoreGps(false)
    }
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
      // Enforce In-Store Price Promise on every product upload/edit
      const submittedPrice = Number(newProductData.price)
      const physicalInStorePrice = Number(
        newProductData.inStorePrice ??
          newProductData.oldPrice ??
          editingProduct?.price ??
          submittedPrice
      )
      validateInStorePrice(submittedPrice, physicalInStorePrice)

      if (currentMerchantRecord && currentMerchantRecord.inStorePricePromiseAccepted === false) {
        alert('You must accept the In-Store Menu Price Promise before uploading products.')
        return
      }

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
    const existingProduct = allProducts.find((p) => p.id === productId)
    if (existingProduct) {
      try {
        validateInStorePrice(parsed, existingProduct.oldPrice ?? existingProduct.price)
      } catch (err: any) {
        alert(err?.message || 'In-Store Price Promise violation: cannot inflate price.')
        return
      }
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

      if (!resolvedCoords || !isValidSACoord(resolvedCoords.lat, resolvedCoords.lng)) {
        alert('Please select a valid store address or GPS pin inside South Africa before saving.')
        return
      }

      const userPayload: Record<string, any> = {
        name: cleanName,
        storeName: cleanName,
        storeLocation: cleanLoc,
        storeType: newStoreType,
        deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
        coords: resolvedCoords,
        coordsVerifiedAt: serverTimestamp(),
      }
      const restPayload: Record<string, any> = {
        name: cleanName,
        location: cleanLoc,
        pickupTime: cleanPickup,
        storeType: newStoreType,
        deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
        coords: resolvedCoords,
        coordsVerifiedAt: serverTimestamp(),
      }
      setNewStoreCoords(resolvedCoords)

      await Promise.all([
        setDoc(doc(db, 'users', merchantId), userPayload, { merge: true }),
        setDoc(doc(db, 'restaurants', merchantId), restPayload, { merge: true }),
      ])

      setMerchantName(cleanName)
      setStoreType(newStoreType)
      setStoreLocation(cleanLoc)
      setStoreCoords(resolvedCoords)
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
  const outForDeliveryOrdersCount = orders.filter(
    (o) => o.status === 'out_for_delivery',
  ).length
  const completedOrdersCount = orders.filter(
    (o) => o.status === 'completed',
  ).length
  const activeOrdersCount =
    pendingOrdersCount + preparingOrdersCount + readyOrdersCount + outForDeliveryOrdersCount

  const filterCounts: Record<OrderFilter, number> = {
    all: orders.length,
    pending: pendingOrdersCount,
    preparing: preparingOrdersCount,
    ready: readyOrdersCount,
    out_for_delivery: outForDeliveryOrdersCount,
    completed: completedOrdersCount,
  }

  const [isPaused, setIsPaused] = useState(false)

  const handleTogglePause = async () => {
    const next = !isPaused
    setIsPaused(next)
    if (!merchantId) return
    try {
      await setDoc(doc(db, 'restaurants', merchantId), { isPaused: next }, { merge: true })
    } catch (err) {
      console.error('Failed to update store pause state:', err)
    }
  }

  const totalRevenue = orders
    .filter((o) => o.status === 'completed' || o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

  const storeTypeLabel =
    storeType === 'grocery' ? 'Shop / Grocery Owner' : 'Restaurant Owner'

  return (
    <div className="min-h-dvh w-full bg-[#F4F4F5] font-sans text-[#09090B]">
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col border-x border-zinc-200 bg-[#F4F4F5]">
        {isCheckingAccess ? (
          <div className="flex flex-1 items-center justify-center p-12">
            <div className="border border-zinc-200 bg-white rounded-md px-6 py-4 text-xs font-black uppercase tracking-widest text-[#71717A]">
              AUTHENTICATING PARTNER PORTAL...
            </div>
          </div>
        ) : (
          <>
            {/* Sticky Industrial Top Header + Desktop Navigation */}
            <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-zinc-200 bg-[#09090B]">
                    <Image
                      src="/dash-logo.jpg"
                      alt="Dash"
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                      PARTNER PORTAL · {storeType === 'grocery' ? 'SHOP / GROCERY' : 'RESTAURANT'}
                    </p>
                    <p className="truncate text-lg font-black leading-tight tracking-tight text-[#09090B] sm:text-xl">
                      {merchantName}
                    </p>
                  </div>
                </div>

                {/* Desktop Tab Navigation (hidden on mobile; mobile uses bottom bar) */}
                <nav className="hidden md:flex items-center gap-1.5" aria-label="Primary">
                  {(
                    [
                      { id: 'orders', label: 'ORDERS', count: activeOrdersCount },
                      { id: 'products', label: 'MENU', count: allProducts.length },
                      { id: 'store', label: 'STORE', count: null },
                      { id: 'account', label: 'ACCOUNT', count: null },
                    ] as const
                  ).map((item) => {
                    const active = activeTab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-sm px-3.5 py-2 text-xs font-black uppercase tracking-widest transition-colors',
                          active
                            ? 'bg-[#09090B] text-white'
                            : 'border border-zinc-200 bg-white text-[#71717A] hover:text-[#09090B]'
                        )}
                      >
                        <span>{item.label}</span>
                        {item.count !== null && (
                          <span
                            className={cn(
                              'rounded-sm px-1.5 py-0.5 text-[10px] font-black [font-variant-numeric:tabular-nums]',
                              active ? 'bg-white/20 text-white' : 'bg-[#F4F4F5] text-[#09090B]'
                            )}
                          >
                            {item.count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </nav>

                {/* Right: Compact Location Jump + Account Initial */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('store')}
                    className="hidden sm:inline-flex max-w-[220px] items-center gap-2 rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-2 text-left text-xs font-bold text-[#09090B] hover:bg-zinc-200/70"
                    title={`${storeLocation} · ${storePickupTime}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#047857]" />
                    <span className="truncate">{storeLocation}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('account')}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-zinc-200 bg-[#F4F4F5] text-xs font-black uppercase text-[#09090B] hover:bg-zinc-200"
                    aria-label="Store account"
                  >
                    {merchantName.slice(0, 2).toUpperCase()}
                  </button>
                </div>
              </div>

              {/* Mobile Location Strip */}
              <button
                type="button"
                onClick={() => setActiveTab('store')}
                className="mt-2.5 flex w-full items-center justify-between rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-2 text-left sm:hidden"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs font-bold text-[#09090B]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#047857]" />
                  <span className="truncate">
                    {storeLocation} · {storePickupTime}
                  </span>
                </span>
                <span className="ml-2 shrink-0 text-[10px] font-black uppercase tracking-widest text-[#71717A]">
                  EDIT
                </span>
              </button>

              {/* Search Input for Orders & Menu tabs */}
              {(activeTab === 'orders' || activeTab === 'products') && (
                <div className="mt-2.5 flex items-center gap-2 rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#71717A]">
                    FIND
                  </span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      activeTab === 'orders'
                        ? 'Search order ID, customer, or meal...'
                        : 'Search menu items or categories...'
                    }
                    className="w-full bg-transparent text-sm font-medium text-[#09090B] placeholder:text-[#71717A] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="rounded-sm border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#09090B]"
                    >
                      CLR
                    </button>
                  )}
                </div>
              )}
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-20 md:pb-6">
              {/* TAB 1: ORDERS (High-Density KDS & Enterprise SaaS Dashboard) */}
              {activeTab === 'orders' && (
                <StoreDashboard
                  merchantName={merchantName}
                  storeType={storeType === 'grocery' ? 'grocery' : 'food'}
                  orders={filteredOrders}
                  isLoading={isLoadingOrders}
                  isPaused={isPaused}
                  onTogglePause={handleTogglePause}
                  onUpdateStatus={handleStatusUpdate}
                  onVerifyPickupPin={async (orderId, pin) => {
                    await verifyOrderPickupPin(orderId, pin)
                  }}
                  financeSlot={
                    <MerchantFinanceDashboard
                      merchantName={merchantName}
                      storeType={storeType === 'grocery' ? 'grocery' : 'food'}
                      initialPricePromiseAccepted={Boolean(
                        currentMerchantRecord?.inStorePricePromiseAccepted
                      )}
                      initialSponsoredTop3={Boolean(
                        currentMerchantRecord?.sponsoredTop3Active
                      )}
                      onTogglePricePromise={async (accepted) => {
                        if (!merchantId) return
                        await updateMerchantCompliance(merchantId, {
                          inStorePricePromiseAccepted: accepted,
                        })
                        mutateRestaurants()
                      }}
                      onToggleSponsoredTop3={async (active) => {
                        if (!merchantId) return
                        await updateMerchantCompliance(merchantId, {
                          sponsoredTop3Active: active,
                        })
                        mutateRestaurants()
                      }}
                      onVerifyPickup={async (orderDocId, pin) => {
                        await verifyOrderPickupPin(orderDocId, pin)
                      }}
                      orders={orders.map((o) => {
                        const createdMs =
                          o.createdAt?.toMillis?.() ||
                          (typeof o.createdAt === 'number' ? o.createdAt : Date.now())
                        return {
                          id: o.id,
                          orderCode: o.orderId || o.id.slice(0, 8),
                          grossOrderValueZar: Number(o.total || 0),
                          deliveryFeeZar: Number(o.deliveryFeeZar ?? 0),
                          storeType: storeType === 'grocery' ? 'grocery' : 'food',
                          paymentMethod:
                            o.paymentChannel === 'capitec_pay'
                              ? 'capitec_pay'
                              : o.paymentChannel === 'card'
                                ? 'card'
                                : 'ozow',
                          pickupPin: o.pickupPin || '',
                          batchDispatch: Boolean(o.batchDispatch),
                          prepStartedAtMs: createdMs,
                          pickupVerified: Boolean(o.pickupVerified) || o.status === 'completed',
                        }
                      })}
                    />
                  }
                />
              )}

              {/* TAB 2: MENU / PRODUCTS */}
              {activeTab === 'products' && (
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Operating Mode + Catalog Header */}
                  <div className="border border-zinc-200 bg-white rounded-md p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          OPERATING & UPLOADING MODE
                        </span>
                        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:inline-flex">
                          <button
                            type="button"
                            onClick={() => handleQuickSwitchStoreType('restaurant')}
                            className={cn(
                              'rounded-sm px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors',
                              storeType === 'restaurant'
                                ? 'bg-[#09090B] text-white'
                                : 'border border-zinc-200 bg-[#F4F4F5] text-[#71717A] hover:text-[#09090B]'
                            )}
                          >
                            RESTAURANT (MEALS)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickSwitchStoreType('grocery')}
                            className={cn(
                              'rounded-sm px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors',
                              storeType === 'grocery'
                                ? 'bg-[#09090B] text-white'
                                : 'border border-zinc-200 bg-[#F4F4F5] text-[#71717A] hover:text-[#09090B]'
                            )}
                          >
                            SHOP / GROCERY
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-3 lg:border-t-0 lg:pt-0">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                            LIVE CATALOG
                          </span>
                          <span className="text-xl font-black text-[#09090B] [font-variant-numeric:tabular-nums]">
                            {allProducts.length} ITEMS
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(null)
                            setUploadDefaultStoreType(storeType)
                            setIsModalOpen(true)
                          }}
                          className="rounded-sm bg-[#047857] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#065F46]"
                        >
                          + {storeType === 'grocery' ? 'ADD SHOP PRODUCT' : 'ADD MEAL'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Responsive Product Grid */}
                  {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredProducts.map((p) => {
                        const modCount = Array.isArray(p.modifierGroups)
                          ? p.modifierGroups.length
                          : 0
                        const isGroceryItem =
                          p.storeType === 'grocery' || isGroceryCategory(p.category)

                        return (
                          <article
                            key={p.id}
                            className="flex flex-col justify-between gap-3 border border-zinc-200 bg-white rounded-md p-3.5"
                          >
                            <div className="flex gap-3">
                              <div className="flex min-w-0 flex-1 flex-col">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'text-[10px] font-black uppercase tracking-widest',
                                      isGroceryItem ? 'text-[#047857]' : 'text-[#1D4ED8]'
                                    )}
                                  >
                                    [{isGroceryItem ? 'SHOP' : 'FOOD'}]
                                  </span>
                                  <span className="rounded-sm border border-zinc-200 bg-[#F4F4F5] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                                    {p.category || 'MENU'}
                                  </span>
                                  {p.size && (
                                    <span className="rounded-sm border border-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-[#09090B]">
                                      {p.size}
                                    </span>
                                  )}
                                  {modCount > 0 && (
                                    <span className="text-[10px] font-bold text-[#71717A]">
                                      +{modCount} OPT
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-1.5 truncate text-sm font-black text-[#09090B]">
                                  {p.name}
                                </h3>

                                {p.description && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-[#71717A]">
                                    {p.description}
                                  </p>
                                )}

                                <div className="mt-auto flex items-baseline gap-2 pt-2">
                                  <span className="text-base font-black text-[#09090B] [font-variant-numeric:tabular-nums]">
                                    {formatPrice(p.price)}
                                  </span>
                                  {p.oldPrice && Number(p.oldPrice) > Number(p.price) && (
                                    <span className="text-xs font-bold text-[#71717A] line-through [font-variant-numeric:tabular-nums]">
                                      {formatPrice(Number(p.oldPrice))}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-zinc-200 bg-[#F4F4F5]">
                                {p.images && p.images.length > 0 && p.images[0] && p.images[0].trim() ? (
                                  <Image
                                    src={p.images[0].trim()}
                                    alt={p.name}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase tracking-widest text-[#71717A]">
                                    NO IMG
                                  </div>
                                )}
                              </div>
                            </div>

                            {editingProductId === p.id ? (
                              <div className="flex items-center gap-2 border-t border-zinc-200 pt-2.5">
                                <span className="text-xs font-black text-[#71717A]">R</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  value={editingPriceValue}
                                  onChange={(e) => setEditingPriceValue(e.target.value)}
                                  className="min-w-0 flex-1 rounded-sm border border-zinc-300 bg-[#F4F4F5] px-2.5 py-1.5 text-sm font-black text-[#09090B] [font-variant-numeric:tabular-nums] outline-none focus:border-[#09090B] focus:bg-white"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSavePrice(p.id)}
                                  disabled={isUpdatingPrice}
                                  className="rounded-sm bg-[#047857] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white"
                                >
                                  SAVE
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingProductId(null)}
                                  disabled={isUpdatingPrice}
                                  className="rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#71717A]"
                                >
                                  ESC
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-2.5">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(p)
                                      setIsModalOpen(true)
                                    }}
                                    className="rounded-sm bg-[#09090B] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-zinc-800"
                                  >
                                    EDIT
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditPrice(p)}
                                    className="rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#09090B] hover:bg-zinc-200"
                                  >
                                    PRICE
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id, p.name)}
                                  className="rounded-sm border border-zinc-200 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#DC2626] hover:bg-red-50"
                                  aria-label={`Delete ${p.name}`}
                                >
                                  DEL
                                </button>
                              </div>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="border border-zinc-200 bg-white rounded-md p-10 text-center">
                      <p className="text-sm font-black uppercase tracking-widest text-[#09090B]">
                        CATALOG EMPTY
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-[#71717A]">
                        Upload meals or shop inventory so nearby customers can place orders.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(null)
                            setUploadDefaultStoreType('restaurant')
                            setIsModalOpen(true)
                          }}
                          className="rounded-sm bg-[#047857] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white"
                        >
                          + UPLOAD RESTAURANT MEAL
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(null)
                            setUploadDefaultStoreType('grocery')
                            setIsModalOpen(true)
                          }}
                          className="rounded-sm border border-zinc-200 bg-[#F4F4F5] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#09090B]"
                        >
                          + UPLOAD SHOP PRODUCT
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: STORE DETAILS & SETTINGS */}
              {activeTab === 'store' && (
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* Left Form Column */}
                    <form
                      onSubmit={handleSaveStoreSettings}
                      className="lg:col-span-7 flex flex-col gap-4 border border-zinc-200 bg-white rounded-md p-5"
                    >
                      <div className="border-b border-zinc-200 pb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          STORE CONFIGURATION
                        </p>
                        <h2 className="mt-0.5 text-lg font-black text-[#09090B]">
                          BUSINESS PROFILE & VERIFIED GPS
                        </h2>
                      </div>

                      {/* Business Type Selector */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          BUSINESS TYPE
                        </label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setNewStoreType('restaurant')}
                            className={cn(
                              'flex flex-col items-start gap-1 rounded-sm border p-3.5 text-left transition-colors',
                              newStoreType === 'restaurant'
                                ? 'border-[#09090B] bg-[#09090B] text-white'
                                : 'border-zinc-200 bg-[#F4F4F5] text-[#09090B] hover:bg-zinc-200/70'
                            )}
                          >
                            <span className="text-xs font-black uppercase tracking-widest">
                              RESTAURANT OWNER
                            </span>
                            <span
                              className={cn(
                                'text-[11px]',
                                newStoreType === 'restaurant' ? 'text-zinc-300' : 'text-[#71717A]'
                              )}
                            >
                              Meals, Burgers, Kotas & Takeaways
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setNewStoreType('grocery')}
                            className={cn(
                              'flex flex-col items-start gap-1 rounded-sm border p-3.5 text-left transition-colors',
                              newStoreType === 'grocery'
                                ? 'border-[#09090B] bg-[#09090B] text-white'
                                : 'border-zinc-200 bg-[#F4F4F5] text-[#09090B] hover:bg-zinc-200/70'
                            )}
                          >
                            <span className="text-xs font-black uppercase tracking-widest">
                              SHOP / GROCERY OWNER
                            </span>
                            <span
                              className={cn(
                                'text-[11px]',
                                newStoreType === 'grocery' ? 'text-zinc-300' : 'text-[#71717A]'
                              )}
                            >
                              Groceries, Spaza, Butcher & Produce
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          {newStoreType === 'grocery' ? 'SHOP / SUPERMARKET NAME' : 'RESTAURANT NAME'}
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
                          className="w-full rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3.5 py-2.5 text-sm font-bold text-[#09090B] outline-none focus:border-[#09090B] focus:bg-white"
                        />
                      </div>

                      {/* Real-Time Store Street Address & GPS Coordinates */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          STORE STREET ADDRESS & GPS LOCATION
                        </label>
                        <div className="flex items-center gap-2 rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3 py-2 focus-within:border-[#09090B] focus-within:bg-white">
                          <input
                            type="text"
                            value={newStoreLocation}
                            onChange={(e) => {
                              setNewStoreLocation(e.target.value)
                              setStoreAddressQuery(e.target.value)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && storeAddressQuery.trim().length >= 1) {
                                e.preventDefault()
                                handleManualStoreAddressSubmit()
                              }
                            }}
                            placeholder="Enter street address, suburb, or city..."
                            className="w-full bg-transparent text-sm font-medium text-[#09090B] outline-none placeholder:text-[#71717A]"
                          />
                          {isSearchingStoreAddress && (
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-[#1D4ED8]">
                              ...
                            </span>
                          )}
                          {newStoreLocation && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewStoreLocation('')
                                setStoreAddressQuery('')
                                setStoreAddressResults([])
                              }}
                              className="shrink-0 rounded-sm border border-zinc-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#71717A] hover:text-[#09090B]"
                            >
                              CLR
                            </button>
                          )}
                          {storeAddressQuery.trim().length >= 2 && (
                            <button
                              type="button"
                              onClick={handleManualStoreAddressSubmit}
                              className="shrink-0 rounded-sm bg-[#09090B] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white"
                            >
                              SET
                            </button>
                          )}
                        </div>

                        {correctedStoreQueryHint && (
                          <p className="text-[11px] font-medium text-[#71717A]">
                            Auto-matched to{' '}
                            <span className="font-bold text-[#047857] capitalize">
                              {correctedStoreQueryHint}
                            </span>
                          </p>
                        )}

                        {storeAddressQuery.trim().length >= 1 && (
                          <div className="max-h-60 overflow-y-auto rounded-sm border border-zinc-200 bg-white divide-y divide-zinc-200">
                            {isSearchingStoreAddress && storeAddressResults.length === 0 ? (
                              <p className="py-4 text-center text-xs font-bold uppercase tracking-widest text-[#71717A]">
                                SEARCHING SOUTH AFRICA...
                              </p>
                            ) : storeAddressResults.length === 0 ? (
                              <p className="py-4 text-center text-xs text-[#71717A]">
                                No matching address found. Enter street name or suburb.
                              </p>
                            ) : (
                              storeAddressResults.map((loc, idx) => (
                                <button
                                  key={`${loc.label}-${idx}`}
                                  type="button"
                                  onClick={() => handleSelectStoreLocation(loc)}
                                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-[#F4F4F5]"
                                >
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#047857]" />
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold text-[#09090B]">
                                      {loc.label}
                                    </span>
                                    <span className="block truncate text-[11px] text-[#71717A]">
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
                          className="mt-1 w-full rounded-sm border border-zinc-200 bg-[#F4F4F5] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#09090B] hover:bg-zinc-200 disabled:opacity-50"
                        >
                          {isLocatingStoreGps
                            ? 'DETECTING HARDWARE GPS...'
                            : 'USE MY CURRENT GPS LOCATION'}
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          ESTIMATED PREP TIME
                        </label>
                        <input
                          type="text"
                          value={newStorePickupTime}
                          onChange={(e) => setNewStorePickupTime(e.target.value)}
                          placeholder="e.g. 15-25 min"
                          className="w-full rounded-sm border border-zinc-200 bg-[#F4F4F5] px-3.5 py-2.5 text-sm font-bold text-[#09090B] outline-none focus:border-[#09090B] focus:bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSavingStore || !newStoreName.trim()}
                        className="mt-1 w-full rounded-sm bg-[#047857] py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#065F46] disabled:opacity-50"
                      >
                        {savedStoreSuccess
                          ? 'STORE SETTINGS SAVED'
                          : isSavingStore
                            ? 'SAVING...'
                            : 'SAVE STORE SETTINGS'}
                      </button>
                    </form>

                    {/* Right Telemetry / Verification Panel */}
                    <aside className="lg:col-span-5 flex flex-col gap-4">
                      <div className="border border-zinc-200 bg-white rounded-md p-5 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          GEOSPATIAL DISPATCH STATUS
                        </p>
                        <div className="bg-[#09090B] text-white rounded-sm p-3.5">
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                            PINNED COORDINATES
                          </span>
                          <span className="mt-1 block text-base font-black tracking-wider [font-variant-numeric:tabular-nums]">
                            {newStoreCoords
                              ? `${newStoreCoords.lat.toFixed(5)}, ${newStoreCoords.lng.toFixed(5)}`
                              : 'NOT PINNED'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="border border-zinc-200 bg-[#F4F4F5] rounded-sm p-3">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                              DISPATCH RADIUS
                            </span>
                            <span className="text-lg font-black text-[#09090B] [font-variant-numeric:tabular-nums]">
                              {SERVICE_DELIVERY_RADIUS_KM} KM
                            </span>
                          </div>
                          <div className="border border-zinc-200 bg-[#F4F4F5] rounded-sm p-3">
                            <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                              STORE STATUS
                            </span>
                            <span
                              className={cn(
                                'text-sm font-black uppercase tracking-widest',
                                isPaused ? 'text-[#DC2626]' : 'text-[#047857]'
                              )}
                            >
                              {isPaused ? 'PAUSED' : 'ONLINE'}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-[#71717A]">
                          Customers within {SERVICE_DELIVERY_RADIUS_KM} km see your store ranked by real road distance.
                        </p>
                      </div>
                    </aside>
                  </div>
                </div>
              )}

              {/* TAB 4: ACCOUNT */}
              {activeTab === 'account' && (
                <div className="p-4 sm:p-6">
                  <div className="mx-auto max-w-3xl space-y-4">
                    <div className="flex flex-col items-start justify-between gap-4 border border-zinc-200 bg-white rounded-md p-5 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-[#09090B] text-xl font-black text-white">
                          {merchantName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[#047857]">
                            VERIFIED {storeTypeLabel.toUpperCase()}
                          </p>
                          <h2 className="text-lg font-black text-[#09090B]">
                            {merchantName}
                          </h2>
                          <p className="text-xs font-medium text-[#71717A]">
                            {currentUser?.email}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full sm:w-auto rounded-sm border border-[#DC2626] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#DC2626] hover:bg-red-50"
                      >
                        SIGN OUT
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('store')}
                        className="flex flex-col items-start gap-1 border border-zinc-200 bg-white rounded-md p-4 text-left hover:bg-[#F4F4F5]"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          LOCATION & CONFIG
                        </span>
                        <span className="text-sm font-black text-[#09090B]">
                          Store Type & GPS Address
                        </span>
                        <span className="truncate w-full text-xs text-[#71717A]">
                          {storeLocation}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('products')}
                        className="flex flex-col items-start gap-1 border border-zinc-200 bg-white rounded-md p-4 text-left hover:bg-[#F4F4F5]"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                          INVENTORY
                        </span>
                        <span className="text-sm font-black text-[#09090B]">
                          Manage Menu Catalog
                        </span>
                        <span className="text-xs text-[#71717A] [font-variant-numeric:tabular-nums]">
                          {allProducts.length} active product{allProducts.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>

            {/* Mobile-Only Bottom Navigation Bar (Desktop uses top header tabs) */}
            <nav
              className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white md:hidden"
              aria-label="Mobile Navigation"
            >
              <ul className="grid grid-cols-4">
                {(
                  [
                    { id: 'orders', label: 'ORDERS', count: activeOrdersCount },
                    { id: 'products', label: 'MENU', count: null },
                    { id: 'store', label: 'STORE', count: null },
                    { id: 'account', label: 'ACCOUNT', count: null },
                  ] as const
                ).map((item) => {
                  const active = activeTab === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          'flex w-full items-center justify-center gap-1.5 border-t-2 py-3.5 text-[11px] font-black uppercase tracking-widest transition-colors',
                          active
                            ? 'border-[#09090B] bg-[#F4F4F5] text-[#09090B]'
                            : 'border-transparent text-[#71717A]'
                        )}
                      >
                        <span>{item.label}</span>
                        {item.count !== null && item.count > 0 && (
                          <span className="rounded-sm bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-black text-white [font-variant-numeric:tabular-nums]">
                            {item.count}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
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