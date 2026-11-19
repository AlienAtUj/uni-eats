'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { restaurants as initialRestaurants } from '@/lib/data'
import { formatZar } from '@/lib/dash-engine'
import { formatJohannesburgTime } from '@/lib/coord-validation'
import { geocodeStoreAddress, resolveStoreCoords, type Coordinates } from '@/lib/location'
import { useStore } from './store'
import { BottomSheet } from './sheet'

const OrderTrackingMap = dynamic(
  () => import('./order-tracking-map').then((m) => m.OrderTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-80 w-full items-center justify-center bg-[#F4F4F2] text-xs font-semibold text-[#545454]">
        Loading live route map...
      </div>
    ),
  }
)
import {
  CheckIcon,
  ClockIcon,
  PinIcon,
  ReceiptIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

import {
  cancelCustomerOrder,
  subscribeToCustomerOrders,
  updateOrderStatus,
  useFirebaseRestaurants,
  type Order,
} from '@/lib/firebase-db'

const stages = [
  { key: 'pending', title: 'Order confirmed', desc: 'The store received your order.' },
  { key: 'preparing', title: 'Preparing your order', desc: 'Your order is being freshly prepared.' },
  { key: 'ready', title: 'Ready', desc: 'Your order is ready and waiting for the rider.' },
  { key: 'out_for_delivery', title: 'Out for delivery', desc: 'Your rider is on the way with your order.' },
  { key: 'completed', title: 'Delivered', desc: 'Enjoy your order. Great times!' },
]

const statusToIndex: Record<string, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  out_for_delivery: 3,
  completed: 4,
}

export function TrackingScreen() {
  const { placedOrder, userLocation, user, goHome, openRestaurant } = useStore()
  const { restaurants: fbRestaurants } = useFirebaseRestaurants()
  const [customerOrders, setCustomerOrders] = useState<Order[]>([])
  const [ordersTab, setOrdersTab] = useState<'active' | 'past'>('active')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [geocodedShopCoords, setGeocodedShopCoords] = useState<Coordinates | null>(null)

  const restaurants = useMemo(
    () => (fbRestaurants.length > 0 ? fbRestaurants : initialRestaurants),
    [fbRestaurants]
  )

  // Subscribe to all real customer orders in Firestore (Active + Past)
  useEffect(() => {
    if (!user?.uid) {
      setCustomerOrders([])
      return
    }
    const unsub = subscribeToCustomerOrders(user.uid, (orders) => {
      setCustomerOrders(orders)
    })
    return () => unsub()
  }, [user?.uid])

  const activeOrders = useMemo(
    () =>
      customerOrders.filter(
        (o) =>
          o.status === 'pending' ||
          o.status === 'preparing' ||
          o.status === 'ready' ||
          o.status === 'out_for_delivery'
      ),
    [customerOrders]
  )

  const pastOrders = useMemo(
    () =>
      customerOrders.filter(
        (o) => o.status === 'completed' || o.status === 'cancelled'
      ),
    [customerOrders]
  )

  // Pick the active Firestore order to track (or fallback to placedOrder if Firestore hasn't synced yet)
  const trackedLiveOrder = useMemo(() => {
    if (selectedOrderId) {
      const found = activeOrders.find((o) => o.id === selectedOrderId)
      if (found) return found
    }
    if (placedOrder?.firestoreId) {
      const match = activeOrders.find((o) => o.id === placedOrder.firestoreId)
      if (match) return match
    }
    return activeOrders[0] ?? null
  }, [activeOrders, selectedOrderId, placedOrder?.firestoreId])

  const activeOrderDisplay = useMemo(() => {
    if (trackedLiveOrder) {
      return {
        firestoreId: trackedLiveOrder.id,
        id: trackedLiveOrder.orderId || trackedLiveOrder.id.slice(0, 8),
        restaurantId: trackedLiveOrder.merchantId,
        restaurantName: trackedLiveOrder.merchantName,
        pickupTime: trackedLiveOrder.pickupTime || 'As soon as possible',
        campusName: userLocation?.label || 'Delivery address',
        total: trackedLiveOrder.total,
        status: trackedLiveOrder.status,
        paymentStatus: trackedLiveOrder.paymentStatus,
        deliveryOtp: trackedLiveOrder.deliveryOtp,
        driverName: trackedLiveOrder.driverName,
        driverPhone: trackedLiveOrder.driverPhone,
        driverVehiclePlate: trackedLiveOrder.driverVehiclePlate,
        lines: trackedLiveOrder.items.map((it, idx) => ({
          lineId: `${it.id}-${idx}`,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.price,
        })),
      }
    }
    if (
      placedOrder &&
      !customerOrders.some(
        (o) =>
          o.id === placedOrder.firestoreId &&
          (o.status === 'completed' || o.status === 'cancelled')
      )
    ) {
      return {
        firestoreId: placedOrder.firestoreId,
        id: placedOrder.id,
        restaurantId: placedOrder.lines[0]?.restaurantId,
        restaurantName: placedOrder.restaurantName,
        pickupTime: placedOrder.pickupTime,
        campusName: placedOrder.campusName,
        total: placedOrder.total,
        status: placedOrder.status || 'pending',
        paymentStatus: placedOrder.paymentStatus,
        deliveryOtp: placedOrder.deliveryOtp,
        driverName: undefined as string | undefined,
        driverPhone: undefined as string | undefined,
        driverVehiclePlate: undefined as string | undefined,
        lines: placedOrder.lines,
      }
    }
    return null
  }, [trackedLiveOrder, placedOrder, customerOrders, userLocation?.label])

  const current = activeOrderDisplay
    ? statusToIndex[activeOrderDisplay.status] ?? 0
    : 0

  const customerCoords = useMemo(
    () =>
      trackedLiveOrder?.dropoffCoords ??
      placedOrder?.dropoffCoords ??
      userLocation?.coords ?? { lat: -26.2041, lng: 28.0473 },
    [trackedLiveOrder?.dropoffCoords, placedOrder?.dropoffCoords, userLocation]
  )

  const orderStore = useMemo(() => {
    if (!activeOrderDisplay) return undefined
    const storeId = activeOrderDisplay.restaurantId
    return (
      restaurants.find((r) => storeId && r.id === storeId) ||
      restaurants.find((r) => r.name === activeOrderDisplay.restaurantName)
    )
  }, [activeOrderDisplay, restaurants])

  // If the ordered store has a street address without stored coords, geocode it in real time
  useEffect(() => {
    setGeocodedShopCoords(null)
    if (!orderStore || orderStore.coords || !orderStore.location) return
    let cancelled = false
    geocodeStoreAddress(orderStore.location).then((coords) => {
      if (!cancelled && coords) {
        setGeocodedShopCoords(coords)
      }
    })
    return () => {
      cancelled = true
    }
  }, [orderStore])

  const shopCoords = useMemo<Coordinates>(() => {
    if (trackedLiveOrder?.pickupCoords) return trackedLiveOrder.pickupCoords
    if (placedOrder?.pickupCoords) return placedOrder.pickupCoords
    if (orderStore?.coords) return orderStore.coords
    if (geocodedShopCoords) return geocodedShopCoords
    if (orderStore) {
      try {
        return resolveStoreCoords(orderStore)
      } catch {
        // Store has no verified coords yet
      }
    }
    return {
      lat: Number.NaN,
      lng: Number.NaN,
    }
  }, [trackedLiveOrder?.pickupCoords, placedOrder?.pickupCoords, orderStore, geocodedShopCoords])

  const nearbyShops = useMemo(
    () =>
      restaurants
        .filter((r) => r.id !== orderStore?.id)
        .slice(0, 8)
        .flatMap((r) => {
          try {
            return [{
              id: r.id,
              name: r.name,
              coords: r.coords ?? resolveStoreCoords(r),
            }]
          } catch {
            return []
          }
        }),
    [restaurants, orderStore?.id]
  )

  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [etaRecalculating, setEtaRecalculating] = useState(false)

  useEffect(() => {
    if (!activeOrderDisplay || activeOrderDisplay.status === 'completed' || activeOrderDisplay.status === 'cancelled') {
      setEtaMinutes(null)
      setEtaRecalculating(false)
      return
    }
    const origin =
      trackedLiveOrder?.driverLocation &&
      Number.isFinite(trackedLiveOrder.driverLocation.lat) &&
      Number.isFinite(trackedLiveOrder.driverLocation.lng)
        ? { lat: trackedLiveOrder.driverLocation.lat, lng: trackedLiveOrder.driverLocation.lng }
        : shopCoords
    if (
      !origin ||
      !customerCoords ||
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lng) ||
      !Number.isFinite(customerCoords.lat) ||
      !Number.isFinite(customerCoords.lng)
    ) {
      return
    }

    let cancelled = false
    fetch('/api/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination: customerCoords }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const sec = typeof data?.durationSeconds === 'number' ? data.durationSeconds : null
        if (sec !== null && Number.isFinite(sec)) {
          setEtaMinutes(Math.max(1, Math.round(sec / 60)))
          setEtaRecalculating(false)
        } else {
          setEtaMinutes(null)
          setEtaRecalculating(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEtaMinutes(null)
          setEtaRecalculating(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    activeOrderDisplay?.id,
    activeOrderDisplay?.status,
    trackedLiveOrder?.driverLocation?.lat,
    trackedLiveOrder?.driverLocation?.lng,
    shopCoords.lat,
    shopCoords.lng,
    customerCoords.lat,
    customerCoords.lng,
  ])

  const handleMarkCollected = async () => {
    if (!activeOrderDisplay?.firestoreId) return
    setIsUpdatingStatus(true)
    try {
      await updateOrderStatus(activeOrderDisplay.firestoreId, 'completed')
    } catch (err) {
      console.error('Error confirming collection:', err)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleCancelOrder = async () => {
    if (!activeOrderDisplay?.firestoreId) return
    setCancelError(null)
    setIsCancelling(true)
    try {
      await cancelCustomerOrder(activeOrderDisplay.firestoreId)
      setCancelConfirmOpen(false)
    } catch (err: any) {
      setCancelError(err?.message || 'Could not cancel order.')
    } finally {
      setIsCancelling(false)
    }
  }

  const canCancel =
    Boolean(activeOrderDisplay?.firestoreId) &&
    (activeOrderDisplay?.status === 'pending' || activeOrderDisplay?.status === 'preparing')

  return (
    <div className="min-h-full bg-white pb-6">
      {/* Orders Switcher: Active vs Past Orders */}
      <div className="border-b border-[#E8E8E8] bg-white px-5 pb-3 pt-5">
        <h1 className="text-[22px] font-black tracking-tight text-[#111111]">Orders</h1>
        <div className="mt-3 grid grid-cols-2 rounded-full bg-[#F3F3F3] p-1">
          <button
            type="button"
            onClick={() => setOrdersTab('active')}
            className={cn(
              'rounded-full py-2.5 text-[13.5px] font-bold transition-colors',
              ordersTab === 'active'
                ? 'bg-[#287d46] text-white shadow-xs'
                : 'text-[#545454] hover:text-[#111111]'
            )}
          >
            Active ({activeOrders.length || (activeOrderDisplay ? 1 : 0)})
          </button>
          <button
            type="button"
            onClick={() => setOrdersTab('past')}
            className={cn(
              'rounded-full py-2.5 text-[13.5px] font-bold transition-colors',
              ordersTab === 'past'
                ? 'bg-[#287d46] text-white shadow-xs'
                : 'text-[#545454] hover:text-[#111111]'
            )}
          >
            Past ({pastOrders.length})
          </button>
        </div>

        {/* Selector when customer has multiple active orders */}
        {ordersTab === 'active' && activeOrders.length > 1 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
            {activeOrders.map((ord) => {
              const selected = activeOrderDisplay?.firestoreId === ord.id
              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => setSelectedOrderId(ord.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-2 text-[13px] font-bold ring-1 transition-colors',
                    selected
                      ? 'bg-[#287d46] text-white ring-[#287d46]'
                      : 'bg-white text-[#111111] ring-[#E8E8E8]'
                  )}
                >
                  {ord.orderId || ord.id.slice(0, 8)} • {ord.merchantName}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* PAST ORDERS TAB */}
      {ordersTab === 'past' ? (
        pastOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3F3F3] text-[#545454]">
              <ReceiptIcon className="h-7 w-7" />
            </span>
            <p className="text-base font-bold text-[#111111]">No past orders yet</p>
            <p className="text-xs text-[#545454]">
              Completed and cancelled orders will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-5 pb-6 pt-4">
            {pastOrders.map((ord) => {
              const isCancelled = ord.status === 'cancelled'
              const matchedStore =
                restaurants.find((r) => r.id === ord.merchantId) ||
                restaurants.find((r) => r.name === ord.merchantName)
              const createdMs =
                ord.createdAt?.toMillis?.() ||
                (typeof ord.createdAt === 'number' ? ord.createdAt : null)
              const formattedDate = createdMs ? formatJohannesburgTime(createdMs) : ''
              const items = Array.isArray(ord.items) ? ord.items : []
              const totalQty = items.reduce((s, it) => s + Number(it.quantity || 1), 0)

              return (
                <article
                  key={ord.id}
                  className="rounded-2xl bg-white p-5 ring-1 ring-[#E8E8E8]"
                >
                  {/* Top Row: Store Thumbnail + Store Name + Date/Order ID + Status */}
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F3F3F3] ring-1 ring-[#E8E8E8]">
                      {matchedStore?.image ? (
                        <img
                          src={matchedStore.image}
                          alt={ord.merchantName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-extrabold text-[#287d46]">
                          {(ord.merchantName || 'D').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-base font-extrabold text-[#111111]">
                          {ord.merchantName}
                        </h3>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                            isCancelled
                              ? 'bg-[#e23b2e]/12 text-[#e23b2e]'
                              : 'bg-[#287d46]/12 text-[#287d46]'
                          )}
                        >
                          {isCancelled ? 'Cancelled' : 'Completed'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-[#545454]">
                        {totalQty} item{totalQty === 1 ? '' : 's'} · {formatZar(Number(ord.total || 0))}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#545454]">
                        {formattedDate ? `${formattedDate} · ` : ''}
                        {ord.orderId || ord.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>

                  {/* Itemized Breakdown */}
                  <div className="mt-4 space-y-2 border-t border-[#E8E8E8] pt-3.5">
                    {items.slice(0, 3).map((it, idx) => (
                      <div
                        key={`${it.id || idx}-${idx}`}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-[#F3F3F3] px-1.5 text-[11px] font-bold text-[#111111]">
                            {it.quantity}
                          </span>
                          <span className="truncate font-medium text-[#111111]">
                            {it.name}
                          </span>
                        </div>
                        <span className="shrink-0 font-semibold text-[#545454]">
                          {formatZar(Number(it.price || 0) * Number(it.quantity || 1))}
                        </span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <p className="text-[11px] font-semibold text-[#545454]">
                        +{items.length - 3} more item{items.length - 3 === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>

                  {/* Footer: Payment Info + Reorder CTA */}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E8E8E8] pt-3.5">
                    <div>
                      <span className="block text-[11px] font-medium text-[#545454]">
                        {ord.paymentStatus === 'paid' ? 'Paid online' : 'Cash on Pickup'}
                      </span>
                      <span className="text-sm font-extrabold text-[#111111]">
                        {formatZar(Number(ord.total || 0))}
                      </span>
                    </div>

                    {matchedStore ? (
                      <button
                        type="button"
                        onClick={() => openRestaurant(matchedStore.id)}
                        className="rounded-full bg-[#287d46] px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#216639] active:scale-95"
                      >
                        Reorder
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={goHome}
                        className="rounded-full bg-[#F3F3F3] px-4 py-2 text-xs font-bold text-[#111111]"
                      >
                        Browse stores
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )
      ) : !activeOrderDisplay ? (
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ReceiptIcon className="h-8 w-8" />
          </span>
          <div>
            <p className="text-base font-bold text-foreground">No active orders</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your active order progress will appear here after checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={goHome}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            Order something
          </button>
        </div>
      ) : (
        <>
          {/* Uber Eats-Style Clean White Order Header */}
          <header className="border-b border-[#E8E8E8] bg-white px-5 pb-4 pt-4 text-[#111111]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#545454]">
                Order {activeOrderDisplay.id}
              </p>
              <span className="rounded-full bg-[#287d46]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#287d46]">
                {current >= 2 ? 'Ready now' : '10 – 15 min'}
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#111111]">
              {stages[current].title}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#545454]">
              {stages[current].desc}
            </p>

            {/* Uber Eats-style 5-segment green progress bar */}
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {stages.map((s, idx) => (
                <span
                  key={s.key}
                  className={cn(
                    'h-1.5 rounded-full transition-colors',
                    idx <= current ? 'bg-[#287d46]' : 'bg-[#E8E8E8]'
                  )}
                />
              ))}
            </div>

            {/* Clean Neutral ETA Row */}
            <div className="mt-3.5 flex items-center gap-3 rounded-xl bg-[#F3F3F3] px-3.5 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#287d46] text-white">
                <ClockIcon className="h-4 w-4" />
              </span>
              <div>
                <span className="block text-[11px] font-medium text-[#545454]">
                  Estimated arrival
                </span>
                <span className="block text-sm font-bold text-[#111111]">
                  {current >= 2 ? 'Ready now' : '10 – 15 minutes'}
                </span>
              </div>
            </div>
          </header>

          {/* Real-time Uber Eats-style Color Tracking Map */}
          <OrderTrackingMap
            orderId={activeOrderDisplay.id}
            firestoreOrderId={activeOrderDisplay.firestoreId}
            shopName={activeOrderDisplay.restaurantName}
            shopCoords={shopCoords}
            customerCoords={customerCoords}
            nearbyShops={nearbyShops}
            orderStage={current}
          />

          {/* Progress tracker */}
          <div className="-mt-4 relative z-10 rounded-t-3xl bg-white px-5 pt-6">
            {/* Live Traffic-Aware ETA (LOC-009) */}
            {activeOrderDisplay.status !== 'completed' && activeOrderDisplay.status !== 'cancelled' && (
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#F3F3F3] px-4 py-2.5">
                <span className="text-xs font-semibold text-[#545454]">Estimated arrival</span>
                <span className="text-xs font-extrabold text-[#111111]">
                  {etaMinutes !== null
                    ? `Arriving in ${etaMinutes} min`
                    : etaRecalculating
                      ? 'Arriving soon — recalculating'
                      : 'Calculating ETA…'}
                </span>
              </div>
            )}

            {/* Secure Handover 4-Digit Delivery OTP */}
            {activeOrderDisplay.deliveryOtp && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#287d46]/25 bg-[#287d46]/8 px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#287d46]">
                    Your Delivery PIN
                  </p>
                  <p className="text-xs font-medium text-[#545454]">
                    Give this 4-digit PIN to your driver when they arrive
                  </p>
                </div>
                <span className="rounded-xl bg-[#287d46] px-3.5 py-2 font-mono text-lg font-black tracking-[0.25em] text-white shadow-xs">
                  {activeOrderDisplay.deliveryOtp}
                </span>
              </div>
            )}

            {/* Assigned Driver Details */}
            {activeOrderDisplay.driverName && (
              <div className="mb-5 flex items-center justify-between rounded-2xl bg-[#F3F3F3] px-4 py-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#545454]">
                    Your Driver
                  </p>
                  <p className="text-sm font-extrabold text-[#111111]">
                    {activeOrderDisplay.driverName}
                    {activeOrderDisplay.driverVehiclePlate
                      ? ` • ${activeOrderDisplay.driverVehiclePlate}`
                      : ''}
                  </p>
                </div>
                {activeOrderDisplay.driverPhone && (
                  <a
                    href={`tel:${activeOrderDisplay.driverPhone}`}
                    className="rounded-full bg-white px-3.5 py-2 text-xs font-bold text-[#287d46] ring-1 ring-[#E8E8E8]"
                  >
                    Call
                  </a>
                )}
              </div>
            )}

            <ol className="relative flex flex-col">
              {stages.map((stage, i) => {
                const done = i < current
                const active = i === current
                const last = i === stages.length - 1
                return (
                  <li key={stage.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors',
                          done || active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        {done ? (
                          <CheckIcon className="h-4 w-4" />
                        ) : (
                          <span className="text-xs font-bold">{i + 1}</span>
                        )}
                      </span>
                      {!last && (
                        <span
                          className={cn(
                            'my-1 w-0.5 flex-1',
                            done ? 'bg-primary' : 'bg-border',
                          )}
                        />
                      )}
                    </div>
                    <div className={cn('pb-6', last && 'pb-2')}>
                      <p
                        className={cn(
                          'text-sm font-bold',
                          done || active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {stage.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {stage.desc}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Cancel Order (Allowed ONLY while order is not ready: pending or preparing) */}
          {canCancel && (
            <div className="mt-2 px-5">
              {cancelError && (
                <p className="mb-2 text-xs font-bold text-destructive">{cancelError}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setCancelError(null)
                  setCancelConfirmOpen(true)
                }}
                disabled={isCancelling}
                className="w-full rounded-full border border-[#e23b2e]/40 bg-[#e23b2e]/8 px-6 py-3.5 text-[15px] font-bold text-[#e23b2e] transition-colors hover:bg-[#e23b2e]/15 disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling order...' : 'Cancel Order'}
              </button>
            </div>
          )}

          {/* Ready / Out for delivery / Delivered action banners */}
          {current === 3 && (
            <div className="mt-3 px-5">
              <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                <CheckIcon className="mx-auto h-6 w-6 text-emerald-600" />
                <h3 className="mt-1 text-base font-bold text-emerald-600">Your Order is On the Way!</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Your rider is heading to you. Once you receive your order, tap below:
                </p>
                <button
                  type="button"
                  onClick={handleMarkCollected}
                  disabled={isUpdatingStatus}
                  className="mt-3 w-full rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isUpdatingStatus ? 'Confirming...' : 'Confirm Order Delivered'}
                </button>
              </div>
            </div>
          )}

          {current === 4 && (
            <div className="mt-3 px-5">
              <div className="rounded-2xl bg-emerald-500/10 p-4 text-center">
                <CheckIcon className="mx-auto h-6 w-6 text-emerald-600" />
                <h3 className="mt-1 text-base font-bold text-emerald-600">Order Delivered</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Thank you! Enjoy your order.
                </p>
              </div>
            </div>
          )}

          {/* Order details */}
          <div className="mt-3 px-5">
            <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <div className="flex items-start gap-3">
                <PinIcon className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Order details
                  </p>
                  <p className="text-sm font-bold text-card-foreground">
                    {activeOrderDisplay.restaurantName} · {activeOrderDisplay.campusName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Order {activeOrderDisplay.id} • {activeOrderDisplay.pickupTime}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order items */}
          <div className="mt-3 px-5">
            <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <h2 className="mb-3 text-sm font-bold text-card-foreground">
                Your order
              </h2>
              <div className="flex flex-col gap-2">
                {activeOrderDisplay.lines.map((line) => (
                  <div
                    key={line.lineId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-semibold text-foreground">
                      {line.quantity}× {line.name}
                    </span>
                    <span className="font-semibold text-foreground">
                      {formatZar(line.unitPrice * line.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="my-3 h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-foreground">
                  {activeOrderDisplay.paymentStatus === 'paid' ? 'Total paid' : 'Total (Cash on Pickup)'}
                </span>
                <span className="text-base font-extrabold text-foreground">
                  {formatZar(activeOrderDisplay.total)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 px-5">
            <button
              type="button"
              onClick={goHome}
              className="w-full rounded-full border border-border bg-card px-6 py-3.5 text-sm font-bold text-foreground"
            >
              Back to home
            </button>
          </div>
        </>
      )}

      {/* Cancel Order Confirmation Sheet */}
      <BottomSheet
        open={cancelConfirmOpen}
        onClose={() => !isCancelling && setCancelConfirmOpen(false)}
        title="Cancel this order?"
      >
        <div className="space-y-4">
          <p className="text-sm font-medium text-[#545454]">
            Are you sure you want to cancel order{' '}
            <span className="font-bold text-[#111111]">
              {activeOrderDisplay?.id}
            </span>
            ? This cannot be undone once cancelled.
          </p>
          {cancelError && (
            <p className="text-xs font-bold text-destructive">{cancelError}</p>
          )}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="w-full rounded-full bg-[#e23b2e] px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-[#c82d22] disabled:opacity-50"
            >
              {isCancelling ? 'Cancelling order...' : 'Yes, Cancel Order'}
            </button>
            <button
              type="button"
              onClick={() => setCancelConfirmOpen(false)}
              disabled={isCancelling}
              className="w-full rounded-full bg-[#F3F3F3] px-6 py-3.5 text-[15px] font-bold text-[#111111] transition-colors hover:bg-[#E8E8E8] disabled:opacity-50"
            >
              Keep Order
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
