# Hoy toca: PWA de actividades y recordatorios

PWA con CRUD sobre **IndexedDB**, **Service Worker** (offline), **Notifications API**, **Push API** con backend,
**sincronización** al recuperar la conexión y despliegue con HTTPS.

## Estructura
```
public/            La PWA (HTML, CSS, JS, manifest, íconos, sw.js)
  db.js            IndexedDB: activities, outbox (cambios pendientes), meta
  sync.js          Envía la outbox y recibe cambios del servidor
  sw.js            Caché offline, Background Sync y push
  app.js           Interfaz, CRUD, recordatorios, ajustes
server.js          Express: sirve /public, API /api/sync y /api/push/*
```

## Ejecutar en local
```bash
npm install
npm start            # http://localhost:3000 (localhost cuenta como contexto seguro)
```

## Requisitos de la práctica y dónde están
| # | Requisito | Dónde |
|---|-----------|-------|
| 1-2 | PWA con CRUD | `public/app.js` (formulario, editar, marcar hecha, eliminar con deshacer) |
| 3 | IndexedDB | `public/db.js` |
| 4 | Caché con Service Worker | `public/sw.js`: precache del shell, network-first en navegación, stale-while-revalidate en estáticos |
| 5 | Notifications API y Push | `checkReminders()` en `app.js`; push en `sw.js` + `server.js` (VAPID) |
| 6 | Sincronización | outbox en `db.js`, `sync.js`, evento `online`, Background Sync en `sw.js` |
| 7 | Hosting con HTTPS | Render (ver abajo) |
| 8 | Lighthouse | Ver abajo |

Sincronización: cada cambio local se guarda en `activities` y se encola en `outbox` en la misma transacción.
Al haber conexión se envía a `POST /api/sync`. En conflicto gana el `updatedAt` más reciente (last-write-wins).

## Publicar en Render (HTTPS incluido)
1. Sube esta carpeta a un repositorio de GitHub.
2. En Render: **New > Web Service**, conecta el repo. Build: `npm install`. Start: `npm start`.
3. Genera claves push con `npm run vapid` y crea estas variables de entorno en Render:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (por ejemplo `mailto:tu_correo@dominio.com`).
4. Abre la URL `https://....onrender.com`. Esa es tu URL pública.

Notas:
- El plan gratuito usa disco efímero: si el servidor reinicia pierde `data.json`. La app lo detecta (`reset`) y vuelve a subir los datos locales.
- Si solo quieres hosting estático (GitHub Pages/Netlify), la PWA funciona completa salvo la sincronización y el push. Para tener ambos, deja el backend en Render y pon su URL en `public/config.js` (`API: 'https://tu-app.onrender.com/api'`).

## Probar offline (para capturas y video)
1. Abre la app en Chrome, espera a que cargue y crea 2 o 3 actividades.
2. DevTools > Application > Service Workers: verifica "activated and running". En Cache Storage verás `shell-v1`.
3. DevTools > Network > **Offline** (o modo avión) y recarga: la app abre.
4. Crea, edita y elimina actividades sin conexión: el indicador muestra "Sin conexión" y "N cambios por enviar".
5. Desactiva Offline: el contador baja a "Todo sincronizado".
6. Ajustes > **Activar avisos** > **Probar aviso**. Crea una actividad con recordatorio "A la hora" para dentro de 2 minutos.
7. Ajustes > **Activar push** > **Enviar push de prueba**; cierra la pestaña y vuelve a enviarlo desde otro dispositivo o el servidor para mostrar que llega con la app cerrada.

## Lighthouse
1. Abre la URL pública en una ventana de incógnito de Chrome.
2. DevTools > Lighthouse > Mobile, marca Performance, Accessibility, Best practices y SEO > Analyze.
3. Guarda el reporte: menú de tres puntos > **Save as HTML** (y captura la pantalla de puntuaciones).
4. En las versiones recientes de Lighthouse ya no hay categoría PWA: revisa la instalabilidad en DevTools > Application > Manifest.
5. Corrige lo que marque, vuelve a correr y entrega el antes y el después.

Ya incluye: `lang`, viewport, `theme-color`, descripción, etiquetas en formularios, objetivos táctiles de 44 px o más, contraste AA, compresión gzip y encabezados de caché.

## Video demostrativo (guion de 2 a 3 minutos)
URL con candado HTTPS, crear/editar/eliminar, modo offline y recarga, vuelta en línea con la sincronización, aviso local, push con la app cerrada y reporte Lighthouse.
