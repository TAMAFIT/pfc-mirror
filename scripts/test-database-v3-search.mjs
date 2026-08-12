import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const primaryPath = process.argv[2] || 'overrides/pfc-database-v3-verified.js';
const b5Path = process.argv[3] || 'overrides/pfc-database-v3-verified-b5.js';
const corePath = process.argv[4] || 'overrides/pfc-database-v3.js';
const catalogPath = process.argv[5] || 'overrides/pfc-database-v3-catalog.js';
const searchPath = process.argv[6] || 'overrides/pfc-database-v3-search.js';

const primary = fs.readFileSync(primaryPath, 'utf8');
const b5 = fs.readFileSync(b5Path, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
const catalog = fs.readFileSync(catalogPath, 'utf8');
const searchCode = fs.readFileSync(searchPath, 'utf8');

const DB = [
  ['🍚炭水化物','白米','はくまい ごはん ライス こめ 米','100g',2.5,0.3,37.1,168],
  ['🍚炭水化物','玄米','げんまい ごはん ライス こめ 米','100g',2.8,1.0,35.6,165],
  ['🍚炭水化物','雑穀米','ざっこくまい ごはん 米','100g',3,0.7,33,163],
  ['🍚炭水化物','麦ご飯','むぎごはん ごはん 米','100g',2.6,0.5,36,160],
  ['🍖肉類','鶏むね(皮なし)','とりむね チキン 鶏肉 肉','100g',23.3,1.5,0,108],
  ['🍖肉類','豚ヒレ','ぶたひれ ポーク 豚肉 肉','100g',22.8,1.9,0.2,115],
  ['🐟魚介類','サバ缶(水煮)','さば サバ 魚 さかな 缶詰','1缶',28.3,20.3,0,302],
  ['🐟魚介類','鮭(焼き)','さけ しゃけ 魚 さかな','1切',17.8,5.3,0.1,123],
  ['🥚卵・乳・大豆','ゆで卵','ゆでたまご 卵 玉子','1個',6.5,5.5,0.5,75],
  ['🏪コンビニ','ゆで卵','ゆでたまご 卵 玉子 コンビニ','1個',6.5,5.5,0.5,75],
  ['🍎果物','干し芋','ほしいも いも 果物','100g',3,0.5,70,300],
  ['🍔ジャンク・菓子','干し芋','ほしいも いも おかし','1袋',3,0.5,70,300],
  ['🥦野菜','ブロッコリー','ぶろっこりー 野菜 やさい','100g',4.3,0.5,5.2,37]
];

const store = new Map();
const context = {
  console,
  DB,
  myFoods: [],
  favoriteSettings: {},
  __PFC_SEARCH_V21__: { version: '2.1.0', search() { return []; } },
  getFavoriteSetting() { return {}; },
  saveFavoriteSettings() {},
  getAutoTime() { return '昼'; },
  getDbDefaultAmount() { return 1; },
  getFavoriteUnit() { return '個'; },
  formatFavoriteAmount() { return 'legacy'; },
  buildFavoriteLogItem() { return null; },
  localStorage: {
    getItem(key) { return store.get(key) || null; },
    setItem(key, value) { store.set(key, String(value)); }
  },
  document: {
    readyState: 'complete',
    documentElement: { classList: { add() {} } },
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() { return {}; },
    addEventListener() {}
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(primary, context, { filename: primaryPath });
vm.runInContext(b5, context, { filename: b5Path });
vm.runInContext(core, context, { filename: corePath });
vm.runInContext(catalog, context, { filename: catalogPath });
vm.runInContext(searchCode, context, { filename: searchPath });

const api = context.__PFC_DB_V3_SEARCH__;
assert.ok(api);
assert.equal(api.version, '3.7.0');
assert.ok(api.duplicateCount() >= 2, 'legacy duplicate names should be canonicalized');

let results = api.search('ゆで卵', 12);
assert.equal(results.filter(x => x.name === 'ゆで卵').length, 1, 'ゆで卵 should appear only once');
results = api.search('干し芋', 12);
assert.equal(results.filter(x => x.name === '干し芋').length, 1, '干し芋 should appear only once');

results = api.search('米', 5);
assert.equal(results[0]?.name, '白米');
assert.ok(results.some(x => x.name === '玄米'));
assert.ok(results.every(x => x.source !== 'db' || x.meta.category === 'staples'));

results = api.search('肉', 8);
assert.equal(results[0]?.name, '鶏むね(皮なし)');
assert.ok(results.length >= 2);
assert.ok(results.every(x => x.source !== 'db' || x.meta.category === 'meat'), '肉 must act as a category query, not a broad alias tie');

results = api.search('魚', 8);
assert.ok(results.length >= 3);
assert.ok(results.every(x => x.source !== 'db' || x.meta.category === 'seafood'));

results = api.search('サバ', 5);
assert.equal(results[0]?.name, 'サバ(生)', 'base-name match should beat サバ缶 broad alias/prefix');
assert.ok(results[0].score > (results.find(x => x.name === 'サバ缶(水煮)')?.score || 0));

results = api.search('ブルーベリー', 5);
assert.equal(results[0]?.name, 'ブルーベリー(生)');
assert.equal(results[0]?.meta.source.itemNo, '07124');

results = api.search('手羽元', 5);
assert.equal(results[0]?.name, '鶏手羽元(皮つき)');
assert.equal(results[0]?.meta.source.itemNo, '11286');

// My foods still outrank DB on exact same-name user entries.
context.myFoods.push({ N: '白米', P: 3, F: 0, C: 40, Cal: 180, Fav: true, useCount: 20 });
results = api.search('白米', 3);
assert.equal(results[0]?.source, 'my');
assert.equal(results[0]?.name, '白米');

console.log('Database V3 canonical search tests passed.');
