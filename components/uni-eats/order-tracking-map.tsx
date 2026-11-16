'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coordinates } from '@/lib/location'
import { cn } from '@/lib/utils'

/**
 * Uber Eats-Inspired Colorful Light Map Style
 * - Clean light canvas: #F4F4F2
 * - Lush green parks: #D4EBD8
 * - Crisp blue water: #A5D5F2
 * - White roads & warm amber highways
 */
export const UBER_EATS_COLOR_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#F4F4F2' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#222222' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#111111' }],
  },
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#ECECE9' }],
  },
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    stylers: [{ visibility: 'on' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#D4EBD8' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#287d46' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.fill',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E0E0DC' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#444444' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.fill',
    stylers: [{ color: '#FCE39D' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#E8C15E' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#A5D5F2' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#2A628F' }],
  },
] as const

export const UBER_EATS_DARK_MAP_STYLE = UBER_EATS_COLOR_MAP_STYLE

export const UBER_EATS_FIT_BOUNDS_PADDING = {
  top: 100,
  bottom: 200,
  left: 50,
  right: 50,
}

export interface DriverTelemetry {
  lat: number
  lng: number
  bearing: number
  timestamp: number
}

interface MarkerSprites {
  shopPng: string
  customerPng: string
  clusterPng: string
  /** Pre-rendered top-down car PNGs quantized every 5° (no runtime SVG generation) */
  carFrames: string[]
}

let cachedSprites: MarkerSprites | null = null

/**
 * Pre-renders crisp PNG marker icons onto an offscreen canvas once and caches them.
 * Zero dynamic SVG generation on the client.
 */
function getMarkerSprites(): MarkerSprites {
  if (cachedSprites) return cachedSprites

  const makePng = (size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    draw(ctx, size)
    return canvas.toDataURL('image/png')
  }

  // 1. Shop Marker: Minimalist pin with restaurant fork & knife icon
  const shopPng = makePng(72, (ctx, s) => {
    const cx = s / 2
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(cx, 26, 20, 0, Math.PI * 2)
    ctx.fill()

    // Pin stem
    ctx.beginPath()
    ctx.moveTo(cx - 8, 42)
    ctx.lineTo(cx, 62)
    ctx.lineTo(cx + 8, 42)
    ctx.closePath()
    ctx.fill()

    // Inner dark badge
    ctx.fillStyle = '#1A1A1A'
    ctx.beginPath()
    ctx.arc(cx, 26, 15, 0, Math.PI * 2)
    ctx.fill()

    // Minimalist restaurant fork & knife bars
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(cx - 5, 18, 2, 16)
    ctx.fillRect(cx - 7, 18, 1.5, 6)
    ctx.fillRect(cx - 3.5, 18, 1.5, 6)
    ctx.fillRect(cx + 3, 18, 2.5, 16)
  })

  // 2. Customer Marker: Distinct home icon inside pulsing-style ring
  const customerPng = makePng(72, (ctx, s) => {
    const cx = s / 2
    const cy = s / 2

    // Outer halo ring
    ctx.fillStyle = 'rgba(40, 125, 70, 0.28)'
    ctx.beginPath()
    ctx.arc(cx, cy, 30, 0, Math.PI * 2)
    ctx.fill()

    // Solid Dash green core
    ctx.fillStyle = '#287d46'
    ctx.beginPath()
    ctx.arc(cx, cy, 19, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()

    // Minimalist house icon
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.moveTo(cx, cy - 8)
    ctx.lineTo(cx + 8, cy - 1)
    ctx.lineTo(cx + 6, cy - 1)
    ctx.lineTo(cx + 6, cy + 7)
    ctx.lineTo(cx - 6, cy + 7)
    ctx.lineTo(cx - 6, cy - 1)
    ctx.lineTo(cx - 8, cy - 1)
    ctx.closePath()
    ctx.fill()
  })

  // 3. Cluster Badge for low zoom levels
  const clusterPng = makePng(64, (ctx, s) => {
    const cx = s / 2
    ctx.fillStyle = '#287d46'
    ctx.beginPath()
    ctx.arc(cx, cx, 24, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()
  })

  // 4. Driver Marker: 72 pre-rendered top-down car PNG frames (5° increments)
  const carFrames: string[] = []
  for (let deg = 0; deg < 360; deg += 5) {
    carFrames.push(
      makePng(72, (ctx, s) => {
        const cx = s / 2
        const cy = s / 2
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((deg * Math.PI) / 180)

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.beginPath()
        ctx.roundRect(-12, -21, 24, 44, 7)
        ctx.fill()

        // Car body (top-down white sedan)
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.roundRect(-11, -22, 22, 42, 6)
        ctx.fill()

        // Windshield & rear glass
        ctx.fillStyle = '#1A1A1A'
        ctx.beginPath()
        ctx.roundRect(-8, -11, 16, 9, 2)
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(-8, 5, 16, 7, 2)
        ctx.fill()

        // Green Dash roof accent
        ctx.fillStyle = '#287d46'
        ctx.fillRect(-7, -1, 14, 5)

        ctx.restore()
      })
    )
  }

  cachedSprites = { shopPng, customerPng, clusterPng, carFrames }
  return cachedSprites
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function interpolateBearing(fromDeg: number, toDeg: number, t: number): number {
  const diff = ((((toDeg - fromDeg) % 360) + 540) % 360) - 180
  return (fromDeg + diff * t + 360) % 360
}

function computeBearing(a: Coordinates, b: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Sample position & road-segment bearing along an ordered array of route coordinates */
function sampleAlongRoute(
  path: Coordinates[],
  progress: number
): { lat: number; lng: number; bearing: number } {
  if (path.length === 0) return { lat: 0, lng: 0, bearing: 0 }
  if (path.length === 1) return { ...path[0], bearing: 0 }

  const clamped = Math.max(0, Math.min(1, progress))
  const segLengths: number[] = []
  let totalLength = 0
  for (let i = 0; i < path.length - 1; i++) {
    const len = haversineMeters(path[i], path[i + 1])
    segLengths.push(len)
    totalLength += len
  }

  if (totalLength === 0) {
    return { ...path[0], bearing: 0 }
  }

  const targetDist = clamped * totalLength
  let acc = 0
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i]
    if (acc + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = segLen > 0 ? Math.min(1, Math.max(0, (targetDist - acc) / segLen)) : 0
      const a = path[i]
      const b = path[i + 1]
      return {
        lat: a.lat + (b.lat - a.lat) * localT,
        lng: a.lng + (b.lng - a.lng) * localT,
        bearing: computeBearing(a, b),
      }
    }
    acc += segLen
  }

  const last = path[path.length - 1]
  const prev = path[path.length - 2]
  return { ...last, bearing: computeBearing(prev, last) }
}

/** Load Google Maps JS API once */
let googleMapsPromise: Promise<any> | null = null
function loadGoogleMapsApi(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('SSR')
  if ((window as any).google?.maps) return Promise.resolve((window as any).google.maps)
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`
    script.async = true
    script.defer = true
    script.onload = () => resolve((window as any).google.maps)
    script.onerror = (err) => reject(err)
    document.head.appendChild(script)
  })
  return googleMapsPromise
}

export function OrderTrackingMap({
  orderId,
  shopName,
  shopCoords,
  customerCoords,
  nearbyShops = [],
  orderStage,
}: {
  orderId: string
  shopName: string
  shopCoords: Coordinates
  customerCoords: Coordinates
  nearbyShops?: Array<{ id: string; name: string; coords: Coordinates }>
  orderStage: number
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const driverMarkerRef = useRef<any>(null)
  const shopMarkersRef = useRef<any[]>([])
  const clusterMarkerRef = useRef<any>(null)
  const customerMarkerRef = useRef<any>(null)
  const routePolylineRef = useRef<any>(null)
  const routeCasingRef = useRef<any>(null)
  const routePathRef = useRef<Coordinates[]>([shopCoords, customerCoords])

  const [isFollowing, setIsFollowing] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [connectionMode, setConnectionMode] = useState<'websocket' | 'live-sim'>('live-sim')

  const isFollowingRef = useRef(true)
  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  // Current animated state & target state for requestAnimationFrame loop
  const animStateRef = useRef({
    fromLat: shopCoords.lat,
    fromLng: shopCoords.lng,
    fromBearing: computeBearing(shopCoords, customerCoords),
    toLat: shopCoords.lat,
    toLng: shopCoords.lng,
    toBearing: computeBearing(shopCoords, customerCoords),
    currentLat: shopCoords.lat,
    currentLng: shopCoords.lng,
    currentBearing: computeBearing(shopCoords, customerCoords),
    startTime: 0,
    duration: 1000,
    lastReceivedAt: 0,
    rafId: 0,
  })

  const fitAllBounds = useCallback(() => {
    const map = mapRef.current
    const gmaps = (window as any).google?.maps
    if (!map || !gmaps) return

    const bounds = new gmaps.LatLngBounds()
    routePathRef.current.forEach((pt) => bounds.extend(pt))
    bounds.extend(shopCoords)
    bounds.extend(customerCoords)
    bounds.extend({
      lat: animStateRef.current.currentLat,
      lng: animStateRef.current.currentLng,
    })

    map.fitBounds(bounds, UBER_EATS_FIT_BOUNDS_PADDING)
  }, [shopCoords, customerCoords])

  const handleRecenter = () => {
    setIsFollowing(true)
    fitAllBounds()
  }

  // Push a new driver telemetry update (throttled to <= 1 update/sec)
  const pushDriverUpdate = useCallback((telemetry: DriverTelemetry) => {
    const now = performance.now()
    const st = animStateRef.current
    if (now - st.lastReceivedAt < 950 && st.lastReceivedAt !== 0) {
      return
    }
    st.lastReceivedAt = now
    st.fromLat = st.currentLat
    st.fromLng = st.currentLng
    st.fromBearing = st.currentBearing
    st.toLat = telemetry.lat
    st.toLng = telemetry.lng
    st.toBearing = telemetry.bearing
    st.startTime = now
    st.duration = 1000
  }, [])

  // Initialize Google Map + Pre-rendered PNG Markers + Clustering
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setMapError('Google Maps API key not configured.')
      return
    }

    let cancelled = false

    loadGoogleMapsApi(apiKey)
      .then((gmaps) => {
        if (cancelled || !mapContainerRef.current) return
        const sprites = getMarkerSprites()

        const map = new gmaps.Map(mapContainerRef.current, {
          center: shopCoords,
          zoom: 14,
          styles: UBER_EATS_COLOR_MAP_STYLE,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          backgroundColor: '#F4F4F2',
        })
        mapRef.current = map

        // Pause Follow Mode on manual user pan
        map.addListener('dragstart', () => {
          setIsFollowing(false)
        })

        // Dual-layer Road Route Polyline (dark casing + vibrant Dash green)
        routeCasingRef.current = new gmaps.Polyline({
          path: [shopCoords, customerCoords],
          geodesic: false,
          strokeColor: '#0E2E19',
          strokeOpacity: 0.9,
          strokeWeight: 7,
          zIndex: 10,
          map,
        })
        routePolylineRef.current = new gmaps.Polyline({
          path: [shopCoords, customerCoords],
          geodesic: false,
          strokeColor: '#287d46',
          strokeOpacity: 1,
          strokeWeight: 4,
          zIndex: 11,
          map,
        })

        // Fetch actual street-level driving directions via /api/directions (Routes API v2 + OSRM fallback)
        fetch('/api/directions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: shopCoords,
            destination: customerCoords,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled || !Array.isArray(data?.path) || data.path.length < 2) return
            const roadPath: Coordinates[] = data.path
            routePathRef.current = roadPath
            routeCasingRef.current?.setPath(roadPath)
            routePolylineRef.current?.setPath(roadPath)
            fitAllBounds()
          })
          .catch(() => {
            // keep initial path on network failure
          })

        // Customer Home Marker
        customerMarkerRef.current = new gmaps.Marker({
          position: customerCoords,
          map,
          title: 'Delivery Address',
          zIndex: 50,
          icon: {
            url: sprites.customerPng,
            scaledSize: new gmaps.Size(42, 42),
            anchor: new gmaps.Point(21, 21),
          },
        })

        // Primary Shop Marker + Optional Nearby Shop Markers for clustering
        const allShops = [
          { id: 'active-shop', name: shopName, coords: shopCoords },
          ...nearbyShops,
        ]
        shopMarkersRef.current = allShops.map(
          (s) =>
            new gmaps.Marker({
              position: s.coords,
              map,
              title: s.name,
              zIndex: 40,
              icon: {
                url: sprites.shopPng,
                scaledSize: new gmaps.Size(38, 38),
                anchor: new gmaps.Point(19, 34),
              },
            })
        )

        // Cluster Marker for low zoom levels (zoom <= 13)
        clusterMarkerRef.current = new gmaps.Marker({
          position: shopCoords,
          map: null,
          zIndex: 45,
          label: {
            text: String(allShops.length),
            color: '#FFFFFF',
            fontWeight: 'bold',
            fontSize: '12px',
          },
          icon: {
            url: sprites.clusterPng,
            scaledSize: new gmaps.Size(36, 36),
            anchor: new gmaps.Point(18, 18),
          },
        })

        // Shop clustering toggle on zoom_changed
        map.addListener('zoom_changed', () => {
          const z = map.getZoom() ?? 14
          const showCluster = z <= 13 && allShops.length > 1
          shopMarkersRef.current.forEach((m) => m.setMap(showCluster ? null : map))
          clusterMarkerRef.current?.setMap(showCluster ? map : null)
        })

        // Driver Car Marker (always on top via high zIndex: 999)
        const initialFrameIdx = Math.round(animStateRef.current.currentBearing / 5) % 72
        driverMarkerRef.current = new gmaps.Marker({
          position: {
            lat: animStateRef.current.currentLat,
            lng: animStateRef.current.currentLng,
          },
          map,
          title: 'Driver',
          zIndex: 999,
          optimized: false,
          icon: {
            url: sprites.carFrames[initialFrameIdx],
            scaledSize: new gmaps.Size(40, 40),
            anchor: new gmaps.Point(20, 20),
          },
        })

        // Initial fitBounds with UI padding
        fitAllBounds()
        setMapReady(true)
      })
      .catch(() => {
        if (!cancelled) setMapError('Could not load Google Maps.')
      })

    return () => {
      cancelled = true
    }
  }, [shopCoords, customerCoords, shopName, nearbyShops, fitAllBounds])

  // Smooth requestAnimationFrame Loop (1-second easeInOutCubic interpolation, no setTimeout)
  useEffect(() => {
    if (!mapReady) return
    const gmaps = (window as any).google?.maps
    if (!gmaps) return
    const sprites = getMarkerSprites()

    let running = true
    const tick = (now: number) => {
      if (!running) return
      const st = animStateRef.current

      if (st.startTime > 0) {
        const elapsed = now - st.startTime
        const rawT = Math.min(1, elapsed / st.duration)
        const eased = easeInOutCubic(rawT)

        st.currentLat = st.fromLat + (st.toLat - st.fromLat) * eased
        st.currentLng = st.fromLng + (st.toLng - st.fromLng) * eased
        st.currentBearing = interpolateBearing(st.fromBearing, st.toBearing, eased)

        const marker = driverMarkerRef.current
        if (marker) {
          marker.setPosition({ lat: st.currentLat, lng: st.currentLng })
          const frameIdx = Math.round(st.currentBearing / 5) % 72
          marker.setIcon({
            url: sprites.carFrames[frameIdx],
            scaledSize: new gmaps.Size(40, 40),
            anchor: new gmaps.Point(20, 20),
          })
        }

        if (isFollowingRef.current && mapRef.current && rawT < 1) {
          mapRef.current.panTo({ lat: st.currentLat, lng: st.currentLng })
        }
      }

      st.rafId = requestAnimationFrame(tick)
    }

    animStateRef.current.rafId = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(animStateRef.current.rafId)
    }
  }, [mapReady])

  // Real-Time WebSocket (Socket.IO / WebSocket) Driver Feed — throttled to 1 update/sec
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL
    if (socketUrl) {
      const wsUrl = socketUrl.replace(/^http/, 'ws')
      const ws = new WebSocket(`${wsUrl}/socket.io/?EIO=4&transport=websocket`)
      setConnectionMode('websocket')

      ws.onopen = () => {
        ws.send('40')
        ws.send(`42${JSON.stringify(['join:order', { orderId }])}`)
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string' && event.data.startsWith('42')) {
          try {
            const [eventName, payload] = JSON.parse(event.data.slice(2))
            if (eventName === 'driver:location' && payload?.lat && payload?.lng) {
              pushDriverUpdate({
                lat: Number(payload.lat),
                lng: Number(payload.lng),
                bearing: Number(payload.bearing ?? 0),
                timestamp: Date.now(),
              })
            }
          } catch {
            // ignore non-JSON frames
          }
        }
      }

      return () => ws.close()
    }

    // Fallback live 1Hz telemetry stream along route when no external Socket.IO server is configured
    setConnectionMode('live-sim')
    let lastEmit = 0
    let rafSim = 0
    const startMs = performance.now()
    const totalTripMs = 45_000

    const step = (now: number) => {
      if (now - lastEmit >= 1000) {
        lastEmit = now
        const progressBase = orderStage >= 3 ? 1 : orderStage >= 2 ? 0.55 : 0.12
        const cycle = ((now - startMs) % totalTripMs) / totalTripMs
        const p = Math.min(1, Math.max(progressBase, cycle))
        const sampled = sampleAlongRoute(routePathRef.current, p)

        pushDriverUpdate({
          lat: sampled.lat,
          lng: sampled.lng,
          bearing: sampled.bearing,
          timestamp: Date.now(),
        })
      }
      rafSim = requestAnimationFrame(step)
    }

    rafSim = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafSim)
  }, [orderId, shopCoords, customerCoords, orderStage, pushDriverUpdate])

  return (
    <div className="relative h-72 w-full overflow-hidden bg-[#F4F4F2]">
      <div ref={mapContainerRef} className="h-full w-full" />

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#F4F4F2] p-4 text-center text-xs font-medium text-[#545454]">
          {mapError}
        </div>
      )}

      {/* Clean Live Route Icon Badge (no pulsing dot, no Lucide) */}
      <div
        className="pointer-events-none absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#287d46] shadow-md ring-1 ring-black/8"
        aria-label={connectionMode === 'websocket' ? 'Live Socket Tracking' : 'Live Route Tracking'}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-[#287d46]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="3 11 22 2 13 21 11 13 3 11" fill="currentColor" />
        </svg>
      </div>

      {/* Recenter & Follow Mode Controls */}
      <div className="absolute bottom-6 right-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-md transition-all active:scale-95',
            isFollowing
              ? 'bg-[#287d46] text-white'
              : 'bg-white text-[#111111] ring-1 ring-black/10'
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          <span>{isFollowing ? 'Following' : 'Recenter'}</span>
        </button>
      </div>
    </div>
  )
}
