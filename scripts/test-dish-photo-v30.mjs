import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v3.4 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '3.4.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  "THINKING_LEVEL = 'minimal'",
  'MAX_SIDE = 1024',
  'REQUEST_TIMEOUT_MS = 35000',
  'nutritionFromAI:false',
  'identityOnly:true',
  'conservativeVisual:true',
  'genericToSpecificBlocked:true',
  'visibleCount:true',
  'aiAmountAutoApplied:false',
  'aiVariantFlagsTrusted:false',
  'requiresUserAmount:true',
  'latencyOptimized:true',
  'structuredJson:true',
  'autoRetry:false',
  'retryTransient:false',
  'cameraRoll:true',
  'capture',
  "source === 'camera'",
  '__PFC_DB_V3_SEARCH__',
  'buildRecord',
  'thinkingConfig',
  'maxOutputTokens:768',
  "responseMimeType:'application/json'"
]) {
  if (!source.includes(marker)) throw new Error(`missing marker: ${marker}`);
}
for (const forbidden of ['@zxing/browser','tesseract.js','Open Food Facts','label-ocr','scan-v28-barcode']) {
  if (source.includes(forbidden)) throw new Error(`removed scan feature leaked into v3.4: ${forbidden}`);
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
const context = { window, document, console, setTimeout, clearTimeout, AbortController, URL, Image:function(){}, fetch:async()=>{throw new Error('not used');}, Promise };
vm.createContext(context);
vm.runInContext(source, context);
const api = window.__PFC_DISH_PHOTO_V30__;
if (!api || api.version !== '3.4.0') throw new Error('v3.4 API missing');
if (api.model !== 'gemini-3.5-flash-lite' || api.thinkingLevel !== 'minimal' || api.nutritionFromAI !== false || !api.conservativeVisual) throw new Error('v3.4 model/safety invariants failed');
if (api.requestTimeoutMs !== 35000 || api.imageMaxSide !== 1024 || Math.abs(api.jpegQuality - 0.8) > 1e-9) throw new Error('v3.4 request/image invariants failed');
if (!api.latencyOptimized || !api.structuredJson || api.autoRetry !== false || api.retryTransient !== false) throw new Error('v3.4 single-request structured JSON markers failed');
if (api.aiAmountAutoApplied !== false || api.aiVariantFlagsTrusted !== false || !api.requiresUserAmount) throw new Error('v3.4 confirmation invariants failed');

const payload = api.buildRequestPayload('abc123');
if (payload.modelPreference !== 'gemini-3.5-flash-lite' || payload.imageBase64 !== 'abc123') throw new Error('v3.4 payload model/image failed');
if (payload.generationConfig?.thinkingConfig?.thinkingLevel !== 'minimal') throw new Error('v3.4 must force minimal thinking');
if (payload.generationConfig?.maxOutputTokens !== 768) throw new Error('v3.4 output token cap missing');
if (payload.generationConfig?.responseMimeType !== 'application/json') throw new Error('v3.4 structured JSON response MIME missing');
const prompt = String(api.identityPrompt?.() || '');
if (!prompt.includes('具が見えないおにぎりは「おにぎり」とだけ書く')) throw new Error('v3.4 conservative generic-food rule missing');
if (!prompt.includes('少しでも曖昧ならnullを優先する')) throw new Error('v3.4 conservative counting rule missing');
if (prompt.includes('visibleCount":3') || prompt.includes('visibleCount":4')) throw new Error('v3.4 prompt must not leak benchmark-specific counts');

const joined = api.extractAiText({candidates:[{content:{parts:[{text:'{"foods":'},{text:'[]}'}]}}]});
if (joined !== '{"foods":[]}') throw new Error('v3.4 must join text parts');
const upstream = api.classifyUpstreamText('GASエラー: AI API HTTP 503: unavailable');
if (!upstream || !upstream.upstream) throw new Error('v3.4 must expose upstream error text');
if (api.classifyUpstreamText('{"foods":[]}') !== null) throw new Error('v3.4 valid JSON must not be classified as upstream error');

const parsed = api.parseIdentityResponse('```json\n{"dishName":"お弁当","foods":[{"name":"おにぎり","visibleCount":4,"countCertain":true,"variantVisible":true},{"name":"にんじん","ambiguity":"千切りと花形型抜き"},{"name":"レタス"},{"name":"鶏肉料理","visibleCount":2},{"name":"卵焼き","visibleCount":2},{"name":"漬物"},{"name":"紫キャベツ"}]}\n```');
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

const karaage = api.resolveFoods({foods:[{name:'唐揚げ',visibleCount:2}]})[0];
if (!karaage.match || karaage.amount !== null || karaage.countSuggestion !== null || karaage.countApplied) throw new Error('gram foods must remain user-entered even when visibleCount exists');

console.log('Dish photo v3.4 structured single-request regression tests passed.');
