import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const dist=path.join(root,'dist');
const files={
  bootstrap:['overrides/pfc-dish-photo-v29-bootstrap.js','pfc-dish-photo-v29-bootstrap.js'],
  js:['overrides/pfc-dish-photo-v29.js','pfc-dish-photo-v29.js'],
  css:['overrides/pfc-dish-photo-v29.css','pfc-dish-photo-v29.css']
};
const htmlPath=path.join(dist,'index.html');
for(const [source] of Object.values(files)) if(!fs.existsSync(path.join(root,source))) throw new Error(`dish photo V2.9 source missing: ${source}`);
if(!fs.existsSync(htmlPath)) throw new Error('dish photo V2.9 requires dist/index.html');
const hashes={};
for(const [key,[source,out]] of Object.entries(files)){
  const body=fs.readFileSync(path.join(root,source)); hashes[key]=createHash('sha256').update(body).digest('hex').slice(0,12); fs.copyFileSync(path.join(root,source),path.join(dist,out));
}
let html=fs.readFileSync(htmlPath,'utf8');
if(!html.includes('pfc-dish-photo-v29.css')) html=html.replace('</head>',`    <link rel="stylesheet" href="pfc-dish-photo-v29.css?v=${hashes.css}">\n</head>`);
if(!html.includes('pfc-dish-photo-v29-bootstrap.js')) html=html.replace('</body>',`    <script src="pfc-dish-photo-v29-bootstrap.js?v=${hashes.bootstrap}"></script>\n</body>`);
if(!html.includes('pfc-dish-photo-v29.js')) html=html.replace('</body>',`    <script src="pfc-dish-photo-v29.js?v=${hashes.js}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');
const finalJs=fs.readFileSync(path.join(dist,files.js[1]),'utf8');
for(const marker of ['__PFC_DISH_PHOTO_V29__',"VERSION = '2.9.0'","MODEL = 'gemini31-lite'",'identityOnly:true','nutritionFromAI:false','__PFC_DB_V3_SEARCH__','buildRecord']) if(!finalJs.includes(marker)) throw new Error(`dish photo V2.9 marker missing: ${marker}`);
const finalHtml=fs.readFileSync(htmlPath,'utf8');
const scanPos=finalHtml.indexOf('pfc-scan-v28.js');
const bootPos=finalHtml.indexOf('pfc-dish-photo-v29-bootstrap.js');
const dishPos=finalHtml.indexOf('pfc-dish-photo-v29.js');
if(!(scanPos>=0&&bootPos>scanPos&&dishPos>bootPos)) throw new Error('dish photo V2.9 script ordering invalid');
for(const [key,[,out]] of Object.entries(files)) if(!finalHtml.includes(`${out}?v=${hashes[key]}`)) throw new Error(`dish photo V2.9 cache key missing: ${out}`);
const test=spawnSync(process.execPath,[path.join(root,'scripts','test-dish-photo-v29.mjs'),path.join(dist,files.js[1])],{stdio:'inherit'});
if(test.status!==0) throw new Error('dish photo V2.9 tests failed');
console.log(`PFC dish photo V2.9 applied (${hashes.js}).`);
