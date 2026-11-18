import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDriverGpsJump } from '../lib/coord-validation.ts'

test('LOC-004/005: accepts normal urban driving speed with monotonic timestamp', () => {
  const prev = { lat: -26.1912, lng: 28.0308, timestampMs: 1_700_000_000_000 }
  // ~500m north in 60s => ~30 km/h
  const next = { lat: -26.1867, lng: 28.0308, timestampMs: 1_700_000_060_000 }
  const res = validateDriverGpsJump(prev, next)
  assert.equal(res.valid, true)
  assert.ok(res.impliedSpeedKmh > 25 && res.impliedSpeedKmh < 35)
})

test('LOC-004: rejects implausible teleport jump (> 120 km/h)', () => {
  const prev = { lat: -26.1912, lng: 28.0308, timestampMs: 1_700_000_000_000 }
  // ~10km jump in 10s => ~3600 km/h
  const next = { lat: -26.1012, lng: 28.0308, timestampMs: 1_700_000_010_000 }
  const res = validateDriverGpsJump(prev, next)
  assert.equal(res.valid, false)
  assert.equal(res.reason, 'IMPLAUSIBLE_SPEED')
  assert.ok(res.impliedSpeedKmh > 120)
})

test('LOC-005: rejects out-of-order or duplicate timestamp (STALE_TIMESTAMP)', () => {
  const prev = { lat: -26.1912, lng: 28.0308, timestampMs: 1_700_000_060_000 }
  const older = { lat: -26.1915, lng: 28.0308, timestampMs: 1_700_000_050_000 }
  const same = { lat: -26.1915, lng: 28.0308, timestampMs: 1_700_000_060_000 }

  assert.deepEqual(validateDriverGpsJump(prev, older), {
    valid: false,
    impliedSpeedKmh: 0,
    reason: 'STALE_TIMESTAMP',
  })
  assert.deepEqual(validateDriverGpsJump(prev, same), {
    valid: false,
    impliedSpeedKmh: 0,
    reason: 'STALE_TIMESTAMP',
  })
})

test('LOC-004/012: rejects (0,0) and NaN coordinates', () => {
  const prev = { lat: -26.1912, lng: 28.0308, timestampMs: 1_700_000_000_000 }
  const zero = { lat: 0, lng: 0, timestampMs: 1_700_000_010_000 }
  const nanCoord = { lat: Number.NaN, lng: 28.0308, timestampMs: 1_700_000_010_000 }

  assert.equal(validateDriverGpsJump(prev, zero).reason, 'INVALID_COORD')
  assert.equal(validateDriverGpsJump(prev, nanCoord).reason, 'INVALID_COORD')
})
