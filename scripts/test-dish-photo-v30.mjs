import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v3.0 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of ["VERSION = '3.0.0'",'nutritionFromAI:false','identityOnly:true','cameraRoll:true','capture',"source === 'camera'",'__PFC_DB_V3_SEARCH__','buildRecord']) {
  if (!source.includes(marker)) throw new Error(`missing marker: ${marker}`);
}
for (const forbidden of ['@zxing/browser','tesseract.js','Open Food Facts','label-ocr','scan-v28-barcode']) {
  if (source.includes(forbidden)) throw new Error(`removed scan feature leaked into v3.0: ${forbidden}`);
}
const window = {};
const document = { readyState:'loading', addEventListener(){}, getElementById(){return null;} };
const context = { window, document, console, setTimeout, clearTimeout, AbortController, URL, Image:function(){}, fetch:async()=>{throw new Error('not used');} };
vm.createContext(context);
vm.runInContext(source, context);
const api = window.__PFC_DISH_PHOTO_V30__;
if (!api || api.version !== '3.0.0' || !api.camera || !api.cameraRoll || api.nutritionFromAI !== false) throw new Error('v3.0 public invariants failed');
const parsed = api.parseIdentityResponse('```json\n{"dishName":"定食","foods":[{"name":"白米","confidence":0.9},{"name":"白米","confidence":0.8},{"name":"唐揚げ","confidence":0.7}]}\n```');
if (!parsed || parsed.foods.length !== 2 || parsed.foods[0].name !== '白米') throw new Error('identity JSON parsing/dedup failed');
console.log('Dish photo v3.0 tests passed.');
