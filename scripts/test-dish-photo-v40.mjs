import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('dish photo v4 path required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '4.0.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  "THINKING_LEVEL = 'minimal'",
  'MAX_SIDE = 512',
  'JPEG_QUALITY = 0.62',
  'MIN_REQUEST_INTERVAL_MS = 5000',
  'nutritionFromAI:false',
  "nutritionSource:'Food Master'",
  'provisionalAmounts:true',
  'editableAmounts:true',
  'removableCards:true',
  'dbReplacement:true',
  'dbAddition:true',
  'oneRequestPerPhoto:true',
  'estimatedWeightG',
  "responseMimeType:'application/json'",
  "mediaResolution:'MEDIA_RESOLUTION_LOW'"
]) if (!source.includes(marker)) throw new Error(`missing v4 marker: ${marker}`);

const rows = [
  {source:'db',score:5200,name:'ツナマヨおにぎり',index:0,meta:{name:'ツナマヨおにぎり',aliases:['ツナマヨ'],input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}}},
  {source:'db',score:5200,name:'唐揚げ',index:1,meta:{name:'唐揚げ',aliases:['から揚げ'],input:{defaultAmount:100,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}}},
  {source:'db',score:5200,name:'卵焼き',index:2,meta:{name:'卵焼き',aliases:['玉子焼き'],input:{defaultAmount:2,defaultUnit:'切れ'},nutritionBasis:{amount:2,unit:'切れ'}}},
  {source:'db',score:5200,name:'キャベツ',index:3,meta:{name:'キャベツ',aliases:[],input:{defaultAmount:50,defaultUnit:'g'},nutritionBasis:{amount:50,unit:'g'}}},
  {source:'db',score:4700,name:'おにぎり(ツナ)',index:4,meta:{name:'おにぎり(ツナ)',aliases:['ツナおにぎり'],input:{defaultAmount:1,defaultUnit:'個'},nutritionBasis:{amount:1,unit:'個'}}}
];
const nutrition = {
  0:{kcal:215,p:5,f:6,c:35},
  1:{kcal:250,p:18,f:15,c:10},
  2:{kcal:100,p:7,f:7,c:3},
  3:{kcal:23,p:1.3,f:.2,c:5.2},
  4:{kcal:210,p:5,f:5,c:35}
};
const window = {
  __PFC_DB_V3_SEARCH__:{
    search(query){
      if (query === 'おにぎり') return [rows[0],rows[4]];
      if (query === '唐揚げ') return [rows[1]];
      if (query === '卵焼き') return [rows[2]];
      if (query === 'キャベツ') return [rows[3]];
      return [];
    }
  },
  __PFC_DB_V3__:{
    get(index){ return rows[index]?.meta || null; },
    scale(index,amount){
      const meta = rows[index]?.meta;
      const base = Number(meta?.nutritionBasis?.amount || 1);
      const n = nutrition[index];
      if (!meta || !n || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return null;
      const m = Number(amount)/base;
      return {kcal:Math.round(n.kcal*m),p:Number((n.p*m).toFixed(1)),f:Number((n.f*m).toFixed(1)),c:Number((n.c*m).toFixed(1))};
    },
    buildRecord(index,amount){ return {N:rows[index]?.name,amount}; }
  }
};
const document = {readyState:'loading',addEventListener(){},getElementById(){return null;},documentElement:{classList:{add(){}}}};
const context = {window,document,console,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,URL,Image:function(){},fetch:async()=>{throw new Error('not used');},Promise,Date};
vm.createContext(context);
vm.runInContext(source,context);
const api = window.__PFC_DISH_PHOTO_V40__;
if (!api || api.version !== '4.0.0') throw new Error('v4 API missing');
if (api.model !== 'gemini-3.5-flash-lite' || api.thinkingLevel !== 'minimal') throw new Error('v4 model config failed');
if (api.nutritionFromAI !== false || api.nutritionSource !== 'Food Master') throw new Error('v4 must keep nutrition out of AI');
if (!api.provisionalAmounts || !api.editableAmounts || !api.removableCards || !api.dbReplacement || !api.dbAddition) throw new Error('v4 editor capabilities missing');

const prompt = api.identityPrompt();
if (!prompt.includes('estimatedWeightG')) throw new Error('v4 prompt must request provisional weight');
if (!prompt.includes('P/F/C、kcal') || !prompt.includes('絶対に出さない')) throw new Error('v4 prompt must prohibit AI nutrition');
if (!prompt.includes('具が見えないおにぎりは必ず「おにぎり」')) throw new Error('v4 hidden filling guard missing');

const payload = api.buildRequestPayload('abc');
if (payload.modelPreference !== 'gemini-3.5-flash-lite' || payload.imageBase64 !== 'abc') throw new Error('v4 payload failed');
if (payload.generationConfig?.thinkingConfig?.thinkingLevel !== 'minimal') throw new Error('v4 minimal thinking missing');
if (payload.generationConfig?.responseMimeType !== 'application/json') throw new Error('v4 structured JSON missing');
if (payload.generationConfig?.mediaResolution !== 'MEDIA_RESOLUTION_LOW') throw new Error('v4 low media resolution missing');

const parsed = api.parseIdentityResponse(JSON.stringify({dishName:'お弁当',foods:[
  {name:'おにぎり',visibleCount:3,estimatedWeightG:155,portionConfidence:'medium',kcal:999,p:99},
  {name:'鶏のから揚げ',visibleCount:2,estimatedWeightG:92,portionConfidence:'medium'},
  {name:'玉子焼き',visibleCount:2,estimatedWeightG:62,portionConfidence:'high'},
  {name:'千切りキャベツ',estimatedWeightG:18,portionConfidence:'low'}
]}));
if (!parsed || parsed.foods.length !== 4) throw new Error('v4 parse failed');
const [onigiri,karaage,egg,cabbage] = parsed.foods;
if (onigiri.estimatedWeightG !== 155 || onigiri.visibleCount !== 3) throw new Error('v4 provisional portion parse failed');
if ('kcal' in onigiri || 'p' in onigiri) throw new Error('AI nutrition must be discarded by parser');
if (karaage.name !== '唐揚げ') throw new Error('safe visual canonicalization failed');
if (egg.name !== '卵焼き') throw new Error('egg visual canonicalization failed');
if (cabbage.name !== 'キャベツ') throw new Error('cut-style canonicalization failed');

if (api.safeResolveFood(onigiri) !== null) throw new Error('generic onigiri must not auto-map to a specific filling');
const karaageMatch = api.safeResolveFood(karaage);
if (!karaageMatch || karaageMatch.name !== '唐揚げ') throw new Error('karaage exact safe match failed');
const karaageRow = api.makeEditorRow(karaage,0);
if (!karaageRow.match || karaageRow.amount !== 90 || karaageRow.unit !== 'g') throw new Error(`karaage provisional grams failed: ${karaageRow.amount}${karaageRow.unit}`);
const karaageNutrition = api.nutritionFor(karaageRow);
if (!karaageNutrition || karaageNutrition.kcal !== 225) throw new Error('Food Master nutrition must scale from provisional grams');
if (!api.nutritionText(karaageRow).startsWith('推定 ')) throw new Error('unmodified provisional nutrition should be labeled estimated');

const eggRow = api.makeEditorRow(egg,1);
if (eggRow.amount !== 2 || eggRow.unit !== '切れ') throw new Error('visible count should seed count-unit amount');
const cabbageRow = api.makeEditorRow(cabbage,2);
if (cabbageRow.amount !== 20 || cabbageRow.unit !== 'g') throw new Error('vegetable provisional grams failed');

const manualOnigiri = api.applyDbMatch({id:'x',ai:onigiri,match:null,manualDb:false},rows[0],true);
if (manualOnigiri.amount !== 3 || manualOnigiri.unit !== '個' || !manualOnigiri.manualDb) throw new Error('explicit DB replacement should reuse AI visible count');
manualOnigiri.amount = 2;
manualOnigiri.userEditedAmount = true;
if (!api.nutritionText(manualOnigiri).startsWith('計算 ')) throw new Error('edited nutrition should be labeled calculated');

console.log('Dish photo v4 provisional-estimate editor tests passed.');
