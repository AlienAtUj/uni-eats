'use client'

import { useState, useEffect, useMemo } from 'react'
import { formatPrice } from '@/lib/data'
import { useFirebaseRestaurants } from '@/lib/firebase-db'
import { resolveStoreCoords, geocodeStoreAddress } from '@/lib/location'
import {
  calculateDashCheckout,
  fetchRoadDistanceKm,
  formatZar,
  getSmallOrderFeeInfo,
  type DashPaymentMethod,
  type DashStoreType,
  DASH_SERVICE_FEE_ZAR,
} from '@/lib/dash-engine'
import { useStore } from './store'
import { BottomSheet } from './sheet'
import {
  ArrowLeftIcon,
  PinIcon,
  ClockIcon,
  CardIcon,
  ChevronRightIcon,
  CheckIcon,
  LockIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

const pickupTimes = [
  'As soon as possible',
  'In 15 minutes',
  'In 30 minutes',
  'In 1 hour',
]

const dashPaymentOptions: Array<{
  id: 'paystack' | 'cash_on_pickup'
  label: string
  tag: string
}> = [
  { id: 'paystack', label: 'Paystack (Card / EFT / SnapScan)', tag: 'Instant EFT, Card & SnapScan' },
]

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string
        email: string
        amount: number
        currency?: string
        ref?: string
        access_code?: string
        metadata?: Record<string, any>
        callback: (response: { reference: string; status: string }) => void
        onClose: () => void
      }) => {
        openIframe: () => void
      }
    }
  }
}

export function CheckoutScreen() {
  const {
    cart,
    subtotal,
    goToScreen,
    userLocation,
    getStoreDistanceKm,
    pickupTime,
    setPickupTime,
    paymentMethod,
    setPaymentMethod,
    placeOrder,
    user,
  } = useStore()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()
  const [sheet, setSheet] = useState<'time' | 'payment' | null>(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [hasDashPlus, setHasDashPlus] = useState(false)
  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery')
  const [dashPayment, setDashPayment] = useState<'paystack' | 'cash_on_pickup'>('paystack')
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null)
  const [roadDistanceError, setRoadDistanceError] = useState<string | null>(null)

  const orderRestaurant = useMemo(() => {
    if (cart.length === 0) return null
    const found = liveRestaurants?.find((r) => r.id === cart[0].restaurantId)
    if (found) return found
    return {
      id: cart[0].restaurantId,
      name: cart[0].restaurantName || 'Store',
      storeType: 'restaurant' as const,
      location: '',
      open: true,
      campusIds: [],
      cuisine: 'Food & Meals',
      image: cart[0].image || '/food/featured-burger.jpg',
      rating: 5.0,
      reviews: 0,
      pickupTime: '15-25 min',
      priceLevel: 'R 25.00',
      menu: [],
    }
  }, [cart, liveRestaurants])

  const dashStoreType: DashStoreType =
    orderRestaurant?.storeType === 'grocery' ? 'grocery' : 'food'

  // Calculate real Road Distance via Google Maps Distance Matrix / Routes API
  useEffect(() => {
    if (!userLocation?.coords) {
      setRoadDistanceKm(null)
      setRoadDistanceError('Please select your delivery address to calculate delivery distance.')
      return
    }
    if (!orderRestaurant) return

    let cancelled = false
    setRoadDistanceError(null)

    ;(async () => {
      let shopCoords
      try {
        shopCoords = resolveStoreCoords(orderRestaurant)
      } catch (err: any) {
        if (orderRestaurant.location) {
          shopCoords = await geocodeStoreAddress(orderRestaurant.location)
        }
        if (!shopCoords) {
          if (!cancelled) {
            setRoadDistanceKm(null)
            setRoadDistanceError(err?.message || 'Store location coordinates are unavailable.')
          }
          return
        }
      }

      try {
        const km = await fetchRoadDistanceKm(shopCoords, userLocation.coords)
        if (!cancelled) {
          setRoadDistanceKm(km)
          setRoadDistanceError(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setRoadDistanceKm(null)
          setRoadDistanceError(err?.message || 'Unable to calculate road distance.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userLocation, orderRestaurant])

  // Ensure Cash on Pickup is only selectable in Self-Pickup mode
  useEffect(() => {
    if (fulfillmentMode === 'delivery' && dashPayment === 'cash_on_pickup') {
      setDashPayment('paystack')
      setPaymentMethod('Paystack (Card / EFT / SnapScan)')
    }
  }, [fulfillmentMode, dashPayment, setPaymentMethod])

  const { checkoutSummary, zoneError } = useMemo(() => {
    const activePayMethod: DashPaymentMethod = 'ozow'
    if (fulfillmentMode === 'pickup') {
      const smallOrderInfo = getSmallOrderFeeInfo(subtotal, dashStoreType)
      const pickupTotal = Number(
        (subtotal + smallOrderInfo.smallOrderFeeZar + DASH_SERVICE_FEE_ZAR).toFixed(2)
      )
      return {
        checkoutSummary: {
          zone: 'standard' as const,
          roadDistanceKm: 0,
          basketSubtotalZar: subtotal,
          standardDeliveryFeeZar: 0,
          deliveryFeeZar: 0,
          dashPlusApplied: false,
          smallOrderFeeZar: smallOrderInfo.smallOrderFeeZar,
          smallOrderInfo,
          serviceFeeZar: DASH_SERVICE_FEE_ZAR,
          tipZar: 0,
          totalChargedZar: pickupTotal,
          benchmarkTotalZar: Number((subtotal * 1.45).toFixed(2)),
          savingsZar: Math.max(0, Number((subtotal * 1.45 - pickupTotal).toFixed(2))),
          savingsBadge: `You are saving ${formatZar(Math.max(0, Number((subtotal * 1.45 - pickupTotal).toFixed(2))))} compared to typical delivery apps.`,
          paymentMethod: activePayMethod,
          gatewayFeeZar: 0,
          splitLedger: null as any,
        },
        zoneError: null,
      }
    }
    if (roadDistanceError) {
      return { checkoutSummary: null, zoneError: roadDistanceError }
    }
    if (roadDistanceKm === null) {
      return { checkoutSummary: null, zoneError: null }
    }
    try {
      const summary = calculateDashCheckout({
        basketSubtotalZar: subtotal,
        roadDistanceKm,
        storeType: dashStoreType,
        hasDashPlus,
        paymentMethod: activePayMethod,
      })
      return { checkoutSummary: summary, zoneError: null }
    } catch (err: any) {
      return {
        checkoutSummary: null,
        zoneError: err?.message || 'Delivery unavailable at this distance.',
      }
    }
  }, [fulfillmentMode, subtotal, roadDistanceKm, roadDistanceError, dashStoreType, hasDashPlus, dashPayment])

  const smallOrderInfo = useMemo(
    () => getSmallOrderFeeInfo(subtotal, dashStoreType),
    [subtotal, dashStoreType]
  )

  const deliveryFee = checkoutSummary?.deliveryFeeZar ?? 0
  const smallOrderFee = checkoutSummary?.smallOrderFeeZar ?? smallOrderInfo.smallOrderFeeZar
  const locationDisplay = userLocation?.label || userLocation?.address || 'Delivery address not set'
  const total =
    checkoutSummary?.totalChargedZar ??
    Number((subtotal + deliveryFee + smallOrderFee + DASH_SERVICE_FEE_ZAR).toFixed(2))

  // Load official Paystack Inline V1 script safely
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.PaystackPop) {
      const existingScript = document.getElementById('paystack-inline-script')
      if (!existingScript) {
        const script = document.createElement('script')
        script.id = 'paystack-inline-script'
        script.src = 'https://js.paystack.co/v1/inline.js'
        script.async = true
        document.body.appendChild(script)
      }
    }
  }, [])

  const handleCheckout = async () => {
    setPaymentError(null)
    if (zoneError) {
      setPaymentError(zoneError)
      return
    }

    // Cash is ONLY allowed for Self-Pickup (never on delivery)
    if (fulfillmentMode === 'pickup' && dashPayment === 'cash_on_pickup') {
      setIsProcessingPayment(true)
      try {
        await placeOrder({
          paymentStatus: 'cash_on_pickup',
          paymentChannel: 'cash',
          verifiedTotalZar: total,
          deliveryFeeZar: 0,
          roadDistanceKm: 0,
          smallOrderFeeZar: smallOrderFee,
          dashPlusApplied: false,
        })
      } finally {
        setIsProcessingPayment(false)
      }
      return
    }

    // Paystack Online Payment Flow
    const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
    if (!publicKey) {
      setPaymentError(
        'Paystack Public Key (NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) is missing in .env.local.'
      )
      return
    }

    if (!window.PaystackPop) {
      setPaymentError('Paystack payment library is still loading. Please try again in a moment.')
      return
    }

    setIsProcessingPayment(true)
    const customerEmail = user?.email || 'customer@dash.co.za'
    const cartPayload = cart.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      modifierLabels: line.modifierLabels,
    }))
    const orderMetadata = {
      customerId: user?.uid || 'guest-user',
      restaurantId: cart[0]?.restaurantId,
      restaurantName: cart[0]?.restaurantName,
      pickupTime,
    }

    try {
      const feeBreakdown = {
        deliveryFeeZar: fulfillmentMode === 'pickup' ? 0 : deliveryFee,
        smallOrderFeeZar: smallOrderFee,
      }

      // 1. Initialize transaction on server to verify Firestore prices and lock reference
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customerEmail,
          amountZar: total,
          items: cartPayload,
          feeBreakdown,
          metadata: orderMetadata,
        }),
      })

      const initData = await initRes.json()
      if (!initRes.ok || !initData.reference) {
        setPaymentError(
          initData.error || 'Could not initialize secure payment session on the server.'
        )
        setIsProcessingPayment(false)
        return
      }

      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: customerEmail,
        amount: initData.amountInCents,
        currency: 'ZAR',
        ref: initData.reference,
        metadata: orderMetadata,
        callback: (response) => {
          // 2. Verify transaction server-to-server before creating the order
          ;(async () => {
            try {
              const verifyRes = await fetch('/api/paystack/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  reference: response.reference,
                  expectedAmountZar: initData.amountZar || total,
                  items: cartPayload,
                  feeBreakdown,
                }),
              })

              const verifyData = await verifyRes.json()

              if (!verifyRes.ok || !verifyData.verified) {
                setPaymentError(
                  verifyData.error ||
                    'Payment verification failed on the server. Please contact support with ref: ' +
                      response.reference
                )
                setIsProcessingPayment(false)
                return
              }

              // 3. Server verified payment amount, currency, and status === 'success'
              await placeOrder({
                paymentReference: verifyData.reference,
                paymentStatus: 'paid',
                paymentChannel: verifyData.channel || 'paystack',
                verifiedTotalZar: verifyData.amountZar,
                deliveryFeeZar: deliveryFee,
                roadDistanceKm: roadDistanceKm ?? undefined,
                smallOrderFeeZar: smallOrderFee,
                dashPlusApplied: checkoutSummary?.dashPlusApplied ?? false,
              })
            } catch (err) {
              console.error('Error verifying payment:', err)
              setPaymentError('Network error while verifying payment.')
            } finally {
              setIsProcessingPayment(false)
            }
          })()
        },
        onClose: () => {
          setIsProcessingPayment(false)
        },
      })

      handler.openIframe()
    } catch (err: any) {
      console.error('Paystack popup error:', err)
      setPaymentError(err?.message || 'Could not launch Paystack checkout.')
      setIsProcessingPayment(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-base font-bold text-foreground">Nothing to check out</p>
        <button
          type="button"
          onClick={() => goToScreen('home')}
          className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
        >
          Back to home
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 px-5 pb-2 pt-5">
        <button
          type="button"
          onClick={() => goToScreen('cart')}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-black tracking-tight text-foreground">
          Checkout
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-5 pt-2">
        {/* Fulfillment Toggle: Delivery (Default) vs Self-Pickup */}
        <div className="grid grid-cols-2 rounded-full bg-[#F3F3F3] p-1">
          <button
            type="button"
            onClick={() => setFulfillmentMode('delivery')}
            className={cn(
              'rounded-full py-2.5 text-[13.5px] font-bold transition-colors',
              fulfillmentMode === 'delivery'
                ? 'bg-[#287d46] text-white shadow-xs'
                : 'text-[#545454] hover:text-[#111111]'
            )}
          >
            Delivery
          </button>
          <button
            type="button"
            onClick={() => setFulfillmentMode('pickup')}
            className={cn(
              'rounded-full py-2.5 text-[13.5px] font-bold transition-colors',
              fulfillmentMode === 'pickup'
                ? 'bg-[#287d46] text-white shadow-xs'
                : 'text-[#545454] hover:text-[#111111]'
            )}
          >
            Self-Pickup (Cash allowed)
          </button>
        </div>

        {/* Delivery / Pickup Address */}
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <div className="flex items-start gap-3">
            <PinIcon className="mt-0.5 h-5 w-5 text-primary" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">
                {fulfillmentMode === 'delivery' ? 'Delivering to' : 'Self-pickup from'}
              </p>
              <p className="text-sm font-bold text-card-foreground">
                {fulfillmentMode === 'delivery' ? locationDisplay : cart[0].restaurantName}
              </p>
              <p className="text-xs text-muted-foreground">
                {fulfillmentMode === 'delivery'
                  ? `From ${cart[0].restaurantName}`
                  : orderRestaurant?.location || locationDisplay}
              </p>
            </div>
          </div>
        </div>

        {/* Pickup Time (Self-Pickup only) */}
        {fulfillmentMode === 'pickup' && (
          <SelectRow
            icon={<ClockIcon className="h-5 w-5 text-primary" />}
            label="Pickup time"
            value={pickupTime}
            onClick={() => setSheet('time')}
          />
        )}

        {/* Smart Cart Floor Progress Bar */}
        {smallOrderInfo.isBelowFloor && (
          <div className="rounded-2xl border border-[#e07a2e]/30 bg-[#e07a2e]/8 p-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-[#111111]">
              <span>{smallOrderInfo.message}</span>
              <span className="text-[#e07a2e]">{smallOrderInfo.progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E8E8E8]">
              <div
                className="h-full rounded-full bg-[#287d46] transition-all"
                style={{ width: `${smallOrderInfo.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Dash+ Subscription Toggle (R49/month) */}
        <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <div className="min-w-0 pr-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-extrabold text-foreground">Dash+</span>
              <span className="text-xs font-bold text-[#287d46]">
                R49.00/month
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              R0 delivery on orders over R180 within 6 km
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hasDashPlus}
            onClick={() => setHasDashPlus((v) => !v)}
            className={cn(
              'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
              hasDashPlus ? 'bg-[#287d46]' : 'bg-[#D4D4D4]'
            )}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform',
                hasDashPlus ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Payment Method: Paystack Only (plus Cash on Pickup when Self-Pickup is selected) */}
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Payment Method
          </p>
          <div className="flex flex-col gap-2">
            {(fulfillmentMode === 'pickup'
              ? [
                  ...dashPaymentOptions,
                  { id: 'cash_on_pickup' as const, label: 'Cash on Pickup', tag: 'Self-Pickup Only' },
                ]
              : dashPaymentOptions
            ).map((opt) => {
              const selected = dashPayment === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setDashPayment(opt.id)
                    setPaymentMethod(opt.label)
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left ring-1 transition-all',
                    selected
                      ? 'bg-[#287d46]/8 ring-[#287d46]'
                      : 'bg-white ring-[#E8E8E8] hover:bg-[#F6F6F6]'
                  )}
                >
                  <div>
                    <p className="text-sm font-bold text-foreground">{opt.label}</p>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px] font-semibold',
                        opt.id === 'cash_on_pickup'
                          ? 'text-[#545454]'
                          : 'text-[#287d46]'
                      )}
                    >
                      {opt.tag}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border',
                      selected
                        ? 'border-[#287d46] bg-[#287d46] text-white'
                        : 'border-[#CCCCCC]'
                    )}
                  >
                    {selected && <CheckIcon className="h-3 w-3" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {(zoneError || paymentError) && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            {zoneError || paymentError}
          </div>
        )}

        {/* Order summary & Savings Receipt */}
        <div className="mt-1 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <h2 className="mb-3 text-sm font-bold text-card-foreground">
            Order summary
          </h2>
          <div className="flex flex-col gap-2">
            {cart.map((line) => (
              <div
                key={line.lineId}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-foreground">
                    {line.quantity}× {line.name}
                  </span>
                  {line.modifierLabels.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {line.modifierLabels.join(', ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold text-foreground">
                  {formatZar(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <SummaryRow label="Subtotal" value={formatZar(subtotal)} />
          <SummaryRow
            label={
              fulfillmentMode === 'pickup'
                ? 'Delivery fee (Self-Pickup)'
                : roadDistanceKm !== null
                  ? `Delivery fee (${roadDistanceKm.toFixed(1)} km road)`
                  : 'Delivery fee (calculating road distance...)'
            }
            value={
              fulfillmentMode === 'pickup'
                ? 'R0.00'
                : roadDistanceKm === null
                  ? '...'
                  : checkoutSummary?.dashPlusApplied
                    ? 'R0.00 (Dash+)'
                    : formatZar(deliveryFee)
            }
          />
          {smallOrderFee > 0 && (
            <SummaryRow label="Small-order fee" value={formatZar(smallOrderFee)} />
          )}
          <SummaryRow label="Service fee" value={formatZar(DASH_SERVICE_FEE_ZAR)} />
          <div className="my-3 h-px bg-border" />
          <SummaryRow label="Dash Total" value={formatZar(total)} strong />
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 bg-background px-5 pb-2 pt-2">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={
            isProcessingPayment ||
            Boolean(zoneError) ||
            (fulfillmentMode === 'delivery' && roadDistanceKm === null)
          }
          className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          <span>
            {isProcessingPayment
              ? 'Processing secure payment...'
              : dashPayment === 'cash_on_pickup'
                ? 'Place Self-Pickup Order (Cash)'
                : 'Pay with Paystack'}
          </span>
          <span>{formatZar(total)}</span>
        </button>
      </div>

      {/* Pickup time sheet */}
      <BottomSheet
        open={sheet === 'time'}
        onClose={() => setSheet(null)}
        title="Pickup time"
      >
        <OptionList
          options={pickupTimes}
          selected={pickupTime}
          onSelect={(v) => {
            setPickupTime(v)
            setSheet(null)
          }}
        />
      </BottomSheet>

      {/* Payment sheet */}
      <BottomSheet
        open={sheet === 'payment'}
        onClose={() => setSheet(null)}
        title="Payment method"
      >
        <OptionList
          options={
            fulfillmentMode === 'pickup'
              ? ['Paystack (Card / EFT / SnapScan)', 'Cash on Pickup']
              : ['Paystack (Card / EFT / SnapScan)']
          }
          selected={dashPayment === 'cash_on_pickup' ? 'Cash on Pickup' : 'Paystack (Card / EFT / SnapScan)'}
          onSelect={(v) => {
            setDashPayment(v === 'Cash on Pickup' ? 'cash_on_pickup' : 'paystack')
            setPaymentMethod(v)
            setPaymentError(null)
            setSheet(null)
          }}
        />
      </BottomSheet>
    </div>
  )
}

function SelectRow({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-sm font-bold text-card-foreground">
          {value}
        </span>
      </span>
      <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
    </button>
  )
}

function OptionList({
  options,
  selected,
  onSelect,
}: {
  options: string[]
  selected: string
  onSelect: (v: string) => void
}) {
  return (
    <ul className="flex flex-col gap-2 py-1">
      {options.map((opt) => {
        const active = opt === selected
        return (
          <li key={opt}>
            <button
              type="button"
              onClick={() => onSelect(opt)}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl border p-4 text-left text-sm font-semibold',
                active
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border bg-card text-foreground',
              )}
            >
              {opt}
              {active && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="h-4 w-4" />
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={
          strong
            ? 'text-base font-bold text-foreground'
            : 'text-sm text-muted-foreground'
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-base font-extrabold text-foreground'
            : 'text-sm font-semibold text-foreground'
        }
      >
        {value}
      </span>
    </div>
  )
}
