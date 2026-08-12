import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const promotedPath = process.argv[2] || 'overrides/pfc-database-v3-mext-promoted.js';
const corePath = process.argv[3] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[4] || 'overrides/pfc-database-v3-catalog.js';
for (const file of [promotedPath, corePath, catalogPath]) assert.ok(fs.existsSync(file), `missing ${file}`);

const names = [
  '白米','オートミール','パスタ(乾麺)','パスタ(ゆで)','コーンフレーク',
  '鶏むね(皮なし)','鶏むね(皮あり)','鶏もも(皮なし)','鶏もも(皮あり)','砂肝',
  'ローストビーフ','豚ヒレ','豚ロース(脂身無)','豚バラ','豚ひき肉',
  'うなぎ(蒲焼)','きゅうり','無脂肪ヨーグルト','カッテージチーズ'
];
const basis = { 'オートミール': '30g', 'コーンフレーク': '40g' };
const DB = names.map((name, i) => ['test', name, name, basis[name] || '100g', 99+i, 88+i, 77+i, 999+i]);
const store = new Map();
const favoriteSettings = {};
const context = {
  console, DB, favoriteSettings,
  getFavoriteSetting(source,index) { const k=`${source}:${index}`; return favoriteSettings[k] ||= {}; },
  saveFavoriteSettings() {}, getAutoTime(){return '昼';}, getDbDefaultAmount(){return 1;}, getFavoriteUnit(){return '個';}, formatFavoriteAmount(){return 'legacy';}, buildFavoriteLogItem(){return null;},
  localStorage: { getItem(k){return store.has(k)?store.get(k):null;}, setItem(k,v){store.set(k,String(v));} },
  document: { readyState:'complete', documentElement:{classList:{add(){}}}, addEventListener(){} }
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(promotedPath,'utf8'),context,{filename:promotedPath});

assert.equal(context.__PFC_DB_V3_MEXT_PROMOTED__.version,'3.8.0');
assert.equal(context.__PFC_DB_V3_MEXT_PROMOTED__.names.length,19);
assert.equal(context.__PFC_DB_V3_MEXT_PROMOTED__.applied.length,19);
assert.equal(context.__PFC_DB_V3_MEXT_PROMOTED__.skipped.length,0);

const byName=name=>DB.find(row=>row[1]===name);
assert.deepEqual(byName('白米').slice(4,9),[2.5,0.3,37.1,156,0]);
assert.deepEqual(byName('鶏むね(皮なし)').slice(4,9),[23.3,1.9,0.1,105,0]);
assert.deepEqual(byName('きゅうり').slice(4,9),[1,0.1,3,13,0]);
// 30g oatmeal keeps its input basis while using official 100g nutrition.
assert.deepEqual(byName('オートミール').slice(4,9),[4.11,1.71,20.73,105,0]);
// 40g cornflakes likewise remain a 40g food row.
assert.deepEqual(byName('コーンフレーク').slice(4,9),[3.12,0.68,33.44,152,0]);

vm.runInContext(fs.readFileSync(corePath,'utf8'),context,{filename:corePath});
vm.runInContext(fs.readFileSync(catalogPath,'utf8'),context,{filename:catalogPath});
const api=context.__PFC_DB_V3__;
const rice=api.items.find(x=>x.name==='白米');
const oats=api.items.find(x=>x.name==='オートミール');
assert.equal(rice.source.kind,'mext');
assert.equal(rice.source.itemNo,'01088');
assert.equal(rice.canonicalId,'mext:01088');
assert.equal(rice.provenance.sourceId,'01088');
assert.equal(rice.provenance.confidence,'high');
assert.equal(rice.provenance.datasetSha256,'0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c');
assert.equal(oats.nutritionBasis.amount,30);
assert.equal(api.buildRecord(oats.runtimeIndex,30).Cal,105);
assert.equal(context.__PFC_DB_V3_CATALOG__.version,'3.1.2');
assert.equal(context.__PFC_DB_V3_CATALOG__.verifiedSourcesApplied,19);
console.log('Database V3 MEXT promotion/provenance tests passed.');
