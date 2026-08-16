import fs from 'node:fs';
import vm from 'node:vm';

const hardeningFile = process.argv[2];
if (!hardeningFile) throw new Error('hardening path required');
const source = fs.readFileSync(hardeningFile,'utf8');

for (const marker of [
  "VERSION = '5.0.1'",
  "VOICE_INTELLIGENCE_VERSION = '5.1.0'",
  "VOICE_MODEL = 'gemini-3.5-flash-lite'",
  'genericConfirmationMemory:true',
  'recordNutritionContext:true',
  'foodMasterRepair:true',
  'localRepairFastPath:true',
  'planConfirmationV51',
  'nutritionMismatch',
  'window.sendVoiceChat=sendVoiceV51'
]) if (!source.includes(marker)) throw new Error(`Voice v5.1 marker missing: ${marker}`);

const store = new Map();
const localStorage = {
  getItem(key){ return store.has(key) ? store.get(key) : null; },
  setItem(key,value){ store.set(key,String(value)); },
  removeItem(key){ store.delete(key); }
};

const meta = {
  runtimeIndex:0,
  name:'うどん',
  baseName:'うどん',
  category:'staples',
  input:{defaultAmount:1,defaultUnit:'玉'},
  nutritionBasis:{amount:1,unit:'玉'}
};

const lst = [{
  id:777,
  N:'うどん(3玉)',
  P:18.3,F:2.4,C:156,A:705,Cal:5654,
  U:'x',
  time:'間食'
}];

const engine = {
  version:'5.0.0',
  voiceModel:'gemini-3.1-flash-lite',
  unitCanon(value){ return String(value || '').replace('切','切れ'); },
  stripRecordName(name){ return String(name || '').replace(/[（(][^()（）]*[0-9][^()（）]*[)）]\s*$/,'').trim(); },
  safeResolveFood(query){ return query === 'うどん' ? {index:0,name:'うどん',meta} : null; },
  buildTrustedRecord(index,amount,unit,time,id){
    if (index !== 0 || unit !== '玉') return null;
    return {
      id,
      N:`うどん(${amount}玉)`,
      P:6.1*amount,F:.8*amount,C:52*amount,A:0,Cal:242*amount,
      U:'x',time,
      _dbv3:{index,amount,unit},
      _mealEngine:{trusted:true,nutritionSource:'Food Master'}
    };
  },
  validateTrustedRecord(record){ return record && record.A === 0 ? {ok:true} : {ok:false}; },
  currentTotals(){
    return lst.reduce((a,r)=>({kcal:a.kcal+Number(r.Cal||0),p:a.p+Number(r.P||0),f:a.f+Number(r.F||0),c:a.c+Number(r.C||0),a:a.a+Number(r.A||0)}),{kcal:0,p:0,f:0,c:0,a:0});
  },
  buildRecordRefs(){ return {refs:new Map([['r1',777]]),rows:[{ref:'r1',name:'うどん'}]}; },
  executePlan(plan){ return {ok:true,message:'delegate',changed:[],plan}; },
  undoLastTransaction(){ return {ok:true,message:'undo',changed:[]}; }
};

const window = {
  localStorage,
  __PFC_MEAL_ENGINE_V50__:engine,
  __PFC_DB_V3__:{get(index){ return index === 0 ? meta : null; }},
  __PFC_MEAL_EDITOR_V50__:null
};

const document = {
  readyState:'complete',
  head:{appendChild(){}},
  createElement(){ return {id:'',textContent:'',className:'',appendChild(){},querySelector(){return null;}}; },
  getElementById(){ return null; },
  addEventListener(){}
};

const context = {
  window,document,console,Date,Map,Set,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw new Error('not used');},
  JSON,Number,String,Math,RegExp,
  lst,
  sv(){},ren(){},upd(){},getAutoTime(){return '間食';}
};

vm.createContext(context);
vm.runInContext(source,context);

const api = window.__PFC_MEAL_V501__;
if (!api || api.voiceIntelligenceVersion !== '5.1.0') throw new Error('Voice Intelligence v5.1 API missing');
if (api.voiceModel !== 'gemini-3.5-flash-lite' || engine.voiceModel !== 'gemini-3.5-flash-lite') throw new Error('voice model override failed');
if (typeof window.sendVoiceChat !== 'function') throw new Error('v5.1 voice send path was not installed');

const rich = api.buildRichRecordContext();
if (rich.length !== 1 || rich[0].amount !== 3 || rich[0].unit !== '玉') throw new Error('record amount/unit context failed');
if (rich[0].a !== 705 || rich[0].kcal !== 5654 || rich[0].foodMasterExpected?.kcal !== 726 || rich[0].nutritionMismatch !== true) {
  throw new Error('current vs Food Master nutrition context failed');
}

const parsed = api.parsePlanV51(JSON.stringify({operations:[{op:'repair',targetRef:'r1',targetQuery:'うどん'}]}));
if (!parsed || parsed.operations[0].op !== 'repair') throw new Error('repair plan parsing failed');

const repaired = api.tryLocalRepair('今日保存されてるうどん、明らかに成分おかしいから修整しといて');
if (!repaired?.ok || lst[0].A !== 0 || lst[0].Cal !== 726 || lst[0]._mealEngine?.repaired !== true) {
  throw new Error('deterministic Food Master repair fast-path failed');
}

const confirm = api.executePlanV51({
  operations:[{
    op:'update',
    targetRef:'r1',
    targetQuery:'うどん',
    scope:'single',
    preserveAmount:true,
    needsConfirmation:true,
    confirmationQuestion:'うどんを修正しますか？'
  }],
  reply:''
});
if (!confirm?.confirmation) throw new Error('generic confirmation must pause execution');
const pending = JSON.parse(localStorage.getItem('pfc_v50_pending_action') || 'null');
if (pending?.type !== 'planConfirmationV51' || pending?.plan?.operations?.[0]?.needsConfirmation !== false) {
  throw new Error('generic confirmation state was not persisted');
}

console.log('Voice Intelligence v5.1 regression tests passed.');
