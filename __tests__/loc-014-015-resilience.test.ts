import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidPlacedOrder } from '../lib/coord-validation.ts'

test('LOC-014: isValidPlacedOrder accepts well-formed order and rejects corrupted localStorage payloads', () => {
  assert.equal(
    isValidPlacedOrder({
      id: 'ord-123',
      lines: [{ id: '1', name: 'Kota', quantity: 1 }],
      dropoffCoords: { lat: -26.1855, lng: 28.0392 },
    }),
    true
  )
  assert.equal(isValidPlacedOrder(null), false)
  assert.equal(isValidPlacedOrder({ id: 'ord-1', lines: 'corrupted' }), false)
  assert.equal(
    isValidPlacedOrder({ id: 'ord-1', lines: [], dropoffCoords: { lat: Number.NaN, lng: 28.0 } }),
    false
  )
})
