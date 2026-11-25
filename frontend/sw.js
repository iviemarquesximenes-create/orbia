'use strict';

// Parent build replaces this version with the validated content hash automatically.
const CACHE_NAME = 'orbia-public-da6bb8fcdb255141';
const PRECACHE_PATHS = Object.freeze([
  '/offline.html',
  '/css/offline.css',
  '/assets/pwa/icon-192.png'
]);
const PUBLIC_ASSET_PATHS = new Set([
  '/css/offline.css',
  '/assets/pwa/icon-192.png'
]);
const PROTECTED_PATH_PREFIXES = Object.freeze([
  '/api',
  '/auth',
  '/manus-oauth',
  '/__manus',
  '/__system__',
  '/manus-storage'
]);

function workerUrl(request) {
  try {
    return new URL(request.url, self.location.origin);
  } catch (_error) {
    return null;
  }
}

function decodedPathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch (_error) {
    return pathname;
  }
}

function isProtectedPath(pathname) {
  const paths = [pathname, decodedPathname(pathname)];
  return PROTECTED_PATH_PREFIXES.some((prefix) => paths.some((path) => (
    path === prefix || path.startsWith(`${prefix}/`)
  )));
}

function isPublicAsset(pathname) {
  return PUBLIC_ASSET_PATHS.has(pathname);
}

function precacheRequests() {
  return PRECACHE_PATHS.map((path) => new Request(
    new URL(path, self.location.origin).toString(),
    { credentials: 'omit', cache: 'reload' }
  ));
}

async function offlinePageFromCurrentCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const page = await cache.match(new URL('/offline.html', self.location.origin).toString());
    if (page) return page;
  } catch (_error) {
    // Storage can be cleared or evicted by the operating system.
  }
  return new Response('ORBIA está sem conexão. Conecte-se à internet e tente novamente. Nenhum envio foi realizado.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function cacheFirstPublicAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  // A public asset is never stored at runtime. Omit session credentials if a
  // browser has to recover it from the network after an incomplete install.
  return fetch(new Request(request, { credentials: 'omit' }));
}

async function networkFirstNavigation(request) {
  try {
    // Keep the original navigation request and response. In particular, do
    // not turn resolved HTTP 401/403/500 responses into the public offline page.
    return await fetch(request);
  } catch (_error) {
    return offlinePageFromCurrentCache();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(precacheRequests()))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('orbia-public-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = workerUrl(request);
  if (!url || url.origin !== self.location.origin || isProtectedPath(url.pathname)) return;

  if (isPublicAsset(url.pathname)) {
    event.respondWith(cacheFirstPublicAsset(request));
    return;
  }

  if (request.mode !== 'navigate') return;
  event.respondWith(networkFirstNavigation(request));
});
