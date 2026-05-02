// Cross-device sync via Cloudflare Worker.
//
// Storage model:
//   - All localStorage is the source of truth on each device.
//   - We push a snapshot (every key except those under `vibe-learn:sync:`)
//     and pull replaces local with remote. No merge in step 2.
//   - Sync config (URL + secret) lives in `vibe-learn:sync:config` and is
//     intentionally NOT synced — each device holds its own credentials.

(function () {
  'use strict';

  const CONFIG_KEY = 'vibe-learn:sync:config';
  const SYNC_KEY_PREFIX = 'vibe-learn:sync:';

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveConfig(partial) {
    const existing = getConfig() || {};
    const next = Object.assign({}, existing, partial);
    if (!next.url || !next.secret) {
      throw new Error('Sync config requires url and secret.');
    }
    next.url = next.url.replace(/\/+$/, '');
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
  }

  function isSyncKey(key) {
    return key && key.indexOf(SYNC_KEY_PREFIX) === 0;
  }

  function snapshotLocalStorage() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || isSyncKey(k)) continue;
      out[k] = localStorage.getItem(k);
    }
    return out;
  }

  function applySnapshot(snapshot) {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || isSyncKey(k)) continue;
      toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));

    Object.keys(snapshot || {}).forEach((k) => {
      if (isSyncKey(k)) return;
      const v = snapshot[k];
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
  }

  async function request(method, body) {
    const cfg = getConfig();
    if (!cfg) throw new Error('Sync not configured.');
    const headers = { Authorization: 'Bearer ' + cfg.secret };
    const opts = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(cfg.url + '/state', opts);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch (e) { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status + ' — ' + (data.error || text));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function testConnection() {
    const data = await request('GET');
    const remoteKeys = data && typeof data === 'object' ? Object.keys(data).length : 0;
    return { ok: true, remoteKeys };
  }

  async function push() {
    const snap = snapshotLocalStorage();
    const result = await request('PUT', snap);
    saveConfig({
      lastPushAt: new Date().toISOString(),
      lastPushKeys: Object.keys(snap).length,
      lastPushBytes: result && result.bytes,
    });
    return { keys: Object.keys(snap).length, bytes: result && result.bytes };
  }

  async function pull() {
    const remote = await request('GET');
    if (!remote || typeof remote !== 'object') {
      throw new Error('Unexpected remote payload.');
    }
    applySnapshot(remote);
    saveConfig({
      lastPullAt: new Date().toISOString(),
      lastPullKeys: Object.keys(remote).length,
    });
    return { keys: Object.keys(remote).length };
  }

  window.VibeSync = {
    getConfig,
    saveConfig,
    clearConfig,
    snapshotLocalStorage,
    testConnection,
    push,
    pull,
  };
})();
