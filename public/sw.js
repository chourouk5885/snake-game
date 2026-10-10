/* Snake service worker — hand-written, no libraries.
 *
 * - The page (navigation requests): network first, so a new deploy shows up
 *   as soon as you're online; falls back to the cached page offline.
 * - Assets (scripts, styles, icons, fonts): cache first for instant loads,
 *   refreshed in the background (stale-while-revalidate).
 *
 * The build fills in PRECACHE and VERSION (see vite.config.ts), so every file
 * of the current build is cached at install time and the game works offline
 * right after the first visit.
 */

const VERSION = '__BUILD_VERSION__';
const PRECACHE = self.__PRECACHE_MANIFEST__ || [];
const APP_CACHE = `snake-app-${VERSION}`;
const RUNTIME_CACHE = 'snake-runtime';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const scope = self.registration.scope;
const toUrl = (path) => new URL(path, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      const urls = [scope, ...PRECACHE.filter((p) => p !== 'index.html').map(toUrl)];
      await cache.addAll(urls);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('snake-') && name !== APP_CACHE && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.href.startsWith(scope)) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  const sameScope = url.href.startsWith(scope);
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (sameScope || isFont) {
    event.respondWith(staleWhileRevalidate(event, request, sameScope ? APP_CACHE : RUNTIME_CACHE));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(scope, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match(scope));
    if (cached) return cached;
    return new Response('<h1>Offline</h1><p>Snake has not been cached yet. Connect once and reload.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const response = await refresh;
  return response || Response.error();
}
