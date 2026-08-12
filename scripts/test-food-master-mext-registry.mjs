import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const registryPath = process.argv[2] || 'overrides/pfc-food-master-mext-registry.js';
const corePath = process.argv[3] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[4] || 'overrides/pfc-database-v3-catalog.js';
for (const file of [registryPath,corePath,catalogPath]) assert.ok(fs.existsSync(file),`missing ${file}`);

const DB = [
  ['調味料','こいくち醤油','しょうゆ','100g',0,0,0,0],
  ['炭水化物','白米','ごはん 米','100g',0,0,0,0],
  ['炭水化物','オートミール','オーツ','30g',0,0,0,0],
  ['果物','マンゴー(生)','マンゴー','100g',0,0,0,0]
];
const previousServing={kind:'verified-volume',measure:'大さじ1',grams:18,exactForEntry:true};
const context={
  console, DB, favoriteSettings:{},
  __PFC_DB_V3_VERIFIED_SOURCES__: {
    'こいくち醤油': { source:{kind:'mext',itemNo:'17007'}, serving:previousServing, confidence:'high', verifiedVersion:'3.4.0' }
  },
  getFavoriteSetting(){return {};},saveFavoriteSettings(){},getAutoTime(){return '昼';},getDbDefaultAmount(){return 1;},getFavoriteUnit(){return '個';},formatFavoriteAmount(){return 'legacy';},buildFavoriteLogItem(){return null;},
  localStorage:{getItem(){return null;},setItem(){}},
  document:{readyState:'complete',documentElement:{classList:{add(){}}},addEventListener(){}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(registryPath,'utf8'),context,{filename:registryPath});

const registry=context.__PFC_FOOD_MASTER_MEXT_REGISTRY__;
assert.ok(registry);
assert.equal(registry.version,'4.0.0');
assert.equal(registry.count,40);
assert.equal(registry.itemNos.length,40);
assert.equal(new Set(Array.from(registry.itemNos)).size,40);
assert.equal(registry.applied.length,4);
assert.equal(registry.skipped.length,36);
assert.deepEqual(DB[1].slice(4,9),[2.5,0.3,37.1,156,0]);
assert.deepEqual(DB[2].slice(4,9),[4.11,1.71,20.73,105,0]);
assert.deepEqual(DB[3].slice(4,9),[0.6,0.1,16.9,68,0]);
assert.deepEqual(DB[0].slice(4,9),[7.7,0,7.9,76,2.1]);
assert.equal(context.__PFC_DB_V3_VERIFIED_SOURCES__['こいくち醤油'].serving,previousServing,'registry must preserve curated serving conversion metadata');
assert.equal(context.__PFC_DB_V3_VERIFIED_SOURCES__['白米'].canonicalId,'mext:01088');
assert.equal(context.__PFC_DB_V3_VERIFIED_SOURCES__['白米'].verifiedVersion,'4.0.0');

vm.runInContext(fs.readFileSync(corePath,'utf8'),context,{filename:corePath});
vm.runInContext(fs.readFileSync(catalogPath,'utf8'),context,{filename:catalogPath});
const api=context.__PFC_DB_V3__;
const rice=api.items.find(x=>x.name==='白米');
const oats=api.items.find(x=>x.name==='オートミール');
const soy=api.items.find(x=>x.name==='こいくち醤油');
assert.equal(rice.source.itemNo,'01088');
assert.equal(rice.canonicalId,'mext:01088');
assert.equal(rice.provenance.verifiedVersion,'4.0.0');
assert.equal(oats.nutritionBasis.amount,30);
assert.equal(api.buildRecord(oats.runtimeIndex,30).Cal,105);
assert.equal(soy.servingSource.measure,'大さじ1');
console.log('Food Master central MEXT registry tests passed.');
