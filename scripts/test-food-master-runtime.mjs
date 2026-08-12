import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const runtimePath = process.argv[2] || 'dist/pfc-food-master-runtime.js';
const manifestPath = process.argv[3] || 'dist/food-master-manifest.json';
const runtime = fs.readFileSync(runtimePath, 'utf8');
const currentManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const flushAsyncWork = () => new Promise(resolve => setImmediate(resolve));

function arrayBufferFromString(value) {
  const bytes = Buffer.from(String(value));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function makeResponse(body, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return typeof body === 'string' ? JSON.parse(body) : body; },
    async arrayBuffer() { return arrayBufferFromString(typeof body === 'string' ? body : JSON.stringify(body)); },
    headers: { get() { return contentType; } }
  };
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function createContext() {
  const store = new Map();
  let manifest = currentManifest;
  const assets = new Map();
  const fetchLog = [];

  const context = {
    console,
    URL,
    Date,
    Promise,
    Uint8Array,
    crypto: crypto.webcrypto,
    navigator: { onLine: true },
    location: { href: 'https://example.test/pfc-mirror/' },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); }
    },
    document: { readyState: 'complete', addEventListener() {} },
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    dispatchEvent() {},
    requestIdleCallback() {},
    setTimeout() {},
    fetch: async url => {
      const stringUrl = String(url);
      fetchLog.push(stringUrl);
      if (stringUrl.includes('food-master-manifest.json')) return makeResponse(manifest);
      const parsed = new URL(stringUrl);
      const key = parsed.pathname.split('/').pop() + parsed.search;
      const plainKey = parsed.pathname.split('/').pop();
      if (assets.has(key)) return makeResponse(assets.get(key), 200, 'application/javascript');
      if (assets.has(plainKey)) return makeResponse(assets.get(plainKey), 200, 'application/javascript');
      return makeResponse('', 404, 'text/plain');
    }
  };
  context.window = context;
  context.globalThis = context;
  context.__setManifest = value => { manifest = value; };
  context.__setAsset = (url, value) => { assets.set(url, value); };
  context.__fetchLog = fetchLog;
  context.__store = store;
  vm.createContext(context);
  vm.runInContext(runtime, context, { filename: runtimePath });
  return context;
}

const context = createContext();
const api = context.__PFC_FOOD_MASTER_RUNTIME__;
assert.ok(api, 'Food Master runtime should initialize');
assert.equal(api.version, '1.0.0');
assert.equal(api.localFirst, true);
assert.equal(api.hotSwapDuringSession, false);
assert.equal(api.state.activeFingerprint, currentManifest.fingerprint);
assert.equal(api.state.status, 'ready');

// Current manifest: no staging and no UI-blocking state remains.
await api.checkNow({ force: true });
assert.equal(api.state.status, 'ready');
assert.equal(api.state.pendingFingerprint, '');

// A newer manifest is staged in the background, never hot-swapped mid-session.
const assetA = 'new verified data';
const assetB = 'new index';
const nextManifest = {
  schemaVersion: 1,
  fingerprint: 'next-food-master-fingerprint',
  generatedAt: new Date().toISOString(),
  strategy: 'local-first-next-launch',
  assets: [
    { url: 'pfc-database-v3-verified.js?v=999', sha256: sha(assetA) },
    { url: 'index.html', sha256: sha(assetB) }
  ]
};
context.__setAsset('pfc-database-v3-verified.js?v=999', assetA);
context.__setAsset('index.html', assetB);
context.__setManifest(nextManifest);
await api.checkNow({ force: true });
assert.equal(api.state.status, 'update-ready');
assert.equal(api.state.pendingFingerprint, nextManifest.fingerprint);
assert.equal(context.__store.get('pfc-mirror:food-master:pending'), nextManifest.fingerprint);
assert.ok(context.__fetchLog.some(url => url.includes('pfc-database-v3-verified.js?v=999')));
assert.ok(context.__fetchLog.some(url => url.endsWith('/pfc-mirror/index.html')));

// Generic deferred work returns pending immediately, then confirms asynchronously.
const successTask = api.defer('demo-success', async () => 42);
assert.equal(successTask.status, 'pending');
await flushAsyncWork();
assert.equal(api.getTask(successTask.id).status, 'confirmed');
assert.equal(api.getTask(successTask.id).result, 42);

const failedTask = api.defer('demo-failure', async () => { throw new Error('expected failure'); });
assert.equal(failedTask.status, 'pending');
await flushAsyncWork();
assert.equal(api.getTask(failedTask.id).status, 'failed');
assert.match(api.getTask(failedTask.id).error, /expected failure/);

// Update failures do not make the local database unavailable.
context.__setManifest({ schemaVersion: 1, fingerprint: 'bad', assets: [{ url: 'missing.js', sha256: 'deadbeef' }] });
await api.checkNow({ force: true });
assert.equal(api.state.status, 'update-ready');
assert.match(api.state.lastError, /HTTP 404|hash mismatch/);

console.log('Food Master local-first background runtime tests passed.');
