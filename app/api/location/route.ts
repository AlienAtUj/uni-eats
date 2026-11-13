import { NextRequest, NextResponse } from 'next/server'

// In-memory cache to prevent duplicate API calls and keep app costs near $0
const locationApiCache = new Map<string, { data: any; expiry: number }>()

function getCachedResult(key: string) {
  const cached = locationApiCache.get(key)
  if (cached && cached.expiry > Date.now()) {
    return cached.data
  }
  locationApiCache.delete(key)
  return null
}

function setCachedResult(key: string, data: any, ttlMs: number) {
  if (locationApiCache.size > 2000) {
    const keysToEvict = Array.from(locationApiCache.keys()).slice(0, 400)
    keysToEvict.forEach((k) => locationApiCache.delete(k))
  }
  locationApiCache.set(key, { data, expiry: Date.now() + ttlMs })
}

function getGoogleApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  if (!key || key.trim().length === 0) return null
  return key.trim()
}

function parseGoogleGeocodeResult(result: any, isGps = false) {
  const components: any[] = result.address_components || []
  const getComp = (...types: string[]) => {
    const found = components.find((c) =>
      types.some((t) => Array.isArray(c.types) && c.types.includes(t))
    )
    return found ? found.long_name || found.short_name || '' : ''
  }

  const streetNumber = getComp('street_number')
  const route = getComp('route')
  const premise = getComp('premise', 'subpremise', 'establishment', 'point_of_interest')
  const suburb = getComp(
    'sublocality_level_1',
    'sublocality_level_2',
    'sublocality',
    'neighborhood'
  )
  const city = getComp('locality', 'administrative_area_level_2')
  const province = getComp('administrative_area_level_1')
  const formattedAddress = result.formatted_address || ''

  const streetPart = [streetNumber, route].filter(Boolean).join(' ').trim() || premise
  let label = ''
  if (streetPart && suburb) {
    label = `${streetPart}, ${suburb}`
  } else if (streetPart && city) {
    label = `${streetPart}, ${city}`
  } else if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
    label = `${suburb}, ${city}`
  } else if (suburb || city) {
    label = suburb || city
  } else {
    label = formattedAddress.split(',').slice(0, 2).join(', ').trim()
  }

  const loc = result.geometry?.location
  const lat = typeof loc?.lat === 'number' ? loc.lat : Number(loc?.lat)
  const lng = typeof loc?.lng === 'number' ? loc.lng : Number(loc?.lng)

  return {
    label: label || formattedAddress,
    suburb: suburb || city,
    city: city || province,
    address: formattedAddress || label,
    coords: { lat, lng },
    isGps,
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}

async function serverReverseArcGis(lat: number, lng: number) {
  try {
    const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&outSR=4326&f=json`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const arcData = await res.json()
    const addr = arcData?.address
    if (!addr) return null

    const street = addr.Address || addr.StAddr || ''
    const suburb = addr.Neighborhood || addr.District || ''
    const city = addr.City || addr.Subregion || ''
    const matchAddr = addr.Match_addr || addr.LongLabel || addr.ShortLabel || ''

    let display = ''
    if (street && suburb) {
      display = `${street}, ${suburb}`
    } else if (street && city) {
      display = `${street}, ${city}`
    } else if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
      display = `${suburb}, ${city}`
    } else if (suburb) {
      display = suburb
    } else if (street) {
      display = street
    } else {
      display = matchAddr.split(',').slice(0, 2).join(', ').trim()
    }

    if (!display) return null
    return {
      label: display,
      suburb: suburb || city,
      city,
      address: matchAddr || display,
      coords: { lat, lng },
      isGps: true,
    }
  } catch {
    return null
  }
}

async function serverReverseNominatim(lat: number, lng: number) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
    const res = await fetchWithTimeout(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'DashDeliveryApp/1.0 (https://dash-delivery.app)',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const addr = data?.address || {}
    const houseNumber = addr.house_number || ''
    const road = addr.road || addr.street || addr.pedestrian || ''
    const suburb =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.city_district ||
      addr.town ||
      addr.village ||
      ''
    const city = addr.city || addr.town || addr.municipality || addr.county || ''

    const streetPart = [houseNumber, road].filter(Boolean).join(' ').trim()
    let display = ''
    if (streetPart && suburb) {
      display = `${streetPart}, ${suburb}`
    } else if (streetPart && city) {
      display = `${streetPart}, ${city}`
    } else if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
      display = `${suburb}, ${city}`
    } else if (suburb) {
      display = suburb
    } else if (city) {
      display = city
    } else {
      display = data.display_name?.split(',').slice(0, 2).join(', ').trim() || ''
    }

    if (!display) return null
    return {
      label: display,
      suburb: suburb || city,
      city,
      address: data.display_name || display,
      coords: { lat, lng },
      isGps: true,
    }
  } catch {
    return null
  }
}

async function serverReverseBigDataCloud(lat: number, lng: number) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null
    const data = await res.json()
    const locality = data?.locality || ''
    const city = data?.city || data?.principalSubdivision || ''
    const display =
      locality && city && locality.toLowerCase() !== city.toLowerCase()
        ? `${locality}, ${city}`
        : locality || city
    if (!display) return null
    return {
      label: display,
      suburb: locality || city,
      city,
      address: [locality, city, data?.countryName].filter(Boolean).join(', '),
      coords: { lat, lng },
      isGps: true,
    }
  } catch {
    return null
  }
}

/**
 * GET /api/location
 * Multi-Engine Server-Side Geocoding (Google Maps + ArcGIS + Nominatim + BigDataCloud)
 * - ?action=reverse&lat=...&lng=...
 * - ?action=search&q=...
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const apiKey = getGoogleApiKey()

  try {
    if (action === 'reverse') {
      const lat = parseFloat(searchParams.get('lat') || '')
      const lng = parseFloat(searchParams.get('lng') || '')
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
      }

      // Round coordinates to ~11 meters to maximize cache hits and eliminate redundant billing
      const cacheKey = `rev:${lat.toFixed(4)}:${lng.toFixed(4)}`
      const cached = getCachedResult(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
        })
      }

      // Run Google (if key present), ArcGIS, and Nominatim in parallel on the server
      const googlePromise = apiKey
        ? (async () => {
            try {
              const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=en&region=za&key=${encodeURIComponent(
                apiKey
              )}`
              const res = await fetchWithTimeout(url)
              const data = await res.json()
              if (data.status === 'OK' && Array.isArray(data.results) && data.results.length > 0) {
                const preferred =
                  data.results.find((r: any) =>
                    r.types?.some((t: string) =>
                      ['street_address', 'premise', 'subpremise', 'route', 'intersection'].includes(t)
                    )
                  ) || data.results[0]
                const location = parseGoogleGeocodeResult(preferred, true)
                location.coords = { lat, lng }
                return { location, source: 'google_geocode' }
              }
            } catch {}
            return null
          })()
        : Promise.resolve(null)

      const [googleOut, arcOut, nomOut] = await Promise.all([
        googlePromise,
        serverReverseArcGis(lat, lng),
        serverReverseNominatim(lat, lng),
      ])

      const bestLocation =
        googleOut?.location || arcOut || nomOut || (await serverReverseBigDataCloud(lat, lng))
      const source = googleOut?.location
        ? 'google_geocode'
        : arcOut
          ? 'arcgis'
          : nomOut
            ? 'nominatim'
            : bestLocation
              ? 'bigdatacloud'
              : 'none'

      if (bestLocation) {
        const payload = { location: bestLocation, source }
        setCachedResult(cacheKey, payload, 24 * 60 * 60 * 1000) // 24hr cache
        return NextResponse.json(payload, {
          headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
        })
      }

      return NextResponse.json({ location: null, source: 'none' })
    }

    if (action === 'search') {
      const q = (searchParams.get('q') || '').trim()
      if (!q) {
        return NextResponse.json({ results: [] })
      }

      const cacheKey = `srch:${q.toLowerCase()}`
      const cached = getCachedResult(cacheKey)
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=43200' },
        })
      }

      const results: any[] = []

      if (apiKey) {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          q
        )}&components=country:ZA&region=za&language=en&key=${encodeURIComponent(apiKey)}`

        const placesTextUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
          `${q}, South Africa`
        )}&region=za&language=en&key=${encodeURIComponent(apiKey)}`

        const [geoSettled, placesSettled] = await Promise.allSettled([
          fetchWithTimeout(geocodeUrl),
          fetchWithTimeout(placesTextUrl),
        ])

        if (placesSettled.status === 'fulfilled' && placesSettled.value.ok) {
          const placesData = await placesSettled.value.json()
          if (placesData.status === 'OK' && Array.isArray(placesData.results)) {
            for (const p of placesData.results.slice(0, 6)) {
              const loc = p.geometry?.location
              if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
                const formatted = p.formatted_address || ''
                const parts = formatted.split(',').map((s: string) => s.trim())
                const suburb = parts[1] || parts[0] || ''
                const city = parts[2] || parts[1] || ''
                const label =
                  p.name && suburb && !p.name.toLowerCase().includes(suburb.toLowerCase())
                    ? `${p.name}, ${suburb}`
                    : p.name || parts.slice(0, 2).join(', ')
                results.push({
                  label,
                  suburb,
                  city,
                  address: formatted ? `${p.name}, ${formatted}` : p.name,
                  coords: { lat: Number(loc.lat), lng: Number(loc.lng) },
                  isGps: false,
                })
              }
            }
          }
        }

        if (geoSettled.status === 'fulfilled' && geoSettled.value.ok) {
          const geoData = await geoSettled.value.json()
          if (geoData.status === 'OK' && Array.isArray(geoData.results)) {
            for (const r of geoData.results.slice(0, 6)) {
              const parsed = parseGoogleGeocodeResult(r, false)
              if (Number.isFinite(parsed.coords.lat) && Number.isFinite(parsed.coords.lng)) {
                results.push(parsed)
              }
            }
          }
        }
      }

      const payload = { results, source: results.length > 0 ? 'google' : 'none' }
      if (results.length > 0) {
        setCachedResult(cacheKey, payload, 12 * 60 * 60 * 1000)
      }
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=43200' },
      })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Location API request failed', results: [] },
      { status: 200 }
    )
  }
}
