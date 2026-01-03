const CACHE_NAME = 'math-adventure-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './assets/hero.svg',
  './assets/bg.svg',
  './assets/star.svg',
  './assets/coin.svg',
  './assets/badge.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => { if(k !== CACHE_NAME) return caches.delete(k); })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      // cache new GET responses
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => { try{ c.put(req, copy); }catch(e){} });
      return res;
    }).catch(()=> caches.match('./index.html')))
  );
});
