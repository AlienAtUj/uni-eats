'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  calculateSplitLedger,
  DASH_SPONSORED_TOP3_MONTHLY_FEE_ZAR,
  formatZar,
  validateInStorePrice,
  type DashStoreType,
} from '@/lib/dash-engine'
import { cn } from '@/lib/utils'

export interface MerchantLedgerOrder {
  id: string
  orderCode: string
  grossOrderValueZar: number
  deliveryFeeZar: number
  storeType: DashStoreType
  paymentMethod: 'ozow' | 'capitec_pay' | 'card'
  pickupPin: string
  batchDispatch: boolean
  prepStartedAtMs: number
  pickupVerified: boolean
}

export function MerchantFinanceDashboard({
  merchantName,
  storeType,
  orders,
  initialPricePromiseAccepted = false,
  initialSponsoredTop3 = false,
  onTogglePricePromise,
  onToggleSponsoredTop3,
  onVerifyPickup,
}: {
  merchantName: string
  storeType: DashStoreType
  orders: MerchantLedgerOrder[]
  initialPricePromiseAccepted?: boolean
  initialSponsoredTop3?: boolean
  onTogglePricePromise?: (accepted: boolean) => Promise<void> | void
  onToggleSponsoredTop3?: (active: boolean) => Promise<void> | void
  onVerifyPickup?: (orderId: string, pin: string) => Promise<void> | void
}) {
  const [subTab, setSubTab] = useState<'wallet' | 'orders' | 'boost'>('wallet')
  const [pricePromiseAccepted, setPricePromiseAccepted] = useState(initialPricePromiseAccepted)
  const [inStorePriceInput, setInStorePriceInput] = useState('120.00')
  const [dashPriceInput, setDashPriceInput] = useState('120.00')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [priceValidMsg, setPriceValidMsg] = useState<string | null>(null)

  const [pinInputs, setPinInputs] = useState<Record<string, string>>({})
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({})
  const [verifiedIds, setVerifiedIds] = useState<Record<string, boolean>>({})

  const [top3Sponsored, setTop3Sponsored] = useState(initialSponsoredTop3)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    setPricePromiseAccepted(initialPricePromiseAccepted)
  }, [initialPricePromiseAccepted])

  useEffect(() => {
    setTop3Sponsored(initialSponsoredTop3)
  }, [initialSponsoredTop3])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const ledgerRows = useMemo(() => {
    return orders.map((o) => {
      const totalCharged = o.grossOrderValueZar + o.deliveryFeeZar + 4.99
      const split = calculateSplitLedger({
        grossOrderValueZar: o.grossOrderValueZar,
        storeType: o.storeType,
        deliveryFeeZar: o.deliveryFeeZar,
        totalChargedZar: totalCharged,
        paymentMethod: o.paymentMethod,
      })
      return { order: o, split }
    })
  }, [orders])

  const totals = useMemo(() => {
    return ledgerRows.reduce(
      (acc, row) => {
        acc.gross += row.split.grossOrderValueZar
        acc.commission += row.split.dashCommissionZar
        acc.net += row.split.merchantNetPayoutZar
        return acc
      },
      { gross: 0, commission: 0, net: 0 }
    )
  }, [ledgerRows])

  const handleValidatePrice = () => {
    setPriceError(null)
    setPriceValidMsg(null)
    try {
      validateInStorePrice(Number(dashPriceInput), Number(inStorePriceInput))
      setPriceValidMsg('Price matches your physical store price.')
    } catch (err: any) {
      setPriceError(err?.message || 'In-Store Price Promise violation.')
    }
  }

  const handleVerifyOrderPin = async (order: MerchantLedgerOrder) => {
    const entered = (pinInputs[order.id] || '').trim()
    if (!entered) {
      setPinErrors((prev) => ({
        ...prev,
        [order.id]: 'Enter the 4-digit Order PIN from the rider.',
      }))
      return
    }
    try {
      if (onVerifyPickup) {
        await onVerifyPickup(order.id, entered)
      } else if (entered !== order.pickupPin) {
        throw new Error('Invalid Order PIN. Ask the rider for the 4-digit pickup PIN.')
      }
      setPinErrors((prev) => {
        const next = { ...prev }
        delete next[order.id]
        return next
      })
      setVerifiedIds((prev) => ({ ...prev, [order.id]: true }))
    } catch (err: any) {
      setPinErrors((prev) => ({
        ...prev,
        [order.id]: err?.message || 'Invalid Order PIN.',
      }))
    }
  }

  return (
    <section className="space-y-4">
      {/* 0% Onboarding & In-Store Price Promise Banner */}
      <div className="rounded-2xl border border-[#287d46]/25 bg-[#287d46]/8 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#287d46]">
              0% Onboarding Fee. Next-day payouts.
            </p>
            <h3 className="text-sm font-bold text-[#111111]">
              {merchantName} • {storeType === 'grocery' ? '10% Grocery Commission' : '15% Food Commission'}
            </h3>
          </div>
          {top3Sponsored && (
            <span className="rounded-full bg-[#e07a2e] px-2.5 py-1 text-[11px] font-extrabold text-white">
              Promoted
            </span>
          )}
        </div>

        {/* Mandatory Non-Skippable In-Store Price Promise Checkbox */}
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-white p-3 ring-1 ring-[#E8E8E8]">
          <input
            type="checkbox"
            checked={pricePromiseAccepted}
            onChange={(e) => {
              const next = e.target.checked
              setPricePromiseAccepted(next)
              onTogglePricePromise?.(next)
            }}
            className="mt-0.5 h-4 w-4 accent-[#287d46]"
            required
          />
          <span className="text-xs font-medium leading-relaxed text-[#111111]">
            I commit to the In-Store Menu Price Promise. The prices on Dash will exactly match my physical store prices. I understand I cannot inflate prices.
          </span>
        </label>

        {/* Live In-Store Price Guardrail Check */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#545454]">
              In-Store Price (R)
            </label>
            <input
              type="number"
              step="0.01"
              value={inStorePriceInput}
              onChange={(e) => setInStorePriceInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-xs font-bold text-[#111111]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#545454]">
              Dash Menu Price (R)
            </label>
            <input
              type="number"
              step="0.01"
              value={dashPriceInput}
              onChange={(e) => setDashPriceInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-xs font-bold text-[#111111]"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleValidatePrice}
          disabled={!pricePromiseAccepted}
          className="mt-2 rounded-lg bg-[#287d46] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          Verify In-Store Price
        </button>
        {priceError && (
          <p className="mt-1.5 text-xs font-bold text-destructive">{priceError}</p>
        )}
        {priceValidMsg && (
          <p className="mt-1.5 text-xs font-bold text-[#287d46]">{priceValidMsg}</p>
        )}
      </div>

      {/* Sub-navigation: Wallet | Prep & Batch | Boost */}
      <div className="grid grid-cols-3 gap-1.5 rounded-full bg-[#F3F3F3] p-1">
        {(
          [
            ['wallet', 'Wallet'],
            ['orders', 'Prep & Batch'],
            ['boost', 'Boost'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={cn(
              'rounded-full py-2 text-xs font-bold transition-colors',
              subTab === key
                ? 'bg-[#287d46] text-white'
                : 'text-[#545454] hover:text-[#111111]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* WALLET TAB */}
      {subTab === 'wallet' && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[#E8E8E8]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#545454]">
                Net Payout (Due next morning)
              </p>
              <p className="text-2xl font-black text-[#287d46]">{formatZar(totals.net)}</p>
            </div>
            <span className="rounded-full bg-[#287d46]/12 px-3 py-1 text-[11px] font-bold text-[#287d46]">
              Hits bank at 08:00 SAST
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-[#E8E8E8] pt-3 text-xs">
            <div>
              <span className="text-[#545454]">Gross Order Value</span>
              <p className="font-extrabold text-[#111111]">{formatZar(totals.gross)}</p>
            </div>
            <div>
              <span className="text-[#545454]">
                Dash Commission ({storeType === 'grocery' ? '10%' : '15%'})
              </span>
              <p className="font-extrabold text-[#111111]">{formatZar(totals.commission)}</p>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#E8E8E8] pt-3">
            {ledgerRows.map(({ order, split }) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-xl bg-[#F6F6F6] px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-bold text-[#111111]">{order.orderCode}</p>
                  <p className="text-[11px] text-[#545454]">
                    Gross {formatZar(split.grossOrderValueZar)} • Comm{' '}
                    {formatZar(split.dashCommissionZar)}
                  </p>
                </div>
                <span className="font-extrabold text-[#287d46]">
                  {formatZar(split.merchantNetPayoutZar)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PREP & BATCH DISPATCH TAB */}
      {subTab === 'orders' && (
        <div className="space-y-3">
          {orders.map((order) => {
            const elapsedSec = Math.max(0, Math.floor((nowMs - order.prepStartedAtMs) / 1000))
            const targetSec = 15 * 60
            const remainingSec = Math.max(0, targetSec - elapsedSec)
            const mins = Math.floor(remainingSec / 60)
            const secs = remainingSec % 60
            const isVerified = order.pickupVerified || verifiedIds[order.id]

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-white p-4 ring-1 ring-[#E8E8E8]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-[#111111]">
                    {order.orderCode}
                  </span>
                  <span className="rounded-full bg-[#287d46]/12 px-2.5 py-0.5 text-xs font-bold text-[#287d46]">
                    Prep Timer: {mins}:{String(secs).padStart(2, '0')} (10–15 min)
                  </span>
                </div>

                {order.batchDispatch && (
                  <p className="mt-2 rounded-lg bg-[#e07a2e]/12 px-2.5 py-1.5 text-xs font-semibold text-[#b85312]">
                    Batch Dispatch: A rider is picking this up alongside another order nearby.
                  </p>
                )}

                {isVerified ? (
                  <p className="mt-3 text-xs font-bold text-[#287d46]">
                    Pickup verified with Order PIN. Handed to rider.
                  </p>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="Order PIN"
                      value={pinInputs[order.id] || ''}
                      onChange={(e) =>
                        setPinInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      className="w-28 rounded-lg border border-[#E8E8E8] px-3 py-1.5 font-mono text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyOrderPin(order)}
                      className="rounded-lg bg-[#287d46] px-3.5 py-1.5 text-xs font-bold text-white"
                    >
                      Verify Pickup
                    </button>
                  </div>
                )}

                {pinErrors[order.id] && (
                  <p className="mt-1.5 text-xs font-semibold text-destructive">
                    {pinErrors[order.id]}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* BOOST TAB (SPONSORED PLACEMENTS) */}
      {subTab === 'boost' && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E8E8E8]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-[#e07a2e]/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-[#e07a2e]">
                Sponsored Placement
              </span>
              <h4 className="mt-1.5 text-base font-extrabold text-[#111111]">
                Top-3 Banner Placement
              </h4>
              <p className="mt-1 text-xs text-[#545454]">
                Feature {merchantName} in the Top-3 home carousel and display a &ldquo;Promoted&rdquo; badge next to your store icon on the Client App.
              </p>
            </div>
            <span className="shrink-0 text-base font-black text-[#111111]">
              {formatZar(DASH_SPONSORED_TOP3_MONTHLY_FEE_ZAR)}/mo
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !top3Sponsored
              setTop3Sponsored(next)
              onToggleSponsoredTop3?.(next)
            }}
            className={cn(
              'mt-4 w-full rounded-full py-3 text-xs font-extrabold transition-colors',
              top3Sponsored
                ? 'bg-[#F3F3F3] text-[#111111]'
                : 'bg-[#287d46] text-white'
            )}
          >
            {top3Sponsored
              ? 'Top-3 Banner Active (Promoted)'
              : `Purchase Top-3 Banner (${formatZar(DASH_SPONSORED_TOP3_MONTHLY_FEE_ZAR)}/month)`}
          </button>
        </div>
      )}
    </section>
  )
}
