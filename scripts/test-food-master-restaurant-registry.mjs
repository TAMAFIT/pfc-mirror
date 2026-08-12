import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const registryPath = process.argv[2] || 'overrides/pfc-food-master-restaurant-registry.js';
const corePath = process.argv[3] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[4] || 'overrides/pfc-database-v3-catalog.js';
for (const file of [registryPath,corePath,catalogPath]) assert.ok(fs.existsSync(file), `missing ${file}`);

const expected = {
  'ハンバーガー': [13.0,9.5,30.3,259],
  'チーズバーガー': [15.9,13.5,31.0,310],
  'ダブルチーズ': [26.4,25.1,31.8,459],
  'ビッグマック': [26.1,28.0,42.0,524],
  'フィレオフィッシュ': [15.0,14.2,37.4,338],
  'チキチー': [16.4,23.2,40.3,433],
  'エグチ': [22.4,19.0,31.2,390],
  'ポテト(S)': [2.8,10.7,28.5,221],
  'ポテト(M)': [5.3,19.7,51.8,404],
  'ポテト(L)': [6.7,24.8,65.3,509],
  'ナゲット(5個)': [15.3,16.1,13.3,262]
};
const DB = Object.entries(expected).map(([name,vals]) => [
  name.startsWith('ポテト') || name.startsWith('ナゲット') ? '🍔ジャンク・菓子' : '🍔ジャンク・菓子',
  name, name, name === 'ナゲット(5個)' ? '1箱' : '1個', 1,1,1,1
]);
const store = new Map();
const favoriteSettings = {};
const context = {
  console, DB, favoriteSettings,
  getFavoriteSetting(source,index){ const k=`${source}:${index}`; return favoriteSettings[k] ||= {}; },
  saveFavoriteSettings(){}, getAutoTime(){return '昼';}, getDbDefaultAmount(){return 1;}, getFavoriteUnit(){return '個';}, formatFavoriteAmount(){return 'legacy';}, buildFavoriteLogItem(){return null;},
  localStorage:{getItem(k){return store.has(k)?store.get(k):null;},setItem(k,v){store.set(k,String(v));}},
  document:{readyState:'complete',documentElement:{classList:{add(){}}},addEventListener(){}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(registryPath,'utf8'),context,{filename:registryPath});
const registry=context.__PFC_FOOD_MASTER_RESTAURANT_REGISTRY__;
assert.ok(registry);
assert.equal(registry.version,'6.0.0');
assert.equal(registry.provider,"McDonald's Japan");
assert.equal(registry.count,11);
assert.equal(registry.applied.length,11);
assert.equal(registry.skipped.length,0);
assert.equal(new Set(Array.from(registry.canonicalIds)).size,11);

for (const [name,vals] of Object.entries(expected)) {
  const row=DB.find(x=>x[1]===name);
  assert.deepEqual(row.slice(4,9), [...vals,0], `${name} official serving nutrition`);
  const hint=context.__PFC_DB_V3_VERIFIED_SOURCES__[name];
  assert.equal(hint.source.kind,'restaurant');
  assert.equal(hint.source.provider,"McDonald's Japan");
  assert.equal(hint.confidence,'high');
  assert.ok(hint.canonicalId.startsWith('restaurant:mcd-jp:'));
  assert.match(hint.source.url,/^https:\/\/www\.mcdonalds\.co\.jp\/products\//);
}

vm.runInContext(fs.readFileSync(corePath,'utf8'),context,{filename:corePath});
vm.runInContext(fs.readFileSync(catalogPath,'utf8'),context,{filename:catalogPath});
const api=context.__PFC_DB_V3__;
const byName=name=>api.items.find(x=>x.name===name);
assert.equal(byName('ビッグマック').source.kind,'restaurant');
assert.equal(byName('ビッグマック').canonicalId,'restaurant:mcd-jp:big-mac');
assert.equal(byName('ビッグマック').provenance.sourceId,'big-mac');
assert.equal(byName('ビッグマック').confidence,'high');
assert.equal(api.buildRecord(byName('ビッグマック').runtimeIndex,1).Cal,524);

for (const name of ['ポテト(S)','ポテト(M)','ポテト(L)']) {
  const item=byName(name);
  assert.equal(item.input.defaultUnit,'食');
  assert.equal(item.input.defaultAmount,1);
  assert.equal(api.buildRecord(item.runtimeIndex,1).Cal,expected[name][3]);
}
const nugget=byName('ナゲット(5個)');
assert.equal(nugget.nutritionBasis.amount,5);
assert.equal(nugget.nutritionBasis.unit,'個');
assert.equal(nugget.input.defaultUnit,'個');
assert.equal(nugget.input.defaultAmount,5);
assert.equal(api.buildRecord(nugget.runtimeIndex,5).Cal,262);
assert.equal(nugget.servingSource.measure,'5個');
console.log('Food Master official restaurant registry tests passed.');
