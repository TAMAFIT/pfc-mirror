import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const primaryPath = process.argv[2] || 'overrides/pfc-database-v3-verified.js';
const b5Path = process.argv[3] || 'overrides/pfc-database-v3-verified-b5.js';
const corePath = process.argv[4] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[5] || 'overrides/pfc-database-v3-catalog.js';
const primary = fs.readFileSync(primaryPath, 'utf8');
const b5 = fs.readFileSync(b5Path, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');

const DB = [['🍚炭水化物','白米','ごはん 米','100g',2.5,0.3,37.1,168]];
const store = new Map();
const favoriteSettings = {};
const context = {
  console, DB, favoriteSettings,
  getFavoriteSetting(source, index) { const key = `${source}:${index}`; if (!favoriteSettings[key]) favoriteSettings[key] = {}; return favoriteSettings[key]; },
  saveFavoriteSettings() {}, getAutoTime() { return '昼'; }, getDbDefaultAmount() { return 1; },
  getFavoriteUnit() { return '個'; }, formatFavoriteAmount() { return 'legacy'; }, buildFavoriteLogItem() { return null; },
  localStorage: { getItem(key) { return store.has(key) ? store.get(key) : null; }, setItem(key, value) { store.set(key, String(value)); } },
  document: { readyState: 'complete', documentElement: { classList: { add() {} } }, addEventListener() {} }
};
context.window = context;
vm.createContext(context);
vm.runInContext(primary, context, { filename: primaryPath });
const afterPrimary = DB.length;
vm.runInContext(b5, context, { filename: b5Path });
assert.equal(DB.length, afterPrimary + 6, 'B5 should add six foods');
vm.runInContext(b5, context, { filename: b5Path });
assert.equal(DB.length, afterPrimary + 6, 'B5 must be duplicate-safe');
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });

const api = context.__PFC_DB_V3__;
const byName = name => api.items.find(item => item.name === name);
const expected = {
  'まだら(生)': { itemNo: '10205', p: 17.6, f: 0.2, c: 0.1, kcal: 72 },
  'スイートコーン(生)': { itemNo: '06175', p: 3.6, f: 1.7, c: 16.8, kcal: 89 },
  'ズッキーニ': { itemNo: '06116', p: 1.3, f: 0.1, c: 2.8, kcal: 16 },
  'マンゴー(生)': { itemNo: '07132', p: 0.6, f: 0.1, c: 16.9, kcal: 68 },
  'ブルーベリー(生)': { itemNo: '07124', p: 0.5, f: 0.1, c: 12.9, kcal: 48 },
  'ネーブルオレンジ(生)': { itemNo: '07040', p: 0.9, f: 0.1, c: 11.8, kcal: 48 }
};
for (const [name, e] of Object.entries(expected)) {
  const item = byName(name);
  assert.ok(item, `${name} should exist`);
  assert.equal(item.nutritionBasis.amount, 100);
  assert.equal(item.nutritionBasis.unit, 'g');
  assert.equal(item.input.defaultUnit, 'g');
  assert.deepEqual({ p: item.nutrition.p, f: item.nutrition.f, c: item.nutrition.c, kcal: item.nutrition.kcal }, { p: e.p, f: e.f, c: e.c, kcal: e.kcal });
  assert.equal(item.source.kind, 'mext');
  assert.equal(item.source.itemNo, e.itemNo);
  assert.equal(api.buildRecord(item.runtimeIndex, 100).Cal, e.kcal);
}
assert.match(byName('まだら(生)').servingSource.note, /1切/);
assert.match(byName('スイートコーン(生)').servingSource.note, /1本/);
assert.match(byName('マンゴー(生)').servingSource.note, /1個/);
assert.equal(context.__PFC_DB_V3_VERIFIED_B5__.version, '3.5.1');
assert.equal(context.__PFC_DB_V3_VERIFIED_B5__.names.length, 6);
assert.equal(context.__PFC_DB_V3_CATALOG__.verifiedSourcesApplied, 21);
console.log('Database V3 B5 verified-food tests passed.');