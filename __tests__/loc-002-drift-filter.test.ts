import test from 'node:test'
import assert from 'node:assert/strict'
import { filterStationaryDrift } from '../lib/coord-validation.ts'

test('LOC-002: dead-band suppresses < 8m stationary GPS drift at < 3 km/h', () => {
  const prev = { lat: -26.1912, lng: 28.0308 }
  // ~3m jitter north
  const jitter = { lat: -26.191225, lng: 28.03081 }
  const res = filterStationaryDrift(prev, jitter, 0.5)
  assert.equal(res.suppressed, true)
  assert.equal(res.lat, prev.lat)
  assert.equal(res.lng, prev.lng)
})

test('LOC-002: applies 1D EMA (alpha = 0.3) for slow movement (< 15 km/h) and raw coords at driving speed', () => {
  const prev = { lat: -26.1912, lng: 28.0308 }
  const next = { lat: -26.191, lng: 28.031 }

  const slow = filterStationaryDrift(prev, next, 10, 0.3)
  assert.equal(slow.suppressed, false)
  assert.ok(Math.abs(slow.lat - (prev.lat + 0.3 * (next.lat - prev.lat))) < 1e-9)

  const fast = filterStationaryDrift(prev, next, 40, 0.3)
  assert.equal(fast.suppressed, false)
  assert.equal(fast.lat, next.lat)
  assert.equal(fast.lng, next.lng)
})
