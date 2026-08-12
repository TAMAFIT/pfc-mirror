import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const source = path.join(root, 'overrides', 'pfc-database-v3-catalog.js');
const output = path.join(dist, 'pfc-database-v3-catalog.js');
const htmlPath = path.join(dist, 'index.html');

for (const required of [source, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Database V3 catalog dependency missing: ${required}`);
}

fs.copyFileSync(source, output);
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('pfc-database-v3-catalog.js')) {
  const manualTag = '    <script src="pfc-database-v3-manual.js?v=300"></script>';
  if (!html.includes(manualTag)) throw new Error('Database V3 manual script tag was not found.');
  html = html.replace(manualTag, `    <script src="pfc-database-v3-catalog.js?v=310"></script>\n${manualTag}`);
  fs.writeFileSync(htmlPath, html, 'utf8');
}

const catalog = fs.readFileSync(output, 'utf8');
for (const marker of ['__PFC_DB_V3_CATALOG__', "VERSION = '3.1.0'", 'BUNDLE_COUNT_BASES', 'MEAL_AS_ONE_SERVING', 'maffRiceServingGuide', 'maffEggStandard']) {
  if (!catalog.includes(marker)) throw new Error(`Database V3 catalog marker missing: ${marker}`);
}
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
const catalogPos = finalHtml.indexOf('pfc-database-v3-catalog.js');
const manualPos = finalHtml.indexOf('pfc-database-v3-manual.js');
if (!(corePos >= 0 && catalogPos > corePos && manualPos > catalogPos)) {
  throw new Error('Database V3 script ordering is invalid.');
}

console.log('Database V3 natural-unit catalog applied.');
