/**
 * AuditSec — Service Worker
 * Maneja el cache para funcionamiento 100% offline
 */

const CACHE_NAME = 'auditsec-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
];

// INSTALL — cachear assets en instalación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache los assets locales siempre; las fuentes de Google pueden fallar en la primera instalación
      const localAssets = ['/', '/index.html', '/app.js', '/manifest.json'];
      return cache.addAll(localAssets).catch(err => {
        console.warn('Cache parcial en instalación:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE — limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH — estrategia cache-first para assets, network-first para otros
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo manejar GET
  if (event.request.method !== 'GET') return;

  // Cache-first para assets de la app
  if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => {
          // Si falla la red y no hay cache, devolver página principal
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
});
