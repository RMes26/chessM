// Service worker : jeu hors ligne + mise à jour automatique (réseau d'abord pour le code)
const V = 'chessm-v5';
const Q = '?v=5'; // même numéro que dans index.html et les imports
const CORE = ['./', 'index.html', 'credits.html', 'css/style.css' + Q, 'lib/pieces.css', 'lib/chess.js', 'lib/peerjs.min.js',
  'lib/stockfish-18-lite-single.js', 'lib/stockfish-18-lite-single.wasm', 'js/app.js' + Q, 'js/board.js' + Q, 'js/engine.js' + Q,
  'js/analysis.js' + Q, 'js/callout.js' + Q, 'fonts/cormorant-garamond-latin-600-normal.woff2', 'fonts/cormorant-garamond-latin-700-normal.woff2', 'js/sound.js' + Q, 'js/online.js' + Q, 'js/rating.js' + Q, 'js/fx.js' + Q, 'js/puzzles.js' + Q, 'data/puzzles.json',
  'sounds/move_white.wav', 'sounds/move_black.wav', 'sounds/capture_white.wav', 'sounds/capture_black.wav',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const heavy = /\/(lib|sounds|icons|fonts)\//.test(u.pathname);
  if (heavy) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); return res; })));
  } else {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
