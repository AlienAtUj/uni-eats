'use client'

import { useState, useEffect, useMemo } from 'react'
import { restaurants, formatPrice } from '@/lib/data'
import { calculateDeliveryFeeAmount, formatDistanceKm } from '@/lib/location'
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

const SERVICE_FEE = 0.99

const pickupTimes = [
  'As soon as possible',
  'In 15 minutes',
  'In 30 minutes',
  'In 1 hour',
]

const paymentMethods = [
  'Paystack (Card / EFT / SnapScan)',
  'Cash on Pickup',
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
  const [sheet, setSheet] = useState<'time' | 'payment' | null>(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const orderRestaurant = useMemo(() => {
    if (cart.length === 0) return null
    return restaurants.find((r) => r.id === cart[0].restaurantId) || null
  }, [cart])

  const storeDistanceKm = useMemo(() => {
    if (!orderRestaurant) return 1.5
    return getStoreDistanceKm(orderRestaurant)
  }, [orderRestaurant, getStoreDistanceKm])

  const deliveryFee = useMemo(() => {
    return calculateDeliveryFeeAmount(storeDistanceKm, orderRestaurant?.storeType === 'grocery')
  }, [storeDistanceKm, orderRestaurant])

  const locationDisplay = userLocation?.label || userLocation?.address || 'Delivery address not set'
  const total = subtotal + deliveryFee + SERVICE_FEE

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

    // If student chose Cash on Pickup, place order directly marked as cash_on_pickup
    if (paymentMethod === 'Cash on Pickup') {
      setIsProcessingPayment(true)
      try {
        await placeOrder({
          paymentStatus: 'cash_on_pickup',
          paymentChannel: 'cash',
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
        'Paystack Public Key (NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) is missing in .env.local. Please add your Paystack keys or select Cash on Pickup.'
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
      // 1. Initialize transaction on server to verify Firestore prices and lock reference
      const initRes = await fetch('/api/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customerEmail,
          amountZar: total,
          items: cartPayload,
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
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          Checkout
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-5 pt-2">
        {/* Pickup location */}
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <div className="flex items-start gap-3">
            <PinIcon className="mt-0.5 h-5 w-5 text-primary" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">
                Pickup location
              </p>
              <p className="text-sm font-bold text-card-foreground">
                {cart[0].restaurantName}
              </p>
              <p className="text-xs text-muted-foreground">
                {locationDisplay}
              </p>
            </div>
          </div>
        </div>

        {/* Pickup time */}
        <SelectRow
          icon={<ClockIcon className="h-5 w-5 text-primary" />}
          label="Pickup time"
          value={pickupTime}
          onClick={() => setSheet('time')}
        />

        {/* Payment */}
        <SelectRow
          icon={<CardIcon className="h-5 w-5 text-primary" />}
          label="Payment method"
          value={paymentMethod}
          onClick={() => setSheet('payment')}
        />

        {/* Security Badge */}
        {paymentMethod.startsWith('Paystack') && (
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3.5 py-2.5 text-xs font-medium text-primary">
            <LockIcon className="h-4 w-4 shrink-0" />
            <span>Secured by Paystack (256-bit SSL encrypted, server-verified)</span>
          </div>
        )}

        {paymentError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            {paymentError}
          </div>
        )}

        {/* Order summary */}
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
                  {formatPrice(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <SummaryRow label="Subtotal" value={formatPrice(subtotal)} />
          <SummaryRow
            label={`Delivery fee (${formatDistanceKm(storeDistanceKm)})`}
            value={formatPrice(deliveryFee)}
          />
          <SummaryRow label="Service fee" value={formatPrice(SERVICE_FEE)} />
          <div className="my-3 h-px bg-border" />
          <SummaryRow label="Total" value={formatPrice(total)} strong />
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 bg-background px-5 pb-2 pt-2">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={isProcessingPayment}
          className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          <span>
            {isProcessingPayment
              ? 'Processing secure payment...'
              : paymentMethod.startsWith('Paystack')
                ? 'Pay with Paystack'
                : 'Place order'}
          </span>
          <span>{formatPrice(total)}</span>
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
          options={paymentMethods}
          selected={paymentMethod}
          onSelect={(v) => {
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
