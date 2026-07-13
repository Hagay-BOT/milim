/* service worker — offline cache. Bump V to push an update to installed apps. */
const V = 'hw-v6';
const ASSETS = [
  './', './index.html', './app.js', './data.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const cp = res.clone();
          caches.open(V).then(c => c.put(req, cp));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
