/* Service Worker: caché offline, sincronización en segundo plano y notificaciones push. */
importScripts('./config.js', './db.js', './sync.js');

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const SHELL = ['./', './index.html', './styles.css', './app.js', './db.js', './sync.js', './config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg'];

// Instalación: precache del app shell. (La activación espera a que el usuario pulse "Actualizar".)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
});

// Activación: elimina cachés de versiones anteriores y toma el control.
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, RUNTIME_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

// Estrategias:
//  - Navegación (HTML): network-first con tiempo límite; sin red, se sirve el shell en caché.
//  - Archivos estáticos: stale-while-revalidate (responde al instante y actualiza en segundo plano).
//  - /api/*: nunca se cachea (la sincronización la maneja IndexedDB + outbox).
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(rej, 3000))]);
        if (res.ok) cache.put(INDEX_URL, res.clone());
        return res;
      } catch {
        return (await cache.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async res => {
      if (res.ok) (await caches.open(cached ? SHELL_CACHE : RUNTIME_CACHE)).put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

// Background Sync: el navegador lo dispara cuando vuelve la conexión, aunque la app esté cerrada.
self.addEventListener('sync', e => {
  if (e.tag !== 'sync-activities') return;
  e.waitUntil(Sync.run().then(async r => {
    if (!r.ok) throw new Error('sync pendiente'); // hace que el navegador reintente
    for (const c of await self.clients.matchAll()) c.postMessage({ type: 'synced' });
  }));
});

// Push: muestra la notificación enviada por el backend.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Recordatorio', {
    body: d.body || '', icon: './icons/icon-192.png', tag: d.tag, vibrate: [120, 60, 120], data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow(e.notification.data?.url || './');
  })());
});
