import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root,'dist');
const jsSource = path.join(root,'overrides','pfc-dish-photo-v40.js');
const cssSource = path.join(root,'overrides','pfc-dish-photo-v40.css');
const jsOut = path.join(dist,'pfc-dish-photo-v40.js');
const cssOut = path.join(dist,'pfc-dish-photo-v40.css');
const htmlPath = path.join(dist,'index.html');
for (const file of [jsSource,cssSource,htmlPath]) if (!fs.existsSync(file)) throw new Error(`dish photo v4 dependency missing: ${file}`);

const js = fs.readFileSync(jsSource,'utf8');
const css = fs.readFileSync(cssSource);
for (const marker of [
  "VERSION = '4.0.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'provisionalAmounts:true',
  'editableAmounts:true',
  "nutritionSource:'Food Master'",
  'estimatedWeightG',
  'dish-v40-amount',
  'DBから変更',
  '＋ DBから食品を追加'
]) if (!js.includes(marker)) throw new Error(`dish photo v4 marker missing: ${marker}`);

const test = spawnSync(process.execPath,[path.join(root,'scripts','test-dish-photo-v40.mjs'),jsSource],{stdio:'inherit'});
if (test.status !== 0) throw new Error('dish photo v4 tests failed');

const hash = content => createHash('sha256').update(content).digest('hex').slice(0,12);
const jsHash = hash(js);
const cssHash = hash(css);
fs.writeFileSync(jsOut,js,'utf8');
fs.writeFileSync(cssOut,css);
let html = fs.readFileSync(htmlPath,'utf8');
if (!html.includes('pfc-dish-photo-v30.js')) throw new Error('dish photo v3.8 base asset must load before v4');
if (!html.includes('pfc-dish-photo-v40.css')) html = html.replace('</head>',`    <link rel="stylesheet" href="pfc-dish-photo-v40.css?v=${cssHash}">\n</head>`);
if (!html.includes('pfc-dish-photo-v40.js')) html = html.replace('</body>',`    <script src="pfc-dish-photo-v40.js?v=${jsHash}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');
const final = fs.readFileSync(htmlPath,'utf8');
if (final.indexOf('pfc-dish-photo-v40.js') <= final.indexOf('pfc-dish-photo-v30.js')) throw new Error('dish photo v4 must load after v3.8 base');
console.log(`PFC dish photo v4 applied (${jsHash}/${cssHash}).`);
