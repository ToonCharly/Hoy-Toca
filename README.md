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
1. En Render: **New > Blueprint**, conecta este repositorio y confirma el servicio definido en `render.yaml`.
2. Genera claves push localmente con `npm run vapid`. En Render, introduce `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` como variables secretas del servicio. No las subas a GitHub.
3. Espera a que el despliegue pase el chequeo `/api/health` y copia la URL HTTPS del backend.
4. Pon la URL del backend seguida de `/api` en `public/config.js`, por ejemplo:
   `API: 'https://hoy-toca-tooncharly-api.onrender.com/api'`.
5. Publica el cambio de `public/` en `gh-pages` usando el comando de la sección de GitHub Pages.

Notas:
- El plan gratuito usa disco efímero: si el servidor reinicia pierde `data.json`. La app lo detecta (`reset`) y vuelve a subir los datos locales.
- Si solo quieres hosting estático (GitHub Pages/Netlify), la PWA funciona completa salvo la sincronización y el push. Para tener ambos, deja el backend en Render y pon su URL en `public/config.js` (`API: 'https://tu-app.onrender.com/api'`).

## Publicar la PWA estática en GitHub Pages
La rama `gh-pages` contiene el contenido de `public/` en su raíz. En GitHub, abre **Settings > Pages**,
elige **Deploy from a branch**, selecciona `gh-pages` y `/(root)`, y guarda. La URL será
`https://tooncharly.github.io/Hoy-Toca/`.

Para publicar cambios posteriores de `public/`, ejecuta desde `main`:
```bash
git subtree push --prefix=public origin gh-pages
```

GitHub Pages sirve solo archivos estáticos: el CRUD, IndexedDB, avisos locales y modo offline funcionan;
sincronización entre dispositivos y Push requieren desplegar el backend con HTTPS y configurar `API`
en `public/config.js`. El despliegue automático con GitHub Actions requiere que la cuenta pueda ejecutar
Actions; si se restablece, el workflow se puede volver a agregar.

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
