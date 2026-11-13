'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { campuses, formatPrice } from '@/lib/data'
import { useFirebaseRestaurants } from '@/lib/firebase-db'
import { calculateDeliveryFeeAmount, formatDistanceKm } from '@/lib/location'
import { useStore } from './store'
import {
  ArrowLeftIcon,
  PlusIcon,
  MinusIcon,
  BagIcon,
  PinIcon,
} from '@/components/icons'

const SERVICE_FEE = 0.99
const FALLBACK_IMAGE = '/food/featured-burger.jpg'

const lineImage = (image?: string | null) =>
  image && image.trim() ? image.trim() : FALLBACK_IMAGE

const latest = (lines: { addedAt?: number }[]) =>
  Math.max(0, ...lines.map((l) => l.addedAt ?? 0))

export function CartScreen() {
  const {
    carts,
    setActiveCartId,
    clearCart,
    goHome,
    goToScreen,
    campusId,
    customLocationLabel,
    userLocation,
  } = useStore()

  // Which cart is open in detail view (null = show the list of all carts)
  const [openCartId, setOpenCartId] = useState<string | null>(null)

  const campus = campuses.find((c) => c.id === campusId) ?? campuses[0]
  const locationDisplay =
    userLocation?.label ||
    userLocation?.address ||
    customLocationLabel ||
    campus.name

  const cartEntries = Object.entries(carts).sort(
    ([, a], [, b]) => latest(b) - latest(a),
  )
  const openLines = openCartId ? carts[openCartId] : undefined

  // ---------- DETAIL VIEW (one store's cart + checkout) ----------
  if (openCartId && openLines && openLines.length > 0) {
    return (
      <CartDetail
        lines={openLines}
        locationDisplay={locationDisplay}
        onBack={() => setOpenCartId(null)}
        onCheckout={() => {
          setActiveCartId(openCartId) // checkout uses the active cart
          goToScreen('checkout')
        }}
      />
    )
  }

  // ---------- LIST VIEW (all carts) ----------
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 px-5 pb-2 pt-5">
        <button
          type="button"
          onClick={goHome}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          Your carts
        </h1>
      </header>

      {cartEntries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <BagIcon className="h-8 w-8" />
          </span>
          <div>
            <p className="text-base font-bold text-foreground">
              Your carts are empty
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse restaurants and stores near you to add meals or groceries.
            </p>
          </div>
          <button
            type="button"
            onClick={goHome}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            Explore Dash
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3 px-5 pb-6">
          {cartEntries.map(([id, lines]) => {
            const count = lines.reduce((n, l) => n + l.quantity, 0)
            const sub = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
            const preview = lines.slice(0, 3)
            const extra = lines.length - preview.length
            const openCart = () => {
              setActiveCartId(id)
              setOpenCartId(id)
            }

            return (
              <div
                key={id}
                className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border"
              >
                <button
                  type="button"
                  onClick={openCart}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <div className="flex -space-x-3">
                    {preview.map((l) => (
                      <div
                        key={l.lineId}
                        className="relative h-14 w-14 overflow-hidden rounded-2xl ring-2 ring-card"
                      >
                        <Image
                          src={lineImage(l.image)}
                          alt={l.name}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                    {extra > 0 && (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-xs font-bold text-foreground ring-2 ring-card">
                        +{extra}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-card-foreground">
                      {lines[0].restaurantName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {count} item{count === 1 ? '' : 's'} · {formatPrice(sub)}
                    </p>
                  </div>
                </button>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={openCart}
                    className="flex-1 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
                  >
                    View cart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Remove your ${lines[0].restaurantName} cart?`)
                      ) {
                        clearCart(id)
                      }
                    }}
                    className="rounded-full bg-secondary px-4 py-2.5 text-xs font-bold text-foreground"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Separate component so the fee hooks aren't called after a conditional return.
function CartDetail({
  lines,
  locationDisplay,
  onBack,
  onCheckout,
}: {
  lines: ReturnType<typeof useStore>['carts'][string]
  locationDisplay: string
  onBack: () => void
  onCheckout: () => void
}) {
  const { updateQty, getStoreDistanceKm } = useStore()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()

  const restaurantId = lines[0].restaurantId
  const restaurant = useMemo(
    () => liveRestaurants?.find((r) => r.id === restaurantId) ?? null,
    [liveRestaurants, restaurantId],
  )

  const storeDistanceKm = useMemo(
    () => (restaurant ? getStoreDistanceKm(restaurant) : 1.5),
    [restaurant, getStoreDistanceKm],
  )

  const deliveryFee = useMemo(
    () =>
      calculateDeliveryFeeAmount(
        storeDistanceKm,
        restaurant?.storeType === 'grocery',
      ),
    [storeDistanceKm, restaurant],
  )

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const total = subtotal + deliveryFee + SERVICE_FEE

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 px-5 pb-2 pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to carts"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-foreground">
          {lines[0].restaurantName}
        </h1>
      </header>

      <div className="px-5">
        <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <PinIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Ordering from
            </p>
            <p className="text-sm font-bold text-card-foreground">
              {lines[0].restaurantName} · {locationDisplay}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-5">
        {lines.map((line) => (
          <div
            key={line.lineId}
            className="flex gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
              <Image
                src={lineImage(line.image)}
                alt={line.name}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="truncate text-sm font-bold text-card-foreground">
                {line.name}
              </h3>
              {line.modifierLabels.length > 0 && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {line.modifierLabels.join(', ')}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="text-sm font-bold text-foreground">
                  {formatPrice(line.unitPrice * line.quantity)}
                </span>
                <div className="flex items-center gap-3 rounded-full bg-secondary px-1.5 py-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${line.name}`}
                    onClick={() => updateQty(line.lineId, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-4 text-center text-sm font-bold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${line.name}`}
                    onClick={() => updateQty(line.lineId, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 px-5">
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          <Row
            label={`Delivery fee (${formatDistanceKm(storeDistanceKm)})`}
            value={formatPrice(deliveryFee)}
          />
          <Row label="Service fee" value={formatPrice(SERVICE_FEE)} />
          <div className="my-3 h-px bg-border" />
          <Row label="Total" value={formatPrice(total)} strong />
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 bg-background px-5 pb-2 pt-2">
        <button
          type="button"
          onClick={onCheckout}
          className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground"
        >
          <span>Go to checkout</span>
          <span>{formatPrice(total)}</span>
        </button>
      </div>
    </div>
  )
}

function Row({
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