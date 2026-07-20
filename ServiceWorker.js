const CACHE_NAME = 'daily-brief-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/variables.css',
    '/css/layout.css',
    '/css/style.css',
    '/js/app.js',
    '/js/api.js',
    '/js/ui.js',
    '/manifest.json'
];

// Install event - Cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(STATIC_ASSETS);
            })
    );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => {
                    return name !== CACHE_NAME;
                }).map(name => {
                    return caches.delete(name);
                })
            );
        })
    );
});

// Fetch event - Cache falling back to network, and network falling back to cache for data
self.addEventListener('fetch', event => {
    // For the news data JSON, try network first, then cache (Stale-While-Revalidate pattern)
    if (event.request.url.includes('data/news.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Update cache with new data
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clonedResponse);
                    });
                    return response;
                })
                .catch(() => {
                    // If network fails, return cached data
                    return caches.match(event.request);
                })
        );
    } else {
        // For static assets, Cache First, falling back to network
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request);
                })
        );
    }
});
