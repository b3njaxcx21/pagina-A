// Service worker: permite instalar la app y abrirla aunque falle la red.
// Siempre intenta traer la versión más nueva; si no hay internet usa la guardada.
const CACHE = 'nosotros-v32';
const ARCHIVOS = ['./', './index.html', './styles.css', './app.js', './tema-temprano.js', './vendor/supabase.js', './fonts/mystery-quest-latin.woff2', './fonts/mystery-quest-latin-ext.woff2', './legal/privacidad.html', './legal/terminos.html', './legal/cookies.html', './legal/reembolsos.html', './legal/creditos.html', './legal/legal.css', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo manejamos archivos de la propia página (no Supabase ni otros sitios)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
