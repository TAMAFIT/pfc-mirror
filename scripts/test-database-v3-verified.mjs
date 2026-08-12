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
assert.equal(DB.length, 12, 'eleven verified foods should be appended');
vm.runInContext(verified, context, { filename: verifiedPath });
assert.equal(DB.length, 12, 'verified foods must not duplicate');
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });

const api = context.__PFC_DB_V3__;
assert.ok(api);
const byName = name => api.items.find(item => item.name === name);

const expected = {
  '豚肩ロース(脂身つき)': { itemNo: '11119', p: 17.1, f: 19.2, c: 0.1, kcal: 237 },
  '鶏手羽元(皮つき)': { itemNo: '11286', p: 18.2, f: 12.8, c: 0.0, kcal: 175 },
  'サバ(生)': { itemNo: '10154', p: 20.6, f: 16.8, c: 0.3, kcal: 211 },
  'アジ(生)': { itemNo: '10003', p: 19.7, f: 4.5, c: 0.1, kcal: 112 },
  'ピーマン': { itemNo: '06245', p: 0.9, f: 0.2, c: 5.1, kcal: 20 },
  'なす': { itemNo: '06191', p: 1.1, f: 0.1, c: 5.1, kcal: 18 },
  '白菜': { itemNo: '06233', p: 0.8, f: 0.1, c: 3.2, kcal: 13 }
};
for (const [name, e] of Object.entries(expected)) {
  const item = byName(name);
  assert.ok(item, `${name} should exist`);
  assert.equal(item.nutritionBasis.amount, 100);
  assert.equal(item.nutritionBasis.unit, 'g');
  assert.equal(item.input.defaultUnit, 'g');
  assert.deepEqual(
    { p: item.nutrition.p, f: item.nutrition.f, c: item.nutrition.c, kcal: item.nutrition.kcal },
    { p: e.p, f: e.f, c: e.c, kcal: e.kcal }
  );
  assert.equal(item.source.kind, 'mext');
  assert.equal(item.source.itemNo, e.itemNo);
  assert.equal(item.servingSource.kind, 'mass-only');
  assert.equal(api.buildRecord(item.runtimeIndex, 100).Cal, e.kcal);
}
assert.match(byName('鶏手羽元(皮つき)').servingSource.note, /1本/);

const soy = byName('こいくち醤油');
assert.ok(soy);
assert.equal(soy.nutritionBasis.amount, 1);
assert.equal(soy.nutritionBasis.unit, '大さじ');
assert.deepEqual(
  { p: soy.nutrition.p, f: soy.nutrition.f, c: soy.nutrition.c, kcal: soy.nutrition.kcal, a: soy.nutrition.a },
  { p: 1.4, f: 0, c: 1.4, kcal: 14, a: 0.4 }
);
assert.equal(soy.source.itemNo, '17007');
assert.equal(soy.servingSource.grams, 18);

const sugar = byName('上白糖');
assert.equal(sugar.input.defaultUnit, '大さじ');
assert.equal(sugar.nutrition.c, 8.9);
assert.equal(sugar.nutrition.kcal, 35);
assert.equal(sugar.servingSource.grams, 9);
assert.equal(sugar.source.itemNo, '03003');

const miso = byName('米みそ(淡色辛みそ)');
assert.equal(miso.nutritionBasis.amount, 10);
assert.equal(miso.nutritionBasis.unit, 'g');
assert.deepEqual(
  { p: miso.nutrition.p, f: miso.nutrition.f, c: miso.nutrition.c, kcal: miso.nutrition.kcal },
  { p: 1.3, f: 0.6, c: 2.2, kcal: 18 }
);
assert.equal(miso.source.itemNo, '17045');

const mirin = byName('本みりん');
assert.equal(mirin.input.defaultUnit, '大さじ');
assert.equal(mirin.nutrition.c, 7.8);
assert.equal(mirin.nutrition.kcal, 43);
assert.equal(mirin.nutrition.a, 1.7);
assert.equal(mirin.servingSource.grams, 18);
assert.equal(mirin.source.itemNo, '16025');

assert.equal(context.__PFC_DB_V3_VERIFIED__.version, '3.3.0');
assert.equal(context.__PFC_DB_V3_CATALOG__.verifiedSourcesApplied, 11);
console.log('Database V3 source-verified food tests passed.');
