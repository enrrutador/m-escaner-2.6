/* ©️ [2024] [SYSMARKETHM]. Todos los derechos reservados. Service Worker para M-Scanner 2.0 - Soporte offline + cache de APIs VTEX/Constructor.io */

const CACHE_VERSION = 'mscanner-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './image/1.jpg',
  './image/icon-192.png',
  './image/icon-512.png',
  './image/apple-touch-icon.png',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js',
  'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js'
];

const API_CACHE_NAME = 'mscanner-api-v2';

// Dominios de APIs que se cachean network-first (offline friendly)
const API_ORIGINS = new Set([
  'https://www.jumbo.com.ar',
  'https://www.carrefour.com.ar',
  'https://www.farmacity.com',
  'https://cors.eu.org',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION && name !== API_CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1) Same-origin assets: cache-first (fallback a index.html para SPA)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return networkResponse;
        }).catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // 2) APIs de los proveedores: network-first, cache fallback (stale-while-revalidate light)
  // (Los nombres de dominio son de uso interno; no se exponen en la UI)
  if (API_ORIGINS.has(url.origin)) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(API_CACHE_NAME).then((c) => c.put(request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // 3) CDN de xlsx y ZXing: stale-while-revalidate
  if (url.origin === 'https://cdn.sheetjs.com' ||
      url.origin === 'https://cdnjs.cloudflare.com' ||
      url.origin === 'https://unpkg.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 4) Default: try network, fallback to cache
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});