import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const verifiedSource = path.join(root, 'overrides', 'pfc-database-v3-verified.js');
const verifiedOutput = path.join(dist, 'pfc-database-v3-verified.js');
const verifiedB5Source = path.join(root, 'overrides', 'pfc-database-v3-verified-b5.js');
const verifiedB5Output = path.join(dist, 'pfc-database-v3-verified-b5.js');
const promotedSource = path.join(root, 'overrides', 'pfc-database-v3-mext-promoted.js');
const promotedOutput = path.join(dist, 'pfc-database-v3-mext-promoted.js');
const registrySource = path.join(root, 'overrides', 'pfc-food-master-mext-registry.js');
const registryOutput = path.join(dist, 'pfc-food-master-mext-registry.js');
const catalogSource = path.join(root, 'overrides', 'pfc-database-v3-catalog.js');
const catalogOutput = path.join(dist, 'pfc-database-v3-catalog.js');
const multiunitSource = path.join(root, 'overrides', 'pfc-database-v3-multiunit.js');
const multiunitOutput = path.join(dist, 'pfc-database-v3-multiunit.js');
const searchSource = path.join(root, 'overrides', 'pfc-database-v3-search.js');
const searchOutput = path.join(dist, 'pfc-database-v3-search.js');
const htmlPath = path.join(dist, 'index.html');

for (const required of [verifiedSource, verifiedB5Source, promotedSource, registrySource, catalogSource, multiunitSource, searchSource, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Database V3 catalog dependency missing: ${required}`);
}

fs.copyFileSync(verifiedSource, verifiedOutput);
fs.copyFileSync(verifiedB5Source, verifiedB5Output);
fs.copyFileSync(promotedSource, promotedOutput);
fs.copyFileSync(registrySource, registryOutput);
fs.copyFileSync(catalogSource, catalogOutput);
fs.copyFileSync(multiunitSource, multiunitOutput);
fs.copyFileSync(searchSource, searchOutput);
let html = fs.readFileSync(htmlPath, 'utf8');

const injectBeforeCore = (name, version, error) => {
  if (html.includes(name)) return;
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error(error);
  html = html.replace(coreTag, `    <script src="${name}?v=${version}"></script>\n${coreTag}`);
};
injectBeforeCore('pfc-database-v3-verified.js', '340', 'Database V3 core script tag was not found.');
injectBeforeCore('pfc-database-v3-verified-b5.js', '351', 'Database V3 core script tag was not found for B5.');
injectBeforeCore('pfc-database-v3-mext-promoted.js', '380', 'Database V3 core script tag was not found for MEXT promotion.');
injectBeforeCore('pfc-food-master-mext-registry.js', '400', 'Database V3 core script tag was not found for central MEXT registry.');

if (!html.includes('pfc-database-v3-catalog.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found.');
  html = html.replace(manualTag, `    <script src="pfc-database-v3-catalog.js?v=312"></script>\n${manualTag}`);
}
if (!html.includes('pfc-database-v3-multiunit.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found for multi-unit injection.');
  html = html.replace(manualTag, `${manualTag}\n    <script src="pfc-database-v3-multiunit.js?v=360"></script>`);
}
if (!html.includes('pfc-database-v3-search.js')) {
  const inputTag = '    <script src="pfc-input-v25.js?v=251"></script>';
  if (!html.includes(inputTag)) throw new Error('PFC input V2.5 script tag was not found for V3 search injection.');
  html = html.replace(inputTag, `    <script src="pfc-database-v3-search.js?v=370"></script>\n${inputTag}`);
}
fs.writeFileSync(htmlPath, html, 'utf8');

const verified = fs.readFileSync(verifiedOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_VERIFIED__', "VERSION = '3.4.0'", 'こいくち醤油', '本みりん', '豚肩ロース(脂身つき)', '鶏手羽元(皮つき)', 'サバ(生)', 'アジ(生)', 'ピーマン', 'なす', '白菜', '小松菜', 'アスパラガス', 'にんにく', '長ねぎ']) {
  if (!verified.includes(marker)) throw new Error(`Database V3 verified marker missing: ${marker}`);
}
const verifiedB5 = fs.readFileSync(verifiedB5Output, 'utf8');
for (const marker of ['__PFC_DB_V3_VERIFIED_B5__', "VERSION = '3.5.1'", 'まだら(生)', 'スイートコーン(生)', 'ズッキーニ', 'マンゴー(生)', 'ブルーベリー(生)', 'ネーブルオレンジ(生)']) {
  if (!verifiedB5.includes(marker)) throw new Error(`Database V3 B5 marker missing: ${marker}`);
}
const promoted = fs.readFileSync(promotedOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_MEXT_PROMOTED__', "VERSION = '3.8.0'", 'mext:01088', 'mext:11220', '白米', 'オートミール', 'パスタ(乾麺)', '鶏むね(皮なし)', '豚ひき肉', 'うなぎ(蒲焼)', 'きゅうり', 'カッテージチーズ']) {
  if (!promoted.includes(marker)) throw new Error(`Database V3 MEXT promoted marker missing: ${marker}`);
}
const registry = fs.readFileSync(registryOutput, 'utf8');
for (const marker of ['__PFC_FOOD_MASTER_MEXT_REGISTRY__', "VERSION = '4.0.0'", 'REGISTRY_DATA_START', 'mext:17007', 'mext:01088', 'mext:13033', 'DATASET_SHA256']) {
  if (!registry.includes(marker)) throw new Error(`Food Master central MEXT registry marker missing: ${marker}`);
}
const catalog = fs.readFileSync(catalogOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_CATALOG__', "VERSION = '3.1.2'", 'BUNDLE_COUNT_BASES', 'MEAL_AS_ONE_SERVING', 'maffRiceServingGuide', 'maffEggStandard', 'applyVerifiedSources', 'provenanceSchema']) {
  if (!catalog.includes(marker)) throw new Error(`Database V3 catalog marker missing: ${marker}`);
}
const multiunit = fs.readFileSync(multiunitOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_MULTIUNIT__', "VERSION = '3.6.0'", 'scaleInput', 'buildRecordInput', 'basisPerUnit', 'dbv3-unit-switch']) {
  if (!multiunit.includes(marker)) throw new Error(`Database V3 multi-unit marker missing: ${marker}`);
}
const search = fs.readFileSync(searchOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_SEARCH__', "VERSION = '3.7.0'", 'canonicalItems', 'Generic tags', 'CATEGORY_QUERY', 'duplicateCount']) {
  if (!search.includes(marker)) throw new Error(`Database V3 search marker missing: ${marker}`);
}

const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const positions = {
  v21: finalHtml.indexOf('pfc-v21.js'), verified: finalHtml.indexOf('pfc-database-v3-verified.js'),
  b5: finalHtml.indexOf('pfc-database-v3-verified-b5.js'), promoted: finalHtml.indexOf('pfc-database-v3-mext-promoted.js'),
  registry: finalHtml.indexOf('pfc-food-master-mext-registry.js'), core: finalHtml.indexOf('pfc-database-v3.js'),
  catalog: finalHtml.indexOf('pfc-database-v3-catalog.js'), manual: finalHtml.indexOf('pfc-database-v3-manual.js'),
  multi: finalHtml.indexOf('pfc-database-v3-multiunit.js'), search: finalHtml.indexOf('pfc-database-v3-search.js'), input: finalHtml.indexOf('pfc-input-v25.js')
};
if (!(positions.v21 >= 0 && positions.verified > positions.v21 && positions.b5 > positions.verified && positions.promoted > positions.b5 && positions.registry > positions.promoted && positions.core > positions.registry && positions.catalog > positions.core && positions.manual > positions.catalog && positions.multi > positions.manual && positions.search > positions.multi && positions.input > positions.search)) {
  throw new Error('Database V3 script ordering is invalid.');
}
for (const marker of ['pfc-database-v3-verified.js?v=340','pfc-database-v3-verified-b5.js?v=351','pfc-database-v3-mext-promoted.js?v=380','pfc-food-master-mext-registry.js?v=400','pfc-database-v3-catalog.js?v=312','pfc-database-v3-multiunit.js?v=360','pfc-database-v3-search.js?v=370']) {
  if (!finalHtml.includes(marker)) throw new Error(`Database V3 cache version is stale: ${marker}`);
}

const runtimeApply = path.join(root, 'scripts', 'apply-food-master-runtime.mjs');
if (!fs.existsSync(runtimeApply)) throw new Error(`Food Master runtime apply script missing: ${runtimeApply}`);
const runtimeResult = spawnSync(process.execPath, [runtimeApply], { stdio: 'inherit' });
if (runtimeResult.status !== 0) throw new Error('Food Master runtime build step failed');

console.log('Food Master V4 central MEXT registry + Database V3 verified/units/search/runtime applied.');
