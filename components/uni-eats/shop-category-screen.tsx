'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { restaurants, type MenuItem, type Restaurant } from '@/lib/data'
import {
  DASH_MARKET_ID,
  DEPARTMENTS,
  buildDashMarket,
  collectGroceries,
  groceryMatchesDepartment,
  type Department,
} from '@/lib/grocery-catalog'
import { MEAL_CATEGORIES, collectMeals, mealMatchesCategory, type MealEntry } from '@/lib/meal-catalog'
import { useFirebaseRestaurants } from '@/lib/firebase-db'
import { formatDistanceKm } from '@/lib/location'
import { useStore } from './store'
import { ProductCard, ProductSheet } from './product-card'
import { ArrowLeftIcon, SearchIcon, ChevronRightIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export function useDashMarket(): Restaurant {
  return useMemo(
    () => restaurants.find((r) => r.id === DASH_MARKET_ID) ?? buildDashMarket([]),
    []
  )
}

type SortKey = 'nearest' | 'popular' | 'price-asc' | 'price-desc' | 'specials'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'nearest', label: 'Nearest first' },
  { key: 'popular', label: 'Popular' },
  { key: 'specials', label: 'Specials' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
]

export function ShopCategoryScreen() {
  const {
    activeDepartmentId,
    openDepartment,
    goHome,
    isStoreInRange,
    getStoreDistanceKm,
    getStoreDeliveryFee,
    getStoreDeliveryTime,
  } = useStore()
  const market = useDashMarket()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()

  const isMealMode = Boolean(activeDepartmentId && activeDepartmentId.startsWith('meal-'))

  const allCategoryTabs: Department[] = isMealMode ? MEAL_CATEGORIES : DEPARTMENTS
  const activeCategory: Department =
    allCategoryTabs.find((d) => d.id === activeDepartmentId) ?? allCategoryTabs[0]

  const allEntries =
    liveRestaurants && liveRestaurants.length > 0 ? liveRestaurants : restaurants

  // Enrich in-range stores with real-time distance & sort by shortest distance first
  const inRangeSortedStores = useMemo(() => {
    return allEntries
      .filter((r) => isStoreInRange(r))
      .map((r) => {
        const distKm = getStoreDistanceKm(r)
        return {
          ...r,
          distKm,
          distance: formatDistanceKm(distKm),
          deliveryFee: getStoreDeliveryFee(r),
          pickupTime: getStoreDeliveryTime(r),
        }
      })
      .sort((a, b) => a.distKm - b.distKm)
  }, [allEntries, isStoreInRange, getStoreDistanceKm, getStoreDeliveryFee, getStoreDeliveryTime])

  const mealRestaurants = useMemo(
    () => inRangeSortedStores.filter((r) => r.storeType !== 'grocery'),
    [inRangeSortedStores]
  )

  const groceryStores = useMemo(
    () => inRangeSortedStores.filter((r) => r.storeType === 'grocery'),
    [inRangeSortedStores]
  )

  const [sub, setSub] = useState<string>('All')
  const [sort, setSort] = useState<SortKey>('nearest')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ item: MenuItem; store: Restaurant } | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const deptStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSub('All')
    setQuery('')
    topRef.current?.scrollIntoView({ block: 'start' })
    const active = deptStripRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeCategory.id])

  const categoryEntries: MealEntry[] = useMemo(() => {
    if (isMealMode) {
      const mealCat = MEAL_CATEGORIES.find((c) => c.id === activeCategory.id) ?? MEAL_CATEGORIES[0]
      return collectMeals(mealRestaurants).filter((entry) =>
        mealMatchesCategory(entry.item, mealCat)
      )
    }
    return collectGroceries(groceryStores).filter((entry) =>
      groceryMatchesDepartment(entry.item, activeCategory)
    )
  }, [isMealMode, activeCategory, mealRestaurants, groceryStores])

  const visible: MealEntry[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = categoryEntries.filter(
      ({ item, store }) =>
        (sub === 'All' || item.subcategory === sub) &&
        (q === '' ||
          item.name.toLowerCase().includes(q) ||
          (item.subcategory ?? '').toLowerCase().includes(q) ||
          store.name.toLowerCase().includes(q))
    )
    if (sort === 'specials') {
      list = list.filter(({ item }) => item.oldPrice && item.oldPrice > item.price)
    }
    const sorted = [...list]
    if (sort === 'nearest') {
      sorted.sort((a, b) => {
        const distDiff = getStoreDistanceKm(a.store) - getStoreDistanceKm(b.store)
        if (Math.abs(distDiff) > 0.05) return distDiff
        return Number(!!b.item.popular) - Number(!!a.item.popular)
      })
    } else if (sort === 'price-asc') {
      sorted.sort((a, b) => a.item.price - b.item.price)
    } else if (sort === 'price-desc') {
      sorted.sort((a, b) => b.item.price - a.item.price)
    } else {
      sorted.sort((a, b) => {
        const popDiff = Number(!!b.item.popular) - Number(!!a.item.popular)
        if (popDiff !== 0) return popDiff
        return getStoreDistanceKm(a.store) - getStoreDistanceKm(b.store)
      })
    }
    return sorted
  }, [categoryEntries, sub, sort, query, getStoreDistanceKm])

  const groups = useMemo(() => {
    if (sub !== 'All' || (sort !== 'nearest' && sort !== 'popular') || query) {
      return [{ title: '', entries: visible }]
    }
    const subGroups = activeCategory.subcategories
      .map((s) => ({
        title: s,
        entries: visible.filter(({ item }) => item.subcategory === s),
      }))
      .filter((g) => g.entries.length > 0)
    const uncategorized = visible.filter(
      ({ item }) => !item.subcategory || !activeCategory.subcategories.includes(item.subcategory)
    )
    if (uncategorized.length > 0) {
      subGroups.push({ title: subGroups.length > 0 ? 'More Options' : '', entries: uncategorized })
    }
    return subGroups.length > 0 ? subGroups : [{ title: '', entries: visible }]
  }, [visible, sub, sort, query, activeCategory])

  return (
    <div className="flex min-h-full flex-col bg-[#f4f5f2] pb-6">
      <div ref={topRef} />

      {/* Sticky header (green bar + sub-aisle pills) */}
      <div className="sticky top-0 z-20 shadow-sm">
        <header className="bg-[oklch(0.22_0.04_150)] text-white">
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <button
              type="button"
              onClick={goHome}
              aria-label="Back to home"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 transition-colors hover:bg-white/20"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>

            {searchOpen ? (
              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3.5 py-2.5">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search in ${activeCategory.title}`}
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setSearchOpen(false)
                  }}
                  className="text-xs font-bold text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-extrabold leading-tight">
                    {activeCategory.title}
                  </h1>
                  <p className="text-xs font-medium text-white/70">
                    {categoryEntries.length} {isMealMode ? 'meals near you' : 'products near you'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search this category"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 transition-colors hover:bg-white/20"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Category switcher */}
          <div ref={deptStripRef} className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
            {allCategoryTabs.map((d) => {
              const active = d.id === activeCategory.id
              return (
                <button
                  key={d.id}
                  type="button"
                  data-active={active}
                  onClick={() => openDepartment(d.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-bold transition-colors',
                    active
                      ? 'bg-white text-[oklch(0.22_0.04_150)]'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  )}
                >
                  <span
                    className="relative h-7 w-7 overflow-hidden rounded-full"
                    style={{ backgroundColor: d.bg }}
                  >
                    <Image src={d.icon} alt="" fill sizes="28px" className="object-cover" />
                  </span>
                  {d.title}
                </button>
              )
            })}
          </div>
        </header>

        {/* Sub-aisle pills */}
        <div className="border-b border-black/5 bg-[#f4f5f2]/95 backdrop-blur">
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            {['All', ...activeCategory.subcategories].map((s) => {
              const active = sub === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSub(s)}
                  className={cn(
                    'shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors',
                    active
                      ? 'border-[#287d46] bg-[#287d46] text-white'
                      : 'border-border bg-white text-foreground hover:border-[#287d46]/50'
                  )}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {visible.length} {visible.length === 1 ? 'item' : 'items'}
        </p>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-bold text-foreground outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Product / Meal grid */}
      <div className="flex-1 px-4 pb-4">
        {visible.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span
              className="relative h-20 w-20 overflow-hidden rounded-2xl"
              style={{ backgroundColor: activeCategory.bg }}
            >
              <Image src={activeCategory.icon} alt="" fill sizes="80px" className="object-cover" />
            </span>
            <p className="mt-4 text-base font-extrabold text-foreground">No items found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another filter or search term.
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.title || 'all'} className="mt-3">
              {g.title && (
                <div className="mb-2.5 mt-2 flex items-center justify-between">
                  <h2 className="text-[17px] font-extrabold tracking-tight text-foreground">
                    {g.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSub(g.title)}
                    className="flex items-center text-xs font-bold text-[#287d46]"
                  >
                    See all
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {g.entries.map(({ item, store }) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    store={store}
                    subtitle={
                      isMealMode
                        ? `${store.name}${store.distance ? ` • ${store.distance}` : ''}`
                        : `${item.size ? `${item.size} • ` : ''}${store.name}${store.distance ? ` • ${store.distance}` : ''}`
                    }
                    onOpen={(it, st) => setSelected({ item: it, store: st })}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <ProductSheet
        item={selected?.item ?? null}
        store={selected?.store ?? market}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
