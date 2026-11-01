const CACHE_NAME = 'unieats-shell-v1'
const PRECACHE_URLS = ['/', '/icon-192.png', '/icon-512.png', '/unieats-logo.jpg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key)
            }
            return Promise.resolve()
          })
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache API routes, Paystack, or Firebase requests
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('paystack.co')
  ) {
    return
  }

  // Network-first strategy with cache fallback for offline resilience
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((cached) => cached || caches.match('/'))
    )
  )
})

