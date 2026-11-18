# Migration Notes — Location & Store Coordinates (LOC-006)

## 1. Backfill `coordsVerifiedAt` on Existing Stores
Existing `restaurants/{id}` and `users/{id}` documents created before `LOC-006` may have `coords` without `coordsVerifiedAt`, or may lack `coords` altogether.

### Required Admin Script / One-off Backfill
1. Query all `restaurants` documents.
2. For each store:
   - If `coords.lat` and `coords.lng` are present and within South Africa (`-35.5 <= lat <= -22.0`, `16.0 <= lng <= 33.5`, non-`(0, 0)`), set `coordsVerifiedAt = FieldValue.serverTimestamp()`.
   - If `coords` is missing or invalid, geocode `store.location` using the Google Geocoding API (with `region=za`) and verify manually before writing `coords` and `coordsVerifiedAt`.
   - Mirror `coords` and `coordsVerifiedAt` to the corresponding `users/{merchantId}` document.
3. Until a store has valid `coords`, `resolveStoreCoords()` throws `StoreCoordinatesMissingError` instead of falling back to Johannesburg CBD (`-26.1969, 28.0583`).
