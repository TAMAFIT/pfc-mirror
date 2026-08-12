import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const scriptPath = process.argv[2] || 'overrides/pfc-database-v3.js';
const code = fs.readFileSync(scriptPath, 'utf8');

const DB = [
  ['🍚炭水化物','白米','ごはん 米','100g',2.5,0.3,37.1,168],
  ['🥚卵・乳・大豆','牛乳','ミルク','200ml',6.8,7.8,9.9,134],
  ['🧈油脂類','アーモンド','ナッツ','10粒',1.9,5.4,2.0,60],
  ['🍎果物','グレープフルーツ','フルーツ','1/2個',1.0,0.0,20.0,80],
  ['🧈油脂類','オリーブオイル','油','大さじ1',0,12,0,111],
  ['💊サプリ','クレアチン','creatine','5g',0,0,0,0],
  ['🥚卵・乳・大豆','納豆','なっとう','1P',8,5,6,100],
  ['🍔ジャンク・菓子','ケンタッキー','チキン','1P',18,15,8,237],
  ['🥚卵・乳・大豆','テスト厚揚げ','豆腐','100g',10,10,0,250],
  ['🍺酒・ジュース','テストビール','ビール 酒','500ml',0,0,15,200,20]
];

const store = new Map();
const favoriteSettings = {
  'db:1': { amount: 1 },
  'db:2': { amount: 1 }
};
let savedFavorites = 0;

const context = {
  console,
  DB,
  favoriteSettings,
  getFavoriteSetting(source, index) {
    const key = `${source}:${index}`;
    if (!favoriteSettings[key]) favoriteSettings[key] = {};
    return favoriteSettings[key];
  },
  saveFavoriteSettings() { savedFavorites += 1; },
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
vm.runInContext(code, context, { filename: scriptPath });

const api = context.__PFC_DB_V3__;
assert.ok(api, 'Database V3 API should be installed');
assert.equal(api.version, '3.0.0');

// Saved legacy non-g favorite amounts were multipliers. V3 migrates them to human amounts once.
assert.equal(favoriteSettings['db:1'].amount, 200, 'legacy milk amount 1 should become 200ml');
assert.equal(favoriteSettings['db:2'].amount, 10, 'legacy almonds amount 1 should become 10粒');
assert.ok(savedFavorites >= 1);
assert.equal(store.get('pfc-db-v3-favorite-units-300'), '1');

// Mass scales by the numeric gram basis.
let scaled = api.scale(0, 200);
assert.equal(scaled.multiplier, 2);
assert.equal(scaled.kcal, 336);
assert.equal(api.get(0).input.defaultUnit, 'g');

// Volume is a real amount, not a 200x serving multiplier.
scaled = api.scale(1, 200);
assert.equal(scaled.multiplier, 1);
assert.equal(scaled.kcal, 134);
assert.equal(api.get(1).input.defaultUnit, 'ml');
assert.equal(context.getDbDefaultAmount(1), 200);

// Count bases keep their actual basis amount.
scaled = api.scale(2, 10);
assert.equal(scaled.multiplier, 1);
assert.equal(api.formatAmount(api.get(2), 10), '10粒');

// Fractional count bases are parsed correctly.
scaled = api.scale(3, 0.5);
assert.equal(scaled.multiplier, 1);
assert.equal(api.formatAmount(api.get(3), 0.5), '0.5個');

// Cooking measures are first-class units.
scaled = api.scale(4, 1);
assert.equal(scaled.multiplier, 1);
assert.equal(api.formatAmount(api.get(4), 1), '大さじ1');

// Small gram bases keep a small default and step instead of becoming 100g.
assert.equal(api.get(5).input.defaultAmount, 5);
assert.equal(api.get(5).input.quickStep, 1);

// Legacy P becomes a human package/piece label where appropriate.
assert.equal(api.get(6).input.defaultUnit, 'パック');
assert.equal(api.formatAmount(api.get(6), 1), '1パック');
assert.equal(api.get(7).input.defaultUnit, 'ピース');
assert.equal(api.formatAmount(api.get(7), 1), '1ピース');

// kcal is first-class data; do not synthesize it from P/F/C when scaling.
scaled = api.scale(8, 200);
assert.equal(scaled.kcal, 500, 'stored 250 kcal per 100g should scale to 500 kcal');
assert.equal(scaled.a, 0, 'kcal/PFC mismatch must not create phantom alcohol');
const record = api.buildRecord(8, 200, '昼');
assert.equal(record.Cal, 500);
assert.equal(record.A, 0);

// Explicit alcohol scales independently.
scaled = api.scale(9, 500);
assert.equal(scaled.a, 20);
assert.equal(scaled.kcal, 200);
assert.equal(api.get(9).category, 'alcohol');

console.log('Database V3 scaling tests passed.');
