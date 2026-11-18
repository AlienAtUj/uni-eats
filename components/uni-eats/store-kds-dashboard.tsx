'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { formatZar, calculateSplitLedger } from '@/lib/dash-engine'
import { formatJohannesburgTime } from '@/lib/coord-validation'
import type { Order, OrderStatus } from '@/lib/firebase-db'

export interface StoreDashboardProps {
  merchantName: string
  storeType: 'food' | 'grocery'
  orders: Order[]
  isLoading: boolean
  isPaused: boolean
  onTogglePause: () => Promise<void> | void
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>
  onVerifyPickupPin: (orderId: string, pin: string) => Promise<void>
  financeSlot?: React.ReactNode
}

function getOrderCreatedMs(order: Order): number {
  const raw = order.createdAt as any
  if (typeof raw?.toMillis === 'function') return raw.toMillis()
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const iso = (order as any).createdAtIso
  if (typeof iso === 'string') {
    const parsed = Date.parse(iso)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function formatElapsedMmSs(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatLiveClockSast(nowMs: number): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(nowMs))
}

interface OrderCardProps {
  order: Order
  nowMs: number
  onAcceptPrepare: (orderId: string) => Promise<void>
  onMarkReady: (orderId: string) => Promise<void>
  onOpenPinModal: (order: Order) => void
}

export function OrderCard({
  order,
  nowMs,
  onAcceptPrepare,
  onMarkReady,
  onOpenPinModal,
}: OrderCardProps) {
  const [busy, setBusy] = useState(false)
  const createdMs = getOrderCreatedMs(order)
  const timerStr = formatElapsedMmSs(nowMs - createdMs)
  const displayCode = (order.orderId || order.id.slice(0, 8)).replace(/^#/, '')

  const statusMeta =
    order.status === 'pending'
      ? {
          border: 'border-l-[#DC2626]',
          tag: '[ NEW ]',
          tagColor: 'text-[#DC2626]',
          dot: 'bg-[#DC2626]',
        }
      : order.status === 'preparing'
        ? {
            border: 'border-l-[#1D4ED8]',
            tag: '[ PREP ]',
            tagColor: 'text-[#1D4ED8]',
            dot: 'bg-[#1D4ED8]',
          }
        : {
            border: 'border-l-[#047857]',
            tag: '[ READY ]',
            tagColor: 'text-[#047857]',
            dot: 'bg-[#047857]',
          }

  const handleAction = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`border border-zinc-200 border-l-4 ${statusMeta.border} bg-white rounded-md p-3.5 flex flex-col gap-3`}
    >
      {/* Card Header: Order ID + Status Tag | Massive Tabular Timer */}
      <div className="flex items-start justify-between gap-2 border-b border-zinc-200 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${statusMeta.dot}`} />
            <span className={`text-[11px] font-black tracking-wider ${statusMeta.tagColor}`}>
              {statusMeta.tag}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-[#71717A] truncate">
            #{displayCode}
          </p>
          <p className="text-xs font-bold text-[#09090B] truncate">
            {order.customerName || 'Dash Customer'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
            ELAPSED
          </span>
          <span className="text-2xl font-black leading-none text-[#09090B] [font-variant-numeric:tabular-nums]">
            {timerStr}
          </span>
        </div>
      </div>

      {/* Body: Food Items (Bold qty, regular item name) */}
      <ul className="space-y-1.5">
        {(order.items || []).map((item, idx) => (
          <li key={`${item.id || idx}-${idx}`} className="flex items-baseline justify-between gap-2 text-sm">
            <div className="min-w-0 text-[#09090B]">
              <span className="font-bold [font-variant-numeric:tabular-nums] mr-1.5">
                {item.quantity}x
              </span>
              <span className="font-normal">{item.name}</span>
              {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                <p className="pl-6 text-xs text-[#71717A]">
                  {item.modifiers.map((m) => m.label).filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs font-bold text-[#71717A] [font-variant-numeric:tabular-nums]">
              {formatZar(Number(item.price || 0) * Number(item.quantity || 1))}
            </span>
          </li>
        ))}
      </ul>

      {order.driverName && (
        <div className="border-t border-zinc-200 pt-2 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-[#71717A]">DRIVER</span>
          <span className="font-bold text-[#09090B]">
            {order.driverName}
            {order.driverVehiclePlate ? ` · ${order.driverVehiclePlate}` : ''}
          </span>
        </div>
      )}

      {/* Stark Black PIN Box */}
      <div className="bg-[#09090B] text-white rounded-sm px-3 py-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
          PICKUP PIN
        </span>
        <span className="font-black text-xl tracking-widest [font-variant-numeric:tabular-nums]">
          {order.pickupPin || '----'}
        </span>
      </div>

      {/* Action Button */}
      {order.status === 'pending' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(() => onAcceptPrepare(order.id))}
          className="w-full rounded-sm bg-[#DC2626] px-3 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-50"
        >
          {busy ? 'UPDATING...' : 'ACCEPT & PREPARE'}
        </button>
      )}
      {order.status === 'preparing' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => handleAction(() => onMarkReady(order.id))}
          className="w-full rounded-sm bg-[#1D4ED8] px-3 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
        >
          {busy ? 'UPDATING...' : 'MARK READY'}
        </button>
      )}
      {(order.status === 'ready' || order.status === 'out_for_delivery') && (
        <button
          type="button"
          onClick={() => onOpenPinModal(order)}
          className="w-full rounded-sm bg-[#047857] px-3 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#065F46]"
        >
          CONFIRM PICKUP
        </button>
      )}
    </article>
  )
}

interface PinModalProps {
  order: Order
  onClose: () => void
  onSubmitPin: (orderId: string, pin: string) => Promise<void>
}

function PinVerificationModal({ order, onClose, onSubmitPin }: PinModalProps) {
  const [digits, setDigits] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const displayCode = (order.orderId || order.id.slice(0, 8)).replace(/^#/, '')

  const triggerError = (msg: string) => {
    setErrorMsg(msg)
    setShake(true)
    setTimeout(() => setShake(false), 420)
  }

  const handleDigit = (d: string) => {
    if (submitting || digits.length >= 4) return
    setErrorMsg(null)
    setDigits((prev) => prev + d)
  }

  const handleBackspace = () => {
    if (submitting) return
    setErrorMsg(null)
    setDigits((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    if (submitting) return
    setErrorMsg(null)
    setDigits('')
  }

  const handleVerify = async () => {
    if (digits.length !== 4) {
      triggerError('ENTER 4-DIGIT PICKUP PIN')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      await onSubmitPin(order.id, digits)
      onClose()
    } catch (err: any) {
      triggerError(err?.message || 'INCORRECT PICKUP PIN')
      setDigits('')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        handleBackspace()
      } else if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && digits.length === 4) {
        handleVerify()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Verify Pickup PIN"
    >
      <style>{`
        @keyframes kds-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .kds-shake-active {
          animation: kds-shake 0.38s ease-in-out;
        }
      `}</style>
      <div className="w-full max-w-sm border border-zinc-800 bg-white rounded-md p-5">
        <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#71717A]">
              HANDOVER VERIFICATION
            </p>
            <h2 className="mt-0.5 text-lg font-black text-[#09090B]">
              ORDER #{displayCode}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-zinc-200 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[#09090B] hover:bg-zinc-100"
          >
            ESC
          </button>
        </div>

        <p className="mt-3 text-xs font-medium text-[#71717A]">
          Enter the 4-digit Pickup PIN from the driver to release order.
        </p>

        {/* 4 Large PIN Boxes */}
        <div className={`mt-4 grid grid-cols-4 gap-2.5 ${shake ? 'kds-shake-active' : ''}`}>
          {[0, 1, 2, 3].map((idx) => {
            const char = digits[idx] || ''
            const hasError = Boolean(errorMsg)
            return (
              <div
                key={idx}
                className={`flex h-16 items-center justify-center rounded-sm border-2 text-3xl font-black [font-variant-numeric:tabular-nums] ${
                  hasError
                    ? 'border-[#DC2626] bg-red-50 text-[#DC2626]'
                    : char
                      ? 'border-[#09090B] bg-white text-[#09090B]'
                      : 'border-zinc-200 bg-[#F4F4F5] text-[#71717A]'
                }`}
              >
                {char || '—'}
              </div>
            )
          })}
        </div>

        {errorMsg && (
          <p className="mt-2.5 text-center text-xs font-black uppercase tracking-wider text-[#DC2626]">
            {errorMsg}
          </p>
        )}

        {/* Custom-Built 3x4 Number Pad (Standard Buttons, Zero Icons) */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleDigit(n)}
              className="h-12 rounded-sm border border-zinc-200 bg-white text-lg font-black text-[#09090B] [font-variant-numeric:tabular-nums] hover:bg-[#F4F4F5] active:bg-zinc-200"
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-sm border border-zinc-200 bg-[#F4F4F5] text-xs font-black uppercase tracking-widest text-[#71717A] hover:bg-zinc-200"
          >
            CLR
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-sm border border-zinc-200 bg-white text-lg font-black text-[#09090B] [font-variant-numeric:tabular-nums] hover:bg-[#F4F4F5] active:bg-zinc-200"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-sm border border-zinc-200 bg-[#F4F4F5] text-xs font-black uppercase tracking-widest text-[#09090B] hover:bg-zinc-200"
          >
            DEL
          </button>
        </div>

        <button
          type="button"
          disabled={submitting || digits.length !== 4}
          onClick={handleVerify}
          className="mt-4 w-full rounded-sm bg-[#047857] py-3 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-[#065F46] disabled:opacity-40"
        >
          {submitting ? 'VERIFYING...' : 'CONFIRM PICKUP'}
        </button>
      </div>
    </div>
  )
}

export function StoreDashboard({
  merchantName,
  storeType,
  orders,
  isLoading,
  isPaused,
  onTogglePause,
  onUpdateStatus,
  onVerifyPickupPin,
  financeSlot,
}: StoreDashboardProps) {
  const [subView, setSubView] = useState<'board' | 'history' | 'finance'>('board')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [pinModalOrder, setPinModalOrder] = useState<Order | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const newOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending'),
    [orders]
  )
  const preparingOrders = useMemo(
    () => orders.filter((o) => o.status === 'preparing'),
    [orders]
  )
  const readyOrders = useMemo(
    () => orders.filter((o) => o.status === 'ready' || o.status === 'out_for_delivery'),
    [orders]
  )
  const historyOrders = useMemo(
    () => orders.filter((o) => o.status === 'completed' || o.status === 'cancelled'),
    [orders]
  )

  const activeCount = newOrders.length + preparingOrders.length + readyOrders.length

  const avgPrepTimeStr = useMemo(() => {
    const active = [...preparingOrders, ...readyOrders]
    if (active.length === 0) return '12:00'
    const avgMs =
      active.reduce((sum, o) => sum + Math.max(0, nowMs - getOrderCreatedMs(o)), 0) /
      active.length
    return formatElapsedMmSs(avgMs)
  }, [preparingOrders, readyOrders, nowMs])

  return (
    <div className="min-h-full bg-[#F4F4F5] font-sans text-[#09090B]">
      {/* High-Density Metric Strip Top Bar */}
      <div className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: ACTIVE ORDERS + AVG PREP TIME */}
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                ACTIVE ORDERS
              </span>
              <span className="text-2xl font-black leading-tight text-[#09090B] [font-variant-numeric:tabular-nums]">
                {activeCount}
              </span>
            </div>
            <div className="h-8 w-px bg-zinc-200" />
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                AVG PREP TIME
              </span>
              <span className="text-2xl font-black leading-tight text-[#09090B] [font-variant-numeric:tabular-nums]">
                {avgPrepTimeStr}
              </span>
            </div>
            <div className="hidden sm:block h-8 w-px bg-zinc-200" />
            <div className="hidden sm:block">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
                STATION
              </span>
              <span className="text-sm font-black uppercase tracking-wide text-[#09090B]">
                {merchantName}
              </span>
            </div>
          </div>

          {/* Right: Live Clock + Stark PAUSE NEW ORDERS Button */}
          <div className="flex items-center gap-3">
            <div className="border border-zinc-200 bg-[#F4F4F5] rounded-sm px-3 py-1.5 text-right">
              <span className="block text-[9px] font-bold uppercase tracking-widest text-[#71717A]">
                SAST LIVE
              </span>
              <span className="text-base font-black text-[#09090B] [font-variant-numeric:tabular-nums]">
                {formatLiveClockSast(nowMs)}
              </span>
            </div>
            <button
              type="button"
              onClick={onTogglePause}
              className={`rounded-sm px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors ${
                isPaused
                  ? 'bg-[#047857] hover:bg-[#065F46]'
                  : 'bg-[#DC2626] hover:bg-[#B91C1C]'
              }`}
            >
              {isPaused ? 'RESUME NEW ORDERS' : 'PAUSE NEW ORDERS'}
            </button>
          </div>
        </div>

        {/* Sub-view switcher: LIVE BOARD | HISTORY TABLE | FINANCE */}
        <div className="mt-3 flex items-center gap-1 border-t border-zinc-200 pt-2.5">
          {[
            { id: 'board', label: `LIVE BOARD (${activeCount})` },
            { id: 'history', label: `HISTORY (${historyOrders.length})` },
            { id: 'finance', label: 'FINANCE & PROMOS' },
          ].map((tab) => {
            const active = subView === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id as 'board' | 'history' | 'finance')}
                className={`rounded-sm px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  active
                    ? 'bg-[#09090B] text-white'
                    : 'bg-white text-[#71717A] border border-zinc-200 hover:text-[#09090B]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {isLoading ? (
          <div className="border border-zinc-200 bg-white rounded-md p-8 text-center text-xs font-bold uppercase tracking-widest text-[#71717A]">
            SYNCHRONIZING LIVE KDS FEED...
          </div>
        ) : subView === 'board' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Column 1: NEW */}
            <section className="flex flex-col border border-zinc-200 bg-[#F4F4F5] rounded-md">
              <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-3.5 py-2.5 rounded-t-md">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626]" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#09090B]">
                    NEW ORDERS
                  </h2>
                </div>
                <span className="rounded-sm bg-[#DC2626] px-2 py-0.5 text-xs font-black text-white [font-variant-numeric:tabular-nums]">
                  {newOrders.length}
                </span>
              </header>
              <div className="flex flex-col gap-3 p-3">
                {newOrders.length === 0 ? (
                  <p className="border border-dashed border-zinc-300 bg-white/60 rounded-sm p-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#71717A]">
                    NO NEW TICKETS
                  </p>
                ) : (
                  newOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      nowMs={nowMs}
                      onAcceptPrepare={(id) => onUpdateStatus(id, 'preparing')}
                      onMarkReady={(id) => onUpdateStatus(id, 'ready')}
                      onOpenPinModal={setPinModalOrder}
                    />
                  ))
                )}
              </div>
            </section>

            {/* Column 2: PREPARING */}
            <section className="flex flex-col border border-zinc-200 bg-[#F4F4F5] rounded-md">
              <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-3.5 py-2.5 rounded-t-md">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1D4ED8]" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#09090B]">
                    PREPARING
                  </h2>
                </div>
                <span className="rounded-sm bg-[#1D4ED8] px-2 py-0.5 text-xs font-black text-white [font-variant-numeric:tabular-nums]">
                  {preparingOrders.length}
                </span>
              </header>
              <div className="flex flex-col gap-3 p-3">
                {preparingOrders.length === 0 ? (
                  <p className="border border-dashed border-zinc-300 bg-white/60 rounded-sm p-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#71717A]">
                    QUEUE CLEAR
                  </p>
                ) : (
                  preparingOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      nowMs={nowMs}
                      onAcceptPrepare={(id) => onUpdateStatus(id, 'preparing')}
                      onMarkReady={(id) => onUpdateStatus(id, 'ready')}
                      onOpenPinModal={setPinModalOrder}
                    />
                  ))
                )}
              </div>
            </section>

            {/* Column 3: READY */}
            <section className="flex flex-col border border-zinc-200 bg-[#F4F4F5] rounded-md">
              <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-3.5 py-2.5 rounded-t-md">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#047857]" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-[#09090B]">
                    READY FOR PICKUP
                  </h2>
                </div>
                <span className="rounded-sm bg-[#047857] px-2 py-0.5 text-xs font-black text-white [font-variant-numeric:tabular-nums]">
                  {readyOrders.length}
                </span>
              </header>
              <div className="flex flex-col gap-3 p-3">
                {readyOrders.length === 0 ? (
                  <p className="border border-dashed border-zinc-300 bg-white/60 rounded-sm p-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#71717A]">
                    NONE AWAITING PICKUP
                  </p>
                ) : (
                  readyOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      nowMs={nowMs}
                      onAcceptPrepare={(id) => onUpdateStatus(id, 'preparing')}
                      onMarkReady={(id) => onUpdateStatus(id, 'ready')}
                      onOpenPinModal={setPinModalOrder}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        ) : subView === 'history' ? (
          /* 3. History Screen: Raw Data Table (Zero Cards) */
          <div className="overflow-x-auto border border-zinc-200 bg-white rounded-md">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200 bg-[#F4F4F5] text-[10px] font-black uppercase tracking-widest text-[#71717A]">
                  <th className="px-4 py-3">ORDER ID</th>
                  <th className="px-4 py-3">TIME</th>
                  <th className="px-4 py-3">ITEMS</th>
                  <th className="px-4 py-3">COMMISSION</th>
                  <th className="px-4 py-3 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {historyOrders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-xs font-bold uppercase tracking-widest text-[#71717A]"
                    >
                      NO COMPLETED OR CANCELLED ORDERS
                    </td>
                  </tr>
                ) : (
                  historyOrders.map((ord) => {
                    const displayCode = (ord.orderId || ord.id.slice(0, 8)).replace(/^#/, '')
                    const createdMs = getOrderCreatedMs(ord)
                    const total = Number(ord.total || 0)
                    const econ = calculateSplitLedger({
                      grossOrderValueZar: total,
                      storeType,
                      deliveryFeeZar: Number(ord.deliveryFeeZar ?? 0),
                      totalChargedZar: total,
                      paymentMethod:
                        ord.paymentChannel === 'capitec_pay'
                          ? 'capitec_pay'
                          : ord.paymentChannel === 'card'
                            ? 'card'
                            : 'ozow',
                    })
                    const itemsText = (ord.items || [])
                      .map((it) => `${it.quantity}x ${it.name}`)
                      .join(', ')
                    return (
                      <tr
                        key={ord.id}
                        className="border-b border-zinc-200 text-xs text-[#09090B] hover:bg-[#F4F4F5]/60"
                      >
                        <td className="px-4 py-3 font-bold uppercase tracking-widest text-[#09090B] whitespace-nowrap">
                          #{displayCode}
                          {ord.status === 'cancelled' && (
                            <span className="ml-2 text-[10px] font-black text-[#DC2626]">
                              [ VOID ]
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#71717A] whitespace-nowrap [font-variant-numeric:tabular-nums]">
                          {formatJohannesburgTime(createdMs)}
                        </td>
                        <td className="px-4 py-3 max-w-md truncate font-medium">
                          {itemsText || '—'}
                        </td>
                        <td className="px-4 py-3 text-[#71717A] whitespace-nowrap [font-variant-numeric:tabular-nums]">
                          {formatZar(econ.dashCommissionZar)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#09090B] whitespace-nowrap [font-variant-numeric:tabular-nums]">
                          {formatZar(total)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div>{financeSlot}</div>
        )}
      </div>

      {/* PIN Verification Modal */}
      {pinModalOrder && (
        <PinVerificationModal
          order={pinModalOrder}
          onClose={() => setPinModalOrder(null)}
          onSubmitPin={onVerifyPickupPin}
        />
      )}
    </div>
  )
}
