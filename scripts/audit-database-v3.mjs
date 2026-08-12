import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = process.argv[2] || '_source_pfc/database.js';
if (!fs.existsSync(sourcePath)) throw new Error(`Database not found: ${sourcePath}`);

const source = fs.readFileSync(sourcePath, 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\n;globalThis.__PFC_DB_AUDIT__ = DB;`, context, { filename: sourcePath });
const DB = context.__PFC_DB_AUDIT__;
if (!Array.isArray(DB)) throw new Error('DB was not an array');

const norm = v => String(v ?? '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
  .replace(/[\s・･()（）［］\[\]\/_-]/g, '');
const num = v => Number(v || 0);
const byCountDesc = map => [...map.entries()].sort((a,b) => b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'ja'));

function unitFamily(unitRaw) {
  const u = String(unitRaw || '').normalize('NFKC').trim();
  if (/^[0-9.]+g$/i.test(u)) return 'weight-g';
  if (/^[0-9.]+ml$/i.test(u)) return 'volume-ml';
  if (/^(大さじ|小さじ)[0-9./]+$/.test(u)) return 'spoon';
  if (/^[0-9./]+(個|本|枚|切|切れ|粒|玉|束|缶|袋|杯|皿|食|箱|パック|P|舟|人前|小袋|かけ|片|スクープ|尾|貫|合|個分)$/i.test(u)) return 'count-serving';
  if (/^(S|M|L|並|小|大|特盛|メガ)$/i.test(u)) return 'size-label';
  if (/^(小鉢|一口|少々)$/i.test(u)) return 'vague-serving';
  return 'other';
}

const categoryCounts = new Map();
const unitCounts = new Map();
const familyCounts = new Map();
const rowLengthCounts = new Map();
const categoryFamily = new Map();
const nameMap = new Map();
const normalizedNameMap = new Map();
const aliasTokenMap = new Map();
const kcalFlags = [];
const missingAlcoholField = [];
const vagueUnits = [];
const nameUnitConflicts = [];
const suspiciousCategory = [];

DB.forEach((row, index) => {
  if (!Array.isArray(row) || row.length < 8) return;
  const [category, name, aliases, unit, p, f, c, kcal, alcohol] = row;
  rowLengthCounts.set(row.length, (rowLengthCounts.get(row.length) || 0) + 1);
  categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
  const family = unitFamily(unit);
  familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  if (!categoryFamily.has(category)) categoryFamily.set(category, new Map());
  categoryFamily.get(category).set(family, (categoryFamily.get(category).get(family) || 0) + 1);

  if (!nameMap.has(name)) nameMap.set(name, []);
  nameMap.get(name).push({ index, category, unit, p: num(p), f: num(f), c: num(c), kcal: num(kcal), alcohol: Number.isFinite(Number(alcohol)) ? Number(alcohol) : null });
  const nn = norm(name);
  if (!normalizedNameMap.has(nn)) normalizedNameMap.set(nn, []);
  normalizedNameMap.get(nn).push({ index, name });

  String(aliases || '').split(/\s+/).filter(Boolean).forEach(token => {
    const key = norm(token);
    if (!key) return;
    if (!aliasTokenMap.has(key)) aliasTokenMap.set(key, { raw: new Set(), rows: new Set() });
    aliasTokenMap.get(key).raw.add(token);
    aliasTokenMap.get(key).rows.add(index);
  });

  const a = Number.isFinite(Number(alcohol)) ? Number(alcohol) : 0;
  const expected = num(p) * 4 + num(f) * 9 + num(c) * 4 + a * 7;
  const diff = num(kcal) - expected;
  if (Math.abs(diff) >= 45) kcalFlags.push({ index, name, category, unit, kcal: num(kcal), expected: Math.round(expected), diff: Math.round(diff), alcohol: a });

  const alcoholish = /酒|ビール|ワイン|焼酎|ウイスキー|ハイボール|サワー|チューハイ|カクテル|日本酒|梅酒|ジン|ウォッカ|モスコミュール|カシス|ピーチ|シャンディ|マッコリ|ストロング/i.test(String(name));
  if (alcoholish && !(Number.isFinite(Number(alcohol)) && Number(alcohol) > 0)) {
    missingAlcoholField.push({ index, name, category, unit, kcal: num(kcal) });
  }

  if (['vague-serving','size-label','other'].includes(family)) vagueUnits.push({ index, name, category, unit, family });

  const n = String(name);
  if (/\([0-9]+個\)|（[0-9]+個）/.test(n) && !/(個|皿|箱|袋)/.test(String(unit))) nameUnitConflicts.push({ index, name, unit, reason: 'name-count-vs-unit' });
  if (/\([SML]\)|（[SML]）/.test(n) && !/^[SML]$/i.test(String(unit))) nameUnitConflicts.push({ index, name, unit, reason: 'name-size-vs-unit' });
  if (/(弁当|丼|カレー|ラーメン|チャーハン|餃子|唐揚げ|ピザ|たこ焼き|お好み焼き|麻婆豆腐)/.test(n) && /ジャンク・菓子/.test(String(category))) suspiciousCategory.push({ index, name, category, suggested: '料理・外食' });
  if (/(チョコ|ケーキ|ポテチ|せんべい|クッキー|アイス|菓子|じゃがりこ|ジャガビー|カラムーチョ|ポッキー|トッポ)/.test(n) && /ジャンク・菓子/.test(String(category))) suspiciousCategory.push({ index, name, category, suggested: '菓子・スナック' });
});

const exactDuplicates = [...nameMap.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([name, rows]) => ({ name, rows }));
const normalizedDuplicates = [...normalizedNameMap.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([key, rows]) => ({ key, rows }))
  .filter(group => new Set(group.rows.map(x => x.name)).size > 1);

const aliasCollisions = [...aliasTokenMap.entries()]
  .map(([key, value]) => ({ key, raw: [...value.raw], count: value.rows.size, indexes: [...value.rows] }))
  .filter(x => x.count >= 5)
  .sort((a,b) => b.count - a.count || a.key.localeCompare(b.key, 'ja'));
const highRiskAlias = aliasCollisions.filter(x => x.key.length <= 3 || x.count >= 15);

const coverageTargets = [
  { label: '卵', terms: ['全卵','卵'] },
  { label: '卵白', terms: ['卵白'] },
  { label: '白米', terms: ['白米'] },
  { label: '玄米', terms: ['玄米'] },
  { label: 'オートミール', terms: ['オートミール'] },
  { label: '食パン', terms: ['食パン'] },
  { label: 'うどん', terms: ['うどん'] },
  { label: 'そば', terms: ['そば'] },
  { label: 'パスタ', terms: ['パスタ'] },
  { label: '鶏むね皮なし', terms: ['鶏むね皮なし'] },
  { label: '鶏むね皮あり', terms: ['鶏むね皮あり'] },
  { label: '鶏もも', terms: ['鶏もも'] },
  { label: '豚ヒレ', terms: ['豚ヒレ'] },
  { label: '豚ロース', terms: ['豚ロース'] },
  { label: '牛モモ', terms: ['牛モモ'] },
  { label: '鮭', terms: ['鮭','さけ'] },
  { label: 'サバ', terms: ['サバ','さば'] },
  { label: 'マグロ', terms: ['マグロ','まぐろ'] },
  { label: 'ツナ', terms: ['ツナ'] },
  { label: '納豆', terms: ['納豆'] },
  { label: '木綿豆腐', terms: ['木綿豆腐'] },
  { label: '絹ごし豆腐', terms: ['絹ごし豆腐'] },
  { label: '無脂肪ヨーグルト', terms: ['無脂肪ヨーグルト'] },
  { label: 'ギリシャヨーグルト', terms: ['ギリシャヨーグルト','オイコス'] },
  { label: '牛乳', terms: ['牛乳'] },
  { label: '低脂肪牛乳', terms: ['低脂肪牛乳'] },
  { label: '豆乳', terms: ['豆乳'] },
  { label: 'プロテイン', terms: ['プロテイン'] },
  { label: 'バナナ', terms: ['バナナ'] },
  { label: 'りんご', terms: ['りんご'] },
  { label: 'みかん', terms: ['みかん'] },
  { label: 'キウイ', terms: ['キウイ'] },
  { label: 'ブロッコリー', terms: ['ブロッコリー'] },
  { label: 'キャベツ', terms: ['キャベツ'] },
  { label: 'トマト', terms: ['トマト'] },
  { label: 'オリーブオイル', terms: ['オリーブオイル'] },
  { label: 'マヨネーズ', terms: ['マヨネーズ'] },
  { label: 'ケチャップ', terms: ['ケチャップ'] },
  { label: '醤油', terms: ['醤油','しょうゆ'] },
  { label: '味噌', terms: ['味噌','みそ'] },
  { label: 'はちみつ', terms: ['はちみつ','蜂蜜'] },
  { label: '鮭おにぎり', terms: ['鮭おにぎり','おにぎり鮭'] },
  { label: '梅おにぎり', terms: ['梅おにぎり','おにぎり梅'] },
  { label: 'ツナマヨおにぎり', terms: ['ツナマヨおにぎり','おにぎりツナマヨ'] },
  { label: 'サラダチキン', terms: ['サラダチキン'] },
  { label: 'ゆで卵', terms: ['ゆで卵'] },
  { label: '唐揚げ', terms: ['唐揚げ','からあげ'] },
  { label: 'とんかつ', terms: ['とんかつ','トンカツ'] },
  { label: '親子丼', terms: ['親子丼'] },
  { label: '牛丼', terms: ['牛丼'] },
  { label: 'カレーライス', terms: ['カレーライス'] },
  { label: 'チャーハン', terms: ['チャーハン','炒飯'] },
  { label: '醤油ラーメン', terms: ['ラーメン醤油','醤油ラーメン'] },
  { label: 'たこ焼き', terms: ['たこ焼き'] },
  { label: 'お好み焼き', terms: ['お好み焼き'] }
];
const searchable = DB.map(row => norm(`${row?.[1] || ''} ${row?.[2] || ''}`));
const missingTargets = coverageTargets
  .filter(target => !target.terms.some(term => searchable.some(text => text.includes(norm(term)))))
  .map(target => target.label);

const categoryUnitFamilies = {};
for (const [category, map] of categoryFamily.entries()) categoryUnitFamilies[category] = Object.fromEntries(byCountDesc(map));

const report = {
  sourcePath,
  totalRows: DB.length,
  rowLengths: Object.fromEntries(byCountDesc(rowLengthCounts)),
  categories: Object.fromEntries(byCountDesc(categoryCounts)),
  unitFamilies: Object.fromEntries(byCountDesc(familyCounts)),
  categoryUnitFamilies,
  units: byCountDesc(unitCounts),
  exactDuplicates,
  normalizedDuplicates,
  highRiskAlias: highRiskAlias.slice(0, 60),
  vagueUnits: vagueUnits.slice(0, 100),
  nameUnitConflicts: nameUnitConflicts.slice(0, 100),
  kcalFlags: kcalFlags.slice(0, 100),
  missingAlcoholField: missingAlcoholField.slice(0, 100),
  suspiciousCategory: suspiciousCategory.slice(0, 160),
  missingTargets
};

console.log('=== PFC DATABASE V3 AUDIT ===');
console.log(`rows=${report.totalRows}`);
console.log('rowLengths=' + JSON.stringify(report.rowLengths));
console.log('categories=' + JSON.stringify(report.categories));
console.log('unitFamilies=' + JSON.stringify(report.unitFamilies));
console.log('categoryUnitFamilies=' + JSON.stringify(report.categoryUnitFamilies));
console.log('units=' + JSON.stringify(report.units));
console.log(`exactDuplicates=${exactDuplicates.length}`);
console.log('exactDuplicatesDetail=' + JSON.stringify(exactDuplicates));
console.log(`normalizedDuplicates=${normalizedDuplicates.length}`);
console.log(`highRiskAlias=${highRiskAlias.length}`);
console.log('highRiskAliasTop=' + JSON.stringify(report.highRiskAlias.slice(0, 25)));
console.log(`vagueUnits=${vagueUnits.length}`);
console.log('vagueUnitsDetail=' + JSON.stringify(report.vagueUnits));
console.log(`nameUnitConflicts=${nameUnitConflicts.length}`);
console.log('nameUnitConflictsDetail=' + JSON.stringify(report.nameUnitConflicts));
console.log(`kcalFlags=${kcalFlags.length}`);
console.log('kcalFlagsTop=' + JSON.stringify(report.kcalFlags.slice(0, 35)));
console.log(`missingAlcoholField=${missingAlcoholField.length}`);
console.log('missingAlcoholFieldTop=' + JSON.stringify(report.missingAlcoholField.slice(0, 35)));
console.log(`suspiciousCategory=${suspiciousCategory.length}`);
console.log('suspiciousCategoryTop=' + JSON.stringify(report.suspiciousCategory.slice(0, 50)));
console.log('missingTargets=' + JSON.stringify(missingTargets));

const outPath = process.argv[3];
if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
