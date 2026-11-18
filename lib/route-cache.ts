/**
 * Bounded 15-minute LRU Cache & Routing Helpers (LOC-024 / LOC-009)
 */

export class BoundedLruCache<T> {
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly store = new Map<string, { value: T; expiresAt: number }>()

  constructor(maxEntries = 1000, ttlMs = 15 * 60 * 1000) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    // Refresh LRU order
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey)
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  get size(): number {
    return this.store.size
  }
}

export function routeCacheKey(
  prefix: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): string {
  return `${prefix}:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
}

export function parseDurationSeconds(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw)
  }
  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+(?:\.\d+)?)s?$/i)
    if (match) {
      const val = Number(match[1])
      if (Number.isFinite(val) && val >= 0) return Math.round(val)
    }
  }
  return null
}

export function extractRetryAfterSeconds(res: { headers: { get(name: string): string | null } }, fallback = 30): number {
  const header = res.headers.get('retry-after')
  if (!header) return fallback
  const parsed = Number(header)
  if (Number.isFinite(parsed) && parsed > 0) return Math.ceil(parsed)
  return fallback
}
