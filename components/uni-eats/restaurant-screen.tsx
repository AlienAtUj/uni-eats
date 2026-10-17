'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { formatPrice, type MenuItem } from '@/lib/data'
import { useStore } from './store'
import { ItemSheet } from './item-sheet'
import {
  ArrowLeftIcon,
  StarIcon,
  ClockIcon,
  PinIcon,
  PlusIcon,
} from '@/components/icons'

import { useFirebaseProducts } from '@/lib/firebase-db'

export function RestaurantScreen() {
  const { activeRestaurant, goHome } = useStore()
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const { products: fbProducts } = useFirebaseProducts()

  const sections = useMemo(() => {
    if (!activeRestaurant) return []
    const map = new Map<string, MenuItem[]>()

    // Existing base menu items
    const baseItems = activeRestaurant.menu || []
    
    // Additional products from Firestore for this merchant
    const merchantFbProducts = fbProducts
      .filter((p) => p.merchantId === activeRestaurant.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price,
        image: (p.images && p.images[0]) || activeRestaurant.image || '/food/burger.png',
        section: p.category || 'Menu',
        modifiers: p.modifierGroups || [],
      }))

    // Combine avoiding duplicate IDs
    const existingIds = new Set(baseItems.map((i) => i.id))
    const combined = [...baseItems, ...merchantFbProducts.filter((p) => !existingIds.has(p.id))]

    for (const item of combined) {
      const sectionName = item.section || 'Menu'
      if (!map.has(sectionName)) map.set(sectionName, [])
      map.get(sectionName)!.push(item)
    }
    return Array.from(map.entries())
  }, [activeRestaurant, fbProducts])

  if (!activeRestaurant) return null
  const r = activeRestaurant

  return (
    <div className="pb-6">
      {/* Cover */}
      <div className="relative h-52 w-full">
        <Image src={r.image} alt={r.name} fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 to-transparent" />
        <button
          type="button"
          onClick={goHome}
          aria-label="Back"
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-md"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Info card */}
      <div className="relative -mt-8 rounded-t-3xl bg-background px-5 pt-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          {r.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {r.cuisine} · {r.priceLevel}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.reviews && r.reviews > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-bold text-foreground ring-1 ring-border">
              <StarIcon filled className="h-4 w-4 text-accent" />
              {r.rating.toFixed(1)}
              <span className="font-medium text-muted-foreground">
                ({r.reviews.toLocaleString()})
              </span>
            </span>
          ) : (
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary ring-1 ring-primary/20">
              New Store (0 reviews)
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-border">
            <ClockIcon className="h-4 w-4" />
            {r.pickupTime}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground ring-1 ring-border">
            <PinIcon className="h-4 w-4" />
            {r.location}
          </span>
        </div>
      </div>

      {/* Menu sections */}
      <div className="mt-5 flex flex-col gap-6 px-5">
        {sections.map(([section, items]) => (
          <section key={section}>
            <h2 className="mb-3 text-lg font-extrabold tracking-tight text-foreground">
              {section}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex gap-4 rounded-3xl bg-card p-3 text-left shadow-sm ring-1 ring-border transition-transform active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-bold text-card-foreground">
                        {item.name}
                      </h3>
                      {item.popular && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-auto pt-2 text-sm font-bold text-foreground">
                      {formatPrice(item.price)}
                    </p>
                  </div>
                  <div className="relative h-24 w-24 shrink-0">
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      className="rounded-2xl object-cover"
                    />
                    <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                      <PlusIcon className="h-5 w-5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <ItemSheet
        item={selected}
        restaurant={r}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
