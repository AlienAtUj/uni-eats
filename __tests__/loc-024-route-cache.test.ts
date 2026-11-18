import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BoundedLruCache,
  extractRetryAfterSeconds,
  parseDurationSeconds,
  routeCacheKey,
} from '../lib/route-cache.ts'

test('LOC-024: BoundedLruCache evicts oldest entry at maxEntries', () => {
  const cache = new BoundedLruCache<number>(3, 60_000)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)
  // Access 'a' so 'b' becomes LRU
  assert.equal(cache.get('a'), 1)
  cache.set('d', 4)

  assert.equal(cache.size, 3)
  assert.equal(cache.get('b'), null)
  assert.equal(cache.get('a'), 1)
  assert.equal(cache.get('c'), 3)
  assert.equal(cache.get('d'), 4)
})

test('LOC-009/024: parseDurationSeconds & extractRetryAfterSeconds handle Google/OSRM formats', () => {
  assert.equal(parseDurationSeconds('480s'), 480)
  assert.equal(parseDurationSeconds(312.6), 313)
  assert.equal(parseDurationSeconds('invalid'), null)

  assert.equal(extractRetryAfterSeconds({ headers: { get: () => '45' } }), 45)
  assert.equal(extractRetryAfterSeconds({ headers: { get: () => null } }, 30), 30)

  const key = routeCacheKey('dir', { lat: -26.19123, lng: 28.03081 }, { lat: -26.18551, lng: 28.03924 })
  assert.equal(key, 'dir:-26.1912,28.0308->-26.1855,28.0392')
})
