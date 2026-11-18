import test from 'node:test'
import assert from 'node:assert/strict'
import { formatJohannesburgTime } from '../lib/coord-validation.ts'
import { MAX_DISPATCH_RADIUS_KM } from '../shared/types.ts'

test('LOC-011: formatJohannesburgTime formats UTC timestamps in Africa/Johannesburg (UTC+2)', () => {
  // 2026-11-17T17:00:00Z => 19:00 in SAST (UTC+2)
  const formatted = formatJohannesburgTime('2026-11-17T17:00:00.000Z')
  assert.ok(formatted.includes('19:00'), `Expected 19:00 SAST, got "${formatted}"`)
})

test('LOC-013: MAX_DISPATCH_RADIUS_KM is aligned to 10 km with dash-engine delivery zone', () => {
  assert.equal(MAX_DISPATCH_RADIUS_KM, 10)
})
