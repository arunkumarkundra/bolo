/* Bolo service worker: lets the app open and speak without internet.
   When you publish a new version, change VERSION below so phones pick up the new files. */
const VERSION = 'bolo-1.1.0';
const FONTS = 'bolo-fonts';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = res => res && res.ok && res.type === 'basic';

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: keep a copy so the letters look right offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // The page itself: try the internet first (for updates), but never make the user wait more than 3 s.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req).then(res => { if (keep(res)) cache.put('./', res.clone()); return res; });
      const cached = await cache.match('./') || await cache.match('./index.html');
      if (!cached) return net;
      return Promise.race([
        net.catch(() => cached),
        new Promise(r => setTimeout(() => r(cached), 3000))
      ]);
    })());
    return;
  }

  // Icons, manifest and other files: answer from the copy at once, refresh it in the background.
  event.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (keep(res)) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
