const CACHE_NAME = 'pawon-pos-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js'
];

// Proses Install & Simpan ke Cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Proses Hapus Cache Lama Jika Ada Versi Baru
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Proses Menarik Data (Bisa tanpa Internet)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Gunakan cache jika ada, jika tidak ambil dari internet
                return response || fetch(event.request);
            })
    );
});
