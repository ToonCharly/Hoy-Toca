'use strict';
/* Backend de Hoy toca: sirve la PWA, sincroniza actividades y envía notificaciones push. */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const webpush = require('web-push');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------- persistencia simple en un archivo JSON ---------- */
let db = { vapid: null, clients: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch { /* primera ejecución */ }
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(db), () => {}), 500); };

/* ---------- claves VAPID (para Web Push) ---------- */
let keys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else {
  console.warn('Aviso: sin VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY se generan claves temporales. En producción usa `npm run vapid` y guárdalas como variables de entorno.');
  keys = db.vapid || (db.vapid = webpush.generateVAPIDKeys());
  save();
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alumno@example.com', keys.publicKey, keys.privateKey);

/* ---------- utilidades ---------- */
const ID = /^[0-9a-f-]{36}$/i;
const client = id => db.clients[id] || (db.clients[id] = { rev: 0, activities: {}, subs: [], sent: {} });
const str = (v, n) => String(v ?? '').slice(0, n);
const clean = a => ({
  id: str(a.id, 64), title: str(a.title, 120), notes: str(a.notes, 500),
  dueAt: a.dueAt ? str(a.dueAt, 40) : null,
  remindMin: Number.isFinite(a.remindMin) ? a.remindMin : null,
  done: !!a.done, createdAt: +a.createdAt || Date.now(), updatedAt: +a.updatedAt || Date.now()
});

async function push(c, payload) {
  const body = JSON.stringify({ url: './', ...payload });
  const results = await Promise.all(c.subs.map(async s => {
    try { await webpush.sendNotification(s, body); return s; }
    catch (e) { return [404, 410].includes(e.statusCode) ? null : s; } // suscripción caducada
  }));
  c.subs = results.filter(Boolean);
  save();
}

/* ---------- API ---------- */
const app = express();
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Sincronización: recibe cambios del cliente y devuelve los cambios más recientes del servidor.
// Resolución de conflictos: gana la versión con `updatedAt` más reciente (last-write-wins).
app.post('/api/sync', (req, res) => {
  const { clientId, ops = [] } = req.body || {};
  if (!ID.test(clientId || '') || !Array.isArray(ops)) return res.status(400).json({ error: 'solicitud inválida' });
  const c = client(clientId);
  let since = +req.body.since || 0;
  const reset = since > c.rev; // el cliente conoce una versión que el servidor ya no tiene
  if (reset) since = 0;

  for (const op of ops.slice(0, 500)) {
    if (op.type === 'upsert' && op.activity?.id) {
      const inc = clean(op.activity), cur = c.activities[inc.id];
      if (!cur || inc.updatedAt >= cur.updatedAt) c.activities[inc.id] = { ...inc, rev: ++c.rev };
    } else if (op.type === 'delete' && op.id) {
      const id = str(op.id, 64), cur = c.activities[id], updatedAt = +op.updatedAt || Date.now();
      if (!cur || updatedAt >= cur.updatedAt) c.activities[id] = { id, deleted: true, updatedAt, rev: ++c.rev };
    }
  }
  save();
  res.json({ rev: c.rev, reset, changes: Object.values(c.activities).filter(a => a.rev > since) });
});

// Web Push
app.get('/api/push/public-key', (_req, res) => res.json({ key: keys.publicKey }));

app.post('/api/push/subscribe', (req, res) => {
  const { clientId, subscription } = req.body || {};
  if (!ID.test(clientId || '') || !subscription?.endpoint) return res.status(400).json({ error: 'solicitud inválida' });
  const c = client(clientId);
  c.subs = c.subs.filter(s => s.endpoint !== subscription.endpoint).concat(subscription);
  save();
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { clientId, endpoint } = req.body || {};
  if (!ID.test(clientId || '')) return res.status(400).json({ error: 'solicitud inválida' });
  const c = client(clientId);
  c.subs = c.subs.filter(s => s.endpoint !== endpoint);
  save();
  res.json({ ok: true });
});

app.post('/api/push/test', async (req, res) => {
  const { clientId } = req.body || {};
  if (!ID.test(clientId || '')) return res.status(400).json({ error: 'solicitud inválida' });
  await push(client(clientId), { title: 'Push de prueba', body: 'El servidor puede avisarte aunque la app esté cerrada.', tag: 'prueba' });
  res.json({ ok: true });
});

/* ---------- programador de recordatorios push (cada 30 s) ---------- */
const lapse = m => m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : `${m / 1440} d`;
setInterval(async () => {
  const now = Date.now();
  for (const c of Object.values(db.clients)) {
    if (!c.subs.length) continue;
    for (const a of Object.values(c.activities)) {
      if (a.deleted || a.done || !a.dueAt || a.remindMin == null) continue;
      const at = Date.parse(a.dueAt) - a.remindMin * 60000, key = `${a.dueAt}|${a.remindMin}`;
      if (now < at || now - at > 6 * 3600e3 || c.sent[a.id] === key) continue;
      c.sent[a.id] = key;
      await push(c, { title: a.title, body: a.remindMin ? `Empieza en ${lapse(a.remindMin)}` : 'Es la hora de tu actividad', tag: `${a.id}:${a.dueAt}` });
    }
  }
}, 30000);

/* ---------- archivos estáticos ---------- */
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, file) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Los íconos casi no cambian; el resto se revalida siempre (necesario para actualizar el Service Worker).
    res.setHeader('Cache-Control', file.includes(`${path.sep}icons${path.sep}`) ? 'public, max-age=604800' : 'no-cache');
  }
}));

app.listen(PORT, () => console.log(`Hoy toca escuchando en http://localhost:${PORT}`));
