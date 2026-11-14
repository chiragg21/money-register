const CACHE = 'money-register-v4';
const FILES = ['./', './index.html', './styles.css', './manifest.json', './icon.svg',
  './js/main.js', './js/core.js', './js/util.js', './js/engine.js', './js/store.js', './js/kit.js',
  './js/sheets.js', './js/views-main.js', './js/views-dues.js', './js/views-more.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first so a new deploy shows up immediately; the cache is the offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
