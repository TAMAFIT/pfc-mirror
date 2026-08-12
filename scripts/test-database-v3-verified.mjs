import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const verifiedPath = process.argv[2] || 'overrides/pfc-database-v3-verified.js';
const corePath = process.argv[3] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[4] || 'overrides/pfc-database-v3-catalog.js';
const verified = fs.readFileSync(verifiedPath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');

const DB = [
  ['🍚炭水化物','白米','ごはん 米','100g',2.5,0.3,37.1,168]
];
const store = new Map();
const favoriteSettings = {};
const context = {
  console,
  DB,
  favoriteSettings,
  getFavoriteSetting(source, index) {
    const key = `${source}:${index}`;
    if (!favoriteSettings[key]) favoriteSettings[key] = {};
    return favoriteSettings[key];
  },
  saveFavoriteSettings() {},
  getAutoTime() { return '昼'; },
  getDbDefaultAmount() { return 1; },
  getFavoriteUnit() { return '個'; },
  formatFavoriteAmount() { return 'legacy'; },
  buildFavoriteLogItem() { return null; },
  localStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  },
  document: {
    readyState: 'complete',
    documentElement: { classList: { add() {} } },
    addEventListener() {}
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(verified, context, { filename: verifiedPath });
assert.equal(DB.length, 5, 'four verified foods should be appended');
// Idempotence: re-running the verified layer does not duplicate foods.
vm.runInContext(verified, context, { filename: verifiedPath });
assert.equal(DB.length, 5, 'verified foods must not duplicate');
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });

const api = context.__PFC_DB_V3__;
assert.ok(api);
const byName = name => api.items.find(item => item.name === name);

const soy = byName('こいくち醤油');
assert.ok(soy);
assert.equal(soy.nutritionBasis.amount, 1);
assert.equal(soy.nutritionBasis.unit, '大さじ');
assert.deepEqual(
  { p: soy.nutrition.p, f: soy.nutrition.f, c: soy.nutrition.c, kcal: soy.nutrition.kcal, a: soy.nutrition.a },
  { p: 1.4, f: 0, c: 1.4, kcal: 14, a: 0.4 }
);
assert.equal(soy.source.kind, 'mext');
assert.equal(soy.source.itemNo, '17007');
assert.equal(soy.servingSource.grams, 18);
assert.equal(api.buildRecord(soy.runtimeIndex, 1).Cal, 14);

const sugar = byName('上白糖');
assert.ok(sugar);
assert.equal(sugar.input.defaultUnit, '大さじ');
assert.equal(sugar.nutrition.c, 8.9);
assert.equal(sugar.nutrition.kcal, 35);
assert.equal(sugar.servingSource.grams, 9);
assert.equal(sugar.source.itemNo, '03003');

const miso = byName('米みそ(淡色辛みそ)');
assert.ok(miso);
assert.equal(miso.nutritionBasis.amount, 10);
assert.equal(miso.nutritionBasis.unit, 'g');
assert.equal(miso.nutrition.p, 1.3);
assert.equal(miso.nutrition.f, 0.6);
assert.equal(miso.nutrition.c, 2.2);
assert.equal(miso.nutrition.kcal, 18);
assert.equal(miso.servingSource.kind, 'mass-only');
assert.equal(miso.source.itemNo, '17045');

const mirin = byName('本みりん');
assert.ok(mirin);
assert.equal(mirin.input.defaultUnit, '大さじ');
assert.equal(mirin.nutrition.c, 7.8);
assert.equal(mirin.nutrition.kcal, 43);
assert.equal(mirin.nutrition.a, 1.7);
assert.equal(mirin.servingSource.grams, 18);
assert.equal(mirin.source.itemNo, '16025');

assert.equal(context.__PFC_DB_V3_VERIFIED__.version, '3.2.0');
assert.equal(context.__PFC_DB_V3_CATALOG__.verifiedSourcesApplied, 4);
console.log('Database V3 source-verified food tests passed.');
