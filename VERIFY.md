# Phase 0 — Verification Gate (`VERIFY.md`)

**Repository:** `/home/sandile/Downloads/uni-eats`  
**Date:** 2026-11-17  
**Status:** Phase 0 complete. No code changes have been made yet.

---

## V0.1 — `firestore.rules` `driverLocation` Update Bypass (`LOC-023`)
- **Citation:** [firestore.rules](file:///home/sandile/Downloads/uni-eats/firestore.rules#L63-L87)
- **Exact current text:**
```javascript
      allow update: if isAuthenticated() && (
        resource.data.customerId == request.auth.uid ||
        resource.data.merchantId == request.auth.uid ||
        resource.data.offeredToDriverId == request.auth.uid ||
        (
          resource.data.driverId == request.auth.uid &&
          (
            !request.resource.data.diff(resource.data).affectedKeys().hasOnly(['driverLocation', 'updatedAt']) ||
            (
              request.resource.data.driverLocation.lat is number &&
              request.resource.data.driverLocation.lng is number &&
              request.resource.data.driverLocation.heading is number &&
              request.resource.data.driverLocation.heading >= 0 &&
              request.resource.data.driverLocation.heading <= 360
            )
          ) &&
          (
            !(request.resource.data.status == 'completed' || request.resource.data.deliveryStatus == 'delivered') ||
            (
              resource.data.deliveryOtp is string &&
              request.resource.data.proofOfDelivery.otpCode == resource.data.deliveryOtp
            )
          )
        )
      );
```
- **Verification:** No sibling `updatedAt == request.time`, separate `allow update`, or `validDriverLocation()` helper exists. Because line 70 uses `!request.resource.data.diff(resource.data).affectedKeys().hasOnly(['driverLocation', 'updatedAt'])`, any driver write that includes `driverLocation` alongside another field (e.g. `updatedAtIso`) evaluates the left side to `true` and bypasses `lat`/`lng`/`heading` validation.
- **Verdict:** **CONFIRMED.** Proceed to Phase 1.1 (`LOC-023`).

---

## V0.2 — Unguarded `.toFixed(5)` and `fitBounds()` (`LOC-015`)
- **Citations:**
  - [components/uni-eats/order-tracking-map.tsx](file:///home/sandile/Downloads/uni-eats/components/uni-eats/order-tracking-map.tsx#L407-L435)
    - Lines 407–411: `shopLat = shopCoords.lat`, `shopLng = shopCoords.lng`, `custLat = customerCoords.lat`, `custLng = customerCoords.lng`, `const routeKey = `${shopLat.toFixed(5)},${shopLng.toFixed(5)}->${custLat.toFixed(5)},${custLng.toFixed(5)}``
    - Line 430: `map.fitBounds(bounds, UBER_EATS_FIT_BOUNDS_PADDING)`
  - [components/uni-eats/tracking-screen.tsx](file:///home/sandile/Downloads/uni-eats/components/uni-eats/tracking-screen.tsx#L160-L198)
    - Uses `?.` on `trackedLiveOrder?.dropoffCoords` / `placedOrder?.dropoffCoords`, but does **not** check `Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng)`.
- **Verification:** Optional chaining is **not** present on `shopCoords.lat` / `customerCoords.lat` in `order-tracking-map.tsx`, and neither file checks `Number.isFinite` before `.toFixed(5)` or `fitBounds()`.
- **Verdict:** **CONFIRMED.** Proceed to Phase 3.2 (`LOC-015`).

---

## V0.3 — Malformed `placedOrder` Crash Site & `store.tsx` `try/catch` (`LOC-014`)
- **Citations:**
  - [components/uni-eats/tracking-screen.tsx](file:///home/sandile/Downloads/uni-eats/components/uni-eats/tracking-screen.tsx#L139) — `restaurantId: placedOrder.lines[0]?.restaurantId` (throws `TypeError` if `placedOrder.lines` is `undefined`).
  - [components/uni-eats/tracking-screen.tsx](file:///home/sandile/Downloads/uni-eats/components/uni-eats/tracking-screen.tsx#L613) — `{activeOrderDisplay.lines.map((line) => (...))}` (throws `TypeError` if `lines` is missing or not an array).
  - [components/uni-eats/store.tsx](file:///home/sandile/Downloads/uni-eats/components/uni-eats/store.tsx#L257-L354) — Single outer `try/catch` wraps all `localStorage` reads; `setPlacedOrder(JSON.parse(savedOrder))` at line 345 only catches invalid JSON syntax, **not** valid JSON missing `lines` (e.g. `{"id":"DSH-1"}`) or non-finite `dropoffCoords`.
- **Verdict:** **CONFIRMED.** Proceed to Phase 3.1 (`LOC-014`).

---

## V0.4 — Server / Cloud Functions / Dispatcher Presence (`LOC-013`, `LOC-004`, `LOC-005`)
- **Verification:** Workspace root listing (`/home/sandile/Downloads/uni-eats`) confirms **no** `functions/`, `cloud/`, `server/`, or dispatcher service exists in this repository. Only `shared/types.ts` and `supabase/migrations/20261113_driver_dispatch_additive.sql` exist for cross-app contract definitions.
- **Verdict:** Dispatcher and Cloud Functions live **outside this repository**. `LOC-013` and the server-side Cloud Function deployment for `LOC-004`/`LOC-005`/`LOC-003` background push will be recorded in `HANDOFF.md` (with the exact Cloud Function spec and radius alignment documented).

---

## V0.5 — `lib/firebase.ts` `persistentLocalCache` (`LOC-018`)
- **Citation:** [lib/firebase.ts](file:///home/sandile/Downloads/uni-eats/lib/firebase.ts#L17)
- **Exact text:** `export const db = getFirestore(app)`
- **Verification:** `lib/firebase.ts` does **not** configure `persistentLocalCache` or `enableIndexedDbPersistence`. The customer web app does not queue offline `driverLocation` writes.
- **Verdict:** `LOC-018` applies to the **external driver app** and will be recorded in `HANDOFF.md`.

---

## V0.6 — Driver App Platform & Coordinate Order Confirmation (`LOC-017`, `LOC-018`, `LOC-022`)
- **Verification:**
  - The driver app is **external** to this repository (separate project). `LOC-017` (Android 14+ `FOREGROUND_SERVICE_LOCATION` / iOS `UIBackgroundModes: location`) and `LOC-018` (offline write queue) are **HANDOFFS** to `HANDOFF.md`.
  - Coordinate order across `app/api/distance/route.ts`, `app/api/directions/route.ts`, `app/api/location/route.ts`, and `lib/location.ts` has **no** `(lat, lng)` / `(lng, lat)` swaps (`OSRM` receives `${lng},${lat}` and maps `[lng, lat]` back to `{ lat, lng }`; `ArcGIS` receives `location=${lng},${lat}`). `LOC-022` requires only the preventive test `__tests__/coordinate-order.test.ts` and the South Africa bounding-box guard (`LOC-012`).
