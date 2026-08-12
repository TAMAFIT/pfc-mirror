import fs from 'node:fs';
import vm from 'node:vm';

const sourceDb = process.argv[2] || '_source_pfc/database.js';
const outPath = process.argv[3] || 'database-v3-effective-audit.json';
const files = [
  sourceDb,
  'overrides/pfc-v21.js',
  'overrides/pfc-database-v3-verified.js',
  'overrides/pfc-database-v3-verified-b5.js',
  'overrides/pfc-database-v3.js',
  'overrides/pfc-database-v3-catalog.js',
  'overrides/pfc-database-v3-multiunit.js',
  'overrides/pfc-database-v3-search.js'
];
for (const file of files) if (!fs.existsSync(file)) throw new Error(`Missing effective-audit dependency: ${file}`);

const store = new Map();
const context = {
  console,
  myFoods: [],
  favoriteSettings: {},
  getFavoriteSetting(source, index) {
    const key = `${source}:${index}`;
    if (!this.favoriteSettings[key]) this.favoriteSettings[key] = {};
    return this.favoriteSettings[key];
  },
  saveFavoriteSettings() {},
  getAutoTime() { return '昼'; },
  getDbDefaultAmount() { return 1; },
  getFavoriteUnit() { return '個'; },
  formatFavoriteAmount() { return 'legacy'; },
  buildFavoriteLogItem() { return null; },
  localStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  },
  document: {
    readyState: 'complete',
    documentElement: { classList: { add() {}, remove() {} } },
    head: { appendChild() {} },
    body: { appendChild() {} },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        id: '', className: '', textContent: '', innerHTML: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {}, append() {}, insertBefore() {}, remove() {},
        addEventListener() {}, closest() { return null; }
      };
    },
    addEventListener() {}
  }
};
context.window = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(sourceDb, 'utf8') + '\n;globalThis.__LEGACY_DB_SIZE__ = DB.length;', context, { filename: sourceDb });
for (const file of files.slice(1)) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

const api = context.__PFC_DB_V3__;
const search = context.__PFC_DB_V3_SEARCH__;
const multi = context.__PFC_DB_V3_MULTIUNIT__;
if (!api || !search || !multi) throw new Error('Effective Database V3 did not initialize completely');

const norm = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
  .replace(/[\s・･()（）\-_/]/g, '');
const countBy = (items, fn) => items.reduce((acc, item) => {
  const key = String(fn(item) ?? 'unknown');
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const sortedObject = object => Object.fromEntries(Object.entries(object).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')));

const items = api.items;
const canonicalNames = new Set();
const canonicalItems = [];
for (const item of items) {
  const key = norm(item.name);
  if (canonicalNames.has(key)) continue;
  canonicalNames.add(key);
  canonicalItems.push(item);
}

const verified = canonicalItems.filter(item => ['mext','manufacturer','restaurant'].includes(item.source?.kind));
const curated = canonicalItems.filter(item => item.source?.kind === 'mirror-curated');
const legacy = canonicalItems.filter(item => item.source?.kind === 'legacy');
const lowConfidence = canonicalItems.filter(item => item.confidence === 'low' || item.nutritionBasis?.exact === false);
const multiunitFoods = canonicalItems.filter(item => (multi.getUnits(item.runtimeIndex) || []).length > 1);

const unitCounts = sortedObject(countBy(canonicalItems, item => item.input?.defaultUnit));
const unitTypeCounts = sortedObject(countBy(canonicalItems, item => item.input?.type));
const categoryCounts = sortedObject(countBy(canonicalItems, item => item.category));
const sourceCounts = sortedObject(countBy(canonicalItems, item => item.source?.kind));

const mealPattern = /(弁当|丼|パスタ|ナポリタン|カルボナーラ|ペペロンチーノ|オムライス|ドリア|グラタン|焼きそば|冷やし中華|カップ麺)/;
const suspiciousMealUnits = canonicalItems
  .filter(item => mealPattern.test(item.name) && ['個','本','枚'].includes(item.input?.defaultUnit))
  .map(item => ({ name: item.name, category: item.category, unit: item.input.defaultUnit, basis: item.nutritionBasis?.legacy }));

const vagueUnits = canonicalItems
  .filter(item => item.nutritionBasis?.exact === false || item.nutritionBasis?.vague === true)
  .map(item => ({ name: item.name, category: item.category, legacyBasis: item.nutritionBasis?.legacy, displayUnit: item.input?.defaultUnit, confidence: item.confidence }));

const desiredCoverage = [
  ['醤油',['こいくち醤油','しょうゆ']], ['上白糖',['上白糖']], ['米みそ',['米みそ']], ['本みりん',['本みりん']],
  ['ポン酢',['ポン酢','ぽん酢']], ['ウスターソース',['ウスターソース']], ['中濃ソース',['中濃ソース']], ['料理酒',['料理酒']],
  ['豚肩ロース',['豚肩ロース']], ['鶏手羽元',['鶏手羽元']], ['サバ生',['サバ(生)']], ['アジ生',['アジ(生)']], ['まだら',['まだら']],
  ['ピーマン',['ピーマン']], ['なす',['なす']], ['白菜',['白菜']], ['小松菜',['小松菜']], ['アスパラ',['アスパラガス']], ['にんにく',['にんにく']], ['長ねぎ',['長ねぎ']], ['ズッキーニ',['ズッキーニ']], ['とうもろこし',['スイートコーン']],
  ['マンゴー',['マンゴー(生)']], ['ブルーベリー',['ブルーベリー(生)']], ['オレンジ',['ネーブルオレンジ(生)']],
  ['牡蠣',['かき','牡蠣']], ['たこ',['たこ','タコ']], ['いか',['いか','イカ']], ['えび',['えび','エビ']],
  ['大葉',['しそ','大葉']], ['もやし',['もやし']], ['きのこ',['しめじ','えのき','エリンギ']],
  ['豆腐',['木綿豆腐','絹ごし豆腐']], ['納豆',['納豆']], ['牛乳',['牛乳']], ['豆乳',['豆乳']], ['ヨーグルト',['ヨーグルト']],
  ['米',['白米']], ['食パン',['食パン']], ['うどん',['うどん']], ['そば',['そば']], ['パスタ',['パスタ']],
  ['鶏むね',['鶏むね']], ['豚ヒレ',['豚ヒレ']], ['牛モモ',['牛モモ']], ['鮭',['鮭']], ['マグロ',['マグロ']],
  ['バナナ',['バナナ']], ['りんご',['りんご']], ['キウイ',['キウイ']]
];
const searchableText = canonicalItems.map(item => norm(`${item.name} ${(item.aliases || []).join(' ')}`));
const missingCoverage = desiredCoverage
  .filter(([, terms]) => !terms.some(term => searchableText.some(text => text.includes(norm(term)))))
  .map(([label]) => label);

const searchSmoke = {};
for (const query of ['米','パン','麺','肉','鶏肉','豚肉','魚','野菜','果物','卵','サバ','ブルーベリー','手羽元']) {
  searchSmoke[query] = search.search(query, 6).map(result => result.name);
}

const report = {
  generatedAt: new Date().toISOString(),
  legacyRows: context.__LEGACY_DB_SIZE__,
  effectiveRows: items.length,
  canonicalRows: search.canonicalCount(),
  duplicateRowsSuppressed: search.duplicateCount(),
  verifiedCanonicalRows: verified.length,
  verifiedCoveragePercent: Number((verified.length / Math.max(1, canonicalItems.length) * 100).toFixed(1)),
  curatedCanonicalRows: curated.length,
  legacyCanonicalRows: legacy.length,
  multiunitFoods: multiunitFoods.map(item => ({ name: item.name, units: multi.getUnits(item.runtimeIndex).map(unit => unit.label) })),
  multiunitCount: multiunitFoods.length,
  lowConfidenceCount: lowConfidence.length,
  sourceCounts,
  categoryCounts,
  unitTypeCounts,
  unitCounts,
  suspiciousMealUnits,
  vagueUnits: vagueUnits.slice(0, 80),
  missingCoverage,
  searchSmoke,
  markers: {
    searchVersion: search.version,
    multiunitVersion: multi.version,
    primaryVerifiedVersion: context.__PFC_DB_V3_VERIFIED__?.version,
    b5VerifiedVersion: context.__PFC_DB_V3_VERIFIED_B5__?.version,
    catalogVersion: context.__PFC_DB_V3_CATALOG__?.version
  }
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('=== EFFECTIVE DATABASE V3 AUDIT ===');
console.log(JSON.stringify({
  legacyRows: report.legacyRows,
  effectiveRows: report.effectiveRows,
  canonicalRows: report.canonicalRows,
  duplicateRowsSuppressed: report.duplicateRowsSuppressed,
  verifiedCanonicalRows: report.verifiedCanonicalRows,
  verifiedCoveragePercent: report.verifiedCoveragePercent,
  multiunitCount: report.multiunitCount,
  lowConfidenceCount: report.lowConfidenceCount,
  suspiciousMealUnits: report.suspiciousMealUnits.length,
  missingCoverage: report.missingCoverage,
  searchSmoke: report.searchSmoke
}, null, 2));
