# Phase 2 Acceptance Report — Directions & Map Quality

## Implemented Fixes
- **LOC-007 (Batch Road-Distance Matrix):** `app/api/distance/route.ts` supports batched `destinations[]` (up to 25 stores), wired via `fetchBatchRoadDistancesKm` in `lib/dash-engine.ts` and `components/uni-eats/store.tsx`. On routing failure, falls back explicitly to `Haversine * 1.3` with `isApproximate: true` and `~RXX.XX` UI indicator.
- **LOC-024 (15-min LRU Cache & 429 Handling):** `lib/route-cache.ts` (`BoundedLruCache(1000, 15 * 60 * 1000)`) applied to both `app/api/distance/route.ts` and `app/api/directions/route.ts`. Upstream `429` / `OVER_QUERY_LIMIT` returns HTTP `503` `{ error: 'UPSTREAM_RATE_LIMITED', retryAfterSeconds }` with `Retry-After` header.
- **LOC-009 (Live Traffic-Aware ETA):** `app/api/directions/route.ts` normalizes `durationSeconds`; `components/uni-eats/tracking-screen.tsx` displays `Arriving in X min` or `Arriving soon — recalculating` on failure.
- **LOC-010 (±150m Hysteresis Buffer):** `fetchRoadDistanceKm` in `lib/dash-engine.ts` and `store.tsx` batch trigger enforce a `0.15 km` (`150m`) hysteresis buffer and 15-min session cache.
- **LOC-022 (Coordinate Order Verification):** Verified across 10 South African origin/destination pairs in `__tests__/coordinate-order.test.ts`.
- **LOC-016 (`gm_authFailure` Fallback):** `components/uni-eats/order-tracking-map.tsx` registers `window.gm_authFailure` and renders a non-crashing fallback overlay when Google Maps auth fails.

## 10-Pair Coordinate & Distance Acceptance Matrix
Verified in `__tests__/coordinate-order.test.ts`:
1. Wits -> Braamfontein (`-26.1929, 28.0305` -> `-26.1912, 28.0345`)
2. Rosebank -> Sandton (`-26.1467, 28.0416` -> `-26.1076, 28.0567`)
3. Melville -> Auckland Park (`-26.1753, 28.0063` -> `-26.1839, 28.0014`)
4. Johannesburg CBD -> Newtown (`-26.2041, 28.0473` -> `-26.2015, 28.0332`)
5. Parktown -> Houghton (`-26.1815, 28.0422` -> `-26.1667, 28.0574`)
6. Cape Town CBD -> Sea Point (`-33.9249, 18.4241` -> `-33.9175, 18.3879`)
7. Rondebosch -> Claremont (`-33.9616, 18.4713` -> `-33.9806, 18.4648`)
8. Durban CBD -> Umhlanga (`-29.8587, 31.0218` -> `-29.7253, 31.0858`)
9. Hatfield -> Brooklyn (PTA) (`-25.7488, 28.2380` -> `-25.7717, 28.2356`)
10. Stellenbosch Central -> Cloetesville (`-33.9321, 18.8602` -> `-33.9132, 18.8548`)
