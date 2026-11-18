import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStoreCoords, StoreCoordinatesMissingError } from '../lib/location.ts'

test('LOC-006: returns exact store coords when valid SA coords are present', () => {
  const coords = resolveStoreCoords({
    name: 'SML Restaurant',
    coords: { lat: -26.1912, lng: 28.0308 },
  })
  assert.deepEqual(coords, { lat: -26.1912, lng: 28.0308 })
})

test('LOC-006: resolves known store alias when coords missing', () => {
  const coords = resolveStoreCoords({
    name: 'McDonalds Braamfontein',
    location: 'Braamfontein',
  })
  assert.ok(coords.lat < -26.0 && coords.lng > 28.0)
})

test('LOC-006: throws StoreCoordinatesMissingError instead of silently falling back to JHB CBD', () => {
  assert.throws(
    () =>
      resolveStoreCoords({
        name: 'Unknown Pop-Up Kitchen',
        location: 'Somewhere Unmapped',
      }),
    (err: unknown) =>
      err instanceof StoreCoordinatesMissingError &&
      err.storeName === 'Unknown Pop-Up Kitchen'
  )
})
