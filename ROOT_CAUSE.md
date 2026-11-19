# Root Cause Analysis — Blank Screen on Page Refresh

## Executive Summary
The blank white screen on refresh (which disappears when the user navigates to another tab/page and comes back) is caused by **four compounding lifecycle bugs** in the Next.js / React render pipeline, traced below with exact file and line citations.

---

## 1. Primary Root Cause: Unpersisted `activeId` + `return null` on Refresh
- **Files & Lines:**
  - `components/uni-eats/store.tsx:180` (`const [activeId, setActiveId] = useState<string | null>(null)`)
  - `components/uni-eats/store.tsx:372-385` (`sessionStorage.getItem('unieats_screen')` restores `screen = 'restaurant'`)
  - `components/uni-eats/store.tsx:683-687` (`openRestaurant(id)` sets `activeId` in memory only, never writes it to `sessionStorage`, while `handleSetScreen('restaurant')` writes `unieats_screen = 'restaurant'`)
  - `components/uni-eats/app.tsx:68-69` (`case 'restaurant': return <RestaurantScreen />`)
  - `components/uni-eats/restaurant-screen.tsx:65` (`if (!activeRestaurant) return null`)
- **Why Refresh Fails:**
  1. User taps a store -> `activeId` is set in React memory and `unieats_screen = 'restaurant'` is written to `sessionStorage`.
  2. User refreshes the browser -> React resets `activeId` to `null`.
  3. The mount `useEffect` in `store.tsx:372-385` reads `unieats_screen` (`'restaurant'`) and calls `setScreen('restaurant')` while `activeId` is still `null`.
  4. `Screens()` renders `<RestaurantScreen />`.
  5. `RestaurantScreen` evaluates `if (!activeRestaurant) return null` at line 65 -> **completely blank white screen**.
- **Why Navigating Away & Back Works:**
  - Clicking Home in `BottomNav` switches `screen` back to `'home'`. Tapping the store again invokes `openRestaurant(id)`, which sets `activeId` in memory -> `activeRestaurant` resolves -> the screen renders normally.

---

## 2. Async Data Race: SWR `liveRestaurants` Empty on First Render
- **Files & Lines:**
  - `components/uni-eats/store.tsx:167-169` (`useFirebaseRestaurants()` starts with `restaurants: []` while fetching Firestore)
  - `components/uni-eats/restaurant-screen.tsx:65` (`if (!activeRestaurant) return null`)
- **Why Refresh Fails:**
  - Even when `activeId` is known, `currentRestaurants` is `[]` on the first client render after a hard refresh until Firestore responds.
  - `activeRestaurant` is `undefined` during the fetch window, and `RestaurantScreen` returns `null` instead of a loading skeleton.

---

## 3. Mount Persistence Race Wiping `localStorage` in StrictMode / Refresh
- **Files & Lines:**
  - `components/uni-eats/store.tsx:418-437`
- **Why Refresh Fails:**
  - On initial mount, `carts` is `{}` and `placedOrder` is `null`.
  - Effect #1 (`store.tsx:258`) reads `localStorage` and schedules `setCarts(...)` / `setPlacedOrder(...)` for the *next* render.
  - In the *same* initial mount commit, Effect #2 (`store.tsx:418`, `[carts]`) executes `localStorage.setItem('unieats_carts', '{}')` and Effect #3 (`store.tsx:427`, `[placedOrder]`) executes `localStorage.removeItem('unieats_active_order')` **before** hydration state updates commit. Under React StrictMode double-mount (or rapid refresh), the second mount reads wiped storage (`{}` / `null`), causing checkout/tracking screens to lose state or render empty.

---

## 4. Missing Crash & Loading Safety Nets (Error Boundary, `error.tsx`, `loading.tsx`, SSR Map Guard)
- **Files & Lines:**
  - `app/layout.tsx:41-61` — No React `ErrorBoundary` wrapping `{children}`. Any uncaught render error (e.g., malformed Firestore record or browser API access) drops the entire React tree to a blank screen.
  - `app/` — Missing `app/error.tsx` and `app/loading.tsx` App Router fallbacks.
  - `components/uni-eats/tracking-screen.tsx:8` — Direct static import of `OrderTrackingMap` (which uses `window`, `document.createElement('canvas')`, and Google Maps JS SDK) instead of `next/dynamic(..., { ssr: false })`.

---

## Permanent Remediation Plan
1. **Hydration & Storage Guards (`components/uni-eats/store.tsx`):**
   - Add `hasHydratedRef` + `isHydrated` state; block persistence `useEffect`s until after storage hydration completes.
   - Persist `dash_active_restaurant` in `sessionStorage` inside `openRestaurant(id)` and restore it alongside `unieats_screen` (falling back to `'home'` if `savedScreen === 'restaurant'` has no valid `activeId`).
   - Expose `isHydrated` and `isRestaurantsLoading` from `StoreProvider`.
2. **Eliminate `return null` Blank Renders (`components/uni-eats/restaurant-screen.tsx`, `components/uni-eats/app.tsx`):**
   - Render `<BrandedAuthSplash />` until `mounted && isHydrated && !isAuthLoading`.
   - Replace `if (!activeRestaurant) return null` in `RestaurantScreen` with a skeleton loader while `isRestaurantsLoading` is true and a recoverable `"Store not found — Back to Home"` state otherwise.
3. **Dynamic `ssr: false` Map Import (`components/uni-eats/tracking-screen.tsx`):**
   - Load `OrderTrackingMap` via `next/dynamic(..., { ssr: false })` with a map loading skeleton.
4. **Global Error Boundary & App Router Safety Nets:**
   - Add `components/error-boundary.tsx` and wrap `{children}` in `app/layout.tsx`.
   - Add `app/error.tsx`, `app/loading.tsx`, and `app/store-owner/loading.tsx`.
