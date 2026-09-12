const CACHE = 'hockey-goalie-trials-v1-7-sidebar-app-links';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/trials-banner-v1-7.png','./assets/icon-192-v1-7.png','./assets/icon-512-v1-7.png','./assets/ddd-banner-v1-7.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
});
