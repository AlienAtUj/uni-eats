'use client'

import { useEffect, useState } from 'react'
import { formatPrice } from '@/lib/data'
import { useStore } from './store'
import {
  CheckIcon,
  ClockIcon,
  PinIcon,
  ReceiptIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

const stages = [
  { key: 'confirmed', title: 'Order confirmed', desc: 'The restaurant received your order.' },
  { key: 'preparing', title: 'Preparing your food', desc: 'Your meal is being freshly made.' },
  { key: 'ready', title: 'Ready for pickup', desc: 'Head to the counter to collect it.' },
  { key: 'collected', title: 'Collected', desc: 'Enjoy your meal. Great times!' },
]

export function TrackingScreen() {
  const { placedOrder, goHome } = useStore()
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!placedOrder) return
    setCurrent(0)
    const timers = [
      setTimeout(() => setCurrent(1), 2500),
      setTimeout(() => setCurrent(2), 6000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [placedOrder])

  if (!placedOrder) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <ReceiptIcon className="h-8 w-8" />
        </span>
        <div>
          <p className="text-base font-bold text-foreground">No active orders</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your order progress will appear here after checkout.
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
    )
  }

  const o = placedOrder

  return (
    <div className="pb-6">
      <header className="bg-[oklch(0.22_0.04_150)] px-5 pb-8 pt-6 text-[oklch(0.97_0.02_120)]">
        <p className="text-[11px] font-medium text-[oklch(0.97_0.02_120)]/70">
          Order {o.id}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {stages[current].title}
        </h1>
        <p className="mt-1 text-sm text-[oklch(0.97_0.02_120)]/75">
          {stages[current].desc}
        </p>
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[oklch(0.97_0.02_120)]/10 px-4 py-3">
          <ClockIcon className="h-5 w-5 text-accent" />
          <div>
            <span className="block text-[11px] text-[oklch(0.97_0.02_120)]/60">
              Estimated ready time
            </span>
            <span className="block text-sm font-bold">
              {current >= 2 ? 'Ready now' : '10 – 15 minutes'}
            </span>
          </div>
        </div>
      </header>

      {/* Progress tracker */}
      <div className="-mt-4 rounded-t-3xl bg-background px-5 pt-6">
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

      {/* Pickup details */}
      <div className="mt-1 px-5">
        <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <div className="flex items-start gap-3">
            <PinIcon className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Pickup instructions
              </p>
              <p className="text-sm font-bold text-card-foreground">
                {o.restaurantName} · {o.campusName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Show order {o.id} at the pickup counter. Pickup: {o.pickupTime}.
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
            {o.lines.map((line) => (
              <div
                key={line.lineId}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-semibold text-foreground">
                  {line.quantity}× {line.name}
                </span>
                <span className="font-semibold text-foreground">
                  {formatPrice(line.unitPrice * line.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-foreground">Total paid</span>
            <span className="text-base font-extrabold text-foreground">
              {formatPrice(o.total)}
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
    </div>
  )
}
