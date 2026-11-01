'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import {
  campuses,
  categories,
  restaurants,
  formatPrice,
  type MenuItem,
  type Restaurant,
} from '@/lib/data'
import { useStore } from './store'
import { BottomSheet } from './sheet'
import { ItemSheet } from './item-sheet'
import {
  SearchIcon,
  ChevronDownIcon,
  StarIcon,
  ClockIcon,
  PinIcon,
  CheckIcon,
  PlusIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

import { useFirebaseRestaurants } from '@/lib/firebase-db'

type TrendingMealEntry = {
  id: string
  name: string
  restaurant: string
  restaurantId: string
  price: number
  image: string
  item: MenuItem
  restaurantObj: Restaurant
}

export function HomeScreen() {
  const { campusId, setCampus, openRestaurant, addLine } = useStore()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()
  const [campusOpen, setCampusOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [addedItemId, setAddedItemId] = useState<string | null>(null)
  const [selectedMeal, setSelectedMeal] = useState<{
    item: MenuItem
    restaurant: Restaurant
  } | null>(null)

  const handleQuickAdd = (m: TrendingMealEntry) => {
    const hasRequiredModifiers = m.item.modifiers?.some((g) => g.required)
    if (hasRequiredModifiers) {
      setSelectedMeal({ item: m.item, restaurant: m.restaurantObj })
      return
    }

    addLine({
      itemId: m.id,
      name: m.name,
      image: m.image,
      unitPrice: m.price,
      quantity: 1,
      restaurantId: m.restaurantId,
      restaurantName: m.restaurant,
      modifierLabels: [],
    })
    setAddedItemId(m.id)
    setTimeout(() => {
      setAddedItemId((prev) => (prev === m.id ? null : prev))
    }, 1200)
  }

  const campus = campuses.find((c) => c.id === campusId)!

  const allRestaurants = liveRestaurants && liveRestaurants.length > 0 ? liveRestaurants : restaurants

  const campusRestaurants = useMemo(
    () => allRestaurants.filter((r) => r.campusIds?.includes(campusId)),
    [campusId, allRestaurants],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cat = category.toLowerCase()
    const catSingular = cat.endsWith('s') ? cat.slice(0, -1) : cat

    return campusRestaurants.filter((r) => {
      const cuisineLower = (r.cuisine || '').toLowerCase()
      const matchesQuery =
        q === '' ||
        r.name.toLowerCase().includes(q) ||
        cuisineLower.includes(q) ||
        (r.menu &&
          r.menu.some(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              (m.description && m.description.toLowerCase().includes(q)),
          ))
      const matchesCat =
        category === 'All' ||
        cuisineLower.includes(cat) ||
        cuisineLower.includes(catSingular) ||
        (r.menu &&
          r.menu.some((m) => {
            const sec = (m.section || '').toLowerCase()
            return sec.includes(cat) || sec.includes(catSingular)
          }))
      return matchesQuery && matchesCat
    })
  }, [campusRestaurants, query, category])

  const featured = campusRestaurants.slice(0, 4)

  const liveTrendingMeals = useMemo(() => {
    const list: TrendingMealEntry[] = []
    const q = query.trim().toLowerCase()
    const cat = category.toLowerCase()
    const catSingular = cat.endsWith('s') ? cat.slice(0, -1) : cat

    for (const r of campusRestaurants) {
      if (r.menu) {
        for (const item of r.menu) {
          const sec = (item.section || r.cuisine || '').toLowerCase()
          const matchesQuery =
            q === '' ||
            item.name.toLowerCase().includes(q) ||
            (item.description && item.description.toLowerCase().includes(q)) ||
            r.name.toLowerCase().includes(q)
          const matchesCat =
            category === 'All' ||
            sec.includes(cat) ||
            sec.includes(catSingular)

          if (matchesQuery && matchesCat) {
            const resolvedImage = item.image || r.image || '/food/burger.png'
            list.push({
              id: item.id,
              name: item.name,
              restaurant: r.name,
              restaurantId: r.id,
              price: item.price,
              image: resolvedImage,
              item: {
                ...item,
                image: resolvedImage,
              },
              restaurantObj: r,
            })
          }
        }
      }
    }
    return list.slice(0, 12)
  }, [campusRestaurants, query, category])

  return (
    <div className="pb-4">
      {/* Header */}
      <header className="bg-[oklch(0.22_0.04_150)] px-5 pb-6 pt-5 text-[oklch(0.97_0.02_120)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-[oklch(0.97_0.02_120)]/10">
              <Image
                src="/unieats-logo.jpg"
                alt="UniEats"
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </span>
            <div>
              <p className="text-[11px] font-medium text-[oklch(0.97_0.02_120)]/70">
                Good food. Great times.
              </p>
              <p className="text-sm font-extrabold tracking-tight">UniEats</p>
            </div>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[oklch(0.97_0.02_120)]/10 text-sm font-bold">
            AK
          </span>
        </div>

        <button
          type="button"
          onClick={() => setCampusOpen(true)}
          className="mt-5 flex w-full items-center justify-between rounded-2xl bg-[oklch(0.97_0.02_120)]/10 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <PinIcon className="h-5 w-5 text-accent" />
            <span>
              <span className="block text-[11px] text-[oklch(0.97_0.02_120)]/60">
                Ordering for
              </span>
              <span className="block text-sm font-bold">
                {campus.name} · {campus.location}
              </span>
            </span>
          </span>
          <ChevronDownIcon className="h-5 w-5 text-[oklch(0.97_0.02_120)]/70" />
        </button>

        {/* Search */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm">
          <SearchIcon className="h-5 w-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants or dishes"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </header>

      {/* Category chips */}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
              category === c
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Featured */}
      {category === 'All' && query === '' && (
        <section className="mt-6">
          <SectionHeader title="Featured this week" />
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-1">
            {featured.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openRestaurant(r.id)}
                className="w-64 shrink-0 overflow-hidden rounded-3xl bg-card text-left shadow-sm ring-1 ring-border"
              >
                <div className="relative h-36 w-full">
                  <Image src={r.image} alt={r.name} fill className="object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
                    Featured
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-card-foreground">
                      {r.name}
                    </h3>
                    {r.reviews && r.reviews > 0 ? (
                      <span className="flex items-center gap-1 text-sm font-bold text-foreground">
                        <StarIcon filled className="h-4 w-4 text-accent" />
                        {r.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                        New
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{r.cuisine}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="h-4 w-4" />
                      {r.pickupTime}
                    </span>
                    <span className="flex items-center gap-1">
                      <PinIcon className="h-4 w-4" />
                      {r.location}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Trending meals */}
      {liveTrendingMeals.length > 0 && (
        <section className="mt-6">
          <SectionHeader
            title={category === 'All' && query === '' ? 'Trending meals' : 'Meals'}
          />
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-1">
            {liveTrendingMeals.map((m) => (
              <div
                key={m.id}
                className="group relative flex w-40 shrink-0 flex-col justify-between text-left"
              >
                <div>
                  <div className="relative h-28 w-40 overflow-hidden rounded-2xl ring-1 ring-border">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedMeal({ item: m.item, restaurant: m.restaurantObj })
                      }
                      className="relative h-full w-full block text-left"
                    >
                      <Image
                        src={m.image}
                        alt={m.name}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </button>
                    {/* Quick Add Floating Button on Image */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleQuickAdd(m)
                      }}
                      className={cn(
                        'absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-all active:scale-95',
                        addedItemId === m.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                      aria-label={`Add ${m.name} to cart`}
                    >
                      {addedItemId === m.id ? (
                        <CheckIcon className="h-4 w-4" />
                      ) : (
                        <PlusIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMeal({ item: m.item, restaurant: m.restaurantObj })
                    }
                    className="block text-left w-full"
                  >
                    <p className="mt-2 line-clamp-1 text-sm font-bold text-foreground">
                      {m.name}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {m.restaurant}
                    </p>
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMeal({ item: m.item, restaurant: m.restaurantObj })
                    }
                    className="text-left text-sm font-extrabold text-primary"
                  >
                    {formatPrice(m.price)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(m)}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm transition-all active:scale-95',
                      addedItemId === m.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                    )}
                  >
                    {addedItemId === m.id ? (
                      <>
                        <CheckIcon className="h-3 w-3" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <PlusIcon className="h-3 w-3" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All restaurants */}
      <section className="mt-6">
        <SectionHeader
          title={
            query || category !== 'All'
              ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}`
              : 'All restaurants'
          }
        />
        <div className="flex flex-col gap-4 px-5">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openRestaurant(r.id)}
              disabled={!r.open}
              className={cn(
                'flex gap-4 rounded-3xl bg-card p-3 text-left shadow-sm ring-1 ring-border transition-transform',
                r.open ? 'active:scale-[0.99]' : 'opacity-60',
              )}
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
                <Image src={r.image} alt={r.name} fill className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-base font-bold text-card-foreground">
                    {r.name}
                  </h3>
                  {r.reviews && r.reviews > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-foreground">
                      <StarIcon filled className="h-4 w-4 text-accent" />
                      {r.rating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      New
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {r.cuisine} · {r.priceLevel}
                </p>
                <div className="mt-auto flex items-center gap-3 pt-2 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="h-4 w-4" />
                    {r.pickupTime}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      r.open
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {r.open ? 'Open now' : 'Closed'}
                  </span>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-3xl bg-card p-8 text-center ring-1 ring-border shadow-sm">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <PinIcon className="h-7 w-7" />
              </span>
              <p className="mt-3 text-base font-bold text-foreground">No restaurants available yet</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                No food items have been posted for {campus.name} yet. Store owners can log in to start adding products!
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Campus selector */}
      <BottomSheet
        open={campusOpen}
        onClose={() => setCampusOpen(false)}
        title="Choose your campus"
      >
        <ul className="flex flex-col gap-2 py-1">
          {campuses.map((c) => {
            const selected = c.id === campusId
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCampus(c.id)
                    setCampusOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl border p-4 text-left',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <PinIcon
                      className={cn(
                        'h-5 w-5',
                        selected ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span>
                      <span className="block text-sm font-bold text-card-foreground">
                        {c.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.location}
                      </span>
                    </span>
                  </span>
                  {selected && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="h-4 w-4" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </BottomSheet>

      {/* Product Details Sheet */}
      {selectedMeal && (
        <ItemSheet
          item={selectedMeal.item}
          restaurant={selectedMeal.restaurant}
          onClose={() => setSelectedMeal(null)}
        />
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between px-5">
      <h2 className="text-lg font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  )
}
