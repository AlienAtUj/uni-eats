import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('LOC-023: firestore.rules validates driverLocation on every diff regardless of sibling fields', () => {
  const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')
  assert.match(rules, /function validDriverLocation\(loc\)/)
  assert.match(rules, /!\('driverLocation' in request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\)/)
  assert.match(rules, /validDriverLocation\(request\.resource\.data\.driverLocation\)/)
  assert.match(rules, /loc\.lat >= -35\.5 && loc\.lat <= -22\.0/)
  assert.match(rules, /loc\.lng >= 16\.0 && loc\.lng <= 33\.5/)
  assert.match(rules, /loc\.heading >= 0 && loc\.heading <= 360/)
  assert.match(rules, /loc\.updatedAt == request\.time/)
  assert.doesNotMatch(rules, /hasOnly\(\['driverLocation', 'updatedAt'\]\)/)
})
