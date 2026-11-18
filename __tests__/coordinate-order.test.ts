import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidSACoord } from '../lib/coord-validation.ts'
import { haversineKm } from '../lib/dash-engine.ts'

const SA_ROUTE_PAIRS: Array<{
  name: string
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
}> = [
  { name: 'Wits -> Braamfontein', origin: { lat: -26.1929, lng: 28.0305 }, destination: { lat: -26.1912, lng: 28.0345 } },
  { name: 'Rosebank -> Sandton', origin: { lat: -26.1467, lng: 28.0416 }, destination: { lat: -26.1076, lng: 28.0567 } },
  { name: 'Melville -> Auckland Park', origin: { lat: -26.1753, lng: 28.0063 }, destination: { lat: -26.1839, lng: 28.0014 } },
  { name: 'Johannesburg CBD -> Newtown', origin: { lat: -26.2041, lng: 28.0473 }, destination: { lat: -26.2015, lng: 28.0332 } },
  { name: 'Parktown -> Houghton', origin: { lat: -26.1815, lng: 28.0422 }, destination: { lat: -26.1667, lng: 28.0574 } },
  { name: 'Cape Town CBD -> Sea Point', origin: { lat: -33.9249, lng: 18.4241 }, destination: { lat: -33.9175, lng: 18.3879 } },
  { name: 'Rondebosch -> Claremont', origin: { lat: -33.9616, lng: 18.4713 }, destination: { lat: -33.9806, lng: 18.4648 } },
  { name: 'Durban CBD -> Umhlanga', origin: { lat: -29.8587, lng: 31.0218 }, destination: { lat: -29.7253, lng: 31.0858 } },
  { name: 'Hatfield -> Brooklyn (PTA)', origin: { lat: -25.7488, lng: 28.2380 }, destination: { lat: -25.7717, lng: 28.2356 } },
  { name: 'Stellenbosch Central -> Cloetesville', origin: { lat: -33.9321, lng: 18.8602 }, destination: { lat: -33.9132, lng: 18.8548 } },
]

test('LOC-022: all 10 SA route pairs have valid { lat, lng } order and positive road-factor distance', () => {
  for (const pair of SA_ROUTE_PAIRS) {
    assert.equal(isValidSACoord(pair.origin.lat, pair.origin.lng), true, pair.name)
    assert.equal(isValidSACoord(pair.destination.lat, pair.destination.lng), true, pair.name)
    // Swapping lat/lng must fail SA bounds
    assert.equal(isValidSACoord(pair.origin.lng, pair.origin.lat), false, `${pair.name} swapped`)
    const approxRoadKm = haversineKm(pair.origin, pair.destination) * 1.3
    assert.ok(approxRoadKm > 0.2 && approxRoadKm < 30, `${pair.name}: ${approxRoadKm} km`)
  }
})
