'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  restaurants,
  type MenuItem,
  type Restaurant,
} from '@/lib/data'
import {
  type DeliveryLocation,
  formatDistanceKm,
  searchAddresses,
  searchInstantLocations,
  correctLocationTypos,
} from '@/lib/location'
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
import {
  DASH_MARKET_ID,
  DEPARTMENTS,
  collectGroceries,
  groceryMatchesDepartment,
} from '@/lib/grocery-catalog'
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
    userLocation,
    setUserLocation,
    recentLocations,
    isLocatingGps,
    locationError,
    detectUserLocation,
    getStoreDistanceKm,
    getStoreDeliveryFee,
    getStoreDeliveryTime,
    isStoreInRange,
    homeMode,
    setHomeMode,
    openRestaurant,
    addLine,
    goToScreen,
    openDepartment,
    user,
  } = useStore()
  const { restaurants: liveRestaurants } = useFirebaseRestaurants()
  const [locationSheetOpen, setLocationSheetOpen] = useState(false)
  const [addressSearchQuery, setAddressSearchQuery] = useState('')
  const [addressResults, setAddressResults] = useState<DeliveryLocation[]>([])
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)
  const [query, setQuery] = useState('')
  const [addedItemId, setAddedItemId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<{
    item: MenuItem
    store: Restaurant
  } | null>(null)
  const rawMarket = useDashMarket()

  // Super-fast location search: 0ms instant fuzzy match + 120ms multi-API geocoder (ArcGIS + Photon + Nominatim)
  useEffect(() => {
    const q = addressSearchQuery.trim()
    if (q.length < 1) {
      setAddressResults([])
      setIsSearchingAddress(false)
      return
    }

    // 1. Instant 0ms fuzzy results (with typo tolerance)
    const instant = searchInstantLocations(q)
    setAddressResults(instant)

    if (q.length < 2) {
      setIsSearchingAddress(false)
      return
    }

    // 2. Fast 120ms live API lookup across all South African streets, complexes & suburbs
    const controller = new AbortController()
    setIsSearchingAddress(true)
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddresses(q, controller.signal)
        if (!controller.signal.aborted) {
          setAddressResults(results)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setAddressResults(instant)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingAddress(false)
        }
      }
    }, 120)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [addressSearchQuery])

  const correctedQueryHint = useMemo(() => {
    const raw = addressSearchQuery.trim()
    if (raw.length < 3) return null
    const fixed = correctLocationTypos(raw)
    return fixed.toLowerCase() !== raw.toLowerCase() ? fixed : null
  }, [addressSearchQuery])

  const handleManualAddressSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = addressSearchQuery.trim()
    if (!q) return
    if (addressResults.length > 0) {
      handleSelectLocation(addressResults[0])
      return
    }
    setIsSearchingAddress(true)
    try {
      const results = await searchAddresses(q)
      if (results.length > 0) {
        handleSelectLocation(results[0])
      }
    } finally {
      setIsSearchingAddress(false)
    }
  }

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

  const handleUseCurrentLocation = async () => {
    const loc = await detectUserLocation()
    if (loc) {
      setLocationSheetOpen(false)
      setAddressSearchQuery('')
      setAddressResults([])
    }
  }

  const handleSelectLocation = (loc: DeliveryLocation) => {
    setUserLocation(loc)
    setLocationSheetOpen(false)
    setAddressSearchQuery('')
    setAddressResults([])
  }

  const market = useMemo(() => {
    const distKm = getStoreDistanceKm(rawMarket)
    return {
      ...rawMarket,
      distance: formatDistanceKm(distKm),
      deliveryFee: getStoreDeliveryFee(rawMarket),
      pickupTime: getStoreDeliveryTime(rawMarket),
    }
  }, [rawMarket, getStoreDistanceKm, getStoreDeliveryFee, getStoreDeliveryTime])

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

  // Recomputes exact real-time distance in km, delivery fee, and time for every store
  const storesWithDistance = useMemo(() => {
    return allEntries
      .map((store) => {
        const distKm = getStoreDistanceKm(store)
        const inRange = isStoreInRange(store)
        const dynamicDeliveryFee = getStoreDeliveryFee(store)
        const dynamicDeliveryTime = getStoreDeliveryTime(store)
        const dynamicDistanceText = formatDistanceKm(distKm)
        return {
          ...store,
          distKm,
          inRange,
          distance: dynamicDistanceText,
          deliveryFee: dynamicDeliveryFee,
          pickupTime: dynamicDeliveryTime,
        }
      })
      .sort((a, b) => a.distKm - b.distKm)
  }, [allEntries, getStoreDistanceKm, isStoreInRange, getStoreDeliveryFee, getStoreDeliveryTime])

  // Only show stores within delivery range of the user's real location
  const inRangeStores = useMemo(
    () => storesWithDistance.filter((s) => s.inRange),
    [storesWithDistance]
  )

  const mealRestaurants = useMemo(
    () => inRangeStores.filter((r) => r.storeType !== 'grocery'),
    [inRangeStores]
  )

  const groceryStores = useMemo(
    () => inRangeStores.filter((r) => r.storeType === 'grocery'),
    [inRangeStores]
  )

  const nearestMealDistance = useMemo(() => {
    const meals = storesWithDistance.filter((r) => r.storeType !== 'grocery')
    return meals.length > 0 && Number.isFinite(meals[0].distKm) ? meals[0].distKm : null
  }, [storesWithDistance])

  const nearestGroceryDistance = useMemo(() => {
    const groc = storesWithDistance.filter((r) => r.storeType === 'grocery')
    return groc.length > 0 && Number.isFinite(groc[0].distKm) ? groc[0].distKm : null
  }, [storesWithDistance])

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
    return mealRestaurants.slice(0, 4)
  }, [mealRestaurants])

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

  const allGroceryEntries = useMemo(
    () => collectGroceries(groceryStores),
    [groceryStores]
  )

  const marketSearchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allGroceryEntries.filter(
      ({ item, store }) =>
        item.name.toLowerCase().includes(q) ||
        (item.section || '').toLowerCase().includes(q) ||
        (item.subcategory || '').toLowerCase().includes(q) ||
        store.name.toLowerCase().includes(q)
    )
  }, [allGroceryEntries, query])

  const marketSpecials = useMemo(
    () =>
      allGroceryEntries.filter(
        ({ item }) => typeof item.oldPrice === 'number' && item.oldPrice > item.price
      ),
    [allGroceryEntries]
  )

  return (
    <div className="min-h-full bg-[#f4f5f2] pb-8">
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

        {/* Real-Time Delivery Address Selector Pill */}
        <button
          type="button"
          onClick={() => setLocationSheetOpen(true)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/15 active:scale-[0.99]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e59838]/20 text-[#e59838]">
              {isLocatingGps && !userLocation ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#e59838] border-t-transparent" />
              ) : (
                <PinIcon className="h-4 w-4" />
              )}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-bold text-white">
                {isLocatingGps && !userLocation
                  ? 'Detecting your location...'
                  : userLocation
                    ? userLocation.label
                    : 'Set your delivery address'}
              </span>
              <span className="truncate text-[11px] font-medium text-white/75">
                {userLocation
                  ? userLocation.address || 'Delivering to your location'
                  : 'Required to see stores & products near you'}
              </span>
            </div>
          </span>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 text-white/80" />
        </button>

        {/* Rounded-Full White Search Bar (only active when location is set) */}
        {userLocation && (
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
        )}
      </header>

      {/* ========================================================= */}
      {/* LOCATION GATE: DO NOT DISPLAY PRODUCTS WITHOUT A LOCATION */}
      {/* ========================================================= */}
      {!userLocation ? (
        <div className="px-5 pt-6">
          <div className="rounded-3xl bg-white p-6 shadow-xs ring-1 ring-border/80">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#287d46]/10 text-[#287d46]">
              {isLocatingGps ? (
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#287d46] border-t-transparent" />
              ) : (
                <PinIcon className="h-7 w-7" />
              )}
            </div>

            <h2 className="mt-4 text-center text-lg font-extrabold tracking-tight text-foreground">
              {isLocatingGps
                ? 'Finding your location...'
                : 'Set your delivery location first'}
            </h2>
            <p className="mt-1.5 text-center text-xs leading-relaxed text-muted-foreground">
              {locationError
                ? locationError
                : 'Enter your delivery address or allow GPS access so we can calculate real-time distance, delivery fees, and show stores that deliver to you.'}
            </p>

            {/* Direct Address Search Input */}
            <div className="mt-5">
              <form
                onSubmit={handleManualAddressSubmit}
                className="relative flex items-center rounded-2xl border border-border bg-[#f8f9f7] px-3.5 py-2.5 focus-within:border-[#287d46] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#287d46]/15"
              >
                <SearchIcon className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={addressSearchQuery}
                  onChange={(e) => setAddressSearchQuery(e.target.value)}
                  placeholder="Enter street address, suburb, or city..."
                  className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {isSearchingAddress && (
                  <span className="ml-2 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#287d46] border-t-transparent" />
                )}
                {addressSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddressSearchQuery('')
                      setAddressResults([])
                    }}
                    className="ml-2 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
                {addressSearchQuery.trim().length >= 2 && (
                  <button
                    type="submit"
                    className="ml-2 shrink-0 rounded-xl bg-[#287d46] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-transform active:scale-95"
                  >
                    Set
                  </button>
                )}
              </form>

              {correctedQueryHint && (
                <p className="mt-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                  Auto-matched typo to{' '}
                  <span className="font-bold text-[#287d46] capitalize">
                    {correctedQueryHint}
                  </span>
                </p>
              )}

              {addressSearchQuery.trim().length >= 1 && (
                <div className="mt-2 flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-border bg-white p-1 shadow-md">
                  {isSearchingAddress && addressResults.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Searching all South African locations...
                    </p>
                  ) : addressResults.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No matching address found. Try entering your street name or suburb.
                    </p>
                  ) : (
                    addressResults.map((loc, idx) => (
                      <button
                        key={`${loc.label}-${idx}`}
                        type="button"
                        onClick={() => handleSelectLocation(loc)}
                        className="flex w-full items-start gap-2.5 rounded-xl p-3 text-left transition-colors hover:bg-muted active:bg-muted/80"
                      >
                        <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#287d46]" />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {loc.label}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {loc.address}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Live GPS Button */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocatingGps}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#287d46] px-4 py-3.5 text-sm font-bold text-white shadow-xs transition-all hover:bg-[#216639] active:scale-[0.99] disabled:opacity-60"
            >
              {isLocatingGps ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <PinIcon className="h-4 w-4" />
              )}
              <span>
                {isLocatingGps
                  ? 'Detecting GPS location...'
                  : 'Use my current location'}
              </span>
            </button>

            {/* User's Recent Saved Addresses (only if they searched previously) */}
            {recentLocations.length > 0 && (
              <div className="mt-5 border-t border-border/70 pt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Recent delivery addresses
                </p>
                <div className="flex flex-col gap-1.5">
                  {recentLocations.map((loc, idx) => (
                    <button
                      key={`${loc.label}-${idx}`}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-[#f8f9f7] p-2.5 text-left transition-colors hover:bg-muted"
                    >
                      <PinIcon className="h-4 w-4 shrink-0 text-[#287d46]" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">
                          {loc.label}
                        </span>
                        {loc.address && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {loc.address}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
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
            mealRestaurants.length === 0 ? (
              <div className="px-5 pt-6">
                <div className="rounded-3xl bg-white p-6 text-center shadow-xs ring-1 ring-border/80">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e07a2e]/15 text-[#e07a2e]">
                    <PinIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-base font-extrabold text-foreground">
                    No restaurants deliver to this address yet
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    We don&apos;t have partner restaurants within delivery range of{' '}
                    <span className="font-bold text-foreground">{userLocation.label}</span>
                    {nearestMealDistance !== null
                      ? ` (nearest restaurant is ${formatDistanceKm(nearestMealDistance)} away).`
                      : '.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLocationSheetOpen(true)}
                    className="mt-4 rounded-full bg-[#287d46] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-transform active:scale-95"
                  >
                    Change delivery address
                  </button>
                </div>
              </div>
            ) : (
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
                            subtitle={`${store.name} • ${store.distance}`}
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
                        <SectionHeader title="Featured near you" />
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
                                  <span className="font-extrabold text-[#e07a2e]">{r.distance}</span>
                                  <span>•</span>
                                  <span>{r.pickupTime}</span>
                                  <span>•</span>
                                  <span>{r.deliveryFee}</span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )}

                    {/* Quick meal categories */}
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
                                  <span className="font-bold text-[#e07a2e]">{r.distance}</span> • {r.deliveryFee} • {r.pickupTime}
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
            )
          ) : (
            /* ========================================================= */
            /* SHOP (STORES / GROCERIES) MODE                            */
            /* ========================================================= */
            groceryStores.length === 0 ? (
              <div className="px-5 pt-6">
                <div className="rounded-3xl bg-white p-6 text-center shadow-xs ring-1 ring-border/80">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e07a2e]/15 text-[#e07a2e]">
                    <PinIcon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-base font-extrabold text-foreground">
                    No grocery stores deliver to this address yet
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    We don&apos;t have partner grocery stores within delivery range of{' '}
                    <span className="font-bold text-foreground">{userLocation.label}</span>
                    {nearestGroceryDistance !== null
                      ? ` (nearest store is ${formatDistanceKm(nearestGroceryDistance)} away).`
                      : '.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLocationSheetOpen(true)}
                    className="mt-4 rounded-full bg-[#287d46] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-transform active:scale-95"
                  >
                    Change delivery address
                  </button>
                </div>
              </div>
            ) : (
              <>
                {query.trim() ? (
                  <section className="mt-5 px-5">
                    <h2 className="text-[19px] font-extrabold tracking-tight text-foreground">
                      Results for “{query.trim()}”
                    </h2>
                    <p className="mb-3 text-xs font-semibold text-muted-foreground">
                      {marketSearchResults.length} products near you
                    </p>
                    {marketSearchResults.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No products match your search. Try “milk”, “chicken” or “chips”.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {marketSearchResults.map(({ item, store }) => (
                          <ProductCard
                            key={item.id}
                            item={item}
                            store={store}
                            subtitle={`${store.name}${store.distance ? ` • ${store.distance}` : ''}`}
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

                    {/* Specials carousel (closest stores first) */}
                    {marketSpecials.length > 0 && (
                      <MealRail
                        title="Specials this week"
                        entries={marketSpecials}
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
                                    <span className="font-bold text-[#e07a2e]">{store.distance}</span> • {store.deliveryFee} • {store.pickupTime}
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

                    {/* One product rail per department (prioritized by shortest distance first) */}
                    {DEPARTMENTS.map((dept) => {
                      const entries = allGroceryEntries.filter((e) =>
                        groceryMatchesDepartment(e.item, dept)
                      )
                      if (entries.length === 0) return null
                      return (
                        <MealRail
                          key={dept.id}
                          title={dept.title}
                          icon={dept.icon}
                          iconBg={dept.bg}
                          entries={entries}
                          onOpen={(item, store) => setSelectedEntry({ item, store })}
                          onViewAll={() => openDepartment(dept.id)}
                        />
                      )
                    })}
                  </>
                )}
              </>
            )
          )}
        </>
      )}

      {/* Clean Real-Time Delivery Address Sheet (Like Sixty60 / Uber Eats / Mr D) */}
      <BottomSheet
        open={locationSheetOpen}
        onClose={() => setLocationSheetOpen(false)}
        title="Delivery address"
      >
        <div className="flex flex-col gap-4 py-1 pb-4">
          {/* 1. Live Street & Suburb Search Input */}
          <div className="flex flex-col gap-1.5">
            <form
              onSubmit={handleManualAddressSubmit}
              className="relative flex items-center rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-2xs focus-within:border-[#287d46] focus-within:ring-2 focus-within:ring-[#287d46]/15"
            >
              <SearchIcon className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={addressSearchQuery}
                onChange={(e) => setAddressSearchQuery(e.target.value)}
                placeholder="Search street address, suburb, building, or city..."
                className="w-full bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {isSearchingAddress && (
                <span className="ml-2 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#287d46] border-t-transparent" />
              )}
              {addressSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setAddressSearchQuery('')
                    setAddressResults([])
                  }}
                  className="ml-2 text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
              {addressSearchQuery.trim().length >= 2 && (
                <button
                  type="submit"
                  className="ml-2 shrink-0 rounded-xl bg-[#287d46] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-transform active:scale-95"
                >
                  Set
                </button>
              )}
            </form>

            {correctedQueryHint && (
              <p className="px-1 text-[11px] font-medium text-muted-foreground">
                Auto-matched typo to{' '}
                <span className="font-bold text-[#287d46] capitalize">
                  {correctedQueryHint}
                </span>
              </p>
            )}

            {/* Live Autocomplete Suggestions */}
            {addressSearchQuery.trim().length >= 1 && (
              <div className="mt-1 flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-md">
                {isSearchingAddress && addressResults.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Searching all South African locations...
                  </p>
                ) : addressResults.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No matching addresses found. Try entering your street and suburb.
                  </p>
                ) : (
                  addressResults.map((loc, idx) => (
                    <button
                      key={`${loc.label}-${idx}`}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="flex w-full items-start gap-2.5 rounded-xl p-3 text-left transition-colors hover:bg-muted active:bg-muted/80"
                    >
                      <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#287d46]" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">
                          {loc.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {loc.address}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. Live GPS Current Location Button */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingGps}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition-all active:scale-[0.99]',
              isLocatingGps
                ? 'border-[#287d46] bg-[#287d46]/10 animate-pulse'
                : 'border-[#287d46]/40 bg-[#287d46]/10 hover:bg-[#287d46]/15'
            )}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#287d46] text-white shadow-xs">
                {isLocatingGps ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <PinIcon className="h-5 w-5" />
                )}
              </span>
              <span>
                <span className="block text-sm font-extrabold text-foreground">
                  {isLocatingGps
                    ? 'Detecting your current location...'
                    : 'Use my current location'}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {userLocation?.isGps
                    ? `Current GPS: ${userLocation.label}`
                    : 'Automatically detect your address via GPS'}
                </span>
              </span>
            </span>
          </button>

          {/* 3. User's Recent Delivery Addresses (only if user has previous searches) */}
          {recentLocations.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent addresses
              </p>
              <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                {recentLocations.map((loc, idx) => {
                  const isCurrent =
                    userLocation !== null &&
                    userLocation.label === loc.label &&
                    Math.abs(userLocation.coords.lat - loc.coords.lat) < 0.002 &&
                    Math.abs(userLocation.coords.lng - loc.coords.lng) < 0.002
                  return (
                    <button
                      key={`${loc.label}-${idx}`}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all',
                        isCurrent
                          ? 'border-[#287d46] bg-[#287d46]/5 ring-1 ring-[#287d46]'
                          : 'border-border bg-card hover:bg-muted'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <PinIcon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isCurrent ? 'text-[#287d46]' : 'text-muted-foreground'
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-foreground">
                            {loc.label}
                          </span>
                          {loc.address && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {loc.address}
                            </span>
                          )}
                        </span>
                      </span>
                      {isCurrent && (
                        <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#287d46] text-white">
                          <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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
            subtitle={
              store.distance
                ? `${store.name} • ${store.distance}`
                : store.name
            }
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
