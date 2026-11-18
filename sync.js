/* Sincronización: envía la cola local (outbox) y recibe cambios del servidor. Expone `Sync`. */
(function () {
  const api = p => (globalThis.APP_CONFIG?.API || './api') + p;
  let inflight = null;

  async function clientId() {
    let id = await Store.getMeta('clientId');
    if (!id) { id = crypto.randomUUID(); await Store.setMeta('clientId', id); }
    return id;
  }

  async function exec(again) {
    const outbox = await Store.outbox();
    const body = {
      clientId: await clientId(),
      since: (await Store.getMeta('rev')) || 0,
      ops: outbox.map(o => o.type === 'upsert'
        ? { type: 'upsert', activity: o.activity }
        : { type: 'delete', id: o.id, updatedAt: o.updatedAt })
    };
    let res;
    try {
      res = await fetch(api('/sync'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { return { ok: false, reason: 'offline' }; }
    if (!res.ok) return { ok: false, reason: 'server' };

    const data = await res.json();
    if (outbox.length) await Store.clearOutbox(outbox[outbox.length - 1].seq);
    await Store.applyRemote(data.changes);
    await Store.setMeta('rev', data.rev);
    await Store.setMeta('lastSync', Date.now());
    // El servidor perdió sus datos (p. ej. disco efímero): vuelve a subir todo lo local.
    if (data.reset && again) { await Store.enqueueAll(); return exec(false); }
    return { ok: true, pushed: outbox.length, pulled: data.changes.length };
  }

  globalThis.Sync = {
    clientId,
    run() { return inflight || (inflight = exec(true).finally(() => { inflight = null; })); }
  };
})();
