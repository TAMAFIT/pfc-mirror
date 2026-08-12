import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const source = path.join(root, 'overrides', 'pfc-database-v3-verified.js');
const output = path.join(dist, 'pfc-database-v3-verified.js');
const htmlPath = path.join(dist, 'index.html');

for (const required of [source, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Database V3 verified dependency missing: ${required}`);
}

fs.copyFileSync(source, output);
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('pfc-database-v3-verified.js')) {
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error('Database V3 core script tag was not found.');
  html = html.replace(coreTag, `    <script src="pfc-database-v3-verified.js?v=320"></script>\n${coreTag}`);
  fs.writeFileSync(htmlPath, html, 'utf8');
}

const verified = fs.readFileSync(output, 'utf8');
for (const marker of ['__PFC_DB_V3_VERIFIED__', "VERSION = '3.2.0'", 'こいくち醤油', '上白糖', '米みそ(淡色辛みそ)', '本みりん', 'MEXT nutrition + MAFF serving conversion']) {
  if (!verified.includes(marker)) throw new Error(`Database V3 verified marker missing: ${marker}`);
}
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const v21Pos = finalHtml.indexOf('pfc-v21.js');
const verifiedPos = finalHtml.indexOf('pfc-database-v3-verified.js');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
if (!(v21Pos >= 0 && verifiedPos > v21Pos && corePos > verifiedPos)) {
  throw new Error('Database V3 verified/core script ordering is invalid.');
}

console.log('Database V3 source-verified foods applied.');
