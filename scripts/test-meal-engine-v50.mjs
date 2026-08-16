import fs from 'node:fs';
import vm from 'node:vm';

const engineFile = process.argv[2];
const editorFile = process.argv[3];
const cssFile = process.argv[4];
if (!engineFile || !editorFile || !cssFile) throw new Error('engine/editor/css paths required');
const engineSource = fs.readFileSync(engineFile,'utf8');
const editorSource = fs.readFileSync(editorFile,'utf8');
const css = fs.readFileSync(cssFile,'utf8');

for (const marker of [
  "VERSION = '5.0.0'",
  "VOICE_MODEL = 'gemini-3.1-flash-lite'",
  "nutritionSource:'Food Master'",
  'legacyCommandTags:false',
  'transactionalMutations:true',
  'nonAlcoholAZeroGuard:true',
  'safeResolveFood',
  'buildTrustedRecord',
  'validateTrustedRecord',
  'responseMimeType:\'application/json\'',
  'P/F/C/A/kcalは絶対に生成しない',
  'window.sendVoiceChat = sendVoiceV50'
]) if (!engineSource.includes(marker)) throw new Error(`engine marker missing: ${marker}`);

for (const forbidden of ['[DATA]','[DATA2]','[REPLACE]','[REPLACE2]']) {
  if (engineSource.includes(forbidden)) throw new Error(`legacy command tag leaked into v5 engine: ${forbidden}`);
}

for (const marker of [
  "VERSION = '5.0.0'",
  'singleLayerEditor:true',
  'directNameEditing:true',
  'inlineDbSearch:true',
  'removableCards:true',
  'voiceDraftEditing:true',
  'photoUsesFoodMasterNutrition:true',
  'v50-name',
  'v50-suggestions',
  'Food Masterから食品を追加',
  '__PFC_DISH_PHOTO_V40__',
  'createImageBitmap'
]) if (!editorSource.includes(marker)) throw new Error(`editor marker missing: ${marker}`);
if (editorSource.includes('dish-v50-db-picker')) throw new Error('v5 must not create a second DB modal layer');
for (const marker of ['.pfc-meal-editor-v50','.v50-name','.v50-suggestions','.v50-amount','.v50-macros','94dvh']) {
  if (!css.includes(marker)) throw new Error(`editor css marker missing: ${marker}`);
}

const meta = [
  { runtimeIndex:0, name:'うどん(1玉)', baseName:'うどん', aliases:['饂飩'], category:'staples', input:{defaultAmount:1,defaultUnit:'玉'}, nutritionBasis:{amount:1,unit:'玉'} },
  { runtimeIndex:1, name:'ツナマヨおにぎり', baseName:'ツナマヨおにぎり', aliases:[], category:'staples', input:{defaultAmount:1,defaultUnit:'個'}, nutritionBasis:{amount:1,unit:'個'} },
  { runtimeIndex:2, name:'梅おにぎり', baseName:'梅おにぎり', aliases:[], category:'staples', input:{defaultAmount:1,defaultUnit:'個'}, nutritionBasis:{amount:1,unit:'個'} },
  { runtimeIndex:3, name:'白米', baseName:'白米', aliases:['ごはん','ご飯','ライス'], category:'staples', input:{defaultAmount:150,defaultUnit:'g'}, nutritionBasis:{amount:100,unit:'g'} },
  { runtimeIndex:4, name:'ビール', baseName:'ビール', aliases:[], category:'alcohol', input:{defaultAmount:350,defaultUnit:'ml'}, nutritionBasis:{amount:350,unit:'ml'} }
];
const searchRows = {
  'うどん':[{source:'db',index:0,name:'うどん(1玉)',meta:meta[0],score:4700}],
  'おにぎり':[
    {source:'db',index:1,name:'ツナマヨおにぎり',meta:meta[1],score:2200},
    {source:'db',index:2,name:'梅おにぎり',meta:meta[2],score:2200}
  ],
  '白米':[{source:'db',index:3,name:'白米',meta:meta[3],score:5200}],
  'ご飯':[{source:'db',index:3,name:'白米',meta:meta[3],score:900}],
  'ビール':[{source:'db',index:4,name:'ビール',meta:meta[4],score:5200}]
};
const nutrition = {
  0:{P:6.1,F:.8,C:52,A:0,Cal:242},
  3:{P:2.5,F:.3,C:37.1,A:0,Cal:156},
  4:{P:1.1,F:0,C:10.5,A:14,Cal:140}
};
const window = {
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  __PFC_DB_V3_SEARCH__:{search(q){return searchRows[q] || []; }},
  __PFC_DB_V3__:{
    get(index){return meta[index] || null;},
    buildRecord(index,amount,time){
      const n=nutrition[index]; if(!n) return null;
      const base=Number(meta[index].nutritionBasis.amount||1); const m=Number(amount)/base;
      return {id:1,N:`${meta[index].name}(${amount}${meta[index].input.defaultUnit})`,P:n.P*m,F:n.F*m,C:n.C*m,A:n.A*m,Cal:Math.round(n.Cal*m),U:'x',time:time||'昼',_dbv3:{index,amount,unit:meta[index].input.defaultUnit}};
    }
  },
  __PFC_DB_V3_MULTIUNIT__:{
    getUnits(index){return [{id:meta[index].input.defaultUnit,label:meta[index].input.defaultUnit,basisPerUnit:1}];},
    buildRecordInput(index,amount,unit,time){return window.__PFC_DB_V3__.buildRecord(index,amount,time);}
  }
};
const document = {readyState:'loading',addEventListener(){},documentElement:{classList:{add(){}}},getElementById(){return null;}};
const context = {window,document,console,Date,Map,Set,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw new Error('not used');},JSON,Number,String,Math,RegExp};
vm.createContext(context);
vm.runInContext(engineSource,context);
const api = window.__PFC_MEAL_ENGINE_V50__;
if (!api || api.version !== '5.0.0') throw new Error('v5 engine API missing');
if (api.legacyCommandTags !== false || !api.transactionalMutations || !api.nonAlcoholAZeroGuard) throw new Error('v5 engine invariants missing');
if (api.safeResolveFood('うどん')?.index !== 0) throw new Error('unique base-name food should resolve');
if (api.safeResolveFood('おにぎり') !== null) throw new Error('generic onigiri must not auto-resolve to a hidden filling');
if (api.safeResolveFood('ご飯')?.index !== 3) throw new Error('rice canonicalization failed');
const udon = api.buildTrustedRecord(0,3,'玉','昼',123);
if (!udon || udon._mealEngine?.nutritionSource !== 'Food Master' || udon.Cal !== 726) throw new Error('trusted udon 3玉 build failed');
if (!api.validateTrustedRecord(udon).ok) throw new Error('valid Food Master record rejected');
const poisoned = {...udon,A:705,Cal:5654};
if (api.validateTrustedRecord(poisoned).ok) throw new Error('non-alcohol A guard failed');
const beer = api.buildTrustedRecord(4,350,'ml','晩',124);
if (!beer || !api.validateTrustedRecord(beer).ok || beer.A <= 0) throw new Error('alcohol record should allow Food Master A');
const plan = api.parsePlan(JSON.stringify({operations:[{op:'add',foodQuery:'うどん',amountValue:3,amountUnit:'玉'}]}));
if (!plan || plan.operations[0].amountValue !== 3 || plan.operations[0].amountUnit !== '玉') throw new Error('structured voice plan parse failed');
if (api.parsePlan('{"reply":"x"}') !== null) throw new Error('plan without operations must fail closed');

const editorWindow = {
  __PFC_MEAL_ENGINE_V50__:api,
  __PFC_DB_V3__:window.__PFC_DB_V3__,
  __PFC_DB_V3_MULTIUNIT__:window.__PFC_DB_V3_MULTIUNIT__
};
const editorContext = {window:editorWindow,document,console,Date,Math,Number,String,JSON,URL:{createObjectURL(){},revokeObjectURL(){}},Image:function(){},setTimeout,clearTimeout,createImageBitmap:async()=>({width:1,height:1,close(){}})};
vm.createContext(editorContext);
vm.runInContext(editorSource,editorContext);
const editor = editorWindow.__PFC_MEAL_EDITOR_V50__;
if (!editor || editor.version !== '5.0.0' || !editor.singleLayerEditor || !editor.directNameEditing || !editor.inlineDbSearch) throw new Error('v5 editor API missing');

console.log('Meal Engine / Editor v5 trusted-mutation regression tests passed.');
