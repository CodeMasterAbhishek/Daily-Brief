const CACHE_NAME = 'daily-brief-v5';
const STATIC_ASSETS = [
    './index.html',
    './css/variables.css',
    './css/layout.css',
    './css/style.css',
    './js/app.js',
    './js/api.js',
    './js/ui.js',
    './manifest.json',
    './assets/images/fallback.svg'
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
    const requestUrl = new URL(event.request.url);

    if (requestUrl.pathname.includes('/data/') && requestUrl.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response && response.ok) {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clonedResponse);
                    });
                }
                return response;
            }).catch(() => caches.match(event.request, { ignoreSearch: true }))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
