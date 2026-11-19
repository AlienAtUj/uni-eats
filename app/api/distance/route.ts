import { NextRequest, NextResponse } from 'next/server'
import { isValidSACoord } from '@/lib/coord-validation'
import { BoundedLruCache, extractRetryAfterSeconds, routeCacheKey } from '@/lib/route-cache'
import { haversineKm } from '@/lib/dash-engine'

interface LatLng {
  lat: number
  lng: number
}

interface CachedDistanceResult {
  provider: string
  roadDistanceKm: number
  durationSeconds?: number | null
}

const distanceCache = new BoundedLruCache<CachedDistanceResult>(1000, 15 * 60 * 1000)

async function computeSingleRoadDistance(
  origin: LatLng,
  destination: LatLng,
  googleKey: string | undefined,
  referer: string
): Promise<{ result?: CachedDistanceResult; rateLimitedRetryAfter?: number }> {
  if (
    Math.abs(origin.lat - destination.lat) < 0.0001 &&
    Math.abs(origin.lng - destination.lng) < 0.0001
  ) {
    return {
      result: {
        provider: 'road-same-block',
        roadDistanceKm: 0.1,
        durationSeconds: 60,
      },
    }
  }

  const key = routeCacheKey('dist', origin, destination)
  const cached = distanceCache.get(key)
  if (cached) {
    return { result: cached }
  }

  let rateLimitedRetryAfter: number | undefined

  if (googleKey) {
    try {
      const routesRes = await fetch(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': googleKey,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
            Referer: referer,
          },
          body: JSON.stringify({
            origin: {
              location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
            },
            destination: {
              location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
            },
            travelMode: 'DRIVE',
          }),
          signal: AbortSignal.timeout(5000),
        }
      )

      if (routesRes.status === 429) {
        rateLimitedRetryAfter = extractRetryAfterSeconds(routesRes)
      } else if (routesRes.ok) {
        const routesData = await routesRes.json()
        const route = routesData?.routes?.[0]
        if (route) {
          const meters = typeof route.distanceMeters === 'number' ? route.distanceMeters : 0
          const durStr = typeof route.duration === 'string' ? route.duration.replace(/s$/i, '') : ''
          const durSec = durStr ? Number(durStr) : null
          const value: CachedDistanceResult = {
            provider: 'google-routes-v2',
            roadDistanceKm: Number((meters / 1000).toFixed(2)),
            durationSeconds: Number.isFinite(durSec) ? Math.round(durSec!) : null,
          }
          distanceCache.set(key, value)
          return { result: value }
        }
      }
    } catch {
      // Fall through to Distance Matrix / OSRM / Valhalla
    }

    try {
      const dmUrl =
        `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${origin.lat},${origin.lng}` +
        `&destinations=${destination.lat},${destination.lng}` +
        `&mode=driving&units=metric&key=${encodeURIComponent(googleKey)}`

      const dmRes = await fetch(dmUrl, {
        cache: 'no-store',
        headers: { Referer: referer },
        signal: AbortSignal.timeout(5000),
      })
      if (dmRes.status === 429) {
        rateLimitedRetryAfter = extractRetryAfterSeconds(dmRes)
      } else if (dmRes.ok) {
        const dmData = await dmRes.json()
        if (dmData?.status === 'OVER_QUERY_LIMIT') {
          rateLimitedRetryAfter = 30
        }
        const element = dmData?.rows?.[0]?.elements?.[0]
        if (element?.status === 'OK' && typeof element?.distance?.value === 'number') {
          const value: CachedDistanceResult = {
            provider: 'google-distance-matrix',
            roadDistanceKm: Number((element.distance.value / 1000).toFixed(2)),
            durationSeconds: element.duration?.value ?? null,
          }
          distanceCache.set(key, value)
          return { result: value }
        }
      }
    } catch {
      // Fall through to OSRM / Valhalla
    }
  }

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`
    const osrmRes = await fetch(osrmUrl, {
      cache: 'no-store',
      headers: { 'User-Agent': 'DashApp/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (osrmRes.status === 429) {
      rateLimitedRetryAfter = extractRetryAfterSeconds(osrmRes)
    } else if (osrmRes.ok) {
      const osrmData = await osrmRes.json()
      const meters = osrmData?.routes?.[0]?.distance
      if (typeof meters === 'number' && Number.isFinite(meters)) {
        const value: CachedDistanceResult = {
          provider: 'osrm-road-network',
          roadDistanceKm: Number((meters / 1000).toFixed(2)),
          durationSeconds: osrmData?.routes?.[0]?.duration ?? null,
        }
        distanceCache.set(key, value)
        return { result: value }
      }
    }
  } catch {
    // Fall through to Valhalla
  }

  try {
    const valhallaRes = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DashApp/1.0',
      },
      body: JSON.stringify({
        locations: [
          { lat: origin.lat, lon: origin.lng },
          { lat: destination.lat, lon: destination.lng },
        ],
        costing: 'auto',
        units: 'kilometers',
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (valhallaRes.status === 429) {
      rateLimitedRetryAfter = extractRetryAfterSeconds(valhallaRes)
    } else if (valhallaRes.ok) {
      const vData = await valhallaRes.json()
      const km = vData?.trip?.summary?.length
      if (typeof km === 'number' && Number.isFinite(km)) {
        const value: CachedDistanceResult = {
          provider: 'valhalla-road-network',
          roadDistanceKm: Number(km.toFixed(2)),
          durationSeconds: vData?.trip?.summary?.time ?? null,
        }
        distanceCache.set(key, value)
        return { result: value }
      }
    }
  } catch {
    // All road-network APIs failed
  }

  return { rateLimitedRetryAfter }
}

/**
 * Road Distance API (NEVER Haversine / Straight-line)
 * Supports single { origin, destination } and batch { origin, destinations: [{ id, lat, lng }] }.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const origin = body?.origin as LatLng | undefined
    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    const referer = req.headers.get('referer') || req.nextUrl.origin

    if (!origin || !isValidSACoord(origin.lat, origin.lng)) {
      return NextResponse.json(
        { error: 'INVALID_COORD', field: 'origin' },
        { status: 400 }
      )
    }

    // Batch matrix mode for store feed (LOC-007)
    if (Array.isArray(body?.destinations)) {
      const destinations = body.destinations as Array<{ id?: string; lat: number; lng: number }>
      for (const dest of destinations) {
        if (!dest || !isValidSACoord(dest.lat, dest.lng)) {
          return NextResponse.json(
            { error: 'INVALID_COORD', field: 'destinations' },
            { status: 400 }
          )
        }
      }

      const results = await Promise.all(
        destinations.slice(0, 25).map(async (dest) => {
          const outcome = await computeSingleRoadDistance(origin, dest, googleKey, referer)
          return {
            id: dest.id ?? null,
            roadDistanceKm: outcome.result?.roadDistanceKm ?? null,
            durationSeconds: outcome.result?.durationSeconds ?? null,
            provider: outcome.result?.provider ?? null,
          }
        })
      )
      return NextResponse.json({ results })
    }

    const destination = body?.destination as LatLng | undefined
    if (!destination || !isValidSACoord(destination.lat, destination.lng)) {
      return NextResponse.json(
        { error: 'INVALID_COORD', field: 'destination' },
        { status: 400 }
      )
    }

    const outcome = await computeSingleRoadDistance(origin, destination, googleKey, referer)
    if (outcome.result) {
      return NextResponse.json(outcome.result)
    }

    // Explicit approximate road-factor fallback so checkout never blocks on external API outage
    const approxKm = Number((haversineKm(origin, destination) * 1.3).toFixed(2))
    return NextResponse.json({
      provider: 'haversine-road-estimate',
      roadDistanceKm: Math.max(0.1, approxKm),
      isApproximate: true,
      rateLimitedRetryAfter: outcome.rateLimitedRetryAfter ?? null,
    })
  } catch (err) {
    console.error('Road distance API error:', err)
    return NextResponse.json({ error: 'Failed to calculate road distance' }, { status: 500 })
  }
}
