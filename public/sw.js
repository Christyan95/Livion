// ============================================================================
// LIVION PWA — SERVICE WORKER (Cache de App Shell & Suporte Offline)
// Nota: Os binários de PDF são armazenados no IndexedDB ('livion-offline-db')
//       para leitura instantânea e custo zero de tráfego repetido (RN02).
// ============================================================================

const CACHE_NAME = 'livion-shell-v2';
const ASSETS_ESSENCIAIS = [
  '/manifest.json',
  '/marca/icone-192.png',
  '/marca/icone-512.png',
  '/marca/logo-completa.png',
  '/marca/wordmark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_ESSENCIAIS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Ignora chamadas de API e autenticação
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});

