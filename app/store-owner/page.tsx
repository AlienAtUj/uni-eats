'use client'

import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  PackageIcon,
  TrendingUpIcon,
  BagIcon,
  StarIcon,
  MoreVerticalIcon,
  SearchIcon,
  BellIcon,
  CloseIcon,
  TrashIcon,
  UploadCloudIcon,
  CheckIcon,
  ClockIcon,
} from '@/components/icons'
import { formatPrice, campuses, categories } from '@/lib/data'
import Image from 'next/image'
import { 
  useFirebaseProducts, 
  createProduct, 
  updateProduct,
  updateProductPrice, 
  deleteProduct, 
  getMerchantOrders, 
  subscribeToMerchantOrders,
  updateOrderStatus, 
  type Order, 
  type OrderStatus 
} from '@/lib/firebase-db'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { fetchUserRole, type UserRole } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const statusColors: Record<OrderStatus, string> = {
  pending: 'bg-accent/10 text-accent font-bold',
  preparing: 'bg-blue-500/10 text-blue-600 font-bold',
  ready: 'bg-primary/10 text-primary font-bold',
  completed: 'bg-muted text-muted-foreground font-semibold',
  cancelled: 'bg-destructive/10 text-destructive font-semibold',
}

const statusOptions: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed']

export default function StoreOwnerDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'orders' | 'products'>('orders')
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [merchantName, setMerchantName] = useState<string>('Store Owner')
  const [storeLocation, setStoreLocation] = useState<string>('Student Centre')
  const [storeCampusId, setStoreCampusId] = useState<string>('aucklandpark')
  const [storePickupTime, setStorePickupTime] = useState<string>('10-15 min')
  
  const [isEditingStoreName, setIsEditingStoreName] = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreLocation, setNewStoreLocation] = useState('')
  const [newStoreCampusId, setNewStoreCampusId] = useState('aucklandpark')
  const [newStorePickupTime, setNewStorePickupTime] = useState('10-15 min')
  const [isSavingName, setIsSavingName] = useState(false)
  const [isCheckingAccess, setIsCheckingAccess] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)

  const { products: fbProducts, mutate } = useFirebaseProducts()
  // Filter products for this merchant if merchantId is available
  const allProducts = merchantId 
    ? fbProducts.filter(p => p.merchantId === merchantId)
    : fbProducts
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Fetch merchant profile and orders
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/login')
        return
      }

      const role = await fetchUserRole(user.uid)
      if (role !== 'merchant') {
        router.replace('/')
        return
      }

      setMerchantId(user.uid)

      // Fetch merchant details from Firestore
      try {
        let currentName = 'Store Owner'
        let loc = 'Student Centre'
        let campus = 'aucklandpark'
        let pickup = '10-15 min'

        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          const data = userDoc.data()
          currentName = data.storeName || data.businessName || data.name || 'Store Owner'
          if (data.storeLocation || data.location) loc = data.storeLocation || data.location
          if (data.campusId) campus = data.campusId
        }

        const restDoc = await getDoc(doc(db, 'restaurants', user.uid))
        if (restDoc.exists()) {
          const rData = restDoc.data()
          if (rData.name) currentName = rData.name
          if (rData.location) loc = rData.location
          if (rData.campusIds && rData.campusIds.length > 0) campus = rData.campusIds[0]
          if (rData.pickupTime) pickup = rData.pickupTime
        }

        setMerchantName(currentName)
        setNewStoreName(currentName)
        setStoreLocation(loc)
        setNewStoreLocation(loc)
        setStoreCampusId(campus)
        setNewStoreCampusId(campus)
        setStorePickupTime(pickup)
        setNewStorePickupTime(pickup)
      } catch (error) {
        console.error('Error fetching merchant details:', error)
      }

      // Subscribe to real-time live orders
      setIsLoadingOrders(true)
      const unsubOrders = subscribeToMerchantOrders(user.uid, (liveOrders) => {
        setOrders(liveOrders)
        setIsLoadingOrders(false)
      })

      setIsCheckingAccess(false)

      return () => {
        unsubOrders()
      }
    })
    return () => unsub()
  }, [router])

  // Handle order status update
  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus)
    } catch (error) {
      console.error('Error updating order status:', error)
      alert('Failed to update order status')
    }
  }

  const [editingProduct, setEditingProduct] = useState<any | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingPriceValue, setEditingPriceValue] = useState<string>('')
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)

  const handleProductSaved = async (newProductData: any, imageFiles: File[]) => {
    if (!merchantId) {
      alert('You must be logged in as a merchant to manage products.')
      return
    }

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, merchantId, newProductData, imageFiles)
      } else {
        await createProduct(merchantId, newProductData, imageFiles)
      }
      mutate()
      setIsModalOpen(false)
      setEditingProduct(null)
    } catch (e) {
      console.error(e)
      alert(editingProduct ? 'Failed to update product.' : 'Failed to upload product.')
    }
  }

  if (isCheckingAccess) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[oklch(0.97_0.01_100)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const displayOrders = orders

  // Stats from real data
  const stats = {
    revenue: orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total, 0),
    ordersToday: orders.length,
    rating: 'New (0 reviews)',
  }

  const handleStartEditPrice = (product: { id: string; price: number }) => {
    setEditingProductId(product.id)
    setEditingPriceValue(product.price.toString())
  }

  const handleSavePrice = async (productId: string) => {
    const parsed = parseFloat(editingPriceValue)
    if (isNaN(parsed) || parsed < 0) {
      alert('Please enter a valid price.')
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
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return
    try {
      await deleteProduct(productId)
      mutate()
    } catch (e) {
      console.error(e)
      alert('Failed to delete product.')
    }
  }

  const handleSaveStoreSettings = async () => {
    if (!merchantId || !newStoreName.trim()) return
    setIsSavingName(true)
    try {
      const cleanName = newStoreName.trim()
      const cleanLoc = newStoreLocation.trim() || 'Student Centre'
      const cleanPickup = newStorePickupTime.trim() || '10-15 min'
      const campusIds = newStoreCampusId === 'all'
        ? ['aucklandpark', 'buntingroad', 'doornfontein', 'soweto']
        : [newStoreCampusId]

      await setDoc(doc(db, 'users', merchantId), { 
        name: cleanName, 
        storeName: cleanName,
        storeLocation: cleanLoc,
        campusId: newStoreCampusId
      }, { merge: true })

      await setDoc(doc(db, 'restaurants', merchantId), { 
        name: cleanName,
        location: cleanLoc,
        campusIds: campusIds,
        pickupTime: cleanPickup
      }, { merge: true })

      setMerchantName(cleanName)
      setStoreLocation(cleanLoc)
      setStoreCampusId(newStoreCampusId)
      setStorePickupTime(cleanPickup)
      setIsEditingStoreName(false)
    } catch (err) {
      console.error('Error saving store details:', err)
      alert('Failed to save store details.')
    } finally {
      setIsSavingName(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[oklch(0.97_0.01_100)] text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary/10">
            <Image src="/unieats-logo.jpg" alt="UniEats" width={40} height={40} className="object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight">{merchantName}</h1>
              <button
                type="button"
                onClick={() => {
                  setNewStoreName(merchantName)
                  setNewStoreLocation(storeLocation)
                  setNewStoreCampusId(storeCampusId)
                  setNewStorePickupTime(storePickupTime)
                  setIsEditingStoreName(true)
                }}
                className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold text-primary hover:bg-secondary/80 transition-colors"
              >
                ⚙️ Store Settings & Location
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1 font-semibold text-foreground/80">
                📍 {storeLocation}
              </span>
              <span>•</span>
              <span className="text-primary font-bold">
                {campuses.find(c => c.id === storeCampusId)?.name || 'All Campuses'}
              </span>
              <span>•</span>
              <span>{storePickupTime}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 rounded-full bg-background px-4 py-2 ring-1 ring-border">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search orders or products..."
              className="bg-transparent text-sm outline-none placeholder:text-muted-foreground w-48"
            />
          </div>
          <button className="relative rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors">
            <BellIcon className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-accent" />
          </button>
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            aria-label="Open profile"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[oklch(0.95_0.02_150)] text-sm font-bold text-primary">
              {merchantName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline">Profile</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
          <StatCard
            title="Today's Revenue"
            value={formatPrice(stats.revenue)}
            icon={<TrendingUpIcon className="h-5 w-5 text-primary" />}
          />
          <StatCard
            title="Total Orders"
            value={stats.ordersToday.toString()}
            icon={<BagIcon className="h-5 w-5 text-accent" />}
          />
          <StatCard
            title="Active Products"
            value={allProducts.length.toString()}
            icon={<PackageIcon className="h-5 w-5 text-blue-500" />}
          />
          <StatCard
            title="Store Rating"
            value={stats.rating.toString()}
            icon={<StarIcon filled className="h-5 w-5 fill-accent text-accent" />}
          />
        </div>

        {/* Main Content Area */}
        <div className="mt-8 rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('orders')}
                className={`text-sm font-bold transition-colors ${
                  activeTab === 'orders' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Recent Orders
                {activeTab === 'orders' && <div className="mt-4 h-0.5 rounded-full bg-primary" />}
              </button>
              <button
                onClick={() => setActiveTab('products')}
                className={`text-sm font-bold transition-colors ${
                  activeTab === 'products' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Products Catalog
                {activeTab === 'products' && <div className="mt-4 h-0.5 rounded-full bg-primary" />}
              </button>
            </div>

            {activeTab === 'products' && (
              <button
                onClick={() => {
                  setEditingProduct(null)
                  setIsModalOpen(true)
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-95 hover:brightness-110"
              >
                <PlusIcon className="h-4 w-4" />
                Add Product
              </button>
            )}
          </div>

          <div className="p-0">
            {activeTab === 'orders' ? (
              <div className="overflow-x-auto">
                {isLoadingOrders ? (
                  <div className="p-12 text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                    <p className="mt-4 text-muted-foreground">Loading orders...</p>
                  </div>
                ) : displayOrders.length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-[11px] font-semibold">
                      <tr>
                        <th className="px-6 py-4">Order ID</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4">Items</th>
                        <th className="px-6 py-4">Total</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {displayOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-foreground">
                            {order.orderId || order.id}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-foreground">{order.customerName || 'Student'}</span>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">
                            {order.items?.map((it: any) => `${it.quantity}x ${it.name}`).join(', ') || 'Items'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-extrabold text-foreground">
                              {formatPrice(order.total)}
                            </div>
                            <div className="mt-1">
                              {order.paymentStatus === 'paid' ? (
                                <span
                                  title={order.paymentReference ? `Ref: ${order.paymentReference}` : 'Verified by Paystack'}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                                >
                                  ✓ Paid (Paystack)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                  Cash on Pickup
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] ${
                                statusColors[order.status as OrderStatus] || 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {order.status?.charAt(0).toUpperCase() + order.status?.slice(1) || 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {order.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, 'preparing')}
                                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                                >
                                  Accept & Prepare
                                </button>
                              )}
                              {order.status === 'preparing' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, 'ready')}
                                  className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-600 active:scale-95 transition-all animate-pulse"
                                >
                                  🔔 Mark as Ready
                                </button>
                              )}
                              {order.status === 'ready' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, 'completed')}
                                  className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                                >
                                  ✓ Mark as Collected
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600">
                                  <CheckIcon className="h-4 w-4" /> Collected
                                </span>
                              )}
                              {order.status === 'cancelled' && (
                                <span className="text-xs font-semibold text-destructive">Cancelled</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-muted-foreground">
                    <BagIcon className="mx-auto h-12 w-12 opacity-20" />
                    <h3 className="mt-4 text-lg font-bold text-foreground">No orders yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                      When students place orders, they will appear here.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-0">
                {allProducts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-[11px] font-semibold">
                        <tr>
                          <th className="px-6 py-4">Product Name</th>
                          <th className="px-6 py-4">Category</th>
                          <th className="px-6 py-4">Base Price</th>
                          <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {allProducts.map((p) => (
                          <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-bold text-foreground">
                              <div className="flex items-center gap-3">
                                {p.images && p.images.length > 0 ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={p.images[0]}
                                    alt={p.name}
                                    className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-border"
                                  />
                                ) : (
                                  <div className="h-10 w-10 shrink-0 rounded-lg bg-muted flex items-center justify-center ring-1 ring-border text-[10px] uppercase font-bold text-muted-foreground">
                                    Img
                                  </div>
                                )}
                                <span>{p.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">{p.category}</td>
                            <td className="px-6 py-4 font-bold text-primary">
                              {editingProductId === p.id ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-muted-foreground">R</span>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={editingPriceValue}
                                    onChange={(e) => setEditingPriceValue(e.target.value)}
                                    className="w-24 rounded-lg border bg-background px-2 py-1 text-sm font-bold outline-none focus:border-primary"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSavePrice(p.id)}
                                    disabled={isUpdatingPrice}
                                    className="rounded bg-primary px-2 py-1 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingProductId(null)}
                                    disabled={isUpdatingPrice}
                                    className="rounded bg-muted px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted/80"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>{formatPrice(p.price)}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditPrice(p)}
                                    className="rounded-lg bg-secondary px-2 py-0.5 text-xs font-bold text-primary hover:bg-secondary/80 transition-colors"
                                  >
                                    Edit Price
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProduct(p)
                                    setIsModalOpen(true)
                                  }}
                                  className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold text-foreground hover:bg-secondary/80 transition-colors"
                                >
                                  Edit Details
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id, p.name)}
                                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                                  title="Delete product"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted-foreground">
                    <PackageIcon className="mx-auto h-12 w-12 opacity-20" />
                    <h3 className="mt-4 text-lg font-bold text-foreground">Your catalog is empty</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                      Products you add will appear here. Students from your campus will be able to order them.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add / Edit Product Modal Overlay */}
      {isModalOpen && (
        <AddProductModal 
          initialProduct={editingProduct}
          onClose={() => {
            setIsModalOpen(false)
            setEditingProduct(null)
          }} 
          onSave={handleProductSaved} 
        />
      )}
      {/* Edit Store Details & Location Modal */}
      {isEditingStoreName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-xl ring-1 ring-border">
            <h2 className="text-xl font-extrabold text-foreground">Store Details & Location</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure your store name, primary campus, and pickup location so students can easily locate your store.
            </p>
            
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">Store / Business Name</label>
                <input
                  type="text"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  placeholder="e.g. UJ Campus Grill"
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">Campus</label>
                <select
                  value={newStoreCampusId}
                  onChange={(e) => setNewStoreCampusId(e.target.value)}
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.short}) - {c.location}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">Specific Campus Location / Spot</label>
                <input
                  type="text"
                  value={newStoreLocation}
                  onChange={(e) => setNewStoreLocation(e.target.value)}
                  placeholder="e.g. Student Centre, Shop 4 or Madibeng Building"
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
                <span className="text-[11px] text-muted-foreground">
                  Where students should collect their meals (building, floor, or booth).
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">Estimated Pickup Time</label>
                <input
                  type="text"
                  value={newStorePickupTime}
                  onChange={(e) => setNewStorePickupTime(e.target.value)}
                  placeholder="e.g. 10-15 min"
                  className="w-full rounded-2xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setIsEditingStoreName(false)}
                disabled={isSavingName}
                className="rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStoreSettings}
                disabled={isSavingName || !newStoreName.trim()}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {isSavingName ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <div className="rounded-full bg-background p-2 ring-1 ring-border">{icon}</div>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
    </div>
  )
}

// ============================================================
// ADD PRODUCT MODAL (same as before, with custom icons)
// ============================================================

type ModifierOption = { id: string; label: string; price: string }
type ModifierGroup = { id: string; title: string; required: boolean; type: 'single' | 'multi'; options: ModifierOption[] }

const PRODUCT_CATEGORY_OPTIONS = [
  'Burgers',
  'Kotas',
  'Chicken',
  'Pizza',
  'Shisa Nyama',
  'Vetkoek',
  'Bowls',
  'Wraps',
  'Breakfast',
  'Drinks',
  'Salads',
  'Desserts',
]

function AddProductModal({ 
  initialProduct,
  onClose, 
  onSave 
}: { 
  initialProduct?: any
  onClose: () => void
  onSave: (data: any, files: File[]) => Promise<void> 
}) {
  const [name, setName] = useState(initialProduct?.name || '')
  const [description, setDescription] = useState(initialProduct?.description || '')
  const [price, setPrice] = useState(initialProduct ? initialProduct.price.toString() : '')
  
  const initialCat = initialProduct?.category?.trim() || 'Burgers'
  const isCustomInit = initialProduct?.category 
    ? !PRODUCT_CATEGORY_OPTIONS.includes(initialCat)
    : false

  const [category, setCategory] = useState(initialCat)
  const [isCustomCategory, setIsCustomCategory] = useState(isCustomInit)
  const [customCategoryInput, setCustomCategoryInput] = useState(isCustomInit ? initialCat : '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [existingImages, setExistingImages] = useState<string[]>(initialProduct?.images || [])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(
    initialProduct?.modifierGroups || []
  )

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
      { id: Math.random().toString(), title: '', required: false, type: 'single', options: [] },
    ])
  }

  const updateGroup = (id: string, updates: Partial<ModifierGroup>) => {
    setModifierGroups(modifierGroups.map((g) => (g.id === id ? { ...g, ...updates } : g)))
  }

  const removeGroup = (id: string) => {
    setModifierGroups(modifierGroups.filter((g) => g.id !== id))
  }

  const handleAddOption = (groupId: string) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return { ...g, options: [...g.options, { id: Math.random().toString(), label: '', price: '0' }] }
        }
        return g
      })
    )
  }

  const updateOption = (groupId: string, optionId: string, updates: Partial<ModifierOption>) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return { ...g, options: g.options.map((o) => (o.id === optionId ? { ...o, ...updates } : o)) }
        }
        return g
      })
    )
  }

  const removeOption = (groupId: string, optionId: string) => {
    setModifierGroups(
      modifierGroups.map((g) => {
        if (g.id === groupId) {
          return { ...g, options: g.options.filter((o) => o.id !== optionId) }
        }
        return g
      })
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    await onSave(
      { 
        name, 
        description, 
        price: parseFloat(price) || 0, 
        category, 
        modifierGroups,
        images: existingImages 
      },
      imageFiles
    )
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-[2rem] bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">
            {initialProduct ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-muted p-2 text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <form id="add-product-form" onSubmit={handleSubmit} className="flex flex-col gap-8">
            {/* Product Images */}
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Product Images</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {existingImages.length + imagePreviews.length} photos
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background/50 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary">
                  <UploadCloudIcon className="h-6 w-6" />
                  <span className="text-xs font-bold text-center px-2">Upload or drag photos</span>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                </label>

                {existingImages.map((src, index) => (
                  <div
                    key={`existing-${index}`}
                    className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Existing ${index + 1}`} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => removeExistingImage(index)}
                        className="rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm hover:scale-105 active:scale-95 transition-transform"
                        title="Remove photo"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {imagePreviews.map((src, index) => (
                  <div
                    key={`new-${index}`}
                    className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Upload ${index + 1}`} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="rounded-full bg-destructive p-2 text-destructive-foreground shadow-sm hover:scale-105 active:scale-95 transition-transform"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-border/50" />

            {/* Basic Details */}
            <div className="flex flex-col gap-5">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Basic Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold">Product Name</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Double Cheese Burger"
                    className="rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold">Price (ZAR)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
                <div className="flex flex-col gap-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold">Category</label>
                    <span className="text-xs font-semibold text-muted-foreground">Select an option</span>
                  </div>

                  {/* Curated category pills for fast 1-tap typo-free selection */}
                  <div className="flex flex-wrap gap-2">
                    {PRODUCT_CATEGORY_OPTIONS.map((catOption) => {
                      const isSelected = !isCustomCategory && category === catOption
                      return (
                        <button
                          key={catOption}
                          type="button"
                          onClick={() => {
                            setIsCustomCategory(false)
                            setCategory(catOption)
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
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
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                        isCustomCategory
                          ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      + Custom / Other
                    </button>
                  </div>

                  {/* Dropdown alternative */}
                  <div className="mt-1 flex items-center gap-2">
                    <select
                      value={isCustomCategory ? 'other' : category}
                      onChange={(e) => {
                        if (e.target.value === 'other') {
                          setIsCustomCategory(true)
                          setCategory(customCategoryInput.trim() || 'Other')
                        } else {
                          setIsCustomCategory(false)
                          setCategory(e.target.value)
                        }
                      }}
                      className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                    >
                      {PRODUCT_CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="other">Other (Custom category)</option>
                    </select>
                  </div>

                  {/* Custom category input if selected */}
                  {isCustomCategory && (
                    <div className="mt-2 flex flex-col gap-1">
                      <input
                        required
                        value={customCategoryInput}
                        onChange={(e) => {
                          setCustomCategoryInput(e.target.value)
                          setCategory(e.target.value.trim() || 'Other')
                        }}
                        placeholder="Enter custom category name (e.g. Seafood, Smoothies)"
                        className="rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-sm font-bold">Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the meal ingredients..."
                    className="rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
                  />
                </div>
              </div>
            </div>

            <hr className="border-border/50" />

            {/* Modifiers & Extras */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Modifiers & Extras</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Let customers customize their meal (e.g. choose protein, add cheese).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddGroup}
                  className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add Group
                </button>
              </div>

              {modifierGroups.length === 0 && (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No modifiers added. Click "Add Group" to create options like "Choose Protein".
                </div>
              )}

              <div className="flex flex-col gap-6">
                {modifierGroups.map((group, index) => (
                  <div key={group.id} className="rounded-2xl border bg-background/50 p-5 shadow-sm">
                    <div className="flex flex-wrap md:flex-nowrap items-start gap-4 mb-4">
                      <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
                        <label className="text-xs font-bold">Group Title</label>
                        <input
                          required
                          value={group.title}
                          onChange={(e) => updateGroup(group.id, { title: e.target.value })}
                          placeholder="e.g. Choose your protein"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold">Selection Type</label>
                        <select
                          value={group.type}
                          onChange={(e) =>
                            updateGroup(group.id, { type: e.target.value as 'single' | 'multi' })
                          }
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        >
                          <option value="single">Single Choice</option>
                          <option value="multi">Multiple Choice</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-bold">Requirement</label>
                        <label className="flex items-center gap-2 h-9 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={group.required}
                            onChange={(e) => updateGroup(group.id, { required: e.target.checked })}
                            className="rounded accent-primary w-4 h-4"
                          />
                          <span className="text-sm font-medium">Required</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeGroup(group.id)}
                        className="mt-7 text-muted-foreground hover:text-destructive p-1 rounded"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="pl-4 border-l-2 border-primary/20 flex flex-col gap-3">
                      {group.options.map((option) => (
                        <div key={option.id} className="flex items-center gap-3">
                          <input
                            required
                            value={option.label}
                            onChange={(e) => updateOption(group.id, option.id, { label: e.target.value })}
                            placeholder="Option Name"
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <div className="relative w-32">
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">
                              R
                            </span>
                            <input
                              required
                              type="number"
                              min="0"
                              step="any"
                              value={option.price}
                              onChange={(e) => updateOption(group.id, option.id, { price: e.target.value })}
                              className="w-full pl-6 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeOption(group.id, option.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <CloseIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleAddOption(group.id)}
                        className="self-start text-xs font-bold text-primary hover:underline mt-1"
                      >
                        + Add Option
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="border-t bg-card/50 p-6 flex justify-end gap-3 rounded-b-[2rem]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl px-5 py-3 text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-product-form"
            disabled={isSubmitting}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : (initialProduct ? 'Save Changes' : 'Create Product')}
          </button>
        </div>
      </div>
    </div>
  )
}