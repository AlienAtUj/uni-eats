'use client'

import Image from 'next/image'
import { useState } from 'react'
import { formatPrice, type MenuItem, type Restaurant } from '@/lib/data'
import { departmentForItem } from '@/lib/grocery-catalog'
import { useStore } from './store'
import { PlusIcon, MinusIcon } from '@/components/icons'
import { cn } from '@/lib/utils'
import { BottomSheet } from './sheet'

/** Returns the quantity of a (modifier-free) product in the cart and helpers to change it. */
export function useProductQty(item: MenuItem, store: Restaurant) {
  const { cart, addLine, updateQty } = useStore()
  const line = cart.find((l) => l.itemId === item.id && l.modifierLabels.length === 0)
  const qty = line?.quantity ?? 0

  const add = () =>
    addLine({
      itemId: item.id,
      name: item.size ? `${item.name} ${item.size}` : item.name,
      image: item.image || store.image,
      unitPrice: item.price,
      quantity: 1,
      restaurantId: store.id,
      restaurantName: store.name,
      modifierLabels: [],
    })

  const inc = () => (line ? updateQty(line.lineId, 1) : add())
  const dec = () => line && updateQty(line.lineId, -1)

  return { qty, inc, dec }
}

/** True only for white-background studio packshots in /products/. All database & food photos use full-bleed cover. */
export function isStudioPackshot(src: string | undefined | null): boolean {
  if (!src) return false
  return src.startsWith('/products/')
}

/** Product image with graceful fallback to the department illustration. */
export function ProductImage({
  item,
  className,
  sizes,
}: {
  item: MenuItem
  className?: string
  sizes?: string
}) {
  const [failed, setFailed] = useState(false)
  const dept = departmentForItem(item)
  const rawImage = typeof item.image === 'string' ? item.image.trim() : ''
  const packshot = isStudioPackshot(rawImage)

  if (failed || !rawImage) {
    const tint = dept?.bg ?? '#eef2ef'
    return (
      <div
        className={cn('flex h-full w-full items-center justify-center rounded-xl', className)}
        style={{
          background: `radial-gradient(circle at 50% 45%, #ffffff 0%, ${tint}66 70%, ${tint}aa 100%)`,
        }}
      >
        {dept?.icon && dept.icon.trim() ? (
          <Image src={dept.icon.trim()} alt="" width={64} height={64} className="h-1/2 w-1/2 object-contain" />
        ) : null}
      </div>
    )
  }

  return (
    <Image
      src={rawImage}
      alt={item.name}
      fill
      sizes={sizes ?? '(max-width: 448px) 50vw, 220px'}
      className={cn(
        packshot ? 'object-contain p-2' : 'object-cover object-center',
        className
      )}
      onError={() => setFailed(true)}
    />
  )
}

export function QtyControl({
  qty,
  onInc,
  onDec,
  size = 'md',
}: {
  qty: number
  onInc: () => void
  onDec: () => void
  size?: 'md' | 'lg'
}) {
  const btn = size === 'lg' ? 'h-11 w-11' : 'h-8 w-8'
  const icon = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onInc()
        }}
        aria-label="Add to cart"
        className={cn(
          'flex items-center justify-center rounded-full bg-[#287d46] text-white shadow-md ring-2 ring-white transition-transform active:scale-90',
          btn
        )}
      >
        <PlusIcon className={icon} />
      </button>
    )
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center rounded-full bg-[#287d46] text-white shadow-md ring-2 ring-white"
    >
      <button
        type="button"
        onClick={onDec}
        aria-label="Remove one"
        className={cn('flex items-center justify-center rounded-full active:scale-90', btn)}
      >
        <MinusIcon className={icon} />
      </button>
      <span className={cn('min-w-5 text-center font-extrabold', size === 'lg' ? 'text-base' : 'text-sm')}>
        {qty}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label="Add one more"
        className={cn('flex items-center justify-center rounded-full active:scale-90', btn)}
      >
        <PlusIcon className={icon} />
      </button>
    </div>
  )
}

/** Checkers-style product/meal tile: image, add/stepper, price, name, size/subtitle. */
export function ProductCard({
  item,
  store,
  subtitle,
  onOpen,
  className,
}: {
  item: MenuItem
  store: Restaurant
  subtitle?: string
  onOpen?: (item: MenuItem, store: Restaurant) => void
  className?: string
}) {
  const { qty, inc, dec } = useProductQty(item, store)
  const onSpecial = typeof item.oldPrice === 'number' && item.oldPrice > item.price
  const saving = onSpecial ? (item.oldPrice as number) - item.price : 0
  const metaText = subtitle || item.size
  const packshot = isStudioPackshot(item.image)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(item, store)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(item, store)}
      className={cn(
        'group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-black/5 transition-shadow hover:shadow-md',
        className
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden bg-white',
          packshot ? 'aspect-square' : 'aspect-[4/4]'
        )}
      >
        <div
          className={cn(
            'absolute overflow-hidden',
            packshot ? 'inset-2 rounded-xl' : 'inset-1.5 rounded-xl bg-muted/20'
          )}
        >
          <ProductImage item={item} className="transition-transform duration-300 group-hover:scale-105" />
        </div>

        {onSpecial && (
          <span className="absolute left-3 top-3 rounded-md bg-[#e23b2e] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-2xs">
            Save R{saving.toFixed(0)}
          </span>
        )}

        <div className="absolute bottom-3 right-3">
          <QtyControl qty={qty} onInc={inc} onDec={dec} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-1.5">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-[15px] font-extrabold tracking-tight',
              onSpecial ? 'text-[#e23b2e]' : 'text-foreground'
            )}
          >
            {formatPrice(item.price)}
          </span>
          {onSpecial && (
            <span className="text-[11px] font-semibold text-muted-foreground line-through">
              {formatPrice(item.oldPrice as number)}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] font-semibold leading-snug text-foreground">
          {item.name}
        </p>
        {metaText && (
          <p className="mt-auto truncate pt-1 text-[11px] font-medium text-muted-foreground">
            {metaText}
          </p>
        )}
      </div>
    </div>
  )
}

/** Full product detail sheet for grocery products & meals. */
export function ProductSheet({
  item,
  store,
  onClose,
}: {
  item: MenuItem | null
  store: Restaurant
  onClose: () => void
}) {
  if (!item) return null
  return <ProductSheetInner item={item} store={store} onClose={onClose} />
}

function ProductSheetInner({
  item,
  store,
  onClose,
}: {
  item: MenuItem
  store: Restaurant
  onClose: () => void
}) {
  const { qty, inc, dec } = useProductQty(item, store)
  const onSpecial = typeof item.oldPrice === 'number' && item.oldPrice > item.price
  const dept = departmentForItem(item)

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={dept?.title ?? item.section ?? 'Details'}
      footer={
        <div className="flex items-center gap-3">
          {qty > 0 ? (
            <>
              <QtyControl qty={qty} onInc={inc} onDec={dec} size="lg" />
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full bg-[oklch(0.22_0.04_150)] py-3.5 text-sm font-bold text-white"
              >
                Done · {formatPrice(item.price * qty)}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={inc}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#287d46] py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98]"
            >
              <PlusIcon className="h-4 w-4" />
              Add to cart · {formatPrice(item.price)}
            </button>
          )}
        </div>
      }
    >
      <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl bg-white">
        <ProductImage item={item} sizes="280px" />
        {onSpecial && (
          <span className="absolute left-2 top-2 rounded-md bg-[#e23b2e] px-2 py-1 text-xs font-extrabold uppercase text-white">
            On special
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={cn('text-2xl font-extrabold', onSpecial ? 'text-[#e23b2e]' : 'text-foreground')}>
          {formatPrice(item.price)}
        </span>
        {onSpecial && (
          <span className="text-sm font-semibold text-muted-foreground line-through">
            {formatPrice(item.oldPrice as number)}
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-extrabold leading-snug text-foreground">{item.name}</h3>
      {item.size && <p className="text-sm font-medium text-muted-foreground">{item.size}</p>}
      {item.description && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      )}
      <p className="mt-3 text-xs font-semibold text-[#287d46]">
        From {store.name} · {store.pickupTime}
      </p>
    </BottomSheet>
  )
}
