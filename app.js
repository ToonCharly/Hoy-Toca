/* Interfaz de Hoy toca: CRUD, recordatorios, notificaciones, push, instalación y estado de red. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const api = p => (globalThis.APP_CONFIG?.API || './api') + p;
const S = { items: [], filter: 'todas', q: '' };
const REMIND = [['', 'Sin recordatorio'], [0, 'A la hora'], [5, '5 minutos antes'], [15, '15 minutos antes'], [60, '1 hora antes'], [1440, '1 día antes']];

/* ---------- utilidades ---------- */
const SVG = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  bell: '<path d="M6 17v-6a6 6 0 0112 0v6l1.5 2h-15zM10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'
};
const icon = n => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.classList.add('ico'); s.innerHTML = SVG[n];
  return s;
};
const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter(k => k != null && k !== false));
  return el;
};
const TIME = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = d => Math.round((dayStart(d) - dayStart(new Date())) / 864e5);
const dueLabel = iso => {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso), n = dayDiff(d);
  return `${n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : n === -1 ? 'Ayer' : DAY.format(d)}, ${TIME.format(d)}`;
};
const countdown = ms => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'menos de 1 min';
  const d = Math.floor(m / 1440), hr = Math.floor(m % 1440 / 60), mi = m % 60;
  return d ? `${d} d ${hr} h` : hr ? `${hr} h ${mi} min` : `${mi} min`;
};
const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const byDue = (a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.createdAt - b.createdAt;
const b64 = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const post = async (p, body) => { const r = await fetch(api(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(r.status); return r.json(); };

let toastTimer;
function toast(msg, act) {
  const t = $('#toast');
  t.replaceChildren(h('span', null, msg), act && h('button', { class: 'btn-link', type: 'button', onclick: () => { t.classList.remove('show'); act.fn(); } }, act.label));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), act ? 7000 : 3500);
}

/* ---------- render ---------- */
function renderHero() {
  const now = Date.now(), el = $('#hero');
  const next = S.items.filter(a => !a.done && a.dueAt && Date.parse(a.dueAt) >= now).sort(byDue)[0];
  el.replaceChildren();
  if (!next) {
    el.append(h('h2', { id: 'hero-h' }, 'Nada por ahora'), h('p', { class: 'hero-sub' }, 'Agrega una actividad con fecha y te avisamos a tiempo.'));
    return;
  }
  el.append(
    h('p', { class: 'hero-count' }, `en ${countdown(Date.parse(next.dueAt) - now)}`),
    h('h2', { id: 'hero-h' }, next.title),
    h('p', { class: 'hero-sub' }, dueLabel(next.dueAt)),
    h('button', { class: 'btn', type: 'button', onclick: () => toggle(next) }, 'Marcar como hecha'));
}

function groups() {
  const now = Date.now(), q = S.q.trim().toLowerCase();
  const list = S.items.filter(a => !q || `${a.title} ${a.notes || ''}`.toLowerCase().includes(q));
  const pend = list.filter(a => !a.done).sort(byDue);
  const upcoming = pend.filter(a => a.dueAt && Date.parse(a.dueAt) >= now);
  const g = [];
  if (S.filter !== 'hechas') g.push(
    ['Vencidas', pend.filter(a => a.dueAt && Date.parse(a.dueAt) < now), true],
    ['Hoy', upcoming.filter(a => dayDiff(new Date(a.dueAt)) === 0)],
    ['Próximas', upcoming.filter(a => dayDiff(new Date(a.dueAt)) > 0)],
    ['Sin fecha', pend.filter(a => !a.dueAt)]);
  if (S.filter !== 'pendientes') g.push(['Hechas', list.filter(a => a.done).sort((x, y) => y.updatedAt - x.updatedAt)]);
  return g.filter(x => x[1].length);
}

function item(a, late) {
  return h('li', { class: 'item' + (a.done ? ' done' : ''), 'data-id': a.id },
    h('button', { class: 'check', type: 'button', 'data-act': 'toggle', 'aria-pressed': String(a.done),
      'aria-label': (a.done ? 'Marcar como pendiente: ' : 'Marcar como hecha: ') + a.title }, icon('check')),
    h('div', { class: 'body' },
      h('p', { class: 'title' }, a.title),
      h('p', { class: 'meta' },
        h('span', { class: 'due' + (late && !a.done ? ' late' : '') }, (late && !a.done ? 'Vencida: ' : '') + dueLabel(a.dueAt)),
        a.dueAt && a.remindMin != null && h('span', { class: 'bell' }, icon('bell'), h('span', { class: 'sr' }, 'Con recordatorio'))),
      a.notes && h('p', { class: 'notes' }, a.notes)),
    h('div', { class: 'acts' },
      h('button', { class: 'icon-btn', type: 'button', 'data-act': 'edit', 'aria-label': 'Editar: ' + a.title }, icon('edit')),
      h('button', { class: 'icon-btn', type: 'button', 'data-act': 'del', 'aria-label': 'Eliminar: ' + a.title }, icon('trash'))));
}

function render() {
  renderHero();
  const g = groups(), el = $('#list');
  el.replaceChildren(...(g.length
    ? g.map(([name, items, late]) => h('section', null, h('h2', { class: late ? 'late' : '' }, name), h('ul', null, items.map(a => item(a, late)))))
    : [h('p', { class: 'empty' }, S.items.length ? 'No hay actividades que coincidan.' : 'Todavía no hay actividades. Toca "Nueva actividad" para empezar.')]));
}

async function status() {
  const n = (await Store.outbox()).length, online = navigator.onLine, last = await Store.getMeta('lastSync');
  $('#net').dataset.state = online ? 'on' : 'off';
  $('#net-text').textContent = online ? 'En línea' : 'Sin conexión';
  $('#pending').textContent = n ? `${n} ${n === 1 ? 'cambio' : 'cambios'} por enviar` : last ? 'Todo sincronizado' : 'Guardado en este dispositivo';
}

/* ---------- datos y sincronización ---------- */
const load = async () => { S.items = await Store.all(); render(); };

async function syncNow(quiet) {
  const r = await Sync.run();
  if (r.ok) await load();
  status();
  if (!quiet) toast(r.ok ? 'Sincronizado' : r.reason === 'disabled' ? 'Esta versión guarda datos solo en este dispositivo' : r.reason === 'offline' ? 'Sin conexión: los cambios se enviarán al volver' : 'No se pudo contactar al servidor');
  return r;
}

async function afterChange() {
  await load(); status();
  try { await (await navigator.serviceWorker.ready).sync.register('sync-activities'); } catch { /* Background Sync no disponible */ }
  if (navigator.onLine) syncNow(true);
}

async function toggle(a) { await Store.save({ ...a, done: !a.done, updatedAt: Date.now() }); afterChange(); }

async function del(a) {
  await Store.remove(a.id, Date.now());
  await afterChange();
  toast('Actividad eliminada', { label: 'Deshacer', fn: async () => { await Store.save({ ...a, updatedAt: Date.now() }); afterChange(); } });
}

/* ---------- formulario ---------- */
const dlgForm = $('#dlg-form');
let editing = null;
function remindState() { $('#f-remind').disabled = !$('#f-due').value; }
function openForm(a) {
  editing = a || null;
  $('#form-title').textContent = a ? 'Editar actividad' : 'Nueva actividad';
  $('#f-submit').textContent = a ? 'Guardar cambios' : 'Guardar actividad';
  $('#f-title').value = a?.title || '';
  $('#f-notes').value = a?.notes || '';
  $('#f-due').value = toLocalInput(a?.dueAt);
  $('#f-remind').value = a?.remindMin ?? '';
  remindState();
  dlgForm.showModal();
}
$('#form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = $('#f-title').value.trim();
  if (!title) { $('#f-title').focus(); return toast('Escribe un título para la actividad'); }
  const due = $('#f-due').value ? new Date($('#f-due').value).toISOString() : null;
  const rm = $('#f-remind').value, remindMin = due && rm !== '' ? Number(rm) : null;
  const now = Date.now();
  const a = editing ? { ...editing } : { id: crypto.randomUUID(), done: false, createdAt: now };
  const timingChanged = !editing || a.dueAt !== due || a.remindMin !== remindMin;
  Object.assign(a, { title, notes: $('#f-notes').value.trim(), dueAt: due, remindMin, updatedAt: now });
  if (timingChanged) a.notifiedAt = null;
  await Store.save(a);
  dlgForm.close();
  toast(editing ? 'Cambios guardados' : 'Actividad guardada');
  afterChange();
});
$('#f-cancel').onclick = () => dlgForm.close();
$('#f-due').addEventListener('input', remindState);

/* ---------- recordatorios (Notifications API) ---------- */
async function showNotification(title, body, tag) {
  const opts = { body, icon: './icons/icon-192.png', tag, data: { url: './' } };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
  return reg ? reg.showNotification(title, opts) : new Notification(title, opts);
}
function checkReminders() {
  const now = Date.now();
  for (const a of S.items) {
    if (a.done || !a.dueAt || a.remindMin == null || a.notifiedAt) continue;
    const at = Date.parse(a.dueAt) - a.remindMin * 60000;
    if (now < at || now - at > 6 * 3600e3) continue;
    a.notifiedAt = now;
    Store.patch(a.id, { notifiedAt: now });
    toast(`Recordatorio: ${a.title}`);
    if ('Notification' in window && Notification.permission === 'granted') showNotification(a.title, dueLabel(a.dueAt), `${a.id}:${a.dueAt}`);
  }
}

/* ---------- ajustes: avisos, push, sincronización, instalación ---------- */
const dlgSet = $('#dlg-set');
async function renderSettings() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#notif-state').textContent = { granted: 'Activados. Te avisamos cuando llega la hora de un recordatorio.', denied: 'Bloqueados. Actívalos desde los permisos del sitio en tu navegador.', default: 'Aún no los activas.', unsupported: 'Este navegador no admite avisos.' }[perm];
  $('#btn-notif').hidden = perm !== 'default';
  $('#btn-test').hidden = perm !== 'granted';
  const ls = await Store.getMeta('lastSync');
  const backendEnabled = globalThis.APP_CONFIG?.API !== null;
  $('#sync-state').textContent = !backendEnabled ? 'GitHub Pages guarda los datos solo en este dispositivo.' : ls ? `Última sincronización: ${DAY.format(ls)}, ${TIME.format(ls)}` : 'Aún no se ha sincronizado.';
  $('#btn-sync').hidden = !backendEnabled;
  const pushOk = backendEnabled && 'serviceWorker' in navigator && 'PushManager' in window;
  $('#btn-push').hidden = !pushOk;
  if (!pushOk) {
    $('#push-state').textContent = backendEnabled ? 'Este navegador no admite push.' : 'Push requiere configurar un backend.';
    $('#btn-push-test').hidden = true;
    return;
  }
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  $('#push-state').textContent = sub ? 'Activados. Recibirás avisos aunque cierres la app.' : 'Desactivados.';
  $('#btn-push').textContent = sub ? 'Desactivar push' : 'Activar push';
  $('#btn-push-test').hidden = !sub;
}
async function enablePush() {
  if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') return toast('Sin permiso para mostrar avisos');
  const { key } = await (await fetch(api('/push/public-key'))).json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await post('/push/subscribe', { clientId: await Sync.clientId(), subscription: sub.toJSON() });
  await syncNow(true); // el servidor necesita tus actividades para programar los avisos
  toast('Push activado');
}
async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  await post('/push/unsubscribe', { clientId: await Sync.clientId(), endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
  toast('Push desactivado');
}
$('#btn-settings').onclick = () => { renderSettings(); dlgSet.showModal(); };
$('#set-close').onclick = () => dlgSet.close();
$('#btn-notif').onclick = async () => { await Notification.requestPermission(); renderSettings(); };
$('#btn-test').onclick = () => showNotification('Aviso de prueba', 'Así se verán tus recordatorios.', 'prueba');
$('#btn-push').onclick = async () => {
  try { (await (await navigator.serviceWorker.ready).pushManager.getSubscription()) ? await disablePush() : await enablePush(); }
  catch (e) { toast('No se pudo activar push. ¿Está encendido el servidor?'); }
  renderSettings();
};
$('#btn-push-test').onclick = async () => { try { await post('/push/test', { clientId: await Sync.clientId() }); } catch { toast('No se pudo enviar el push de prueba'); } };
$('#btn-sync').onclick = async () => { await syncNow(false); renderSettings(); };

let installEvent;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('#sec-install').hidden = false; });
addEventListener('appinstalled', () => { $('#sec-install').hidden = true; installEvent = null; });
$('#btn-install').onclick = async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('#sec-install').hidden = true; };

/* ---------- Service Worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  const offerUpdate = w => toast('Hay una versión nueva', { label: 'Actualizar', fn: () => w.postMessage({ type: 'SKIP_WAITING' }) });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    if (reg.waiting && hadController) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); });
    });
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', async e => { if (e.data?.type === 'synced') { await load(); status(); } });
}

/* ---------- arranque ---------- */
$('#list').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'), li = e.target.closest('[data-id]');
  if (!btn || !li) return;
  const a = S.items.find(x => x.id === li.dataset.id);
  if (!a) return;
  ({ toggle, edit: openForm, del })[btn.dataset.act](a);
});
$('#q').addEventListener('input', e => { S.q = e.target.value; render(); });
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  S.filter = c.dataset.filter;
  document.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
  render();
}));
$('#fab').onclick = () => openForm();
addEventListener('online', () => { status(); syncNow(true); });
addEventListener('offline', status);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); if (navigator.onLine) syncNow(true); } });

(async function init() {
  $('#btn-settings').append(icon('gear'));
  $('#fab').prepend(icon('plus'));
  $('#f-remind').replaceChildren(...REMIND.map(([v, t]) => h('option', { value: v }, t)));
  registerSW();
  await load(); status();
  if (new URLSearchParams(location.search).has('new')) openForm();
  checkReminders();
  setInterval(() => { checkReminders(); renderHero(); }, 15000);
  if (navigator.onLine) syncNow(true);
})();
})();
