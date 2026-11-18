// Service worker: permite instalar o app e abrir a interface sem internet.
// Os dados vêm do Firebase; arquivos do app usam "rede primeiro, cache depois".
const CACHE = 'loteamentos-v2';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/state.js', 'js/util.js', 'js/ops.js', 'js/precos.js',
  'js/firebase-config.js', 'js/views/mapa.js', 'js/views/historico.js', 'js/views/config.js',
  'data/loteamentos.json', 'data/mapa.json', 'data/precos.json', 'img/icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
