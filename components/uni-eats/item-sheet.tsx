'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { formatPrice, type MenuItem, type Restaurant } from '@/lib/data'
import { BottomSheet } from './sheet'
import { useStore } from './store'
import { PlusIcon, MinusIcon, CheckIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export function ItemSheet({
  item,
  restaurant,
  onClose,
}: {
  item: MenuItem | null
  restaurant: Restaurant
  onClose: () => void
}) {
  return (
    <BottomSheet
      open={!!item}
      onClose={onClose}
      title={item?.name ?? ''}
      footer={null}
    >
      {item && (
        <ItemSheetBody item={item} restaurant={restaurant} onClose={onClose} />
      )}
    </BottomSheet>
  )
}

function ItemSheetBody({
  item,
  restaurant,
  onClose,
}: {
  item: MenuItem
  restaurant: Restaurant
  onClose: () => void
}) {
  const { addLine } = useStore()
  const [qty, setQty] = useState(1)
  const [single, setSingle] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    item.modifiers?.forEach((g) => {
      if (g.type === 'single' && g.required) init[g.id] = g.options[0].id
    })
    return init
  })
  const [multi, setMulti] = useState<Record<string, Set<string>>>({})

  const { unitPrice, labels } = useMemo(() => {
    let price = Number(item.price) || 0
    const chosen: string[] = []
    item.modifiers?.forEach((g) => {
      if (g.type === 'single') {
        const sel = g.options.find((o) => o.id === single[g.id])
        if (sel) {
          const optPrice = Math.max(0, Number(sel.price) || 0)
          price += optPrice
          if (optPrice > 0 || g.required) chosen.push(sel.label)
        }
      } else {
        const set = multi[g.id]
        g.options.forEach((o) => {
          if (set?.has(o.id)) {
            const optPrice = Math.max(0, Number(o.price) || 0)
            price += optPrice
            chosen.push(o.label)
          }
        })
      }
    })
    return { unitPrice: price, labels: chosen }
  }, [item, single, multi])

  return (
    <div className="flex flex-col gap-5">
      <div className="relative -mx-5 -mt-1 h-44">
        <Image src={item.image} alt={item.name} fill className="object-cover" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">
          {restaurant.name}
          {item.section ? ` · ${item.section}` : ''}
        </p>
        <p className="text-base font-extrabold text-primary">
          {formatPrice(item.price)}
        </p>
      </div>

      {item.description && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      )}

      {item.modifiers?.map((group) => (
        <div key={group.id}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.required ? 'Required' : 'Optional'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {group.options.map((opt) => {
              const active =
                group.type === 'single'
                  ? single[group.id] === opt.id
                  : !!multi[group.id]?.has(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (group.type === 'single') {
                      setSingle((s) => ({ ...s, [group.id]: opt.id }))
                    } else {
                      setMulti((m) => {
                        const set = new Set(m[group.id])
                        set.has(opt.id) ? set.delete(opt.id) : set.add(opt.id)
                        return { ...m, [group.id]: set }
                      })
                    }
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-colors',
                    active ? 'border-primary bg-primary/5' : 'border-border bg-card',
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    {opt.label}
                  </span>
                  <span className="flex items-center gap-3">
                    {opt.price > 0 && (
                      <span className="text-sm font-semibold text-muted-foreground">
                        +{formatPrice(opt.price)}
                      </span>
                    )}
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full border',
                        group.type === 'single' ? 'rounded-full' : 'rounded-md',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {active && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Quantity + add */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-4 rounded-full bg-secondary px-2 py-1.5">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <span className="w-5 text-center text-base font-bold">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            addLine({
              itemId: item.id,
              name: item.name,
              image: item.image,
              quantity: qty,
              unitPrice,
              modifierLabels: labels,
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
            })
            onClose()
          }}
          className="flex flex-1 items-center justify-between rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground"
        >
          <span>Add to cart</span>
          <span>{formatPrice(unitPrice * qty)}</span>
        </button>
      </div>
    </div>
  )
}
