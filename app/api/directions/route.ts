import { NextRequest, NextResponse } from 'next/server'
import { isValidSACoord } from '@/lib/coord-validation'
import {
  BoundedLruCache,
  extractRetryAfterSeconds,
  parseDurationSeconds,
  routeCacheKey,
} from '@/lib/route-cache'

interface LatLng {
  lat: number
  lng: number
}

interface CachedDirectionsResult {
  provider: string
  path: LatLng[]
  distanceMeters: number | null
  duration: unknown
  durationSeconds: number | null
}

const directionsCache = new BoundedLruCache<CachedDirectionsResult>(1000, 15 * 60 * 1000)

/** Standard Google Encoded Polyline decoder */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const dLat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dLat

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    const dLng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dLng

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return points
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const origin = body?.origin as LatLng | undefined
    const destination = body?.destination as LatLng | undefined

    if (!origin || !isValidSACoord(origin.lat, origin.lng)) {
      return NextResponse.json({ error: 'INVALID_COORD', field: 'origin' }, { status: 400 })
    }
    if (!destination || !isValidSACoord(destination.lat, destination.lng)) {
      return NextResponse.json({ error: 'INVALID_COORD', field: 'destination' }, { status: 400 })
    }

    const cacheKey = routeCacheKey('dir', origin, destination)
    const cached = directionsCache.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    const referer = req.headers.get('referer') || req.nextUrl.origin
    let rateLimitedRetryAfter: number | undefined

    // 1. Try Google Maps Routes API (New)
    if (googleKey) {
      try {
        const res = await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleKey,
              'X-Goog-FieldMask':
                'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
              Referer: referer,
            },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
              origin: {
                location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
              },
              destination: {
                location: {
                  latLng: { latitude: destination.lat, longitude: destination.lng },
                },
              },
              travelMode: 'DRIVE',
              routingPreference: 'TRAFFIC_AWARE',
            }),
          }
        )

        if (res.status === 429) {
          rateLimitedRetryAfter = extractRetryAfterSeconds(res)
        } else if (res.ok) {
          const data = await res.json()
          const encoded = data?.routes?.[0]?.polyline?.encodedPolyline
          if (typeof encoded === 'string' && encoded.length > 0) {
            const path = decodePolyline(encoded)
            if (path.length >= 2) {
              const duration = data.routes[0].duration ?? null
              const result: CachedDirectionsResult = {
                provider: 'google-routes-v2',
                path,
                distanceMeters: data.routes[0].distanceMeters ?? null,
                duration,
                durationSeconds: parseDurationSeconds(duration),
              }
              directionsCache.set(cacheKey, result)
              return NextResponse.json(result)
            }
          }
        }
      } catch {
        // Fall through to OSRM
      }
    }

    // 2. Fallback to OSRM real street-level driving route
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
    const osrmRes = await fetch(osrmUrl, { next: { revalidate: 0 } })
    if (osrmRes.status === 429) {
      rateLimitedRetryAfter = extractRetryAfterSeconds(osrmRes)
    } else if (osrmRes.ok) {
      const osrmData = await osrmRes.json()
      const coords: [number, number][] | undefined =
        osrmData?.routes?.[0]?.geometry?.coordinates
      if (Array.isArray(coords) && coords.length >= 2) {
        const path = coords.map(([lng, lat]) => ({ lat, lng }))
        const duration = osrmData.routes[0].duration ?? null
        const result: CachedDirectionsResult = {
          provider: 'osrm',
          path,
          distanceMeters: osrmData.routes[0].distance ?? null,
          duration,
          durationSeconds: parseDurationSeconds(duration),
        }
        directionsCache.set(cacheKey, result)
        return NextResponse.json(result)
      }
    }

    if (rateLimitedRetryAfter !== undefined) {
      return NextResponse.json(
        { error: 'UPSTREAM_RATE_LIMITED', retryAfterSeconds: rateLimitedRetryAfter },
        { status: 503, headers: { 'Retry-After': String(rateLimitedRetryAfter) } }
      )
    }

    return NextResponse.json(
      { error: 'Unable to compute driving route from routing APIs.' },
      { status: 502 }
    )
  } catch (err) {
    console.error('Directions API error:', err)
    return NextResponse.json({ error: 'Failed to compute route' }, { status: 500 })
  }
}
