// 산행지도 오프라인 저장: 앱 파일은 미리 저장, 지도 그림(타일)은 한 번 본 것을 저장해 두고 신호 없을 때 꺼내 씀.
const APP = 'sanhaeng-app-v5';
const TILES = 'sanhaeng-tiles-v1';
const MAX_TILES = 4000; // 대략 60~100MB
const APP_FILES = ['./', 'index.html', 'app.js', 'sync.js', 'search.html', 'search-frame.js', 'lib/leaflet.js', 'lib/leaflet.css', 'manifest.json', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== TILES).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isTile = url => /api\.vworld\.kr\/req\/wmts|map\.ngii\.go\.kr\/openapi\/Gettile|tile\.opentopomap\.org|tile\.openstreetmap\.org|server\.arcgisonline\.com/.test(url);

async function trim(cache){
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (isTile(url)) {
    // 지도 그림: 저장본 먼저, 없으면 받아서 저장
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(url);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (r.ok || r.type === 'opaque') { c.put(url, r.clone()); trim(c); }
        return r;
      } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (new URL(url).origin === location.origin) {
    // 앱 파일: 인터넷 되면 최신, 안 되면 저장본
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  }
});
