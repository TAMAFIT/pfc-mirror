import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) throw new Error('agent file required');
const source = fs.readFileSync(file,'utf8');
for (const marker of [
  "VERSION = '6.0.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'capabilityAgent:true',
  'iterativeToolUse:true',
  "name:'confirm_pending_action'",
  "name:'delete_all_today'",
  "name:'repair_record'",
  "name:'edit_open_draft'",
  "nutritionTruth:'Food Master'",
  "destructiveConfirmation:'runtime-gated'"
]) if (!source.includes(marker)) throw new Error(`v6 marker missing: ${marker}`);
for (const forbidden of ['function yesAnswer(', 'planConfirmationV51']) {
  if (source.includes(forbidden)) throw new Error(`rigid confirmation leaked into v6: ${forbidden}`);
}

const store = new Map();
const localStorage = {
  getItem(k){ return store.has(k) ? store.get(k) : null; },
  setItem(k,v){ store.set(k,String(v)); },
  removeItem(k){ store.delete(k); }
};
const meta = [
  {runtimeIndex:0,name:'うどん(1玉)',baseName:'うどん',category:'staples',input:{defaultAmount:1,defaultUnit:'玉'},nutritionBasis:{amount:1,unit:'玉'}},
  {runtimeIndex:1,name:'白米',baseName:'白米',category:'staples',input:{defaultAmount:150,defaultUnit:'g'},nutritionBasis:{amount:100,unit:'g'}}
];
const nutrition = {
  0:{P:6.1,F:.8,C:52,A:0,Cal:242},
  1:{P:2.5,F:.3,C:37.1,A:0,Cal:156}
};
let lst = [{id:101,N:'うどん(1玉)(3玉)',P:18.3,F:2.4,C:156,A:705,Cal:5654,time:'朝',_dbv3:{index:0,amount:3,unit:'玉'}}];
const engine = {
  unitCanon(v){return String(v||'');},
  stripRecordName(n){return String(n||'').replace(/[（(][^()（）]*[0-9][^()（）]*[)）]\s*$/,'').trim();},
  safeResolveFood(q){return String(q).includes('うどん') ? {index:0,name:'うどん(1玉)',meta:meta[0]} : null;},
  searchFood(q){return String(q).includes('うどん') ? [{source:'db',index:0,name:'うどん(1玉)',meta:meta[0]}] : [];},
  buildTrustedRecord(index,amount,unit,time,id){
    const n=nutrition[index]; const base=meta[index].nutritionBasis.amount; const m=Number(amount)/base;
    return {id,N:`${meta[index].name}(${amount}${unit})`,P:n.P*m,F:n.F*m,C:n.C*m,A:n.A*m,Cal:n.Cal*m,time,_dbv3:{index,amount:Number(amount),unit},_mealEngine:{trusted:true}};
  },
  validateTrustedRecord(r){return r && r.A===0 ? {ok:true} : {ok:false,reason:'invalid'};},
  currentTotals(){return lst.reduce((a,r)=>({kcal:a.kcal+r.Cal,p:a.p+r.P,f:a.f+r.F,c:a.c+r.C,a:a.a+r.A}),{kcal:0,p:0,f:0,c:0,a:0});},
  undoLastTransaction(){const tx=JSON.parse(localStorage.getItem('pfc_v50_last_transaction')||'null'); if(!tx?.before)return {ok:false}; lst.splice(0,lst.length,...tx.before); return {ok:true,message:'戻しました'};}
};
const window = {
  localStorage,
  __PFC_MEAL_ENGINE_V50__:engine,
  __PFC_DB_V3__:{get(i){return meta[i]||null;}},
  __PFC_DB_V3_MULTIUNIT__:{getUnits(i){return [{id:meta[i].input.defaultUnit,label:meta[i].input.defaultUnit}];}},
  __PFC_MEAL_EDITOR_V50__:{hasOpenDraft(){return false;},plannerContext(){return [];}}
};
const document = {readyState:'complete',addEventListener(){},getElementById(){return null;}};
const context = {window,document,lst,console,Date,Math,Number,String,JSON,Array,Set,Map,RegExp,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw new Error('not used');}};
context.sv=()=>{}; context.ren=()=>{}; context.upd=()=>{}; context.getAutoTime=()=> '朝';
vm.createContext(context);
vm.runInContext(source,context);
const api = window.__PFC_AGENT_V60__;
if (!api || api.version !== '6.0.0') throw new Error('v6 API missing');
if (lst[0].N !== 'うどん(3玉)') throw new Error(`trusted display normalization failed: ${lst[0].N}`);
const repair = api.toolResult('repair_record',{recordId:101});
if (!repair.ok || repair.record.a !== 0 || repair.record.kcal !== 726 || lst[0].Cal !== 726) throw new Error('Food Master repair tool failed');
const envelope = api.parseEnvelope(JSON.stringify({type:'tool_calls',calls:[{id:'x',name:'delete_all_today',args:{}}]}));
if (envelope?.calls?.[0]?.name !== 'delete_all_today') throw new Error('tool envelope parse failed');
const ask = api.toolResult('delete_all_today',{});
if (!ask.requiresConfirmation || lst.length !== 1) throw new Error('delete-all must be runtime gated');
const confirm = api.toolResult('confirm_pending_action',{});
if (!confirm.ok || lst.length !== 0 || confirm.deletedIds?.[0] !== 101) throw new Error('pending confirmation tool failed');
console.log('Agent Runtime v6 capability/confirmation/repair tests passed.');
