// Dividend Flow service worker. Bump VERSION on each release.
const VERSION = 'df-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './data/index.json'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    // precache the bundled ticker files so holdings work offline
    try { const idx = await (await fetch('./data/index.json')).json(); await c.addAll(idx.tickers.map(t => `./data/${t.ticker}.json`)); } catch { /* best effort */ }
    // precache the built JS/CSS referenced by index.html
    try { const html = await (await fetch('./index.html')).text(); const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map(m => './' + m[1]); await c.addAll(assets); } catch { /* best effort */ }
  }));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network-first for HTML and data (fresh numbers), cache fallback offline; cache-first for hashed assets/icons
  const fresh = e.request.mode === 'navigate' || u.pathname.includes('/data/');
  if (fresh) e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
  else e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); return res; })));
});
