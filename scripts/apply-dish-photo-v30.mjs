import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root,'dist');
const jsSource = path.join(root,'overrides','pfc-dish-photo-v30.js');
const cssSource = path.join(root,'overrides','pfc-dish-photo-v30.css');
const jsOut = path.join(dist,'pfc-dish-photo-v30.js');
const cssOut = path.join(dist,'pfc-dish-photo-v30.css');
const htmlPath = path.join(dist,'index.html');
for (const file of [jsSource,cssSource,htmlPath]) if (!fs.existsSync(file)) throw new Error(`dish photo v3.1 dependency missing: ${file}`);
const js = fs.readFileSync(jsSource); const css = fs.readFileSync(cssSource);
const jsHash = createHash('sha256').update(js).digest('hex').slice(0,12);
const cssHash = createHash('sha256').update(css).digest('hex').slice(0,12);
fs.copyFileSync(jsSource,jsOut); fs.copyFileSync(cssSource,cssOut);
let html = fs.readFileSync(htmlPath,'utf8');
for (const obsolete of ['pfc-scan-v28.js','pfc-scan-v28.css','pfc-dish-photo-v29.js','pfc-dish-photo-v29.css','pfc-dish-photo-v29-bootstrap.js']) {
  if (html.includes(obsolete)) throw new Error(`obsolete scan asset still injected before v3.1: ${obsolete}`);
}
if (!html.includes('pfc-dish-photo-v30.css')) html = html.replace('</head>',`    <link rel="stylesheet" href="pfc-dish-photo-v30.css?v=${cssHash}">\n</head>`);
if (!html.includes('pfc-dish-photo-v30.js')) html = html.replace('</body>',`    <script src="pfc-dish-photo-v30.js?v=${jsHash}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');
const built = fs.readFileSync(jsOut,'utf8');
for (const marker of [
  '__PFC_DISH_PHOTO_V30__',
  "VERSION = '3.1.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'cameraRoll:true',
  'nutritionFromAI:false',
  'conservativeVisual:true',
  'genericToSpecificBlocked:true',
  'visibleCount:true',
  '料理写真'
]) if (!built.includes(marker)) throw new Error(`dish photo v3.1 marker missing: ${marker}`);
const test = spawnSync(process.execPath,[path.join(root,'scripts','test-dish-photo-v30.mjs'),jsOut],{stdio:'inherit'});
if (test.status !== 0) throw new Error('dish photo v3.1 tests failed');
console.log(`PFC dish photo v3.1 applied (${jsHash}/${cssHash}).`);
