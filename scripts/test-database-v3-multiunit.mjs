import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const verifiedPath = process.argv[2] || 'overrides/pfc-database-v3-verified.js';
const corePath = process.argv[3] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[4] || 'overrides/pfc-database-v3-catalog.js';
const multiunitPath = process.argv[5] || 'overrides/pfc-database-v3-multiunit.js';
const verified = fs.readFileSync(verifiedPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');
const multiunit = fs.readFileSync(multiunitPath, 'utf8');

const DB = [['🍚炭水化物','白米','ごはん 米','100g',2.5,0.3,37.1,168]];
const store = new Map();
const context = {
  console, DB, favoriteSettings: {},
  getFavoriteSetting() { return {}; }, saveFavoriteSettings() {}, getAutoTime() { return '昼'; },
  getDbDefaultAmount() { return 1; }, getFavoriteUnit() { return '個'; }, formatFavoriteAmount() { return 'legacy'; }, buildFavoriteLogItem() { return null; },
  localStorage: { getItem(key) { return store.get(key) || null; }, setItem(key, value) { store.set(key, String(value)); } },
  document: {
    readyState: 'complete',
    documentElement: { classList: { add() {} } },
    head: { appendChild() {} },
    getElementById() { return null; },
    createElement() { return { id: '', textContent: '', className: '', style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, onclick: null }; },
    addEventListener() {}
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(verified, context, { filename: verifiedPath });
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });
vm.runInContext(multiunit, context, { filename: multiunitPath });

const db = context.__PFC_DB_V3__;
const mu = context.__PFC_DB_V3_MULTIUNIT__;
assert.ok(db && mu);
assert.equal(mu.version, '3.6.0');
const indexOf = name => db.items.find(x => x.name === name)?.runtimeIndex;

const soy = indexOf('こいくち醤油');
const sugar = indexOf('上白糖');
const miso = indexOf('米みそ(淡色辛みそ)');
const mirin = indexOf('本みりん');
for (const index of [soy,sugar,miso,mirin]) assert.ok(Number.isInteger(index));

assert.deepEqual(Array.from(mu.getUnits(soy), x => x.label), ['大さじ','g']);
assert.deepEqual(Array.from(mu.getUnits(sugar), x => x.label), ['大さじ','g']);
assert.deepEqual(Array.from(mu.getUnits(mirin), x => x.label), ['大さじ','g']);
assert.deepEqual(Array.from(mu.getUnits(miso), x => x.label), ['g']);

assert.equal(mu.convert(soy, 1, '大さじ', 'g'), 18);
assert.equal(mu.convert(soy, 18, 'g', '大さじ'), 1);
assert.equal(mu.convert(soy, 0.5, '大さじ', 'g'), 9);
assert.equal(mu.convert(sugar, 1, '大さじ', 'g'), 9);
assert.equal(mu.convert(mirin, 1, '大さじ', 'g'), 18);

let scaled = mu.scaleInput(soy, 18, 'g');
assert.deepEqual({ p: scaled.p, f: scaled.f, c: scaled.c, a: scaled.a, kcal: scaled.kcal }, { p: 1.4, f: 0, c: 1.4, a: 0.4, kcal: 14 });
scaled = mu.scaleInput(sugar, 9, 'g');
assert.equal(scaled.kcal, 35);
assert.equal(scaled.c, 8.9);
scaled = mu.scaleInput(mirin, 18, 'g');
assert.equal(scaled.kcal, 43);
assert.equal(scaled.a, 1.7);

const record = mu.buildRecordInput(soy, 18, 'g', '昼');
assert.equal(record.N, 'こいくち醤油(18g)');
assert.equal(record.Cal, 14);
assert.equal(record.A, 0.4);
assert.equal(mu.formatInput(soy, 1, '大さじ'), '大さじ1');
assert.equal(mu.formatInput(soy, 18, 'g'), '18g');
assert.deepEqual(Array.from(mu.choices(soy, 'g')), [9,18,27,36,54]);

console.log('Database V3 verified multi-unit tests passed.');
