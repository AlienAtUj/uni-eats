'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { type MenuItem } from '@/lib/data'
import { useStore } from './store'
import { ProductCard, ProductSheet } from './product-card'
import {
  ArrowLeftIcon,
  StarIcon,
  ClockIcon,
  PinIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

import { useFirebaseProducts } from '@/lib/firebase-db'

export function RestaurantScreen() {
  const { activeRestaurant, goHome } = useStore()
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [activeSection, setActiveSection] = useState<string>('All')
  const { products: fbProducts } = useFirebaseProducts()

  const sections = useMemo(() => {
    if (!activeRestaurant) return []
    const map = new Map<string, MenuItem[]>()

    const baseItems = activeRestaurant.menu || []
    const merchantFbProducts = fbProducts
      .filter((p) => p.merchantId === activeRestaurant.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price,
        image:
          (p.images && p.images[0]) ||
          activeRestaurant.image ||
          '/food/featured-burger.jpg',
        section: p.category || 'Menu',
        modifiers: p.modifierGroups || [],
      }))

    const existingIds = new Set(baseItems.map((i) => i.id))
    const combined = [
      ...baseItems,
      ...merchantFbProducts.filter((p) => !existingIds.has(p.id)),
    ]

    for (const item of combined) {
      const sectionName = item.section || 'Menu'
      if (!map.has(sectionName)) map.set(sectionName, [])
      map.get(sectionName)!.push(item)
    }
    return Array.from(map.entries())
  }, [activeRestaurant, fbProducts])

  if (!activeRestaurant) return null
  const r = activeRestaurant

  const sectionNames = ['All', ...sections.map(([s]) => s)]
  const visibleSections =
    activeSection === 'All'
      ? sections
      : sections.filter(([s]) => s === activeSection)

  return (
    <div className="min-h-full bg-[#f4f5f2] pb-6">
      {/* Cover */}
      <div className="relative h-48 w-full">
        <Image
          src={
            r.image && r.image.trim()
              ? r.image.trim()
              : '/food/featured-burger.jpg'
          }
          alt={r.name}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
        <button
          type="button"
          onClick={goHome}
          aria-label="Back"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-foreground shadow-md"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Info card */}
      <div className="relative -mt-6 rounded-t-3xl bg-[#f4f5f2] px-4 pt-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          {r.name}
        </h1>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">
          {r.cuisine} · {r.deliveryFee || 'R15 delivery'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.reviews && r.reviews > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-foreground ring-1 ring-border">
              <StarIcon filled className="h-3.5 w-3.5 text-[#e59838]" />
              {r.rating.toFixed(1)}
              <span className="font-medium text-muted-foreground">
                ({r.reviews.toLocaleString()})
              </span>
            </span>
          ) : (
            <span className="rounded-full bg-[#287d46]/10 px-3 py-1.5 text-xs font-bold text-[#287d46]">
              New Store
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
            <ClockIcon className="h-3.5 w-3.5" />
            {r.pickupTime}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
            <PinIcon className="h-3.5 w-3.5" />
            {r.location}
          </span>
        </div>

        {/* Section filter pills */}
        {sectionNames.length > 2 && (
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {sectionNames.map((sec) => {
              const active = activeSection === sec
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setActiveSection(sec)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-colors',
                    active
                      ? 'border-[#287d46] bg-[#287d46] text-white'
                      : 'border-border bg-white text-foreground hover:border-[#287d46]/50'
                  )}
                >
                  {sec}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 2-Column Product/Meal Grid by section */}
      <div className="mt-4 flex flex-col gap-5 px-4">
        {visibleSections.map(([section, items]) => (
          <section key={section}>
            <h2 className="mb-2.5 text-[17px] font-extrabold tracking-tight text-foreground">
              {section}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  store={r}
                  onOpen={(it) => setSelected(it)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ProductSheet
        item={selected}
        store={r}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
