import { NextRequest, NextResponse } from 'next/server'

interface LatLng {
  lat: number
  lng: number
}

/**
 * Road Distance API (NEVER Haversine / Straight-line)
 * Uses Google Maps Distance Matrix API (or Routes API v2), with OSRM road-network fallback.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const origin = body?.origin as LatLng | undefined
    const destination = body?.destination as LatLng | undefined

    if (
      !origin ||
      !destination ||
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lng) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lng)
    ) {
      return NextResponse.json({ error: 'Invalid origin or destination coordinates' }, { status: 400 })
    }

    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    // 1. Google Maps Distance Matrix API
    if (googleKey) {
      try {
        const dmUrl =
          `https://maps.googleapis.com/maps/api/distancematrix/json` +
          `?origins=${origin.lat},${origin.lng}` +
          `&destinations=${destination.lat},${destination.lng}` +
          `&mode=driving&units=metric&key=${encodeURIComponent(googleKey)}`

        const dmRes = await fetch(dmUrl, { cache: 'no-store' })
        if (dmRes.ok) {
          const dmData = await dmRes.json()
          const element = dmData?.rows?.[0]?.elements?.[0]
          if (element?.status === 'OK' && typeof element?.distance?.value === 'number') {
            return NextResponse.json({
              provider: 'google-distance-matrix',
              roadDistanceKm: Number((element.distance.value / 1000).toFixed(2)),
              durationSeconds: element.duration?.value ?? null,
            })
          }
        }
      } catch {
        // Fall through to Google Routes API v2
      }

      // 2. Google Maps Routes API v2
      try {
        const routesRes = await fetch(
          'https://routes.googleapis.com/directions/v2:computeRoutes',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': googleKey,
              'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
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
          }
        )

        if (routesRes.ok) {
          const routesData = await routesRes.json()
          const meters = routesData?.routes?.[0]?.distanceMeters
          if (typeof meters === 'number' && Number.isFinite(meters)) {
            return NextResponse.json({
              provider: 'google-routes-v2',
              roadDistanceKm: Number((meters / 1000).toFixed(2)),
            })
          }
        }
      } catch {
        // Fall through to OSRM road-network API
      }
    }

    // 3. OSRM Road-Network Distance API (still real road distance, never Haversine)
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`
    const osrmRes = await fetch(osrmUrl, { cache: 'no-store' })
    if (osrmRes.ok) {
      const osrmData = await osrmRes.json()
      const meters = osrmData?.routes?.[0]?.distance
      if (typeof meters === 'number' && Number.isFinite(meters)) {
        return NextResponse.json({
          provider: 'osrm-road-network',
          roadDistanceKm: Number((meters / 1000).toFixed(2)),
          durationSeconds: osrmData?.routes?.[0]?.duration ?? null,
        })
      }
    }

    return NextResponse.json(
      { error: 'Unable to calculate road distance from routing APIs.' },
      { status: 502 }
    )
  } catch (err) {
    console.error('Road distance API error:', err)
    return NextResponse.json({ error: 'Failed to calculate road distance' }, { status: 500 })
  }
}
