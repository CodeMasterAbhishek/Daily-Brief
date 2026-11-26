const CACHE_NAME = 'daily-brief-v9';
const R2_ORIGIN = 'https://pub-80d5b317212242cab2851c0cd4fe7b89.r2.dev';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/variables.css',
    './css/layout.css',
    './css/style.css',
    './js/preload.js',
    './js/app.js',
    './js/api.js',
    './js/ui.js',
    './manifest.json',
    './data/countries.json',
    './assets/images/fallback.svg',
    './assets/images/icon.svg',
    './assets/images/icon-192.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);
    if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return;
    if (requestUrl.origin !== self.location.origin && requestUrl.origin !== R2_ORIGIN) return;

    // Archive & config JSON: Network-First, caching under URL without ?t= cache-buster
    if (requestUrl.pathname.endsWith('.json')) {
        const cacheKey = `${requestUrl.origin}${requestUrl.pathname}`;
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.ok) {
                        const clonedResponse = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clonedResponse));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(cacheKey);
                    return cached || Response.error();
                })
        );
        return;
    }

    // Same-origin app shell & static assets: Network-First with cache fallback
    if (requestUrl.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.ok) {
                        const clonedResponse = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clonedResponse));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request, { ignoreSearch: true });
                    if (cached) return cached;
                    if (event.request.mode === 'navigate') {
                        const indexFallback = await caches.match('./index.html', { ignoreSearch: true });
                        if (indexFallback) return indexFallback;
                    }
                    return Response.error();
                })
        );
    }
});
