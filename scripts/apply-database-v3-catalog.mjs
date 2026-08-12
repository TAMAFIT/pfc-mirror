import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const verifiedSource = path.join(root, 'overrides', 'pfc-database-v3-verified.js');
const verifiedOutput = path.join(dist, 'pfc-database-v3-verified.js');
const catalogSource = path.join(root, 'overrides', 'pfc-database-v3-catalog.js');
const catalogOutput = path.join(dist, 'pfc-database-v3-catalog.js');
const htmlPath = path.join(dist, 'index.html');

for (const required of [verifiedSource, catalogSource, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Database V3 catalog dependency missing: ${required}`);
}

fs.copyFileSync(verifiedSource, verifiedOutput);
fs.copyFileSync(catalogSource, catalogOutput);
let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('pfc-database-v3-verified.js')) {
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error('Database V3 core script tag was not found.');
  html = html.replace(coreTag, `    <script src="pfc-database-v3-verified.js?v=330"></script>\n${coreTag}`);
}
if (!html.includes('pfc-database-v3-catalog.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found.');
  html = html.replace(manualTag, `    <script src="pfc-database-v3-catalog.js?v=311"></script>\n${manualTag}`);
}
fs.writeFileSync(htmlPath, html, 'utf8');

const verified = fs.readFileSync(verifiedOutput, 'utf8');
for (const marker of [
  '__PFC_DB_V3_VERIFIED__', "VERSION = '3.3.0'", 'こいくち醤油', '本みりん',
  '豚肩ロース(脂身つき)', '鶏手羽元(皮つき)', 'サバ(生)', 'アジ(生)', 'ピーマン', 'なす', '白菜'
]) {
  if (!verified.includes(marker)) throw new Error(`Database V3 verified marker missing: ${marker}`);
}
const catalog = fs.readFileSync(catalogOutput, 'utf8');
for (const marker of ['__PFC_DB_V3_CATALOG__', "VERSION = '3.1.1'", 'BUNDLE_COUNT_BASES', 'MEAL_AS_ONE_SERVING', 'maffRiceServingGuide', 'maffEggStandard', 'applyVerifiedSources']) {
  if (!catalog.includes(marker)) throw new Error(`Database V3 catalog marker missing: ${marker}`);
}

const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const v21Pos = finalHtml.indexOf('pfc-v21.js');
const verifiedPos = finalHtml.indexOf('pfc-database-v3-verified.js');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
const catalogPos = finalHtml.indexOf('pfc-database-v3-catalog.js');
const manualPos = finalHtml.indexOf('pfc-database-v3-manual.js');
if (!(v21Pos >= 0 && verifiedPos > v21Pos && corePos > verifiedPos && catalogPos > corePos && manualPos > catalogPos)) {
  throw new Error('Database V3 script ordering is invalid.');
}

console.log('Database V3 verified foods + natural-unit catalog applied.');
