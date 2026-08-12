import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v3.2 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '3.2.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'nutritionFromAI:false',
  'identityOnly:true',
  'conservativeVisual:true',
  'genericToSpecificBlocked:true',
  'visibleCount:true',
  'aiAmountAutoApplied:false',
  'aiVariantFlagsTrusted:false',
  'requiresUserAmount:true',
  'cameraRoll:true',
  'capture',
  "source === 'camera'",
  '__PFC_DB_V3_SEARCH__',
  'buildRecord'
]) {
  if (!source.includes(marker)) throw new Error(`missing marker: ${marker}`);
}
for (const forbidden of ['@zxing/browser','tesseract.js','Open Food Facts','label-ocr','scan-v28-barcode']) {
  if (source.includes(forbidden)) throw new Error(`removed scan feature leaked into v3.2: ${forbidden}`);
}

const searchRows = [
  { source:'db', score:5200, name:'おにぎり(ツナ)', index:0, meta:{name:'おにぎり(ツナ)',input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}} },
  { source:'db', score:5200, name:'唐揚げ', index:1, meta:{name:'唐揚げ',input:{defaultAmount:100,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}} },
  { source:'db', score:4100, name:'人参', index:2, meta:{name:'人参',input:{defaultAmount:0.5,defaultUnit:'本'},nutritionBasis:{amount:0.5,unit:'本'}} },
  { source:'db', score:5200, name:'レタス', index:3, meta:{name:'レタス',input:{defaultAmount:50,defaultUnit:'g'},nutritionBasis:{amount:50,unit:'g'}} }
];
const window = {
  __PFC_DB_V3_SEARCH__: {
    search(query) {
      if (query === 'おにぎり') return [searchRows[0]];
      if (query === 'おにぎり(ツナ)') return [searchRows[0]];
      if (query === '唐揚げ') return [searchRows[1]];
      if (query === 'にんじん') return [searchRows[2]];
      if (query === 'レタス') return [searchRows[3]];
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
if (!api || api.version !== '3.2.0') throw new Error('v3.2 API missing');
if (api.model !== 'gemini-3.5-flash-lite' || api.nutritionFromAI !== false || !api.conservativeVisual) throw new Error('v3.2 model/safety invariants failed');
if (api.aiAmountAutoApplied !== false || api.aiVariantFlagsTrusted !== false || !api.requiresUserAmount) throw new Error('v3.2 confirmation invariants failed');

const parsed = api.parseIdentityResponse('```json\n{"dishName":"お弁当","foods":[{"name":"おにぎり","confidence":0.95,"visibleCount":4,"countCertain":true,"variantVisible":true},{"name":"にんじん","confidence":0.9,"ambiguity":"千切りと花形型抜き"},{"name":"レタス","confidence":0.9},{"name":"鶏肉料理","confidence":0.8,"visibleCount":2},{"name":"卵焼き","confidence":0.85,"visibleCount":2},{"name":"漬物","confidence":0.7},{"name":"紫キャベツ","confidence":0.85}]}\n```');
if (!parsed || parsed.foods.length !== 7) throw new Error('real-device regression JSON parsing failed');
const onigiri = parsed.foods[0];
if (onigiri.visibleCount !== 4 || !onigiri.rawVariantVisible || !onigiri.rawCountCertain) throw new Error('legacy flags should remain diagnostic only');
if (api.resolveFood(onigiri) !== null) throw new Error('generic onigiri must never map to tuna even when model claims variantVisible=true');

const explicitVariant = { ...onigiri, name:'おにぎり(ツナ)' };
const explicitMatch = api.resolveFood(explicitVariant);
if (!explicitMatch || explicitMatch.name !== 'おにぎり(ツナ)') throw new Error('explicitly named tuna onigiri should resolve');
const explicitResolved = api.resolveFoods({foods:[explicitVariant]})[0];
if (!explicitResolved.match || explicitResolved.amount !== null || explicitResolved.countApplied !== false || explicitResolved.countSuggestion !== 4) {
  throw new Error('AI count may be shown as suggestion but must never auto-fill committed amount');
}

const carrot = api.resolveFoods({foods:[parsed.foods[1]]})[0];
if (!carrot.match || carrot.match.name !== '人参' || carrot.amount !== null) throw new Error('Food Master 0.5本 default must not auto-fill from photo');
const lettuce = api.resolveFoods({foods:[parsed.foods[2]]})[0];
if (!lettuce.match || lettuce.amount !== null) throw new Error('Food Master 50g default must not auto-fill from photo');

const karaage = api.resolveFoods({foods:[{name:'唐揚げ',confidence:0.9,visibleCount:2}]})[0];
if (!karaage.match || karaage.amount !== null || karaage.countSuggestion !== null || karaage.countApplied) throw new Error('gram foods must remain user-entered even when visibleCount exists');

console.log('Dish photo v3.2 safe confirmation regression tests passed.');
