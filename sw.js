const CACHE_NAME = 'vertextrade-cache-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  // network-first for API calls; cache-first for app shell
  if(evt.request.url.includes('api.coingecko.com')){
    evt.respondWith(
      fetch(evt.request).catch(()=> caches.match(evt.request))
    );
    return;
  }
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request))
  );
});
