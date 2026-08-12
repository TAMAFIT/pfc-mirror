import fs from 'node:fs';
import vm from 'node:vm';

const sourceDb = process.argv[2] || '_source_pfc/database.js';
const outPath = process.argv[3] || 'food-master-effective.json';
const overlays = [
  'overrides/pfc-v21.js',
  'overrides/pfc-database-v3-verified.js',
  'overrides/pfc-database-v3-verified-b5.js',
  'overrides/pfc-database-v3-mext-promoted.js',
  'overrides/pfc-database-v3.js',
  'overrides/pfc-database-v3-catalog.js',
  'overrides/pfc-database-v3-multiunit.js',
  'overrides/pfc-database-v3-search.js'
];
for (const file of [sourceDb, ...overlays]) if (!fs.existsSync(file)) throw new Error(`Missing Food Master dependency: ${file}`);

const store = new Map();
const context = {
  console, myFoods: [], favoriteSettings: {},
  getFavoriteSetting(source, index) { const key = `${source}:${index}`; return this.favoriteSettings[key] ||= {}; },
  saveFavoriteSettings() {}, getAutoTime() { return '昼'; }, getDbDefaultAmount() { return 1; },
  getFavoriteUnit() { return '個'; }, formatFavoriteAmount() { return 'legacy'; }, buildFavoriteLogItem() { return null; },
  localStorage: { getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k,v) { store.set(k,String(v)); }, removeItem(k) { store.delete(k); } },
  document: {
    readyState: 'complete', documentElement: { classList: { add() {}, remove() {} } }, head: { appendChild() {} }, body: { appendChild() {} },
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){}}, appendChild(){},append(){},insertBefore(){},remove(){},addEventListener(){},closest(){return null;} }; },
    addEventListener() {}
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(sourceDb,'utf8'), context, { filename: sourceDb });
for (const file of overlays) vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename: file });
const api = context.__PFC_DB_V3__;
const search = context.__PFC_DB_V3_SEARCH__;
if (!api || !search) throw new Error('Database V3 did not initialize');

const norm = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0x60))
  .replace(/[\s・･()（）\-_/]/g,'');
const seen = new Set();
const items = [];
for (const item of api.items) {
  const key = norm(item.name);
  if (seen.has(key)) continue;
  seen.add(key);
  const basis = item.nutritionBasis || {};
  let per100g = null;
  if (basis.type === 'mass' && basis.exact !== false && Number(basis.amount) > 0) {
    const m = 100 / Number(basis.amount);
    per100g = Object.fromEntries(['p','f','c','a','kcal'].map(k => [k, Number(((Number(item.nutrition?.[k]) || 0) * m).toFixed(k === 'kcal' ? 2 : 4))]));
  }
  items.push({
    id: item.id, canonicalId: item.canonicalId || null, runtimeIndex: item.runtimeIndex, legacyIndex: item.legacyIndex,
    name: item.name, baseName: item.baseName, variant: item.variant,
    aliases: item.aliases || [], genericTags: item.genericTags || [], category: item.category, legacyCategory: item.legacyCategory,
    nutritionBasis: item.nutritionBasis, nutrition: item.nutrition, per100g,
    input: item.input, source: item.source, confidence: item.confidence, provenance: item.provenance || null,
    duplicateOf: item.duplicateOf || null
  });
}
const payload = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  sourceDb,
  effectiveRows: api.items.length,
  canonicalRows: items.length,
  duplicateRowsSuppressed: api.items.length - items.length,
  markers: {
    dbv3: api.version,
    search: search.version,
    primaryVerified: context.__PFC_DB_V3_VERIFIED__?.version,
    b5Verified: context.__PFC_DB_V3_VERIFIED_B5__?.version,
    mextPromoted: context.__PFC_DB_V3_MEXT_PROMOTED__?.version,
    catalog: context.__PFC_DB_V3_CATALOG__?.version
  },
  items
};
fs.writeFileSync(outPath, JSON.stringify(payload,null,2)+'\n');
console.log(`FOOD_MASTER_EXPORT canonical=${items.length} effective=${api.items.length} mext=${items.filter(x => x.source?.kind === 'mext').length} output=${outPath}`);
