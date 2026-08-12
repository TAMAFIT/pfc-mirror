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

const norm = v => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[\s・･()（）［］\[\]\/_-]/g, '');
const num = v => Number(v || 0);
const byCountDesc = map => [...map.entries()].sort((a,b) => b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'ja'));

function unitFamily(unitRaw) {
  const u = String(unitRaw || '').normalize('NFKC').trim();
  if (/^[0-9.]+g$/i.test(u)) return 'weight-g';
  if (/^[0-9.]+ml$/i.test(u)) return 'volume-ml';
  if (/^(大さじ|小さじ)[0-9./]+$/.test(u)) return 'spoon';
  if (/^[0-9./]+(個|本|枚|切|切れ|粒|玉|束|缶|袋|杯|皿|食|箱|パック|P|舟|人前|小袋|かけ|片|スクープ)$/i.test(u)) return 'count-serving';
  if (/^(S|M|L|並|小|大|特盛|メガ)$/i.test(u)) return 'size-label';
  if (/^(小鉢|一口|少々)$/i.test(u)) return 'vague-serving';
  return 'other';
}

const categoryCounts = new Map();
const unitCounts = new Map();
const familyCounts = new Map();
const nameMap = new Map();
const normalizedNameMap = new Map();
const aliasTokenMap = new Map();
const kcalFlags = [];
const vagueUnits = [];
const nameUnitConflicts = [];
const suspiciousCategory = [];

DB.forEach((row, index) => {
  if (!Array.isArray(row) || row.length < 8) return;
  const [category, name, aliases, unit, p, f, c, kcal] = row;
  categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
  const family = unitFamily(unit);
  familyCounts.set(family, (familyCounts.get(family) || 0) + 1);

  if (!nameMap.has(name)) nameMap.set(name, []);
  nameMap.get(name).push(index);
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

  const expected = num(p) * 4 + num(f) * 9 + num(c) * 4;
  const diff = num(kcal) - expected;
  const alcoholish = /酒|ビール|ワイン|焼酎|ウイスキー|ハイボール|サワー|チューハイ|カクテル|日本酒|梅酒/i.test(String(name));
  if (!alcoholish && Math.abs(diff) >= 45) kcalFlags.push({ index, name, category, unit, kcal: num(kcal), expected: Math.round(expected), diff: Math.round(diff) });

  if (['vague-serving','size-label','other'].includes(family)) vagueUnits.push({ index, name, category, unit, family });

  const n = String(name);
  if (/\([0-9]+個\)|（[0-9]+個）/.test(n) && !/(個|皿|箱|袋)/.test(String(unit))) nameUnitConflicts.push({ index, name, unit, reason: 'name-count-vs-unit' });
  if (/\([SML]\)|（[SML]）/.test(n) && !/^[SML]$/i.test(String(unit))) nameUnitConflicts.push({ index, name, unit, reason: 'name-size-vs-unit' });
  if (/(弁当|丼|カレー|ラーメン|チャーハン|餃子|唐揚げ|ピザ|たこ焼き|お好み焼き)/.test(n) && /ジャンク・菓子/.test(String(category))) suspiciousCategory.push({ index, name, category, suggested: '料理・外食' });
  if (/(チョコ|ケーキ|ポテチ|せんべい|クッキー|アイス|菓子)/.test(n) && /ジャンク・菓子/.test(String(category))) suspiciousCategory.push({ index, name, category, suggested: '菓子・スナック' });
});

const exactDuplicates = [...nameMap.entries()].filter(([, idxs]) => idxs.length > 1).map(([name, idxs]) => ({ name, indexes: idxs }));
const normalizedDuplicates = [...normalizedNameMap.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([key, rows]) => ({ key, rows }))
  .filter(group => new Set(group.rows.map(x => x.name)).size > 1);

const aliasCollisions = [...aliasTokenMap.entries()]
  .map(([key, value]) => ({ key, raw: [...value.raw], count: value.rows.size, indexes: [...value.rows] }))
  .filter(x => x.count >= 5)
  .sort((a,b) => b.count - a.count || a.key.localeCompare(b.key, 'ja'));
const highRiskAlias = aliasCollisions.filter(x => x.key.length <= 3 || x.count >= 15);

const commonTargets = [
  '卵','卵白','白米','玄米','オートミール','食パン','うどん','そば','パスタ(乾麺)',
  '鶏むね(皮なし)','鶏むね(皮あり)','鶏もも(皮なし)','豚ヒレ','豚ロース(脂身無)','牛モモ(赤身)',
  '鮭(焼き)','サバ','マグロ','ツナ缶','納豆','木綿豆腐','絹ごし豆腐','無脂肪ヨーグルト','ギリシャヨーグルト',
  '牛乳','低脂肪牛乳','無調整豆乳','プロテイン','バナナ','りんご','みかん','キウイ','ブロッコリー','キャベツ','トマト',
  'オリーブオイル','マヨネーズ','ケチャップ','醤油','味噌','はちみつ',
  'おにぎり(鮭)','おにぎり(梅)','おにぎり(ツナマヨ)','サラダチキン','ゆで卵','唐揚げ','とんかつ','親子丼','牛丼(並盛)','カレーライス','チャーハン','ラーメン(醤油)','たこ焼き','お好み焼き'
];
const namesNorm = new Set(DB.map(row => norm(row?.[1])));
const missingTargets = commonTargets.filter(name => !namesNorm.has(norm(name)));

const report = {
  sourcePath,
  totalRows: DB.length,
  categories: Object.fromEntries(byCountDesc(categoryCounts)),
  unitFamilies: Object.fromEntries(byCountDesc(familyCounts)),
  topUnits: byCountDesc(unitCounts).slice(0, 40),
  exactDuplicates,
  normalizedDuplicates,
  highRiskAlias: highRiskAlias.slice(0, 40),
  vagueUnits: vagueUnits.slice(0, 80),
  nameUnitConflicts: nameUnitConflicts.slice(0, 80),
  kcalFlags: kcalFlags.slice(0, 80),
  suspiciousCategory: suspiciousCategory.slice(0, 120),
  missingTargets
};

console.log('=== PFC DATABASE V3 AUDIT ===');
console.log(`rows=${report.totalRows}`);
console.log('categories=' + JSON.stringify(report.categories));
console.log('unitFamilies=' + JSON.stringify(report.unitFamilies));
console.log('topUnits=' + JSON.stringify(report.topUnits));
console.log(`exactDuplicates=${exactDuplicates.length}`);
console.log(`normalizedDuplicates=${normalizedDuplicates.length}`);
console.log(`highRiskAlias=${highRiskAlias.length}`);
console.log('highRiskAliasTop=' + JSON.stringify(report.highRiskAlias.slice(0, 20)));
console.log(`vagueUnits=${vagueUnits.length}`);
console.log('vagueUnitsTop=' + JSON.stringify(report.vagueUnits.slice(0, 30)));
console.log(`nameUnitConflicts=${nameUnitConflicts.length}`);
console.log('nameUnitConflictsTop=' + JSON.stringify(report.nameUnitConflicts.slice(0, 30)));
console.log(`kcalFlags=${kcalFlags.length}`);
console.log('kcalFlagsTop=' + JSON.stringify(report.kcalFlags.slice(0, 30)));
console.log(`suspiciousCategory=${suspiciousCategory.length}`);
console.log('suspiciousCategoryTop=' + JSON.stringify(report.suspiciousCategory.slice(0, 40)));
console.log('missingTargets=' + JSON.stringify(missingTargets));

const outPath = process.argv[3];
if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
