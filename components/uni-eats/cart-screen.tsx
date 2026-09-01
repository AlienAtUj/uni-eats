'use client'

import Image from 'next/image'
import { campuses, formatPrice } from '@/lib/data'
import { useStore } from './store'
import {
  ArrowLeftIcon,
  PlusIcon,
  MinusIcon,
  BagIcon,
  PinIcon,
} from '@/components/icons'

const SERVICE_FEE = 0.99

export function CartScreen() {
  const { cart, updateQty, subtotal, goHome, goToScreen, campusId } = useStore()
  const campus = campuses.find((c) => c.id === campusId)!
  const total = cart.length ? subtotal + SERVICE_FEE : 0

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
          Your cart
        </h1>
      </header>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <BagIcon className="h-8 w-8" />
          </span>
          <div>
            <p className="text-base font-bold text-foreground">
              Your cart is empty
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse restaurants and add your favorite meals.
            </p>
          </div>
          <button
            type="button"
            onClick={goHome}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            Explore restaurants
          </button>
        </div>
      ) : (
        <>
          <div className="px-5">
            <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <PinIcon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Pickup at
                </p>
                <p className="text-sm font-bold text-card-foreground">
                  {cart[0].restaurantName} · {campus.name}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 px-5">
            {cart.map((line) => (
              <div
                key={line.lineId}
                className="flex gap-3 rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                  <Image
                    src={line.image}
                    alt={line.name}
                    fill
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
                        aria-label="Decrease"
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
                        aria-label="Increase"
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
              <Row label="Service fee" value={formatPrice(SERVICE_FEE)} />
              <div className="my-3 h-px bg-border" />
              <Row label="Total" value={formatPrice(total)} strong />
            </div>
          </div>

          <div className="sticky bottom-0 mt-6 bg-background px-5 pb-2 pt-2">
            <button
              type="button"
              onClick={() => goToScreen('checkout')}
              className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground"
            >
              <span>Go to checkout</span>
              <span>{formatPrice(total)}</span>
            </button>
          </div>
        </>
      )}
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
