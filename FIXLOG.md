# Fix Log — Location, Routing & Crash-Resilience Remediation (LOC-001 to LOC-024)

> Note: `.git/index.lock` is on a read-only filesystem inside the sandbox environment, so git commits could not be created directly. Each finding below includes its atomic commit message and file scope for committing on the host.

| Phase | Finding | Commit Message | Files Modified / Added | Test File |
| --- | --- | --- | --- | --- |
| 0 | Verification Gate | `docs(phase0): verify findings against codebase` | `VERIFY.md` | — |
| 1.1 | LOC-023 | `fix(LOC-023): enforce validDriverLocation on all driverLocation diffs` | `firestore.rules` | `__tests__/loc-023-firestore-rules.test.ts` |
| 1.2 | LOC-004, LOC-005 | `fix(LOC-004,LOC-005): monotonic timestamp & >120km/h GPS jump guard` | `lib/coord-validation.ts`, `lib/firebase-db.ts`, `HANDOFF.md` | `__tests__/loc-004-005-gps-validation.test.ts` |
| 1.3 | LOC-012, LOC-022 | `fix(LOC-012): SA bounding box & Null Island guard across APIs` | `lib/coord-validation.ts`, `app/api/distance/route.ts`, `app/api/directions/route.ts`, `app/api/location/route.ts` | `__tests__/loc-012-coord-validation.test.ts` |
| 1.4 | LOC-006 | `fix(LOC-006): replace silent JHB CBD store fallback with StoreCoordinatesMissingError` | `lib/location.ts`, `app/store-owner/page.tsx`, `components/uni-eats/store.tsx`, `components/uni-eats/cart-screen.tsx`, `components/uni-eats/checkout-screen.tsx`, `components/uni-eats/tracking-screen.tsx`, `MIGRATION.md` | `__tests__/loc-006-store-coords.test.ts` |
| 2.1 | LOC-007 | `fix(LOC-007): batch road-distance matrix with explicit approximate flag` | `app/api/distance/route.ts`, `lib/dash-engine.ts`, `components/uni-eats/store.tsx` | `__tests__/coordinate-order.test.ts` |
| 2.2 | LOC-024 | `fix(LOC-024): 15-min 1000-entry LRU route cache & 503 Retry-After on 429` | `lib/route-cache.ts`, `app/api/distance/route.ts`, `app/api/directions/route.ts` | `__tests__/loc-024-route-cache.test.ts` |
| 2.3 | LOC-009 | `fix(LOC-009): live traffic-aware ETA from /api/directions` | `app/api/directions/route.ts`, `components/uni-eats/tracking-screen.tsx` | `__tests__/loc-024-route-cache.test.ts` |
| 2.4 | LOC-010 | `fix(LOC-010): 150m hysteresis buffer & session distance cache` | `lib/dash-engine.ts`, `components/uni-eats/store.tsx` | — |
| 2.5 | LOC-022 | `test(LOC-022): 10-pair SA coordinate order & distance verification` | `PHASE2_ACCEPTANCE.md` | `__tests__/coordinate-order.test.ts` |
| 2.6 | LOC-016 | `fix(LOC-016): register window.gm_authFailure fallback UI` | `components/uni-eats/order-tracking-map.tsx` | — |
| 3.1 | LOC-014 | `fix(LOC-014): isolate localStorage hydration & validate placedOrder shape` | `lib/coord-validation.ts`, `components/uni-eats/store.tsx` | `__tests__/loc-014-015-resilience.test.ts` |
| 3.2 | LOC-015 | `fix(LOC-015): Number.isFinite guards on toFixed and fitBounds` | `components/uni-eats/order-tracking-map.tsx` | — |
| 3.3 | LOC-021 | `fix(LOC-021): onSnapshot onError callback & exponential backoff reconnect` | `lib/firebase-db.ts`, `components/uni-eats/order-tracking-map.tsx` | — |
| 4.1 | LOC-020 | `fix(LOC-020): 45s GPS waiting banner & 120s support link` | `components/uni-eats/order-tracking-map.tsx` | — |
| 4.2 | LOC-019 | `fix(LOC-019): enforce driverSessionId match when set on order` | `firestore.rules`, `HANDOFF.md` | — |
| 4.3 | LOC-003 | `fix(LOC-003): live geolocation permission change listener` | `components/uni-eats/store.tsx`, `HANDOFF.md` | — |
| 4.4 | LOC-002 | `fix(LOC-002): 8m/<3km/h dead-band & 1D EMA stationary drift filter` | `lib/coord-validation.ts`, `components/uni-eats/order-tracking-map.tsx` | `__tests__/loc-002-drift-filter.test.ts` |
| 5.2 | LOC-011 | `fix(LOC-011): Africa/Johannesburg SAST formatter` | `lib/coord-validation.ts` | `__tests__/loc-011-013-ux-consistency.test.ts` |
| 5.3 | LOC-001 | `fix(LOC-001): enforce 50m exact / >50m approximate GPS threshold` | `lib/location.ts` | — |
| 5.4 | LOC-013 | `fix(LOC-013): align MAX_DISPATCH_RADIUS_KM = 10 with delivery zone` | `shared/types.ts`, `HANDOFF.md` | `__tests__/loc-011-013-ux-consistency.test.ts` |
