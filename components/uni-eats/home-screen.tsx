'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  campuses,
  restaurants,
  type MenuItem,
  type Restaurant,
} from '@/lib/data'
import { useStore } from './store'
import { BottomSheet } from './sheet'
import {
  SearchIcon,
  ChevronDownIcon,
  PinIcon,
  CheckIcon,
  ChevronRightIcon,
  BagIcon,
  StoreIcon,
} from '@/components/icons'
import { cn } from '@/lib/utils'

import { useFirebaseRestaurants } from '@/lib/firebase-db'
import { DASH_MARKET_ID, DEPARTMENTS } from '@/lib/grocery-catalog'
import {
  MEAL_CATEGORIES,
  collectMeals,
  mealMatchesCategory,
  type MealEntry,
} from '@/lib/meal-catalog'
import { ProductCard, ProductSheet } from './product-card'
import { useDashMarket } from './shop-category-screen'

export function HomeScreen() {
  const {
    campusId,
    setCampus,
    customLocationLabel,
    setCustomLocation,
    homeMode,
    setHomeMode,
    openRestaurant,
    addLine,
    goToScreen,
    openDepartment,
    user,
  } = useStore()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()
  const [campusOpen, setCampusOpen] = useState(false)
  const [customAddressInput, setCustomAddressInput] = useState('')
  const [isLocatingGps, setIsLocatingGps] = useState(false)
  const [query, setQuery] = useState('')
  const [addedItemId, setAddedItemId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<{
    item: MenuItem
    store: Restaurant
  } | null>(null)
  const market = useDashMarket()

  const markJustAdded = (id: string) => {
    setAddedItemId(id)
    setTimeout(() => {
      setAddedItemId((prev) => (prev === id ? null : prev))
    }, 1200)
  }

  const handleQuickAddFromStore = (store: Restaurant) => {
    const firstItem = store.menu && store.menu[0]
    if (!firstItem) {
      openRestaurant(store.id)
      return
    }
    const hasRequiredModifiers = firstItem.modifiers?.some((g) => g.required)
    if (hasRequiredModifiers) {
      setSelectedEntry({ item: firstItem, store })
      return
    }
    addLine({
      itemId: firstItem.id,
      name: firstItem.name,
      image: firstItem.image || store.image || '/food/spaza-store.jpg',
      unitPrice: firstItem.price,
      quantity: 1,
      restaurantId: store.id,
      restaurantName: store.name,
      modifierLabels: [],
    })
    markJustAdded(store.id)
  }

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setCustomLocation('Current Location • Near You')
      setCampusOpen(false)
      return
    }
    setIsLocatingGps(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16`
          )
          if (res.ok) {
            const data = await res.json()
            const addr = data?.address || {}
            const area =
              addr.suburb ||
              addr.neighbourhood ||
              addr.quarter ||
              addr.city_district ||
              addr.town ||
              addr.city ||
              'Current Location'
            const city = addr.city || addr.town || 'Near You'
            setCustomLocation(
              area === city ? `${area} • Near You` : `${area} • ${city}`
            )
          } else {
            setCustomLocation('Current Location • Near You')
          }
        } catch {
          setCustomLocation('Current Location • Near You')
        } finally {
          setIsLocatingGps(false)
          setCampusOpen(false)
        }
      },
      () => {
        setIsLocatingGps(false)
        setCustomLocation('Current Location • Near You')
        setCampusOpen(false)
      },
      { timeout: 6000 }
    )
  }

  const campus = campuses.find((c) => c.id === campusId) ?? campuses[0]
  const displayLocationText = customLocationLabel
    ? customLocationLabel
    : `${campus.name} • ${campus.location}`

  const userInitials = useMemo(() => {
    if (user?.displayName) {
      const parts = user.displayName.trim().split(/\s+/)
      if (parts.length >= 2)
        return (parts[0][0] + parts[1][0]).toUpperCase()
      return parts[0].slice(0, 2).toUpperCase()
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase()
    }
    return 'AK'
  }, [user])

  const allEntries =
    liveRestaurants && liveRestaurants.length > 0
      ? liveRestaurants
      : restaurants

  const sortedNearYou = useMemo(() => {
    return [...allEntries].sort((a, b) => {
      const aLocal = a.campusIds?.includes(campusId) ? 1 : 0
      const bLocal = b.campusIds?.includes(campusId) ? 1 : 0
      return bLocal - aLocal
    })
  }, [allEntries, campusId])

  const mealRestaurants = useMemo(
    () => sortedNearYou.filter((r) => r.storeType !== 'grocery'),
    [sortedNearYou]
  )

  const groceryStores = useMemo(
    () => sortedNearYou.filter((r) => r.storeType === 'grocery'),
    [sortedNearYou]
  )

  const allMealEntries = useMemo(
    () => collectMeals(mealRestaurants),
    [mealRestaurants]
  )

  const mealSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allMealEntries.filter(
      ({ item, store }) =>
        item.name.toLowerCase().includes(q) ||
        (item.section || '').toLowerCase().includes(q) ||
        (item.subcategory || '').toLowerCase().includes(q) ||
        store.name.toLowerCase().includes(q)
    )
  }, [allMealEntries, query])

  const featuredRestaurants = useMemo(() => {
    const list = mealRestaurants.length > 0 ? mealRestaurants : sortedNearYou
    return list.slice(0, 4)
  }, [mealRestaurants, sortedNearYou])

  const filteredGroceryStores = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groceryStores.filter((store) => {
      if (store.id === DASH_MARKET_ID) return false
      if (q === '') return true
      return (
        store.name.toLowerCase().includes(q) ||
        (store.cuisine || '').toLowerCase().includes(q) ||
        (store.menu || []).some(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.section || '').toLowerCase().includes(q)
        )
      )
    })
  }, [groceryStores, query])

  const marketSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return market.menu.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.section || '').toLowerCase().includes(q) ||
        (m.subcategory || '').toLowerCase().includes(q)
    )
  }, [market, query])

  const marketSpecials = useMemo(
    () =>
      market.menu.filter(
        (m) => typeof m.oldPrice === 'number' && m.oldPrice > m.price
      ),
    [market]
  )

  return (
    <div className="bg-[#f4f5f2] pb-8">
      {/* Top Dark Green Header */}
      <header className="bg-[oklch(0.22_0.04_150)] px-5 pb-5 pt-5 text-[oklch(0.97_0.02_120)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[oklch(0.18_0.04_150)] ring-1 ring-white/15">
              <Image
                src="/dash-logo.jpg"
                alt="Dash"
                width={44}
                height={44}
                className="h-full w-full object-cover"
              />
            </span>
            <div>
              <p className="text-[12px] font-medium leading-tight text-[oklch(0.97_0.02_120)]/75">
                Good food. Great times.
              </p>
              <p className="text-[20px] font-extrabold leading-tight tracking-tight text-white">
                Dash
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => goToScreen('profile')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-sm font-bold text-white transition-colors hover:bg-white/20"
            aria-label="Open account"
          >
            {userInitials}
          </button>
        </div>

        {/* Location Selector Pill */}
        <button
          type="button"
          onClick={() => setCampusOpen(true)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3.5 text-left transition-colors hover:bg-white/15"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <PinIcon className="h-5 w-5 shrink-0 text-[#e59838]" />
            <span className="truncate text-[15px] font-semibold text-white">
              {displayLocationText}
            </span>
          </span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 text-white/80" />
        </button>

        {/* Rounded-Full White Search Bar */}
        <div className="mt-3 flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search restaurants, dishes, or stores..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Segmented Mode Toggle: Eat (Meals) vs Shop (Stores) */}
      <div className="mx-5 mt-4 grid grid-cols-2 rounded-full bg-[#dce3de] p-1">
        <button
          type="button"
          onClick={() => setHomeMode('eat')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-full py-2.5 text-sm transition-all',
            homeMode === 'eat'
              ? 'bg-[oklch(0.22_0.04_150)] font-bold text-white shadow-xs'
              : 'font-semibold text-[#3b4d41] hover:text-[oklch(0.22_0.04_150)]'
          )}
        >
          <StoreIcon className="h-4 w-4" />
          <span>Eat (Meals)</span>
        </button>

        <button
          type="button"
          onClick={() => setHomeMode('shop')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-full py-2.5 text-sm transition-all',
            homeMode === 'shop'
              ? 'bg-[oklch(0.22_0.04_150)] font-bold text-white shadow-xs'
              : 'font-semibold text-[#3b4d41] hover:text-[oklch(0.22_0.04_150)]'
          )}
        >
          <BagIcon className="h-4 w-4" />
          <span>Shop (Stores)</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* EAT (MEALS) MODE                                          */}
      {/* ========================================================= */}
      {homeMode === 'eat' ? (
        <>
          {query.trim() ? (
            <section className="mt-5 px-5">
              <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
                Results for “{query.trim()}”
              </h2>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">
                {mealSearchResults.length} meals near you
              </p>
              {mealSearchResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No meals match your search. Try “burger”, “kota” or “pizza”.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {mealSearchResults.map(({ item, store }) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      store={store}
                      subtitle={store.name}
                      onOpen={(it, st) => setSelectedEntry({ item: it, store: st })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* Featured this week */}
              {featuredRestaurants.length > 0 && (
                <section className="mt-5">
                  <SectionHeader title="Featured this week" />
                  <div className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-1">
                    {featuredRestaurants.map((r) => {
                      const firstDishImg =
                        (r.menu && r.menu[0]?.image && r.menu[0].image.trim()) ||
                        (r.image && r.image.trim()) ||
                        '/food/featured-burger.jpg'
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openRestaurant(r.id)}
                          className="relative h-44 w-full shrink-0 overflow-hidden rounded-3xl bg-card text-left shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.99]"
                        >
                          <Image
                            src={firstDishImg}
                            alt={r.name}
                            fill
                            className="object-cover"
                          />
                          <span className="absolute left-3.5 top-3.5 rounded-full bg-[#e07a2e] px-3.5 py-1 text-xs font-extrabold text-[#1a1a1a] shadow-xs">
                            Featured
                          </span>

                          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-foreground shadow-md backdrop-blur-xs">
                            <span className="text-[#e59838]">★</span>
                            <span>{(r.rating || 5.0).toFixed(1)}</span>
                            <span>•</span>
                            <span>{r.pickupTime || '10-15 min'}</span>
                            <span>•</span>
                            <span>{r.deliveryFee || 'R15 delivery'}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Quick meal categories (Checkers-style tile row opening dedicated category page) */}
              <section className="mt-5">
                <SectionHeader title="Browse meal categories" />
                <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-1">
                  {MEAL_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => openDepartment(cat.id)}
                      className="group flex w-[21.5%] shrink-0 snap-start flex-col items-center text-center"
                    >
                      <div
                        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl shadow-2xs transition-all group-hover:shadow-md group-active:scale-95"
                        style={{ backgroundColor: cat.bg }}
                      >
                        <Image
                          src={cat.icon}
                          alt={cat.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <span className="mt-2 text-xs font-bold leading-tight text-foreground">
                        {cat.line1}
                        {cat.line2 && (
                          <>
                            <br />
                            {cat.line2}
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Trending Meals Rail */}
              {allMealEntries.length > 0 && (
                <MealRail
                  title="Trending meals"
                  entries={allMealEntries}
                  onOpen={(item, store) => setSelectedEntry({ item, store })}
                />
              )}

              {/* Restaurants near you */}
              <section className="mt-6">
                <SectionHeader title="Restaurants near you" />
                <div className="flex flex-col gap-3.5 px-5">
                  {mealRestaurants.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        'flex items-center gap-4 rounded-3xl bg-white p-3.5 shadow-xs ring-1 ring-border/80',
                        !r.open && 'opacity-60'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openRestaurant(r.id)}
                        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl text-left"
                      >
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
                      </button>

                      <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <button
                          type="button"
                          onClick={() => openRestaurant(r.id)}
                          className="block text-left"
                        >
                          <h3 className="truncate text-[16px] font-extrabold text-foreground">
                            {r.name}
                          </h3>
                          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                            {r.deliveryFee || 'R15 delivery'} •{' '}
                            {r.pickupTime || '10-15 min'}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-[#287d46]">
                            {r.open ? 'Open now' : 'Closed'}
                          </p>
                        </button>

                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openRestaurant(r.id)}
                            className="rounded-full bg-[#287d46] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#216639] active:scale-95"
                          >
                            + View Menu
                          </button>
                          {r.menu && r.menu.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleQuickAddFromStore(r)}
                              className="rounded-full bg-[#287d46] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#216639] active:scale-95"
                            >
                              {addedItemId === r.id ? 'Added' : '+ Add'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* One horizontal meal rail per meal category */}
              {MEAL_CATEGORIES.map((cat) => {
                const entries = allMealEntries.filter((e) =>
                  mealMatchesCategory(e.item, cat)
                )
                if (entries.length === 0) return null
                return (
                  <MealRail
                    key={cat.id}
                    title={cat.title}
                    icon={cat.icon}
                    iconBg={cat.bg}
                    entries={entries}
                    onOpen={(item, store) => setSelectedEntry({ item, store })}
                    onViewAll={() => openDepartment(cat.id)}
                  />
                )
              })}
            </>
          )}
        </>
      ) : (
        /* ========================================================= */
        /* SHOP (STORES / GROCERIES) MODE                            */
        /* ========================================================= */
        <>
          {query.trim() ? (
            <section className="mt-5 px-5">
              <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
                Results for “{query.trim()}”
              </h2>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">
                {marketSearchResults.length} products in {market.name}
              </p>
              {marketSearchResults.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No products match your search. Try “milk”, “chicken” or “chips”.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {marketSearchResults.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      store={market}
                      onOpen={(it, st) => setSelectedEntry({ item: it, store: st })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* Promo banners */}
              <ShopPromoCarousel onOpenDepartment={openDepartment} />

              {/* Quick quick categories */}
              <section className="mt-5">
                <SectionHeader title="Quick quick categories" />
                <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-5 pb-1">
                  {DEPARTMENTS.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => openDepartment(cat.id)}
                      className="group flex w-[21.5%] shrink-0 snap-start flex-col items-center text-center"
                    >
                      <div
                        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl shadow-2xs transition-all group-hover:shadow-md group-active:scale-95"
                        style={{ backgroundColor: cat.bg }}
                      >
                        <Image
                          src={cat.icon}
                          alt={cat.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <span className="mt-2 text-xs font-bold leading-tight text-foreground">
                        {cat.line1}
                        {cat.line2 && (
                          <>
                            <br />
                            {cat.line2}
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Specials carousel */}
              {marketSpecials.length > 0 && (
                <ProductRail
                  title="Specials this week"
                  items={marketSpecials}
                  store={market}
                  onOpen={(item, store) => setSelectedEntry({ item, store })}
                />
              )}

              {/* Stores near you */}
              {filteredGroceryStores.length > 0 && (
                <section className="mt-6">
                  <SectionHeader title="Stores near you" />
                  <div className="flex flex-col gap-4 px-5">
                    {filteredGroceryStores.map((store) => (
                      <div
                        key={store.id}
                        className={cn(
                          'flex items-center gap-4 rounded-3xl bg-white p-3.5 shadow-xs ring-1 ring-border/80',
                          !store.open && 'opacity-60'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openRestaurant(store.id)}
                          className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl text-left"
                        >
                          <Image
                            src={
                              store.image && store.image.trim()
                                ? store.image.trim()
                                : '/food/spaza-store.jpg'
                            }
                            alt={store.name}
                            fill
                            className="object-cover transition-transform duration-200 hover:scale-105"
                          />
                        </button>

                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                          <button
                            type="button"
                            onClick={() => openRestaurant(store.id)}
                            className="block text-left"
                          >
                            <h3 className="truncate text-[17px] font-extrabold text-foreground">
                              {store.name}
                            </h3>
                            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                              {store.deliveryFee || 'R10 delivery'} •{' '}
                              {store.pickupTime || '10-15 min'}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold text-[#287d46]">
                              {store.open ? 'Open now' : 'Closed'}
                            </p>
                          </button>

                          <div className="mt-2.5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openRestaurant(store.id)}
                              className="rounded-full bg-[#287d46] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-[#216639] active:scale-95"
                            >
                              + View Shop
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAddFromStore(store)}
                              className={cn(
                                'rounded-full px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all active:scale-95',
                                addedItemId === store.id
                                  ? 'bg-emerald-700'
                                  : 'bg-[#287d46] hover:bg-[#216639]'
                              )}
                            >
                              {addedItemId === store.id ? 'Added' : '+ Add'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* One product rail per department */}
              {DEPARTMENTS.map((dept) => {
                const items = market.menu.filter(
                  (m) => m.section === dept.title
                )
                if (items.length === 0) return null
                return (
                  <ProductRail
                    key={dept.id}
                    title={dept.title}
                    icon={dept.icon}
                    iconBg={dept.bg}
                    items={items}
                    store={market}
                    onOpen={(item, store) => setSelectedEntry({ item, store })}
                    onViewAll={() => openDepartment(dept.id)}
                  />
                )
              })}
            </>
          )}
        </>
      )}

      {/* Location Selector Sheet */}
      <BottomSheet
        open={campusOpen}
        onClose={() => setCampusOpen(false)}
        title="Delivery & pickup location"
      >
        <div className="flex flex-col gap-3 py-1">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingGps}
            className="flex w-full items-center justify-between rounded-2xl border border-[#287d46]/40 bg-[#287d46]/10 p-3.5 text-left transition-colors hover:bg-[#287d46]/15"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#287d46] text-white">
                <PinIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-foreground">
                  {isLocatingGps
                    ? 'Detecting your location...'
                    : 'Use my current location'}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Show restaurants & stores nearest to you right now
                </span>
              </span>
            </span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (customAddressInput.trim()) {
                setCustomLocation(customAddressInput.trim())
                setCustomAddressInput('')
                setCampusOpen(false)
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={customAddressInput}
              onChange={(e) => setCustomAddressInput(e.target.value)}
              placeholder="Enter any street, suburb, or city..."
              className="flex-1 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-[#287d46]"
            />
            <button
              type="submit"
              className="rounded-2xl bg-[#287d46] px-4 py-2.5 text-xs font-bold text-white"
            >
              Set
            </button>
          </form>

          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Popular areas & hubs near you
          </p>

          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {campuses.map((c) => {
              const selected = !customLocationLabel && c.id === campusId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCampus(c.id)
                      setCampusOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border p-3.5 text-left',
                      selected
                        ? 'border-[#287d46] bg-[#287d46]/5'
                        : 'border-border bg-card'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <PinIcon
                        className={cn(
                          'h-5 w-5',
                          selected
                            ? 'text-[#287d46]'
                            : 'text-muted-foreground'
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
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#287d46] text-white">
                        <CheckIcon className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </BottomSheet>

      <ProductSheet
        item={selectedEntry?.item ?? null}
        store={selectedEntry?.store ?? market}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between px-5">
      <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  )
}

function ProductRail({
  title,
  icon,
  iconBg,
  items,
  store,
  onOpen,
  onViewAll,
}: {
  title: string
  icon?: string
  iconBg?: string
  items: MenuItem[]
  store: Restaurant
  onOpen: (item: MenuItem, store: Restaurant) => void
  onViewAll?: () => void
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between px-5">
        <button
          type="button"
          onClick={onViewAll}
          disabled={!onViewAll}
          className="flex items-center gap-2.5 text-left"
        >
          {icon && icon.trim() && (
            <span
              className="relative h-8 w-8 overflow-hidden rounded-lg"
              style={{ backgroundColor: iconBg }}
            >
              <Image
                src={icon.trim()}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            </span>
          )}
          <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
            {title}
          </h2>
        </button>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center gap-0.5 rounded-full bg-[#287d46]/10 px-3 py-1 text-xs font-bold text-[#287d46] transition-colors hover:bg-[#287d46]/20"
          >
            View all
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 scroll-px-5">
        {items.slice(0, 12).map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            store={store}
            onOpen={onOpen}
            className="w-[44%] shrink-0 snap-start"
          />
        ))}
      </div>
    </section>
  )
}

function MealRail({
  title,
  icon,
  iconBg,
  entries,
  onOpen,
  onViewAll,
}: {
  title: string
  icon?: string
  iconBg?: string
  entries: MealEntry[]
  onOpen: (item: MenuItem, store: Restaurant) => void
  onViewAll?: () => void
}) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between px-5">
        <button
          type="button"
          onClick={onViewAll}
          disabled={!onViewAll}
          className="flex items-center gap-2.5 text-left"
        >
          {icon && icon.trim() && (
            <span
              className="relative h-8 w-8 overflow-hidden rounded-lg"
              style={{ backgroundColor: iconBg }}
            >
              <Image
                src={icon.trim()}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            </span>
          )}
          <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
            {title}
          </h2>
        </button>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center gap-0.5 rounded-full bg-[#287d46]/10 px-3 py-1 text-xs font-bold text-[#287d46] transition-colors hover:bg-[#287d46]/20"
          >
            View all
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 scroll-px-5">
        {entries.slice(0, 12).map(({ item, store }) => (
          <ProductCard
            key={item.id}
            item={item}
            store={store}
            subtitle={store.name}
            onOpen={onOpen}
            className="w-[44%] shrink-0 snap-start"
          />
        ))}
      </div>
    </section>
  )
}

const PROMOS = [
  {
    id: 'braai',
    eyebrow: 'Braai weekend',
    title: 'Boerewors now R69.95',
    cta: 'Shop Butcher',
    dept: 'butcher',
    from: '#7a1f1a',
    to: '#d2452f',
    art: '/categories/butcher.svg',
  },
  {
    id: 'fresh',
    eyebrow: 'Fresh deals',
    title: 'Farm-fresh fruit & veg',
    cta: 'Shop Produce',
    dept: 'fresh-produce',
    from: '#1f5a2e',
    to: '#3f9a4a',
    art: '/categories/fresh-produce.svg',
  },
  {
    id: 'breakfast',
    eyebrow: 'Delivered in 60 min',
    title: 'Bread, milk & eggs',
    cta: 'Shop Essentials',
    dept: 'bread-milk',
    from: '#8a4b12',
    to: '#e59838',
    art: '/categories/bread-milk.svg',
  },
] as const

function ShopPromoCarousel({
  onOpenDepartment,
}: {
  onOpenDepartment: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const timer = setInterval(() => {
      const next =
        (Math.round(el.scrollLeft / el.clientWidth) + 1) % PROMOS.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="mt-4">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.round(el.scrollLeft / el.clientWidth))
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {PROMOS.map((p) => (
          <div key={p.id} className="w-full shrink-0 snap-center px-5">
            <button
              type="button"
              onClick={() => onOpenDepartment(p.dept)}
              className="relative flex h-36 w-full items-center overflow-hidden rounded-3xl p-5 text-left text-white shadow-md"
              style={{
                background: `linear-gradient(120deg, ${p.from} 0%, ${p.to} 100%)`,
              }}
            >
              <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <span className="absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-white/10" />
              <span className="relative z-10 max-w-[60%]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                  {p.eyebrow}
                </span>
                <span className="mt-1 block text-xl font-extrabold leading-tight">
                  {p.title}
                </span>
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[oklch(0.22_0.04_150)]">
                  {p.cta}
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </span>
              </span>
              <span className="absolute bottom-3 right-4 h-24 w-24 rotate-6 overflow-hidden rounded-2xl shadow-lg ring-4 ring-white/30">
                <Image
                  src={p.art}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </span>
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {PROMOS.map((p, i) => (
          <span
            key={p.id}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-5 bg-[#287d46]' : 'w-1.5 bg-[#287d46]/25'
            )}
          />
        ))}
      </div>
    </section>
  )
}
