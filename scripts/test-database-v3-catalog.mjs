import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const corePath = process.argv[2] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[3] || 'overrides/pfc-database-v3-catalog.js';
const core = fs.readFileSync(corePath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');

const DB = [
  ['🏪コンビニ','海苔弁当','弁当','1個',15,20,90,600],
  ['🍔ジャンク・菓子','ナゲット(5個)','ナゲット','1箱',15,17,12,270],
  ['🍔ジャンク・菓子','餃子(6個)','餃子','1皿',8,15,25,300],
  ['🍔ジャンク・菓子','唐揚げ(5個)','唐揚げ','1皿',20,25,10,400],
  ['🍚炭水化物','白米','ごはん 米','100g',2.5,0.3,37.1,168],
  ['🥚卵・乳・大豆','全卵(M)','卵','1個',6.2,5.2,0.2,74],
  ['🏪コンビニ','からあげクン','からあげ','1個',14,14,8,210],
  ['🍔ジャンク・菓子','じゃがりこ','おかし','1個',4,12,35,260]
];

const store = new Map();
const favoriteSettings = {
  'db:1': { amount: 1 },
  'db:2': { amount: 1 },
  'db:3': { amount: 1 }
};
let saves = 0;
const context = {
  console,
  DB,
  favoriteSettings,
  getFavoriteSetting(source, index) {
    const key = `${source}:${index}`;
    if (!favoriteSettings[key]) favoriteSettings[key] = {};
    return favoriteSettings[key];
  },
  saveFavoriteSettings() { saves += 1; },
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
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });

const api = context.__PFC_DB_V3__;
const c = context.__PFC_DB_V3_CATALOG__;
assert.ok(api && c);
assert.equal(c.version, '3.1.2');
assert.equal(c.provenanceSchema, 1);

assert.equal(api.get(0).input.defaultUnit, '食');
assert.equal(api.get(0).input.type, 'portion');

for (const [index, expected] of [[1,5],[2,6],[3,5]]) {
  const meta = api.get(index);
  assert.equal(meta.nutritionBasis.amount, expected);
  assert.equal(meta.nutritionBasis.unit, '個');
  assert.equal(meta.input.defaultUnit, '個');
  assert.equal(meta.input.defaultAmount, expected);
  assert.equal(favoriteSettings[`db:${index}`].amount, expected);
  const record = api.buildRecord(index, expected, '昼');
  assert.equal(record.Cal, DB[index][7], `${meta.name} full bundle should preserve legacy full-serving kcal`);
}
assert.ok(saves >= 1);
assert.equal(store.get('pfc-db-v3-bundle-units-310'), '1');

assert.equal(api.get(6).input.defaultUnit, 'パック');
assert.equal(api.get(7).input.defaultUnit, 'カップ');

const riceRefs = api.get(4).input.references || [];
assert.ok(riceRefs.some(ref => ref.kind === 'maff-serving-guide'));
assert.deepEqual(Array.from(riceRefs.find(ref => ref.kind === 'maff-serving-guide').presets, x => x.grams), [100,150,200]);

const eggRefs = api.get(5).input.references || [];
const eggRef = eggRefs.find(ref => ref.kind === 'maff-egg-standard');
assert.ok(eggRef);
assert.equal(eggRef.selectedSize, 'M');
assert.deepEqual(Array.from(eggRef.grossWeightRanges.M), [58,64]);
assert.match(eggRef.note, /可食部gへの自動換算には使わない/);

console.log('Database V3 natural-unit catalog tests passed.');

const verifiedPath = path.join(path.dirname(corePath), 'pfc-database-v3-verified.js');
if (!fs.existsSync(verifiedPath)) throw new Error(`Verified DB V3 layer missing: ${verifiedPath}`);
const verifiedTest = path.join(process.cwd(), 'scripts', 'test-database-v3-verified.mjs');
const primary = spawnSync(process.execPath, [verifiedTest, verifiedPath, corePath, catalogPath], { stdio: 'inherit' });
if (primary.status !== 0) throw new Error('Database V3 verified-food test suite failed');

const b5Path = path.join(path.dirname(corePath), 'pfc-database-v3-verified-b5.js');
if (!fs.existsSync(b5Path)) throw new Error(`Database V3 B5 layer missing: ${b5Path}`);
const b5Test = path.join(process.cwd(), 'scripts', 'test-database-v3-b5.mjs');
const b5 = spawnSync(process.execPath, [b5Test, verifiedPath, b5Path, corePath, catalogPath], { stdio: 'inherit' });
if (b5.status !== 0) throw new Error('Database V3 B5 verified-food test suite failed');

const promotedPath = path.join(path.dirname(corePath), 'pfc-database-v3-mext-promoted.js');
if (!fs.existsSync(promotedPath)) throw new Error(`Database V3 MEXT promotion layer missing: ${promotedPath}`);
const promotedTest = path.join(process.cwd(), 'scripts', 'test-database-v3-mext-promoted.mjs');
const promoted = spawnSync(process.execPath, [promotedTest, promotedPath, corePath, catalogPath], { stdio: 'inherit' });
if (promoted.status !== 0) throw new Error('Database V3 MEXT promotion/provenance test suite failed');

const multiunitPath = path.join(path.dirname(corePath), 'pfc-database-v3-multiunit.js');
if (!fs.existsSync(multiunitPath)) throw new Error(`Database V3 multi-unit layer missing: ${multiunitPath}`);
const multiunitTest = path.join(process.cwd(), 'scripts', 'test-database-v3-multiunit.mjs');
const multiunitResult = spawnSync(process.execPath, [multiunitTest, verifiedPath, corePath, catalogPath, multiunitPath], { stdio: 'inherit' });
if (multiunitResult.status !== 0) throw new Error('Database V3 multi-unit test suite failed');

const searchPath = path.join(path.dirname(corePath), 'pfc-database-v3-search.js');
if (!fs.existsSync(searchPath)) throw new Error(`Database V3 search layer missing: ${searchPath}`);
const searchTest = path.join(process.cwd(), 'scripts', 'test-database-v3-search.mjs');
const searchResult = spawnSync(process.execPath, [searchTest, verifiedPath, b5Path, corePath, catalogPath, searchPath], { stdio: 'inherit' });
if (searchResult.status !== 0) throw new Error('Database V3 canonical search test suite failed');

const runtimePath = path.join(path.dirname(corePath), 'pfc-food-master-runtime.js');
const manifestPath = path.join(path.dirname(corePath), 'food-master-manifest.json');
if (!fs.existsSync(runtimePath)) throw new Error(`Food Master runtime missing: ${runtimePath}`);
if (!fs.existsSync(manifestPath)) throw new Error(`Food Master manifest missing: ${manifestPath}`);
const runtimeTest = path.join(process.cwd(), 'scripts', 'test-food-master-runtime.mjs');
const runtimeResult = spawnSync(process.execPath, [runtimeTest, runtimePath, manifestPath], { stdio: 'inherit' });
if (runtimeResult.status !== 0) throw new Error('Food Master local-first runtime test suite failed');
