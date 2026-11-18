/* Capa de IndexedDB compartida por la página y el Service Worker. Expone `Store`.
   Stores: activities (datos), outbox (cambios pendientes de enviar), meta (clave/valor). */
(function () {
  const DB_NAME = 'hoy-toca', DB_VERSION = 1;
  let dbp;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('activities', { keyPath: 'id' }).createIndex('dueAt', 'dueAt');
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const finish = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
  const tx = async (stores, mode = 'readonly') => (await open()).transaction(stores, mode);

  globalThis.Store = {
    async all() { return wrap((await tx('activities')).objectStore('activities').getAll()); },
    async get(id) { return wrap((await tx('activities')).objectStore('activities').get(id)); },

    // Create / Update: guarda la actividad y encola el cambio en la misma transacción.
    async save(a) {
      const t = await tx(['activities', 'outbox'], 'readwrite');
      t.objectStore('activities').put(a);
      t.objectStore('outbox').add({ type: 'upsert', activity: a });
      return finish(t);
    },
    // Delete
    async remove(id, updatedAt) {
      const t = await tx(['activities', 'outbox'], 'readwrite');
      t.objectStore('activities').delete(id);
      t.objectStore('outbox').add({ type: 'delete', id, updatedAt });
      return finish(t);
    },
    // Cambios solo locales (no se sincronizan), p. ej. marcar un recordatorio como avisado.
    async patch(id, fields) {
      const t = await tx('activities', 'readwrite'), os = t.objectStore('activities');
      const a = await wrap(os.get(id));
      if (a) os.put({ ...a, ...fields });
      return finish(t);
    },

    async outbox() { return wrap((await tx('outbox')).objectStore('outbox').getAll()); },
    async clearOutbox(upToSeq) {
      const t = await tx('outbox', 'readwrite');
      t.objectStore('outbox').delete(IDBKeyRange.upperBound(upToSeq));
      return finish(t);
    },
    async enqueueAll() {
      const t = await tx(['activities', 'outbox'], 'readwrite');
      const all = await wrap(t.objectStore('activities').getAll());
      all.forEach(activity => t.objectStore('outbox').add({ type: 'upsert', activity }));
      return finish(t);
    },
    // Aplica cambios del servidor; gana el más reciente (updatedAt).
    async applyRemote(changes) {
      const t = await tx('activities', 'readwrite'), os = t.objectStore('activities');
      for (const c of changes) {
        const cur = await wrap(os.get(c.id));
        if (cur && cur.updatedAt >= c.updatedAt) continue;
        if (c.deleted) { os.delete(c.id); continue; }
        const { rev, deleted, ...a } = c;
        const same = cur && cur.dueAt === a.dueAt && cur.remindMin === a.remindMin;
        os.put({ ...a, notifiedAt: same ? cur.notifiedAt : null });
      }
      return finish(t);
    },

    async getMeta(key) { const r = await wrap((await tx('meta')).objectStore('meta').get(key)); return r ? r.value : undefined; },
    async setMeta(key, value) { const t = await tx('meta', 'readwrite'); t.objectStore('meta').put({ key, value }); return finish(t); }
  };
})();
