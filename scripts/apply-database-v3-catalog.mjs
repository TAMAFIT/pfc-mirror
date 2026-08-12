import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const verifiedSource = path.join(root, 'overrides', 'pfc-database-v3-verified.js');
const verifiedOutput = path.join(dist, 'pfc-database-v3-verified.js');
const verifiedB5Source = path.join(root, 'overrides', 'pfc-database-v3-verified-b5.js');
const verifiedB5Output = path.join(dist, 'pfc-database-v3-verified-b5.js');
const catalogSource = path.join(root, 'overrides', 'pfc-database-v3-catalog.js');
const catalogOutput = path.join(dist, 'pfc-database-v3-catalog.js');
const multiunitSource = path.join(root, 'overrides', 'pfc-database-v3-multiunit.js');
const multiunitOutput = path.join(dist, 'pfc-database-v3-multiunit.js');
const htmlPath = path.join(dist, 'index.html');

for (const required of [verifiedSource, verifiedB5Source, catalogSource, multiunitSource, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Database V3 catalog dependency missing: ${required}`);
}

fs.copyFileSync(verifiedSource, verifiedOutput);
fs.copyFileSync(verifiedB5Source, verifiedB5Output);
fs.copyFileSync(catalogSource, catalogOutput);
fs.copyFileSync(multiunitSource, multiunitOutput);
let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('pfc-database-v3-verified.js')) {
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error('Database V3 core script tag was not found.');
  html = html.replace(coreTag, `    <script src="pfc-database-v3-verified.js?v=340"></script>\n${coreTag}`);
}
if (!html.includes('pfc-database-v3-verified-b5.js')) {
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error('Database V3 core script tag was not found for B5.');
  html = html.replace(coreTag, `    <script src="pfc-database-v3-verified-b5.js?v=350"></script>\n${coreTag}`);
}
if (!html.includes('pfc-database-v3-catalog.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found.');
  html = html.replace(manualTag, `    <script src="pfc-database-v3-catalog.js?v=311"></script>\n${manualTag}`);
}
if (!html.includes('pfc-database-v3-multiunit.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found for multi-unit injection.');
  html = html.replace(manualTag, `${manualTag}\n    <script src="pfc-database-v3-multiunit.js?v=360"></script>`);
}
fs.writeFileSync(htmlPath, html, 'utf8');

const verified = fs.readFileSync(verifiedOutput, 'utf8');
for (const marker of [
  '__PFC_DB_V3_VERIFIED__', "VERSION = '3.4.0'", 'こいくち醤油', '本みりん',
  '豚肩ロース(脂身つき)', '鶏手羽元(皮つき)', 'サバ(生)', 'アジ(生)',
  'ピーマン', 'なす', '白菜', '小松菜', 'アスパラガス', 'にんにく', '長ねぎ'
]) {
  if (!verified.includes(marker)) throw new Error(`Database V3 verified marker missing: ${marker}`);
}
const verifiedB5 = fs.readFileSync(verifiedB5Output, 'utf8');
for (const marker of [
  '__PFC_DB_V3_VERIFIED_B5__', "VERSION = '3.5.0'", 'まだら(生)', 'スイートコーン(生)',
  'ズッキーニ', 'マンゴー(生)', 'ブルーベリー(生)', 'ネーブルオレンジ(生)'
]) {
  if (!verifiedB5.includes(marker)) throw new Error(`Database V3 B5 marker missing: ${marker}`);
}
const catalog = fs.readFileSync(catalogOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_CATALOG__', "VERSION = '3.1.1'", 'BUNDLE_COUNT_BASES', 'MEAL_AS_ONE_SERVING', 'maffRiceServingGuide', 'maffEggStandard', 'applyVerifiedSources']) {
  if (!catalog.includes(marker)) throw new Error(`Database V3 catalog marker missing: ${marker}`);
}
const multiunit = fs.readFileSync(multiunitOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_MULTIUNIT__', "VERSION = '3.6.0'", 'scaleInput', 'buildRecordInput', 'basisPerUnit', 'dbv3-unit-switch']) {
  if (!multiunit.includes(marker)) throw new Error(`Database V3 multi-unit marker missing: ${marker}`);
}

const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const v21Pos = finalHtml.indexOf('pfc-v21.js');
const verifiedPos = finalHtml.indexOf('pfc-database-v3-verified.js');
const verifiedB5Pos = finalHtml.indexOf('pfc-database-v3-verified-b5.js');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
const catalogPos = finalHtml.indexOf('pfc-database-v3-catalog.js');
const manualPos = finalHtml.indexOf('pfc-database-v3-manual.js');
const multiunitPos = finalHtml.indexOf('pfc-database-v3-multiunit.js');
if (!(v21Pos >= 0 && verifiedPos > v21Pos && verifiedB5Pos > verifiedPos && corePos > verifiedB5Pos && catalogPos > corePos && manualPos > catalogPos && multiunitPos > manualPos)) {
  throw new Error('Database V3 script ordering is invalid.');
}
if (!finalHtml.includes('pfc-database-v3-verified.js?v=340')) throw new Error('Database V3 verified cache version is stale.');
if (!finalHtml.includes('pfc-database-v3-verified-b5.js?v=350')) throw new Error('Database V3 B5 cache version is stale.');
if (!finalHtml.includes('pfc-database-v3-multiunit.js?v=360')) throw new Error('Database V3 multi-unit cache version is stale.');

console.log('Database V3 verified foods B1-B5 + natural-unit catalog + multi-unit engine applied.');
