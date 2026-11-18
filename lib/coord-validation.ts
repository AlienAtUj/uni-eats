/**
 * Shared South Africa Geospatial Coordinate Validator (LOC-012 / LOC-022)
 * Rejects NaN, null, undefined, (0, 0) Null Island, and coordinates outside South Africa.
 */
export const SA_BOUNDS = {
  minLat: -35.5,
  maxLat: -22.0,
  minLng: 16.0,
  maxLng: 33.5,
} as const

export function isValidPlacedOrder(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const ord = raw as Record<string, unknown>
  if (typeof ord.id !== 'string' || ord.id.trim().length === 0) return false
  if (!Array.isArray(ord.lines)) return false
  if (ord.dropoffCoords !== undefined && ord.dropoffCoords !== null) {
    const dc = ord.dropoffCoords as Record<string, unknown>
    if (typeof dc !== 'object' || !Number.isFinite(dc.lat) || !Number.isFinite(dc.lng)) {
      return false
    }
  }
  return true
}

export function isValidSACoord(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return (
    lat >= SA_BOUNDS.minLat &&
    lat <= SA_BOUNDS.maxLat &&
    lng >= SA_BOUNDS.minLng &&
    lng <= SA_BOUNDS.maxLng
  )
}

export class StoreCoordinatesMissingError extends Error {
  readonly storeName?: string
  constructor(storeName?: string) {
    super(
      storeName
        ? `Verified GPS coordinates are missing for store "${storeName}".`
        : 'Verified GPS coordinates are missing for this store.'
    )
    this.name = 'StoreCoordinatesMissingError'
    this.storeName = storeName
  }
}

export interface DriverLocationLike {
  lat: number
  lng: number
  heading?: number
  updatedAt?: unknown
  timestampMs?: number
}

/** Anti-Nonsense GPS Jump & Monotonic Timestamp Validator: rejects > 120 km/h jumps or out-of-order timestamps */
export function validateDriverGpsJump(
  prevLoc: DriverLocationLike | null | undefined,
  nextLoc: DriverLocationLike | null | undefined,
  maxSpeedKmh = 120
): { valid: boolean; impliedSpeedKmh: number; reason?: 'INVALID_COORD' | 'STALE_TIMESTAMP' | 'IMPLAUSIBLE_SPEED' } {
  if (
    !nextLoc ||
    typeof nextLoc.lat !== 'number' ||
    typeof nextLoc.lng !== 'number' ||
    !Number.isFinite(nextLoc.lat) ||
    !Number.isFinite(nextLoc.lng) ||
    (nextLoc.lat === 0 && nextLoc.lng === 0)
  ) {
    return { valid: false, impliedSpeedKmh: Infinity, reason: 'INVALID_COORD' }
  }
  if (!prevLoc) {
    return { valid: true, impliedSpeedKmh: 0 }
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(nextLoc.lat - prevLoc.lat)
  const dLng = toRad(nextLoc.lng - prevLoc.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(prevLoc.lat)) *
      Math.cos(toRad(nextLoc.lat)) *
      Math.sin(dLng / 2) ** 2
  const distanceKm = 2 * R * Math.asin(Math.sqrt(a))

  const toMs = (loc: DriverLocationLike): number | null => {
    if (typeof loc.timestampMs === 'number' && Number.isFinite(loc.timestampMs)) {
      return loc.timestampMs
    }
    const ts: any = loc.updatedAt
    if (typeof ts?.toMillis === 'function') return ts.toMillis()
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts
    if (ts) {
      const parsed = new Date(ts).getTime()
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const prevMs = toMs(prevLoc)
  const nextMs = toMs(nextLoc)

  // Monotonic timestamp guard (LOC-005)
  if (prevMs !== null && nextMs !== null && nextMs <= prevMs) {
    return { valid: false, impliedSpeedKmh: 0, reason: 'STALE_TIMESTAMP' }
  }

  const elapsedHours =
    prevMs !== null && nextMs !== null
      ? Math.max((nextMs - prevMs) / 3600000, 1 / 3600)
      : 1 / 3600
  const impliedSpeedKmh = distanceKm / elapsedHours

  if (!Number.isFinite(impliedSpeedKmh) || impliedSpeedKmh > maxSpeedKmh) {
    return { valid: false, impliedSpeedKmh, reason: 'IMPLAUSIBLE_SPEED' }
  }

  return { valid: true, impliedSpeedKmh }
}

/**
 * Stationary Drift Filter (LOC-002):
 * - Dead-band: if displacement < 8m AND implied speed < 3 km/h, hold previous coordinate.
 * - Otherwise apply 1D EMA (alpha = 0.3) for low-speed jitter smoothing.
 */
export function filterStationaryDrift(
  prev: { lat: number; lng: number } | null | undefined,
  next: { lat: number; lng: number },
  impliedSpeedKmh: number,
  alpha = 0.3
): { lat: number; lng: number; suppressed: boolean } {
  if (!prev || !Number.isFinite(prev.lat) || !Number.isFinite(prev.lng)) {
    return { lat: next.lat, lng: next.lng, suppressed: false }
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(next.lat - prev.lat)
  const dLng = toRad(next.lng - prev.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(prev.lat)) * Math.cos(toRad(next.lat)) * Math.sin(dLng / 2) ** 2
  const distanceMeters = 2 * R * Math.asin(Math.sqrt(a))

  if (distanceMeters < 8 && impliedSpeedKmh < 3) {
    return { lat: prev.lat, lng: prev.lng, suppressed: true }
  }

  if (impliedSpeedKmh < 15) {
    return {
      lat: prev.lat + alpha * (next.lat - prev.lat),
      lng: prev.lng + alpha * (next.lng - prev.lng),
      suppressed: false,
    }
  }

  return { lat: next.lat, lng: next.lng, suppressed: false }
}

/** Format timestamp consistently in Africa/Johannesburg SAST (LOC-011) */
export function formatJohannesburgTime(input: Date | number | string): string {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
