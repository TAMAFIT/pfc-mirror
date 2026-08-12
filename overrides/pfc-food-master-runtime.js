// PFC Mirror Food Master Runtime: local-first, background-update infrastructure.
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const BUILD_FINGERPRINT = '__PFC_FOOD_MASTER_BUILD_FINGERPRINT__';
  const MANIFEST_URL = 'food-master-manifest.json';
  const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const STORAGE_PREFIX = 'pfc-mirror:food-master:';
  const KEYS = {
    applied: `${STORAGE_PREFIX}applied`,
    pending: `${STORAGE_PREFIX}pending`,
    checkedAt: `${STORAGE_PREFIX}checked-at`
  };

  const tasks = new Map();
  let taskSequence = 0;

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function removeStorage(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function now() { return Date.now(); }

  const initialPending = readStorage(KEYS.pending) || '';
  if (initialPending && initialPending === BUILD_FINGERPRINT) removeStorage(KEYS.pending);
  writeStorage(KEYS.applied, BUILD_FINGERPRINT);

  const state = {
    status: initialPending && initialPending !== BUILD_FINGERPRINT ? 'update-ready' : 'ready',
    activeFingerprint: BUILD_FINGERPRINT,
    pendingFingerprint: initialPending && initialPending !== BUILD_FINGERPRINT ? initialPending : '',
    lastCheckedAt: Number(readStorage(KEYS.checkedAt) || 0),
    lastError: '',
    lastManifest: null
  };

  function snapshotState() {
    return {
      status: state.status,
      activeFingerprint: state.activeFingerprint,
      pendingFingerprint: state.pendingFingerprint,
      lastCheckedAt: state.lastCheckedAt,
      lastError: state.lastError,
      lastManifest: state.lastManifest
    };
  }

  function emitState() {
    try {
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('pfc:food-master-state', { detail: snapshotState() }));
      }
    } catch (_) {}
  }

  function setState(patch) {
    Object.assign(state, patch || {});
    emitState();
  }

  function trimTasks() {
    if (tasks.size <= 30) return;
    const ordered = [...tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
    ordered.slice(0, Math.max(0, ordered.length - 20)).forEach(task => tasks.delete(task.id));
  }

  function taskSnapshot(task) {
    if (!task) return null;
    return {
      id: task.id,
      label: task.label,
      status: task.status,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt || 0,
      error: task.error || '',
      result: task.result
    };
  }

  // Returns immediately. The executor starts in a microtask so callers can finish UI work first.
  function defer(label, executor, hooks = {}) {
    if (typeof executor !== 'function') throw new TypeError('Food Master deferred executor must be a function');
    const task = {
      id: `fm-${now()}-${++taskSequence}`,
      label: String(label || 'background-task'),
      status: 'pending',
      createdAt: now(),
      result: undefined,
      error: ''
    };
    tasks.set(task.id, task);
    trimTasks();

    Promise.resolve().then(executor).then(result => {
      task.status = 'confirmed';
      task.result = result;
      task.finishedAt = now();
      try { hooks.onConfirmed?.(result, taskSnapshot(task)); } catch (_) {}
    }).catch(error => {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error || 'unknown error');
      task.finishedAt = now();
      try { hooks.onFailed?.(error, taskSnapshot(task)); } catch (_) {}
    });

    return taskSnapshot(task);
  }

  function getTask(id) {
    return taskSnapshot(tasks.get(String(id)));
  }

  function listTasks() {
    return [...tasks.values()].map(taskSnapshot);
  }

  async function sha256Hex(buffer) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return '';
    const digest = await subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function absoluteUrl(relative) {
    try { return new URL(String(relative || ''), window.location?.href || '').href; }
    catch (_) { return String(relative || ''); }
  }

  async function fetchManifest() {
    const separator = MANIFEST_URL.includes('?') ? '&' : '?';
    const url = absoluteUrl(`${MANIFEST_URL}${separator}ts=${now()}`);
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response?.ok) throw new Error(`Food Master manifest HTTP ${response?.status || 0}`);
    const manifest = await response.json();
    if (!manifest || manifest.schemaVersion !== 1 || !manifest.fingerprint || !Array.isArray(manifest.assets)) {
      throw new Error('Food Master manifest is invalid');
    }
    return manifest;
  }

  async function stageAsset(asset) {
    if (!asset?.url) throw new Error('Food Master asset URL is missing');
    const response = await fetch(absoluteUrl(asset.url), { cache: 'reload', credentials: 'same-origin' });
    if (!response?.ok) throw new Error(`Food Master asset HTTP ${response?.status || 0}: ${asset.url}`);
    const bytes = await response.arrayBuffer();
    if (asset.sha256) {
      const actual = await sha256Hex(bytes);
      if (actual && actual !== asset.sha256) throw new Error(`Food Master asset hash mismatch: ${asset.url}`);
    }
    return asset.url;
  }

  async function stageManifest(manifest) {
    // Do not hot-swap DB arrays in the middle of a session. Prime browser cache only.
    await Promise.all(manifest.assets.map(stageAsset));
    writeStorage(KEYS.pending, manifest.fingerprint);
    setState({
      status: 'update-ready',
      pendingFingerprint: manifest.fingerprint,
      lastManifest: manifest,
      lastError: ''
    });
    return manifest.fingerprint;
  }

  async function checkNow(options = {}) {
    const force = !!options.force;
    if (!force && typeof navigator !== 'undefined' && navigator.onLine === false) return snapshotState();
    const last = Number(readStorage(KEYS.checkedAt) || state.lastCheckedAt || 0);
    if (!force && last && now() - last < CHECK_INTERVAL_MS) return snapshotState();

    setState({ status: 'checking', lastError: '' });
    try {
      const manifest = await fetchManifest();
      const checkedAt = now();
      writeStorage(KEYS.checkedAt, checkedAt);
      state.lastCheckedAt = checkedAt;
      state.lastManifest = manifest;

      if (manifest.fingerprint === BUILD_FINGERPRINT) {
        removeStorage(KEYS.pending);
        setState({
          status: 'ready',
          pendingFingerprint: '',
          lastCheckedAt: checkedAt,
          lastManifest: manifest,
          lastError: ''
        });
        return snapshotState();
      }

      setState({ status: 'staging', lastCheckedAt: checkedAt, lastManifest: manifest });
      await stageManifest(manifest);
      return snapshotState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'unknown error');
      // Network/update failure never blocks the already-loaded local Food Master.
      setState({ status: state.pendingFingerprint ? 'update-ready' : 'ready', lastError: message });
      return snapshotState();
    }
  }

  function scheduleCheck() {
    const run = () => defer('food-master-update-check', () => checkNow({ force: false }));
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2500 });
    } else if (typeof setTimeout === 'function') {
      setTimeout(run, 800);
    }
  }

  const api = {
    version: VERSION,
    localFirst: true,
    hotSwapDuringSession: false,
    get state() { return snapshotState(); },
    checkNow,
    scheduleCheck,
    defer,
    getTask,
    listTasks,
    manifestUrl: MANIFEST_URL
  };

  window.__PFC_FOOD_MASTER_RUNTIME__ = api;
  scheduleCheck();
})();
