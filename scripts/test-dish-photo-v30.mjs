import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v3.1 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '3.1.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'nutritionFromAI:false',
  'identityOnly:true',
  'conservativeVisual:true',
  'genericToSpecificBlocked:true',
  'visibleCount:true',
  'variantVisible',
  'countCertain',
  'cameraRoll:true',
  'capture',
  "source === 'camera'",
  '__PFC_DB_V3_SEARCH__',
  'buildRecord'
]) {
  if (!source.includes(marker)) throw new Error(`missing marker: ${marker}`);
}
for (const forbidden of ['@zxing/browser','tesseract.js','Open Food Facts','label-ocr','scan-v28-barcode']) {
  if (source.includes(forbidden)) throw new Error(`removed scan feature leaked into v3.1: ${forbidden}`);
}

const searchRows = [
  { source:'db', score:5200, name:'おにぎり(ツナ)', index:0, meta:{name:'おにぎり(ツナ)',input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}} },
  { source:'db', score:5200, name:'唐揚げ', index:1, meta:{name:'唐揚げ',input:{defaultAmount:100,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}} }
];
const window = {
  __PFC_DB_V3_SEARCH__: {
    search(query) {
      if (query === 'おにぎり') return [searchRows[0]];
      if (query === 'おにぎり(ツナ)') return [searchRows[0]];
      if (query === '唐揚げ') return [searchRows[1]];
      return [];
    }
  },
  __PFC_DB_V3__: { get(index){ return searchRows[index]?.meta || null; } }
};
const document = { readyState:'loading', addEventListener(){}, getElementById(){return null;} };
const context = { window, document, console, setTimeout, clearTimeout, AbortController, URL, Image:function(){}, fetch:async()=>{throw new Error('not used');} };
vm.createContext(context);
vm.runInContext(source, context);
const api = window.__PFC_DISH_PHOTO_V30__;
if (!api || api.version !== '3.1.0') throw new Error('v3.1 API missing');
if (api.model !== 'gemini-3.5-flash-lite' || api.nutritionFromAI !== false || !api.conservativeVisual) throw new Error('v3.1 model/safety invariants failed');

const parsed = api.parseIdentityResponse('```json\n{"dishName":"お弁当","foods":[{"name":"おにぎり","confidence":0.98,"visibleCount":3,"countCertain":true,"variantVisible":false},{"name":"おにぎり","confidence":0.8,"visibleCount":2,"countCertain":false,"variantVisible":false},{"name":"唐揚げ","confidence":0.85,"visibleCount":2,"countCertain":true,"variantVisible":false,"ambiguity":"焼き物の可能性"}]}\n```');
if (!parsed || parsed.foods.length !== 2) throw new Error('identity JSON parsing/dedup failed');
if (parsed.foods[0].visibleCount !== 3 || !parsed.foods[0].countCertain || parsed.foods[0].variantVisible) throw new Error('visible count/variant parsing failed');
if (parsed.foods[1].ambiguity !== '焼き物の可能性') throw new Error('ambiguity parsing failed');

const unsafe = api.resolveFood(parsed.foods[0]);
if (unsafe !== null) throw new Error('generic おにぎり must not map to おにぎり(ツナ)');

const visibleVariant = { ...parsed.foods[0], name:'おにぎり(ツナ)', variantVisible:true, visibleCount:3, countCertain:true };
const safe = api.resolveFood(visibleVariant);
if (!safe || safe.name !== 'おにぎり(ツナ)') throw new Error('explicit visible variant should resolve');
const resolvedCount = api.resolveFoods({foods:[visibleVariant]})[0];
if (!resolvedCount.match || resolvedCount.amount !== 3 || !resolvedCount.countApplied) throw new Error('count-based visibleCount should seed amount');

const karaage = api.resolveFoods({foods:[parsed.foods[1]]})[0];
if (!karaage.match || karaage.amount !== 100 || karaage.countApplied) throw new Error('visibleCount must not multiply gram-based foods');

console.log('Dish photo v3.1 Gemini 3.5 conservative mapping tests passed.');
