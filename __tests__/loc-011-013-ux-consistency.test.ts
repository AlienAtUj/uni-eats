import test from 'node:test'
import assert from 'node:assert/strict'
import { formatJohannesburgTime } from '../lib/coord-validation.ts'
import { getDeliveryFeeByRoadDistance } from '../lib/dash-engine.ts'
import { MAX_DISPATCH_RADIUS_KM } from '../shared/types.ts'

test('LOC-011: formatJohannesburgTime formats UTC timestamps in Africa/Johannesburg (UTC+2)', () => {
  // 2026-11-17T17:00:00Z => 19:00 in SAST (UTC+2)
  const formatted = formatJohannesburgTime('2026-11-17T17:00:00.000Z')
  assert.ok(formatted.includes('19:00'), `Expected 19:00 SAST, got "${formatted}"`)
})

test('LOC-013: MAX_DISPATCH_RADIUS_KM is aligned to 12 km with dash-engine delivery zone', () => {
  assert.equal(MAX_DISPATCH_RADIUS_KM, 12)
})

test('Delivery fee tiers match exact 0-12 km pricing', () => {
  assert.equal(getDeliveryFeeByRoadDistance(0.5), 15)
  assert.equal(getDeliveryFeeByRoadDistance(2), 15)
  assert.equal(getDeliveryFeeByRoadDistance(3.5), 18)
  assert.equal(getDeliveryFeeByRoadDistance(5.5), 22)
  assert.equal(getDeliveryFeeByRoadDistance(7.5), 25)
  assert.equal(getDeliveryFeeByRoadDistance(9.5), 28)
  assert.equal(getDeliveryFeeByRoadDistance(11.5), 32)
  assert.throws(() => getDeliveryFeeByRoadDistance(12.1))
})
