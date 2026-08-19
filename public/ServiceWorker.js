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
    // For the news data JSON, implement true Stale-While-Revalidate pattern
    if (event.request.url.includes('/data/') && event.request.url.endsWith('.json')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
                const networkFetch = fetch(event.request).then(response => {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clonedResponse);
                    });
                    return response;
                }).catch(() => {
                    // Ignore network errors in the background
                });
                
                // Return cache immediately if available, otherwise wait for network
                return cachedResponse || networkFetch;
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
