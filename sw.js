// Service worker: permite instalar la app y abrirla aunque falle la red.
// Siempre intenta traer la versión más nueva; si no hay internet usa la guardada.
const CACHE = 'nosotros-v17';
const ARCHIVOS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

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

// Al tocar el contador de la barra de notificaciones: abre la app y lo deja fijo otra vez
self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  e.notification.close();
  e.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (lista.length) await lista[0].focus();
    else await self.clients.openWindow('./');
    if (n.tag === 'contador') {
      await self.registration.showNotification(n.title, {
        body: n.body, tag: n.tag, icon: n.icon, badge: n.badge, requireInteraction: true, silent: true,
      });
    }
  })());
});
