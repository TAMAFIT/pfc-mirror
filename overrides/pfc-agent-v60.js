// PFC Mirror Agent Runtime V6.0
// Capability-based tool agent for voice/text control. Gemini interprets intent;
// the browser owns permissions, Food Master truth, transactions, and confirmation gates.
(() => {
  'use strict';

  const VERSION = '6.0.0';
  const MODEL = 'gemini-3.5-flash-lite';
  const MAX_AGENT_STEPS = 4;
  const REQUEST_TIMEOUT_MS = 30000;
  const HISTORY_KEY = 'pfc_agent_v60_history';
  const PENDING_KEY = 'pfc_agent_v60_pending';
  const LAST_TX_KEY = 'pfc_v50_last_transaction';
  const PENDING_TTL_MS = 10 * 60 * 1000;
  let busy = false;

  const engine = () => window.__PFC_MEAL_ENGINE_V50__ || null;
  const editor = () => window.__PFC_MEAL_EDITOR_V50__ || null;
  const dbv3 = () => window.__PFC_DB_V3__ || null;
  const multi = () => window.__PFC_DB_V3_MULTIUNIT__ || null;
  const storage = () => window.mirrorStorage || window.localStorage;
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = value => Number.isFinite(Number(value));
  const positive = value => finite(value) && Number(value) > 0 && Number(value) <= 10000;
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/[・･\s]/g, '').trim();
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const unitCanon = value => engine()?.unitCanon?.(value) || String(value || '').trim();

  function readJson(key, fallback = null) {
    try { const value = JSON.parse(storage().getItem(key) || 'null'); return value == null ? fallback : value; }
    catch { return fallback; }
  }
  function writeJson(key, value) {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  }

  function cleanMasterName(index) {
    const meta = dbv3()?.get?.(Number(index));
    const raw = String(meta?.baseName || meta?.name || '').trim();
    return raw.replace(/[（(]\s*1(?:\.0+)?\s*(?:g|ml|個|玉|杯|本|枚|切れ|切|パック|食|人前)\s*[)）]\s*$/i,'').trim() || raw;
  }
  function formatAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }
  function recordIndex(record) {
    if (finite(record?._dbv3?.index)) return Number(record._dbv3.index);
    const resolved = engine()?.safeResolveFood?.(engine()?.stripRecordName?.(record?.N) || record?.N || '');
    return resolved ? Number(resolved.index) : null;
  }
  function recordAmountUnit(record, index) {
    if (positive(record?._dbv3?.amount)) {
      return { amount:Number(record._dbv3.amount), unit:unitCanon(record._dbv3.unit || dbv3()?.get?.(index)?.input?.defaultUnit || '') };
    }
    const match = String(record?.N || '').match(/[（(]\s*([0-9]+(?:\.[0-9]+)?)\s*(g|ml|個|玉|杯|本|枚|切れ|切|パック|食|人前)\s*[)）]\s*$/i);
    if (match && positive(match[1])) return { amount:Number(match[1]), unit:unitCanon(match[2]) };
    const meta = dbv3()?.get?.(index);
    if (positive(meta?.input?.defaultAmount)) return { amount:Number(meta.input.defaultAmount), unit:unitCanon(meta.input.defaultUnit) };
    return null;
  }
  function normalizeBuiltName(record, index, amount, unit) {
    if (!record) return record;
    const clean = cleanMasterName(index) || engine()?.stripRecordName?.(record.N) || record.N || '食品';
    const amountText = positive(amount) && unit ? `(${formatAmount(amount)}${unitCanon(unit)})` : '';
    record.N = `${clean}${amountText}`;
    return record;
  }
  function summarizeRecord(record) {
    const index = recordIndex(record);
    const au = Number.isFinite(index) ? recordAmountUnit(record,index) : null;
    return {
      id:Number(record?.id),
      name:Number.isFinite(index) ? cleanMasterName(index) : (engine()?.stripRecordName?.(record?.N) || String(record?.N || '')),
      amount:au?.amount ?? null,
      unit:au?.unit || '',
      meal:String(record?.time || ''),
      p:Number(record?.P || 0), f:Number(record?.F || 0), c:Number(record?.C || 0), a:Number(record?.A || 0), kcal:Number(record?.Cal || 0),
      foodIndex:Number.isFinite(index) ? index : null
    };
  }
  function todayRecords() {
    return (typeof lst !== 'undefined' && Array.isArray(lst)) ? lst : [];
  }
  function saveRecords(records) {
    if (typeof lst === 'undefined' || !Array.isArray(lst)) throw new Error('食事記録へアクセスできません');
    lst.splice(0,lst.length,...records);
    if (typeof sv === 'function') sv();
    else storage().setItem('tf_dat',JSON.stringify(lst));
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
  }
  function saveTransaction(before, after, summary, changedIds) {
    writeJson(LAST_TX_KEY,{
      id:`tx-${Date.now()}`,
      createdAt:Date.now(), version:VERSION, summary,
      changedIds:[...new Set((changedIds || []).map(Number).filter(Boolean))],
      before:clone(before), after:clone(after)
    });
  }

  function buildRecord(index, amount, unit, meal, id) {
    const meta = dbv3()?.get?.(Number(index));
    if (!meta) throw new Error('Food Masterの食品番号が不正です');
    const finalAmount = positive(amount) ? Number(amount) : Number(meta.input?.defaultAmount || meta.nutritionBasis?.amount || 1);
    const finalUnit = unitCanon(unit || meta.input?.defaultUnit || meta.nutritionBasis?.unit || '');
    const record = engine()?.buildTrustedRecord?.(Number(index),finalAmount,finalUnit,meal || (typeof getAutoTime === 'function' ? getAutoTime() : ''),id);
    const validation = engine()?.validateTrustedRecord?.(record);
    if (!record || !validation?.ok) throw new Error(validation?.reason || 'Food Masterから記録を作れませんでした');
    normalizeBuiltName(record,index,finalAmount,finalUnit);
    record._agentV6 = { version:VERSION, nutritionSource:'Food Master', toolMutation:true };
    return record;
  }

  function getPending() {
    const pending = readJson(PENDING_KEY,null);
    if (!pending) return null;
    if (Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) { writeJson(PENDING_KEY,null); return null; }
    return pending;
  }
  function setPending(value) { writeJson(PENDING_KEY,value); }

  function getHistory() {
    const items = readJson(HISTORY_KEY,[]);
    return Array.isArray(items) ? items.slice(-8) : [];
  }
  function appendHistory(role,text) {
    const items = getHistory();
    items.push({role:String(role),text:String(text || '').slice(0,600),at:Date.now()});
    writeJson(HISTORY_KEY,items.slice(-8));
  }

  const TOOL_CATALOG = [
    { name:'list_today_records', description:'今日の保存済み食事記録と現在のPFC/kcalを読む。対象が曖昧ならまず使う。', args:{} },
    { name:'search_food_master', description:'Food Masterから食品候補を検索する。食品を追加・置換する前に必要なら使う。', args:{query:'string',limit:'number optional'} },
    { name:'add_food', description:'Food Masterの食品を今日の記録へ追加する。栄養値はFood Masterが決定する。', args:{foodIndex:'number',amount:'number optional',unit:'string optional',meal:'string optional'} },
    { name:'update_record', description:'保存済み1件を変更する。未指定の食品・量・単位・食事区分は保持する。', args:{recordId:'number',foodIndex:'number optional',amount:'number optional',unit:'string optional',meal:'string optional'} },
    { name:'repair_record', description:'保存済み記録の食品・量・単位を保持してFood MasterからPFC/kcalだけ再計算する。', args:{recordId:'number'} },
    { name:'delete_records', description:'指定した保存済み記録を削除する。全件削除になる場合はランタイムが確認を要求する。', args:{recordIds:'number[]'} },
    { name:'delete_all_today', description:'今日の全記録を削除したい時に使う。必ずランタイム確認が入る。', args:{} },
    { name:'confirm_pending_action', description:'直前にランタイムが確認を求めた破壊操作を、ユーザーが了承した時だけ確定する。', args:{} },
    { name:'cancel_pending_action', description:'直前の確認待ち操作をユーザーが拒否・中止した時にキャンセルする。', args:{} },
    { name:'undo_last_action', description:'ユーザーが「元に戻す」「取り消す」と明示した時だけ直前のトランザクションを戻す。削除依頼の代用には使わない。', args:{} },
    { name:'get_open_draft', description:'写真などで現在開いているMeal Draftの食品カードを読む。', args:{} },
    { name:'edit_open_draft', description:'現在開いているMeal Draftの食品カードを追加・変更・削除する。', args:{operations:'array of {action:add|update|delete,targetRef?,foodQuery?,replacementQuery?,amount?,unit?}'} },
    { name:'save_open_draft', description:'現在開いているMeal DraftをFood Master値で保存する。', args:{} }
  ];

  function toolResult(name,args) {
    switch (name) {
      case 'list_today_records':
        return {ok:true,records:todayRecords().map(summarizeRecord),pending:getPending(),draft:editor()?.plannerContext?.() || []};
      case 'search_food_master': {
        const query = String(args?.query || '').trim();
        const limit = Math.max(1,Math.min(10,Number(args?.limit || 6)));
        if (!query) return {ok:false,error:'query is required'};
        const rows = engine()?.searchFood?.(query,limit) || [];
        return {ok:true,candidates:rows.map(row => {
          const meta = row.meta || dbv3()?.get?.(row.index) || {};
          const units = multi()?.getUnits?.(row.index) || [];
          return {foodIndex:Number(row.index),name:cleanMasterName(row.index) || row.name,sourceName:row.name,defaultAmount:Number(meta.input?.defaultAmount || 1),defaultUnit:String(meta.input?.defaultUnit || ''),units:units.map(u=>String(u.label || u.id)).slice(0,8)};
        })};
      }
      case 'add_food': {
        const index = Number(args?.foodIndex);
        if (!Number.isFinite(index)) return {ok:false,error:'foodIndex is required'};
        const before = clone(todayRecords());
        const id = Date.now();
        const record = buildRecord(index,args?.amount,args?.unit,args?.meal,id);
        const after = clone(before); after.push(record);
        saveRecords(after); saveTransaction(before,after,`追加: ${summarizeRecord(record).name}`,[record.id]);
        return {ok:true,mutation:true,record:summarizeRecord(record)};
      }
      case 'update_record': {
        const id = Number(args?.recordId);
        const before = clone(todayRecords());
        const pos = before.findIndex(r => Number(r.id) === id);
        if (pos < 0) return {ok:false,error:'recordId not found'};
        const current = before[pos];
        const currentIndex = recordIndex(current);
        const index = finite(args?.foodIndex) ? Number(args.foodIndex) : currentIndex;
        if (!Number.isFinite(index)) return {ok:false,error:'Food Master source unresolved'};
        const au = recordAmountUnit(current,currentIndex);
        const amount = positive(args?.amount) ? Number(args.amount) : au?.amount;
        const unit = args?.unit ? unitCanon(args.unit) : au?.unit;
        const meal = args?.meal || current.time || '';
        const next = buildRecord(index,amount,unit,meal,current.id);
        const after = clone(before); after[pos] = next;
        saveRecords(after); saveTransaction(before,after,`変更: ${summarizeRecord(next).name}`,[next.id]);
        return {ok:true,mutation:true,record:summarizeRecord(next)};
      }
      case 'repair_record': {
        const id = Number(args?.recordId);
        const before = clone(todayRecords());
        const pos = before.findIndex(r => Number(r.id) === id);
        if (pos < 0) return {ok:false,error:'recordId not found'};
        const current = before[pos];
        const index = recordIndex(current);
        if (!Number.isFinite(index)) return {ok:false,error:'Food Master source unresolved'};
        const au = recordAmountUnit(current,index);
        if (!au) return {ok:false,error:'amount/unit unresolved'};
        const next = buildRecord(index,au.amount,au.unit,current.time,current.id);
        next._agentV6.repaired = true;
        const after = clone(before); after[pos] = next;
        saveRecords(after); saveTransaction(before,after,`再計算: ${summarizeRecord(next).name}`,[next.id]);
        return {ok:true,mutation:true,record:summarizeRecord(next)};
      }
      case 'delete_records': {
        const ids = [...new Set((Array.isArray(args?.recordIds) ? args.recordIds : []).map(Number).filter(Number.isFinite))];
        const before = clone(todayRecords());
        if (!ids.length) return {ok:false,error:'recordIds is required'};
        const existing = ids.filter(id => before.some(r => Number(r.id) === id));
        if (!existing.length) return {ok:false,error:'records not found'};
        if (before.length > 0 && existing.length === before.length) {
          const pending = {id:`pending-${Date.now()}`,createdAt:Date.now(),action:{name:'delete_records',args:{recordIds:existing},confirmed:true},question:`今日の記録${existing.length}件をすべて削除しますか？`};
          setPending(pending);
          return {ok:true,requiresConfirmation:true,pendingId:pending.id,question:pending.question};
        }
        const set = new Set(existing); const after = before.filter(r => !set.has(Number(r.id)));
        saveRecords(after); saveTransaction(before,after,`${existing.length}件を削除`,existing);
        return {ok:true,mutation:true,deletedIds:existing,remaining:after.map(summarizeRecord)};
      }
      case 'delete_all_today': {
        const before = clone(todayRecords());
        if (!before.length) return {ok:true,mutation:false,message:'今日の記録はありません。'};
        const ids = before.map(r=>Number(r.id)).filter(Number.isFinite);
        const pending = {id:`pending-${Date.now()}`,createdAt:Date.now(),action:{name:'delete_records',args:{recordIds:ids},confirmed:true},question:`今日の記録${ids.length}件をすべて削除しますか？`};
        setPending(pending);
        return {ok:true,requiresConfirmation:true,pendingId:pending.id,question:pending.question};
      }
      case 'confirm_pending_action': {
        const pending = getPending();
        if (!pending?.action) return {ok:false,error:'確認待ちの操作はありません'};
        setPending(null);
        if (pending.action.name === 'delete_records') {
          const before = clone(todayRecords());
          const ids = (pending.action.args?.recordIds || []).map(Number);
          const set = new Set(ids); const after = before.filter(r=>!set.has(Number(r.id)));
          saveRecords(after); saveTransaction(before,after,`${ids.length}件を削除`,ids);
          return {ok:true,mutation:true,confirmed:true,deletedIds:ids,remaining:after.map(summarizeRecord)};
        }
        return {ok:false,error:'unsupported pending action'};
      }
      case 'cancel_pending_action':
        if (!getPending()) return {ok:true,cancelled:false,message:'確認待ちの操作はありません。'};
        setPending(null); return {ok:true,cancelled:true,message:'操作をキャンセルしました。'};
      case 'undo_last_action': {
        const result = engine()?.undoLastTransaction?.();
        return result || {ok:false,error:'取り消せる操作がありません'};
      }
      case 'get_open_draft':
        return {ok:true,open:!!editor()?.hasOpenDraft?.(),rows:editor()?.plannerContext?.() || []};
      case 'edit_open_draft': {
        if (!editor()?.hasOpenDraft?.()) return {ok:false,error:'Meal Draft is not open'};
        const operations = (Array.isArray(args?.operations) ? args.operations : []).slice(0,12).map(item => {
          const action = String(item?.action || '');
          if (action === 'add') return {op:'add',foodQuery:String(item.foodQuery || ''),amountValue:positive(item.amount)?Number(item.amount):null,amountUnit:unitCanon(item.unit)};
          if (action === 'delete') return {op:'delete',targetRef:String(item.targetRef || ''),targetQuery:String(item.foodQuery || '')};
          return {op:'update',targetRef:String(item.targetRef || ''),targetQuery:String(item.foodQuery || ''),replacementQuery:String(item.replacementQuery || ''),amountValue:positive(item.amount)?Number(item.amount):null,amountUnit:unitCanon(item.unit)};
        });
        const result = editor().applyVoicePlan({operations});
        return {ok:!!result?.ok,mutation:true,message:result?.message || '',draft:editor()?.plannerContext?.() || []};
      }
      case 'save_open_draft': {
        if (!editor()?.hasOpenDraft?.()) return {ok:false,error:'Meal Draft is not open'};
        const button = document.getElementById('v50-commit');
        if (!button || button.disabled) return {ok:false,error:'Meal Draft cannot be saved yet'};
        button.click();
        return {ok:true,mutation:true,message:'Meal Draftを保存しました。'};
      }
      default:
        return {ok:false,error:`unknown tool: ${name}`};
    }
  }

  function currentSnapshot() {
    return {
      records:todayRecords().map(summarizeRecord),
      totals:engine()?.currentTotals?.() || null,
      pending:getPending() ? {id:getPending().id,question:getPending().question,actionName:getPending().action?.name || ''} : null,
      draft:editor()?.hasOpenDraft?.() ? (editor()?.plannerContext?.() || []) : [],
      recentConversation:getHistory()
    };
  }

  function systemInstruction() {
    return `あなたはPFCアプリ内蔵の操作エージェントです。ユーザーの自然な日本語を文脈で理解し、必要なら利用可能なツールを自律的に使ってアプリを操作してください。\n\n原則:\n- ユーザーの目的を優先し、不要な確認や聞き返しを減らす。対象がツールや現在状態から特定できるなら自分で特定する。\n- P/F/C/A/kcalを自分で生成・推測しない。Food Master由来のツール結果だけを栄養値の真実として扱う。\n- 「削除」と「元に戻す」は別物。undo_last_actionはユーザーが明示的に元へ戻したい時だけ使う。\n- 全件削除などはツールランタイムがrequiresConfirmationを返す。確認待ちがある時は、ユーザーの次の返答を自然な文脈で解釈し、了承ならconfirm_pending_action、拒否ならcancel_pending_actionを使う。特定の語句への完全一致には依存しない。\n- 写真のMeal Draftが開いている時、「これ」「この料理」「このカード」などはDraftを優先する。\n- ツール結果が失敗したら必要なら別ツールで調べて再試行する。\n- アプリ操作が必要なら final で済ませずtool_callsを返す。質問・説明だけならfinalで答える。\n\n出力はJSONのみ。\nツール呼び出し: {"type":"tool_calls","calls":[{"id":"c1","name":"tool_name","args":{}}],"message":""}\n最終回答: {"type":"final","message":"短い自然な日本語"}\n1回に最大4ツール。`;
  }

  function gasEndpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }
  function extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map(p=>typeof p?.text === 'string' ? p.text : '').join('').trim() : '';
  }
  function parseEnvelope(raw) {
    const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    let value;
    try { value = JSON.parse(text); } catch { return null; }
    if (!value || !['tool_calls','final'].includes(value.type)) return null;
    if (value.type === 'final') return {type:'final',message:String(value.message || '').slice(0,1000)};
    const allowed = new Set(TOOL_CATALOG.map(t=>t.name));
    const calls = (Array.isArray(value.calls) ? value.calls : []).slice(0,4).filter(c=>c && allowed.has(c.name)).map((c,i)=>({id:String(c.id || `c${i+1}`).slice(0,40),name:c.name,args:(c.args && typeof c.args === 'object') ? c.args : {}}));
    return calls.length ? {type:'tool_calls',calls,message:String(value.message || '').slice(0,500)} : null;
  }

  async function requestEnvelope(userText, trace) {
    const prompt = `${systemInstruction()}\n\n【利用可能なツール】\n${JSON.stringify(TOOL_CATALOG)}\n\n【現在のアプリ状態】\n${JSON.stringify(currentSnapshot())}\n\n【今回のユーザー発言】\n${String(userText || '').trim()}\n\n【このターンで既に行ったツール処理】\n${JSON.stringify(trace || [])}`;
    const payload = {
      taskType:'chat', modelPreference:MODEL,
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{maxOutputTokens:1200,responseMimeType:'application/json',temperature:0.15}
    };
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(gasEndpoint(),{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload),signal:controller.signal});
      if (!response.ok) throw new Error(`Agent HTTP ${response.status}`);
      const data = await response.json();
      const raw = extractText(data);
      if (/^GASエラー:/i.test(raw)) throw new Error(raw.slice(0,240));
      const envelope = parseEnvelope(raw);
      if (!envelope) throw new Error('AIのツール選択を解釈できませんでした');
      return envelope;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('AIが30秒以内に応答しませんでした');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function deterministicToolMessage(results) {
    const last = results[results.length-1]?.result;
    if (!last) return '処理しました。';
    if (last.requiresConfirmation) return last.question || 'この操作を実行しますか？';
    if (last.cancelled) return last.message || 'キャンセルしました。';
    if (Array.isArray(last.deletedIds)) return `${last.deletedIds.length}件を削除しました。`;
    if (last.record) return `${last.record.name}${last.record.amount ? ` ${formatAmount(last.record.amount)}${last.record.unit || ''}` : ''}を更新しました。`;
    if (last.message) return String(last.message);
    return '処理しました。';
  }

  async function runAgent(userText) {
    const trace = [];
    for (let step=0; step<MAX_AGENT_STEPS; step++) {
      const envelope = await requestEnvelope(userText,trace);
      if (envelope.type === 'final') return {message:envelope.message || '了解しました。',trace};
      const batch = [];
      for (const call of envelope.calls) {
        let result;
        try { result = toolResult(call.name,call.args); }
        catch (error) { result = {ok:false,error:String(error?.message || error)}; }
        batch.push({id:call.id,name:call.name,args:call.args,result});
        if (result?.requiresConfirmation) {
          trace.push({calls:batch});
          return {message:result.question || 'この操作を実行しますか？',trace,confirmation:true};
        }
      }
      trace.push({calls:batch});
      const terminalMutation = batch.some(x=>x.result?.mutation) && !batch.some(x=>['list_today_records','search_food_master','get_open_draft'].includes(x.name));
      if (terminalMutation && step >= 1) return {message:deterministicToolMessage(batch),trace};
    }
    const lastBatch = trace.at(-1)?.calls || [];
    return {message:deterministicToolMessage(lastBatch),trace};
  }

  function resultCardsFromTrace(trace) {
    const records = [];
    for (const step of trace || []) for (const item of step.calls || []) if (item.result?.record) records.push(item.result.record);
    if (!records.length) return '';
    return `<div class="v50-result-list">${records.slice(-4).map(r=>`<div class="v50-result-card"><b>${esc(r.name)}${r.amount ? ` ${esc(formatAmount(r.amount)+r.unit)}` : ''}</b><span>P ${Number(r.p||0).toFixed(1)} / F ${Number(r.f||0).toFixed(1)} / C ${Number(r.c||0).toFixed(1)}</span><strong>${Math.round(Number(r.kcal||0)).toLocaleString()} kcal</strong></div>`).join('')}</div>`;
  }

  async function sendAgentVoice() {
    const input = document.getElementById('v-chat-input');
    const text = String(input?.value || '').trim();
    if (!text || busy) return;
    busy = true;
    const status = document.getElementById('v-status-text');
    if (input) { input.value=''; input.disabled=true; }
    if (status) status.textContent='AIが操作を考え中…';
    if (typeof addChatMsg === 'function') addChatMsg('user',text);
    const loadingId = typeof addChatMsg === 'function' ? addChatMsg('bot','AIがアプリを確認中…') : null;
    appendHistory('user',text);
    try {
      const result = await runAgent(text);
      if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
      const message = result.message || '処理しました。';
      appendHistory('assistant',message);
      if (typeof addChatMsg === 'function') addChatMsg('bot',esc(message)+resultCardsFromTrace(result.trace),true);
    } catch (error) {
      if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
      const message = `操作に失敗しました。${String(error?.message || '')}`;
      appendHistory('assistant',message);
      if (typeof addChatMsg === 'function') addChatMsg('bot',esc(message),true);
    } finally {
      if (status) status.textContent='マイクOFF';
      if (input) input.disabled=false;
      busy=false;
    }
  }

  function normalizeExistingTrustedNames() {
    const rows = todayRecords();
    let changed = false;
    for (const record of rows) {
      const index = recordIndex(record);
      if (!Number.isFinite(index) || !positive(record?._dbv3?.amount)) continue;
      const unit = unitCanon(record._dbv3.unit || dbv3()?.get?.(index)?.input?.defaultUnit || '');
      const expected = `${cleanMasterName(index)}(${formatAmount(record._dbv3.amount)}${unit})`;
      if (expected && record.N !== expected) { record.N = expected; changed = true; }
    }
    if (changed) {
      if (typeof sv === 'function') sv();
      else storage().setItem('tf_dat',JSON.stringify(rows));
      if (typeof ren === 'function') ren();
      if (typeof upd === 'function') upd();
    }
    return changed;
  }

  function install() {
    normalizeExistingTrustedNames();
    window.sendVoiceChat = sendAgentVoice;
    window.__PFC_AGENT_V60__ = {
      version:VERSION, model:MODEL, capabilityAgent:true, iterativeToolUse:true,
      nutritionTruth:'Food Master', destructiveConfirmation:'runtime-gated',
      toolCatalog:clone(TOOL_CATALOG), parseEnvelope, toolResult, currentSnapshot,
      runAgent, normalizeExistingTrustedNames
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
