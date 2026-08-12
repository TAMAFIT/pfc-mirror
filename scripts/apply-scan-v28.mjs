import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const dist=path.join(root,'dist');
const jsSource=path.join(root,'overrides','pfc-scan-v28.js');
const cssSource=path.join(root,'overrides','pfc-scan-v28.css');
const jsOut=path.join(dist,'pfc-scan-v28.js');
const cssOut=path.join(dist,'pfc-scan-v28.css');
const htmlPath=path.join(dist,'index.html');
for(const file of [jsSource,cssSource,htmlPath]) if(!fs.existsSync(file)) throw new Error(`scan V2.8 build dependency missing: ${file}`);
const js=fs.readFileSync(jsSource); const css=fs.readFileSync(cssSource);
const jsHash=createHash('sha256').update(js).digest('hex').slice(0,12);
const cssHash=createHash('sha256').update(css).digest('hex').slice(0,12);
fs.copyFileSync(jsSource,jsOut); fs.copyFileSync(cssSource,cssOut);
let html=fs.readFileSync(htmlPath,'utf8');
if(!html.includes('pfc-scan-v28.css')) html=html.replace('</head>',`    <link rel="stylesheet" href="pfc-scan-v28.css?v=${cssHash}">\n</head>`);
if(!html.includes('pfc-scan-v28.js')) html=html.replace('</body>',`    <script src="pfc-scan-v28.js?v=${jsHash}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');
const final=fs.readFileSync(jsOut,'utf8');
for(const marker of ['__PFC_SCAN_V28__',"VERSION = '2.8.0'",'@zxing/browser@0.2.1','tesseract.js@7.0.0','open-food-facts','label-ocr','parseNutritionLabelText']) if(!final.includes(marker)) throw new Error(`scan V2.8 marker missing: ${marker}`);
let finalHtml=fs.readFileSync(htmlPath,'utf8');
if(!finalHtml.includes(`pfc-scan-v28.js?v=${jsHash}`)||!finalHtml.includes(`pfc-scan-v28.css?v=${cssHash}`)) throw new Error('scan V2.8 cache-busted assets missing');
const test=spawnSync(process.execPath,[path.join(root,'scripts','test-scan-v28.mjs'),jsOut],{stdio:'inherit'});
if(test.status!==0) throw new Error('scan V2.8 unit tests failed');

const dishApply=path.join(root,'scripts','apply-dish-photo-v29.mjs');
if(fs.existsSync(dishApply)){
  const dish=spawnSync(process.execPath,[dishApply],{stdio:'inherit'});
  if(dish.status!==0) throw new Error('dish photo V2.9 build step failed');
  finalHtml=fs.readFileSync(htmlPath,'utf8');
  if(!finalHtml.includes('pfc-dish-photo-v29.js?v=')) throw new Error('dish photo V2.9 final script missing');
}
console.log(`PFC scan V2.8 applied (${jsHash}/${cssHash}).`);
