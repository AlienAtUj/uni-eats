'use client'

import { useState } from 'react'
import { campuses, formatPrice } from '@/lib/data'
import { useStore } from './store'
import { BottomSheet } from './sheet'
import {
  ArrowLeftIcon,
  PinIcon,
  ClockIcon,
  CardIcon,
  ChevronRightIcon,
  CheckIcon,
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
  'Campus Card •••• 4821',
  'Visa •••• 6390',
  'Apple Pay',
]

export function CheckoutScreen() {
  const {
    cart,
    subtotal,
    goToScreen,
    campusId,
    pickupTime,
    setPickupTime,
    paymentMethod,
    setPaymentMethod,
    placeOrder,
  } = useStore()
  const [sheet, setSheet] = useState<'time' | 'payment' | null>(null)
  const campus = campuses.find((c) => c.id === campusId)!
  const total = subtotal + SERVICE_FEE

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
                {campus.name} · {campus.location}
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
          <SummaryRow label="Service fee" value={formatPrice(SERVICE_FEE)} />
          <div className="my-3 h-px bg-border" />
          <SummaryRow label="Total" value={formatPrice(total)} strong />
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 bg-background px-5 pb-2 pt-2">
        <button
          type="button"
          onClick={placeOrder}
          className="flex w-full items-center justify-between rounded-full bg-primary px-6 py-4 text-sm font-bold text-primary-foreground"
        >
          <span>Place order</span>
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
