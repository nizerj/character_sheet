const CACHE_NAME = 'life-sheet-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/themes.css',
  './css/style.css',
  './assets/icon-192.png',
  './assets/skills/academics.png',
  './assets/skills/culture.png',
  './assets/skills/fitness.png',
  './assets/skills/charisma.png',
  './assets/skills/productivity.png',
  './js/constants.js',
  './js/state.js',
  './js/radar.js',
  './js/backup.js',
  './js/healthconnect.js',
  './js/audio.js',
  './js/achievements.js',
  './js/bosses.js',
  './js/shop.js',
  './js/bounties.js',
  './js/cardExport.js',
  './js/timer.js',
  './js/analytics.js',
  './js/notifications.js',
  './js/ui.js',
  './js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-First strategy: always gets live updates when online, falls back to cache when offline
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(networkRes => {
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return networkRes;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
