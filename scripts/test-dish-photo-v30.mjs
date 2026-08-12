import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v3.7 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '3.7.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  "THINKING_LEVEL = 'minimal'",
  'MAX_SIDE = 1024',
  'REQUEST_TIMEOUT_MS = 22000',
  'HEDGE_DELAY_MS = 4500',
  'nutritionFromAI:false',
  'identityOnly:true',
  'conservativeVisual:true',
  'genericToSpecificBlocked:true',
  'strictSpecificityGuard:true',
  'visibleCount:true',
  'aiAmountAutoApplied:false',
  'aiVariantFlagsTrusted:false',
  'requiresUserAmount:true',
  'latencyOptimized:true',
  'structuredJson:true',
  'structuredSchema:true',
  "mediaResolution:'MEDIA_RESOLUTION_LOW'",
  'redundantEndpoints:true',
  'endpointCount:2',
  'autoRetry:false',
  'retryTransient:false',
  'cameraRoll:true',
  'capture',
  "source === 'camera'",
  '__PFC_DB_V3_SEARCH__',
  'buildRecord',
  'responseJsonSchema',
  '続けて別の写真を判定'
]) {
  if (!source.includes(marker)) throw new Error(`missing marker: ${marker}`);
}
for (const forbidden of ['@zxing/browser','tesseract.js','Open Food Facts','label-ocr','scan-v28-barcode']) {
  if (source.includes(forbidden)) throw new Error(`removed scan feature leaked into v3.7: ${forbidden}`);
}

const searchRows = [
  { source:'db', score:5200, name:'ツナマヨおにぎり', index:0, meta:{name:'ツナマヨおにぎり',aliases:['おにぎり','ツナマヨ'],input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}} },
  { source:'db', score:5200, name:'唐揚げ', index:1, meta:{name:'唐揚げ',aliases:[],input:{defaultAmount:100,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}} },
  { source:'db', score:4100, name:'人参', index:2, meta:{name:'人参',aliases:['にんじん','ニンジン'],input:{defaultAmount:0.5,defaultUnit:'本'},nutritionBasis:{amount:0.5,unit:'本'}} },
  { source:'db', score:5200, name:'レタス', index:3, meta:{name:'レタス',aliases:[],input:{defaultAmount:50,defaultUnit:'g'},nutritionBasis:{amount:50,unit:'g'}} },
  { source:'db', score:4700, name:'おにぎり(ツナ)', index:4, meta:{name:'おにぎり(ツナ)',aliases:['おにぎり'],input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}} },
  { source:'db', score:3000, name:'加糖ヨーグルト', index:5, meta:{name:'加糖ヨーグルト',aliases:['ヨーグルト'],input:{defaultAmount:100,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}} }
];
const window = {
  __PFC_DB_V3_SEARCH__: {
    search(query) {
      if (query === 'おにぎり') return [searchRows[0], searchRows[4]];
      if (query === 'ツナマヨおにぎり') return [searchRows[0]];
      if (query === 'おにぎり(ツナ)') return [searchRows[4]];
      if (query === '唐揚げ') return [searchRows[1]];
      if (query === 'にんじん' || query === 'ニンジン') return [searchRows[2]];
      if (query === 'レタス') return [searchRows[3]];
      if (query === 'ヨーグルト') return [searchRows[5]];
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
if (!api || api.version !== '3.7.0') throw new Error('v3.7 API missing');
if (api.model !== 'gemini-3.5-flash-lite' || api.thinkingLevel !== 'minimal' || api.nutritionFromAI !== false || !api.conservativeVisual) throw new Error('v3.7 model/safety invariants failed');
if (api.requestTimeoutMs !== 22000 || api.imageMaxSide !== 1024 || Math.abs(api.jpegQuality - 0.8) > 1e-9) throw new Error('v3.7 request/image invariants failed');
if (!api.latencyOptimized || !api.structuredJson || !api.structuredSchema || api.mediaResolution !== 'MEDIA_RESOLUTION_LOW') throw new Error('v3.7 structured low-media markers failed');
if (!api.redundantEndpoints || api.endpointCount !== 2 || api.hedgeDelayMs !== 4500) throw new Error('v3.7 redundant routing markers failed');
if (!api.strictSpecificityGuard || api.aiAmountAutoApplied !== false || api.aiVariantFlagsTrusted !== false || !api.requiresUserAmount) throw new Error('v3.7 specificity/confirmation invariants failed');

const endpoints = api.endpoints();
if (!Array.isArray(endpoints) || endpoints.length !== 2 || endpoints[0] === endpoints[1]) throw new Error('v3.7 must expose two unique GAS routes');
if (!endpoints[1].includes('AKfycbzmnAYgNXoNbS4UYDU7t1iO70j6OeXLm5CaIaN4P-8Mx27dqLPRU20ewtGAtiJjC0Z7FA')) throw new Error('v3.7 secondary GAS route missing');

const payload = api.buildRequestPayload('abc123');
if (payload.modelPreference !== 'gemini-3.5-flash-lite' || payload.imageBase64 !== 'abc123') throw new Error('v3.7 payload model/image failed');
if (payload.generationConfig?.thinkingConfig?.thinkingLevel !== 'minimal') throw new Error('v3.7 must force minimal thinking');
if (payload.generationConfig?.maxOutputTokens !== 768) throw new Error('v3.7 output token cap missing');
if (payload.generationConfig?.responseMimeType !== 'application/json') throw new Error('v3.7 structured JSON response MIME missing');
if (payload.generationConfig?.mediaResolution !== 'MEDIA_RESOLUTION_LOW') throw new Error('v3.7 low media resolution missing');
const schema = payload.generationConfig?.responseJsonSchema;
if (!schema || schema.type !== 'object' || schema.properties?.foods?.type !== 'array' || schema.properties.foods.maxItems !== 10) throw new Error('v3.7 response JSON schema missing');
const visibleType = schema.properties.foods.items.properties.visibleCount.type;
if (!Array.isArray(visibleType) || !visibleType.includes('integer') || !visibleType.includes('null')) throw new Error('v3.7 visibleCount nullable schema missing');

const prompt = String(api.identityPrompt?.() || '');
if (!prompt.includes('具が見えないおにぎりは「おにぎり」とだけ書く')) throw new Error('v3.7 conservative generic-food rule missing');
if (!prompt.includes('少しでも曖昧ならnullを優先する')) throw new Error('v3.7 conservative counting rule missing');
if (prompt.includes('visibleCount":3') || prompt.includes('visibleCount":4')) throw new Error('v3.7 prompt must not leak benchmark-specific counts');

const joined = api.extractAiText({candidates:[{content:{parts:[{text:'{"foods":'},{text:'[]}'}]}}]});
if (joined !== '{"foods":[]}') throw new Error('v3.7 must join text parts');
const upstream = api.classifyUpstreamText('GASエラー: AI API HTTP 503: unavailable');
if (!upstream || !upstream.upstream) throw new Error('v3.7 must expose upstream error text');

const parsed = api.parseIdentityResponse('{"dishName":"お弁当","foods":[{"name":"おにぎり","visibleCount":3,"countCertain":true,"variantVisible":true},{"name":"にんじん","ambiguity":"千切りと花形型抜き"},{"name":"レタス"},{"name":"唐揚げ","visibleCount":2}]}');
if (!parsed || parsed.foods.length !== 4) throw new Error('v3.7 object response parsing failed');
const onigiri = parsed.foods[0];
if (onigiri.visibleCount !== 3 || !onigiri.rawVariantVisible || !onigiri.rawCountCertain) throw new Error('legacy flags should remain diagnostic only');
if (api.resolveFood(onigiri) !== null) throw new Error('generic onigiri must never map to tuna-mayo or parenthetical tuna variants');

const grouped = api.parseIdentityResponse(JSON.stringify([
  {dishName:'おにぎり',uncertain:false,foods:[{name:'おにぎり',visibleCount:3,ambiguity:'clear',note:''}]},
  {dishName:'唐揚げ',uncertain:false,foods:[{name:'唐揚げ',visibleCount:2,ambiguity:'',note:''}]},
  {dishName:'副菜',uncertain:true,foods:[{name:'レタス',visibleCount:null,ambiguity:'',note:''}]}
]));
if (!grouped || grouped.foods.length !== 3 || grouped.foods[0].name !== 'おにぎり' || grouped.foods[1].name !== '唐揚げ') throw new Error('v3.7 grouped-array fallback parser failed');
if (grouped.foods[0].ambiguity !== '') throw new Error('v3.7 should normalize clear ambiguity marker');
if (!grouped.uncertain) throw new Error('v3.7 grouped uncertainty should be preserved');

const explicitVariant = { ...onigiri, name:'ツナマヨおにぎり' };
const explicitMatch = api.resolveFood(explicitVariant);
if (!explicitMatch || explicitMatch.name !== 'ツナマヨおにぎり') throw new Error('explicitly identified tuna-mayo onigiri should resolve exactly');
const explicitResolved = api.resolveFoods({foods:[explicitVariant]})[0];
if (!explicitResolved.match || explicitResolved.amount !== null || explicitResolved.countApplied !== false || explicitResolved.countSuggestion !== 3) throw new Error('AI count must remain suggestion only');
if (api.resolveFood({name:'ヨーグルト'}) !== null) throw new Error('generic yogurt must not auto-resolve to sweetened yogurt');
const carrot = api.resolveFoods({foods:[parsed.foods[1]]})[0];
if (!carrot.match || carrot.match.name !== '人参' || carrot.amount !== null) throw new Error('trusted exact orthographic alias should resolve without auto-filling amount');
const karaage = api.resolveFoods({foods:[{name:'唐揚げ',visibleCount:2}]})[0];
if (!karaage.match || karaage.amount !== null || karaage.countSuggestion !== null || karaage.countApplied) throw new Error('gram foods must remain user-entered');

let fetchCalls = [];
context.fetch = async (url) => {
  fetchCalls.push(String(url));
  if (String(url) === endpoints[0]) return { ok:false, status:404, json:async()=>({}) };
  return {
    ok:true,
    status:200,
    json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({dishName:'テスト',uncertain:false,foods:[{name:'レタス',visibleCount:null,ambiguity:'',note:''}]})}]}}]})
  };
};
const failover = await api.identifyDish('abc123');
if (!failover || failover.foods?.[0]?.name !== 'レタス') throw new Error('v3.7 secondary-route failover failed');
if (fetchCalls.length !== 2 || fetchCalls[0] !== endpoints[0] || fetchCalls[1] !== endpoints[1]) throw new Error('v3.7 must fall through to secondary route after primary failure');

console.log('Dish photo v3.7 resilient dual-route regression tests passed.');
