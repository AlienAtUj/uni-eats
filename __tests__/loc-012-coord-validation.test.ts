import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidSACoord, SA_BOUNDS } from '../lib/coord-validation.ts'

test('LOC-012: accepts valid South African coordinates', () => {
  assert.equal(isValidSACoord(-26.1912, 28.0308), true) // Johannesburg
  assert.equal(isValidSACoord(-33.9249, 18.4241), true) // Cape Town
  assert.equal(isValidSACoord(-29.8587, 31.0218), true) // Durban
})

test('LOC-012: rejects (0,0), NaN, Infinity, non-numbers, and out-of-SA coords', () => {
  assert.equal(isValidSACoord(0, 0), false)
  assert.equal(isValidSACoord(Number.NaN, 28.03), false)
  assert.equal(isValidSACoord(-26.19, Number.POSITIVE_INFINITY), false)
  assert.equal(isValidSACoord('-26.19', '28.03'), false)
  assert.equal(isValidSACoord(51.5074, -0.1278), false) // London
  assert.equal(isValidSACoord(28.0308, -26.1912), false) // Swapped lat/lng
  assert.equal(isValidSACoord(SA_BOUNDS.minLat - 0.1, 28.0), false)
  assert.equal(isValidSACoord(-26.0, SA_BOUNDS.maxLng + 0.1), false)
})
