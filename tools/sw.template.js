// LexiCards – praca bez internetu.
//
// Przy instalacji pobiera komplet plików aplikacji do pamięci podręcznej oznaczonej wersją.
// Każda zmiana dowolnego pliku zmienia wersję, więc przeglądarka pobiera nowy komplet
// i nigdy nie miesza plików z dwóch wydań.

const VERSION = '__BUILD_ID__';
const CACHE = `lexicards-${VERSION}`;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` omija pamięć HTTP przeglądarki – do kompletu trafiają aktualne pliki.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('lexicards-') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Otwarcie aplikacji (adres katalogu albo index.html) zawsze dostaje stronę główną.
  const scopePath = new URL(self.registration.scope).pathname;
  const opensApp = request.mode === 'navigate'
    && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = opensApp
      ? await cache.match('index.html')
      : await cache.match(request, { ignoreSearch: true });
    return cached ?? fetch(request);
  })());
});
