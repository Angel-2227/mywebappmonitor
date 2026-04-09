// sw.js — Service Worker para MyPages PWA
const CACHE_NAME = 'mypages-v1';

// Archivos a cachear para uso offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/ai.js',
  '/manifest.json'
];

// Instalación: cachear assets estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si algún asset falla, continuar igual
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network First para Firebase/API, Cache First para assets locales
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Requests externos (Firebase, Anthropic API, etc.) → siempre red
  if (url.origin !== self.location.origin) {
    return; // dejar que el browser lo maneje normalmente
  }

  // Assets locales → Cache First con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachear respuestas exitosas de assets estáticos
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, toCache);
          });
        }
        return response;
      }).catch(() => {
        // Offline y no está en caché: devolver index.html
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
