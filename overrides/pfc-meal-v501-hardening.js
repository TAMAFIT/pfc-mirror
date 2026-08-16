// PFC Mirror Meal V5.0.1 hardening + Voice Intelligence V5.1.
// Keeps the single-layer editor hardening while replacing the voice command path
// with richer context, generic confirmation memory, deterministic Food Master repair,
// and Gemini 3.5 Flash-Lite planning.
(() => {
  'use strict';

  // Keep this marker for the existing build contract.
  const VERSION = '5.0.1';
  const VOICE_INTELLIGENCE_VERSION = '5.1.0';
  const VOICE_MODEL = 'gemini-3.5-flash-lite';
  const LAST_TX_KEY = 'pfc_v50_last_transaction';
  const PENDING_KEY = 'pfc_v50_pending_action';
  const PENDING_TTL_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 30000;
  const MAX_RECENT = 12;

  let editorRecognition = null;
  let voiceBusyV51 = false;

  const engine = () => window.__PFC_MEAL_ENGINE_V50__ || null;
  const dbv3 = () => window.__PFC_DB_V3__ || null;
  const storage = () => window.mirrorStorage || window.localStorage;
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = value => String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[・･\s]/g, '')
    .trim();
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 10000;
  const unitCanon = value => engine()?.unitCanon?.(value) || String(value || '').trim();

  function readJson(key) {
    try { return JSON.parse(storage().getItem(key) || 'null'); } catch { return null; }
  }
  function writeJson(key, value) {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  }

  function getPending() {
    const pending = readJson(PENDING_KEY);
    if (!pending) return null;
    if (Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
      writeJson(PENDING_KEY, null);
      return null;
    }
    return pending;
  }
  function setPending(value) { writeJson(PENDING_KEY, value); }

  function yesAnswer(text) {
    return /^(はい|うん|お願い|お願いします|それで|それでお願い|実行|やって|やってください|ok|オーケー)$/i.test(String(text || '').trim());
  }
  function noAnswer(text) {
    return /^(いいえ|いや|違う|やめ|やめて|キャンセル|中止|戻る)$/i.test(String(text || '').trim());
  }

  function stripName(record) {
    return engine()?.stripRecordName?.(record?.N) || String(record?.N || '').replace(/[（(][^()（）]*[0-9][^()（）]*[)）]\s*$/,'').trim();
  }

  function legacyAmountUnit(record) {
    if (positive(record?._dbv3?.amount)) {
      return { amount:Number(record._dbv3.amount), unit:unitCanon(record._dbv3.unit || '') };
    }
    const match = String(record?.N || '').match(/[（(]\s*([0-9]+(?:\.[0-9]+)?)\s*(g|ml|個|玉|杯|本|枚|切れ|切|パック|食|人前)\s*[)）]\s*$/i);
    if (!match || !positive(match[1])) return null;
    return { amount:Number(match[1]), unit:unitCanon(match[2]) };
  }

  function recordDbIndex(record) {
    if (Number.isFinite(Number(record?._dbv3?.index))) return Number(record._dbv3.index);
    const resolved = engine()?.safeResolveFood?.(stripName(record));
    return resolved ? Number(resolved.index) : null;
  }

  function recordAmountUnit(record, index) {
    const parsed = legacyAmountUnit(record);
    if (parsed?.amount && parsed?.unit) return parsed;
    const meta = dbv3()?.get?.(index);
    const amount = positive(record?._dbv3?.amount) ? Number(record._dbv3.amount) : null;
    const unit = unitCanon(record?._dbv3?.unit || meta?.input?.defaultUnit || '');
    return amount && unit ? { amount, unit } : null;
  }

  function expectedRecord(record) {
    const index = recordDbIndex(record);
    if (!Number.isFinite(index)) return null;
    const amountUnit = recordAmountUnit(record,index);
    if (!amountUnit) return null;
    return engine()?.buildTrustedRecord?.(index, amountUnit.amount, amountUnit.unit, record.time || '', record.id) || null;
  }

  function nutritionMismatch(record, expected) {
    if (!expected) return null;
    const keys = ['P','F','C','A','Cal'];
    return keys.some(key => Math.abs(Number(record?.[key] || 0) - Number(expected?.[key] || 0)) > 0.6);
  }

  function buildRichRecordContext() {
    const source = (typeof lst !== 'undefined' && Array.isArray(lst)) ? lst.slice(-MAX_RECENT).reverse() : [];
    return source.map((record,index) => {
      const expected = expectedRecord(record);
      const amountUnit = legacyAmountUnit(record);
      const dbIndex = recordDbIndex(record);
      return {
        ref:`r${index + 1}`,
        id:Number(record.id),
        time:record.time || '',
        name:stripName(record),
        displayName:String(record.N || ''),
        amount:amountUnit?.amount ?? (positive(record?._dbv3?.amount) ? Number(record._dbv3.amount) : null),
        unit:amountUnit?.unit || unitCanon(record?._dbv3?.unit || ''),
        p:Number(record.P || 0),
        f:Number(record.F || 0),
        c:Number(record.C || 0),
        a:Number(record.A || 0),
        kcal:Number(record.Cal || 0),
        dbIndex:Number.isFinite(dbIndex) ? dbIndex : null,
        foodMasterExpected:expected ? {
          p:Number(expected.P || 0),
          f:Number(expected.F || 0),
          c:Number(expected.C || 0),
          a:Number(expected.A || 0),
          kcal:Number(expected.Cal || 0)
        } : null,
        nutritionMismatch:nutritionMismatch(record,expected),
        trusted:record?._mealEngine?.trusted === true
      };
    });
  }

  function totals() {
    return engine()?.currentTotals?.() || { kcal:0,p:0,f:0,c:0,a:0 };
  }

  function plannerContextV51() {
    const current = totals();
    const pending = getPending();
    const lastTx = readJson(LAST_TX_KEY);
    let draft = [];
    try { draft = window.__PFC_MEAL_EDITOR_V50__?.plannerContext?.() || []; } catch {}
    const targets = (typeof TG !== 'undefined' && TG) ? { kcal:TG.cal,p:TG.p,f:TG.f,c:TG.c } : {};
    return {
      currentTime:new Date().toISOString(),
      currentMeal:typeof getAutoTime === 'function' ? getAutoTime() : '',
      targets,
      totals:{
        kcal:Math.round(Number(current.kcal || 0)),
        p:Number(Number(current.p || 0).toFixed(1)),
        f:Number(Number(current.f || 0).toFixed(1)),
        c:Number(Number(current.c || 0).toFixed(1)),
        a:Number(Number(current.a || 0).toFixed(1))
      },
      recentRecords:buildRichRecordContext(),
      lastTransaction:lastTx ? { id:lastTx.id, summary:lastTx.summary || '', changedIds:lastTx.changedIds || [] } : null,
      pendingAction:pending ? { type:pending.type || '', question:pending.question || '', plan:pending.plan || null } : null,
      mealDraft:draft
    };
  }

  function plannerPromptV51() {
    return `あなたは食事管理アプリの操作プランナーです。自然な日本語、短い返答、省略、言い直し、音声認識の揺れを文脈込みで理解し、JSONだけを返してください。

重要:
- P/F/C/A/kcalは絶対に生成・推測しない。栄養値はFood Masterだけが決定する。
- recentRecordsには現在の栄養値とfoodMasterExpectedがある。nutritionMismatch=trueならFood Master再計算で修復可能。
- 「成分がおかしい」「栄養がおかしい」「PFCがおかしい」「カロリーがおかしい」「成分直して」「修整して」「再計算して」は、対象が一意ならrepair。確認質問を挟まない。
- repairは食品・量・単位・時刻・IDを保持し、Food Masterから栄養値だけを再構築する。
- recentRecordsのrefを優先して対象を指定する。
- pendingActionがある場合、「はい」「うん」「それで」などはその未完了操作への返答として扱う。ただし通常はアプリ側が先に処理する。
- 「これ」「それ」「さっきの」「今の」はmealDraft、lastTransaction、recentRecordsの順で文脈解決する。
- updateで量を言っていない場合はpreserveAmount=true。
- 質問だけならquestion。記録操作を勝手に行わない。
- 「今の全部消して」「さっき入れたの全部消して」はundoを優先。
- 「今日の記録を全部消して」はdelete scope=allToday needsConfirmation=true。
- 対象が本当に複数で特定不能な場合だけneedsConfirmation=true。
- 今日以外の記録操作はnoop。
- 「さんたま」=3玉、「にぱっく」=2パック等を自然に解釈する。

operation:
{
 "op":"add|update|repair|delete|undo|question|noop",
 "foodQuery":"",
 "replacementQuery":"",
 "amountValue":null,
 "amountUnit":"",
 "targetRef":"",
 "targetQuery":"",
 "scope":"single|lastTransaction|allToday",
 "preserveAmount":true,
 "needsConfirmation":false,
 "confirmationQuestion":"",
 "answer":""
}

出力:
{"operations":[...],"reply":""}
JSON以外は禁止。`;
  }

  function parsePlanV51(raw) {
    const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!parsed || !Array.isArray(parsed.operations)) return null;
    const allowed = new Set(['add','update','repair','delete','undo','question','noop']);
    parsed.operations = parsed.operations.filter(op => op && allowed.has(op.op)).slice(0,12).map(op => ({
      op:op.op,
      foodQuery:String(op.foodQuery || '').slice(0,80),
      replacementQuery:String(op.replacementQuery || '').slice(0,80),
      amountValue:positive(op.amountValue) ? Number(op.amountValue) : null,
      amountUnit:unitCanon(op.amountUnit),
      targetRef:String(op.targetRef || '').slice(0,20),
      targetQuery:String(op.targetQuery || '').slice(0,80),
      scope:String(op.scope || 'single'),
      preserveAmount:op.preserveAmount !== false,
      needsConfirmation:op.needsConfirmation === true,
      confirmationQuestion:String(op.confirmationQuestion || '').slice(0,180),
      answer:String(op.answer || '').slice(0,500)
    }));
    parsed.reply = String(parsed.reply || '').slice(0,500);
    return parsed;
  }

  function gasEndpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }

  function extractAiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim() : '';
  }

  async function requestPlanV51(text) {
    const payload = {
      taskType:'chat',
      modelPreference:VOICE_MODEL,
      contents:[{parts:[{text:`${plannerPromptV51()}\n\n【アプリ状態】\n${JSON.stringify(plannerContextV51())}\n\n【ユーザー発言】\n${String(text || '').trim()}`}]}],
      generationConfig:{ maxOutputTokens:900,responseMimeType:'application/json',temperature:0.1 }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(gasEndpoint(),{
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body:JSON.stringify(payload),
        signal:controller.signal
      });
      if (!response.ok) throw new Error(`音声AI HTTP ${response.status}`);
      const data = await response.json();
      const raw = extractAiText(data);
      if (/^GASエラー:/i.test(raw)) throw new Error(raw.slice(0,240));
      const plan = parsePlanV51(raw);
      if (!plan) throw new Error('音声AIの操作計画を読めませんでした');
      return plan;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('音声AIが30秒以内に応答しませんでした');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function saveRecords(records) {
    if (typeof lst === 'undefined' || !Array.isArray(lst)) throw new Error('食事記録を参照できません');
    lst.splice(0,lst.length,...records);
    if (typeof sv === 'function') sv();
    else storage().setItem('tf_dat',JSON.stringify(lst));
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
  }

  function saveTransaction(before,after,summary,changedIds) {
    writeJson(LAST_TX_KEY,{
      id:`tx-${Date.now()}`,
      createdAt:Date.now(),
      version:VOICE_INTELLIGENCE_VERSION,
      summary,
      changedIds:[...new Set((changedIds || []).map(Number).filter(Boolean))],
      before,
      after
    });
  }

  function resolveTargetIdsV51(op,records) {
    const refs = engine()?.buildRecordRefs?.().refs;
    if (op.scope === 'allToday') return records.map(item => Number(item.id)).filter(Boolean);
    if (op.scope === 'lastTransaction') {
      const tx = readJson(LAST_TX_KEY);
      return (tx?.changedIds || []).map(Number).filter(id => records.some(item => Number(item.id) === id));
    }
    if (op.targetRef && refs?.has(op.targetRef)) return [Number(refs.get(op.targetRef))];
    const query = normalize(op.targetQuery || op.foodQuery || '');
    if (!query) return [];
    const matches = records.slice().reverse().filter(item => {
      const name = normalize(stripName(item));
      return name && (name.includes(query) || query.includes(name));
    });
    return matches.length ? [Number(matches[0].id)] : [];
  }

  function rebuildRecord(record) {
    const index = recordDbIndex(record);
    if (!Number.isFinite(index)) return null;
    const amountUnit = recordAmountUnit(record,index);
    if (!amountUnit) return null;
    const rebuilt = engine()?.buildTrustedRecord?.(index,amountUnit.amount,amountUnit.unit,record.time || '',record.id);
    const validation = engine()?.validateTrustedRecord?.(rebuilt);
    if (!rebuilt || !validation?.ok) return null;
    rebuilt._mealEngine = {
      ...(rebuilt._mealEngine || {}),
      version:VOICE_INTELLIGENCE_VERSION,
      nutritionSource:'Food Master',
      trusted:true,
      repaired:true,
      repairedAt:Date.now()
    };
    return rebuilt;
  }

  function executeRepairOps(ops) {
    const before = (typeof lst !== 'undefined' && Array.isArray(lst)) ? clone(lst) : [];
    const working = clone(before);
    const changed = [];
    const changedIds = [];
    const unresolved = [];

    for (const op of ops) {
      const targetIds = resolveTargetIdsV51(op,working);
      if (!targetIds.length) {
        unresolved.push({query:op.targetQuery || op.foodQuery,operation:'repair',source:'voice-target'});
        continue;
      }
      for (const targetId of targetIds) {
        const pos = working.findIndex(item => Number(item.id) === Number(targetId));
        if (pos < 0) continue;
        const rebuilt = rebuildRecord(working[pos]);
        if (!rebuilt) {
          unresolved.push({query:stripName(working[pos]),operation:'repair',targetId,source:'voice'});
          continue;
        }
        working[pos] = rebuilt;
        changed.push(rebuilt);
        changedIds.push(rebuilt.id);
      }
    }

    if (unresolved.length) {
      return {ok:false,unresolved,message:'Food Masterで安全に再計算できない項目があります。編集画面で確認してください。'};
    }
    saveRecords(working);
    const names = changed.map(stripName).filter(Boolean);
    saveTransaction(before,clone(working),`${names.join('、') || '食事'}をFood Masterから再計算`,changedIds);
    setPending(null);
    return {
      ok:true,
      message:`${changed.length}件をFood Masterから再計算して修正しました。`,
      changed
    };
  }

  function tryLocalRepair(text) {
    const raw = String(text || '').trim();
    const intent = /(?:成分|栄養|pfc|カロリー|cal).*(?:おかし|変|修正|修整|直|再計算)|(?:修正|修整|直|再計算).*(?:成分|栄養|pfc|カロリー|cal)/i.test(raw);
    if (!intent) return null;
    const records = (typeof lst !== 'undefined' && Array.isArray(lst)) ? lst.slice() : [];
    const matches = records.slice().reverse().filter(record => {
      const name = normalize(stripName(record));
      return name && normalize(raw).includes(name);
    });
    let target = null;
    if (matches.length === 1) target = matches[0];
    else if (matches.length > 1 && /(さっき|直近|最後|今の)/.test(raw)) target = matches[0];
    if (!target) return null;
    return executeRepairOps([{op:'repair',targetQuery:stripName(target),targetRef:'',scope:'single'}]);
  }

  function confirmationFromPlan(plan) {
    const dangerous = (plan.operations || []).find(op => op.op === 'delete' && op.scope === 'allToday');
    if (dangerous) {
      const executable = clone(plan);
      executable.operations.forEach(op => { op.needsConfirmation = false;op.confirmationQuestion = ''; });
      const question = dangerous.confirmationQuestion || '今日の記録をすべて削除しますか？';
      setPending({type:'planConfirmationV51',createdAt:Date.now(),question,plan:executable});
      return {ok:false,confirmation:true,message:question};
    }
    const op = (plan.operations || []).find(item => item.needsConfirmation);
    if (!op) return null;
    const executable = clone(plan);
    executable.operations.forEach(item => { item.needsConfirmation = false;item.confirmationQuestion = ''; });
    const question = op.confirmationQuestion || 'この内容で実行しますか？';
    setPending({type:'planConfirmationV51',createdAt:Date.now(),question,plan:executable});
    return {ok:false,confirmation:true,message:question};
  }

  function executeDeleteAllV51() {
    const before = (typeof lst !== 'undefined' && Array.isArray(lst)) ? clone(lst) : [];
    saveRecords([]);
    saveTransaction(before,[],'今日の記録をすべて削除',before.map(item => item.id));
    setPending(null);
    return {ok:true,message:`${before.length}件の記録を削除しました。`,changed:[]};
  }

  function executePlanV51(plan) {
    if (!plan?.operations?.length) return {ok:false,message:plan?.reply || '操作内容を特定できませんでした。'};

    const confirmation = confirmationFromPlan(plan);
    if (confirmation) return confirmation;

    if (plan.operations.some(op => op.op === 'undo')) {
      setPending(null);
      return engine()?.undoLastTransaction?.() || {ok:false,message:'取り消せる操作がありません。'};
    }

    const repairs = plan.operations.filter(op => op.op === 'repair');
    const others = plan.operations.filter(op => op.op !== 'repair');
    const messages = [];
    const changed = [];
    let unresolved = [];

    if (others.length) {
      const result = engine()?.executePlan?.({operations:others,reply:plan.reply || ''},engine()?.buildRecordRefs?.().refs);
      if (result?.unresolved?.length) unresolved = unresolved.concat(result.unresolved);
      if (result?.message) messages.push(result.message);
      if (result?.changed?.length) changed.push(...result.changed);
      if (result?.confirmation) return result;
    }

    if (repairs.length) {
      const result = executeRepairOps(repairs);
      if (result?.unresolved?.length) unresolved = unresolved.concat(result.unresolved);
      if (result?.message) messages.push(result.message);
      if (result?.changed?.length) changed.push(...result.changed);
    }

    if (unresolved.length) return {ok:false,unresolved,message:'確認が必要な食品があります。'};
    setPending(null);
    return {ok:true,message:messages.filter(Boolean).join(' ') || plan.reply || '処理しました。',changed};
  }

  function resultCards(items) {
    const rows = (items || []).map(item => `<div class="v50-result-card"><b>${escapeHtml(stripName(item))}</b><span>P ${Number(item.P || 0).toFixed(1)} / F ${Number(item.F || 0).toFixed(1)} / C ${Number(item.C || 0).toFixed(1)}</span><strong>${Math.round(Number(item.Cal || 0)).toLocaleString()} kcal</strong></div>`).join('');
    return rows ? `<div class="v50-result-list">${rows}</div>` : '';
  }

  function removeLoading(loadingId) {
    if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
  }

  function showBot(message,changed=[]) {
    if (typeof addChatMsg === 'function') addChatMsg('bot',escapeHtml(message || '処理しました。') + resultCards(changed),true);
  }

  async function sendVoiceV51() {
    const input = document.getElementById('v-chat-input');
    const text = String(input?.value || '').trim();
    if (!text || voiceBusyV51) return;

    voiceBusyV51 = true;
    const status = document.getElementById('v-status-text');
    if (input) { input.value='';input.disabled=true; }
    if (status) status.textContent='音声を解析中…';
    if (typeof addChatMsg === 'function') addChatMsg('user',text);
    const loadingId = typeof addChatMsg === 'function' ? addChatMsg('bot','音声を解析中…') : null;

    try {
      const pending = getPending();
      if (pending?.type === 'planConfirmationV51' && yesAnswer(text)) {
        setPending(null);
        let result;
        if ((pending.plan?.operations || []).some(op => op.op === 'delete' && op.scope === 'allToday')) result = executeDeleteAllV51();
        else result = executePlanV51(pending.plan);
        removeLoading(loadingId);
        showBot(result?.message || '実行しました。',result?.changed || []);
        return;
      }
      if (pending?.type === 'planConfirmationV51' && noAnswer(text)) {
        setPending(null);
        removeLoading(loadingId);
        showBot('キャンセルしました。');
        return;
      }

      const localRepair = tryLocalRepair(text);
      if (localRepair) {
        removeLoading(loadingId);
        showBot(localRepair.message,localRepair.changed || []);
        return;
      }

      const plan = await requestPlanV51(text);
      if (pending?.type === 'planConfirmationV51') setPending(null);
      if (status) status.textContent='Food Masterを照合中…';

      const editor = window.__PFC_MEAL_EDITOR_V50__;
      let result;
      if (editor?.hasOpenDraft?.() && !plan.operations.some(op => op.op === 'repair')) {
        result = editor.applyVoicePlan(plan);
      } else {
        result = executePlanV51(plan);
      }

      removeLoading(loadingId);
      if (result?.unresolved?.length && editor?.openFromUnresolved) editor.openFromUnresolved(result.unresolved);
      showBot(result?.message || plan.reply || '処理しました。',result?.changed || []);
    } catch (error) {
      removeLoading(loadingId);
      showBot(`音声処理に失敗しました。${error?.message || ''}`);
    } finally {
      if (status) status.textContent='マイクOFF';
      if (input) input.disabled=false;
      voiceBusyV51=false;
    }
  }

  function ensureStyle() {
    if (document.getElementById('pfc-meal-v501-style')) return;
    const style = document.createElement('style');
    style.id = 'pfc-meal-v501-style';
    style.textContent = `.v50-footer-actions{display:grid;grid-template-columns:minmax(0,.42fr) minmax(0,1fr);gap:8px}.v50-voice-edit{border:1px solid #bfe0d1;border-radius:14px;background:#eef9f4;color:#167653;font-size:13px;font-weight:900;padding:13px 8px}.v50-voice-edit.is-listening{background:#dcf5e9;box-shadow:0 0 0 3px rgba(34,160,107,.12)}@media(max-width:360px){.v50-footer-actions{grid-template-columns:1fr}.v50-voice-edit{padding:10px}}`;
    document.head.appendChild(style);
  }

  function submitTranscript(text) {
    const input = document.getElementById('v-chat-input');
    const transcript = String(text || '').trim();
    if (!transcript || !input || typeof window.sendVoiceChat !== 'function') return false;
    input.value = transcript;
    input.disabled = false;
    window.sendVoiceChat();
    return true;
  }

  function startEditorVoice(voice,status) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (status) status.textContent='このブラウザは音声入力に対応していません。';
      return;
    }
    try { editorRecognition?.abort?.(); } catch {}
    const recognition = new SpeechRecognition();
    editorRecognition = recognition;
    recognition.lang='ja-JP';
    recognition.continuous=false;
    recognition.interimResults=false;
    try { recognition.maxAlternatives=3; } catch {}
    recognition.onstart=()=>{
      voice.classList.add('is-listening');
      if (status) status.textContent='話してください。例:「唐揚げを100gにして」「キャベツ消して」';
    };
    recognition.onresult=event=>{
      const result=event?.results?.[0];
      const transcript=result?.[0]?.transcript || '';
      if (status) status.textContent=transcript ? `認識: ${transcript}` : '音声を認識できませんでした。';
      submitTranscript(transcript);
    };
    recognition.onerror=event=>{
      if (status) status.textContent=event?.error === 'not-allowed' ? 'マイクの使用を許可してください。' : '音声入力に失敗しました。もう一度試してください。';
    };
    recognition.onend=()=>{
      voice.classList.remove('is-listening');
      editorRecognition=null;
    };
    try { recognition.start(); }
    catch {
      voice.classList.remove('is-listening');
      if (status) status.textContent='音声入力を開始できませんでした。';
    }
  }

  function ensureVoiceButton() {
    const host=document.getElementById('pfc-meal-editor-v50');
    const footer=host?.querySelector('footer');
    const commit=host?.querySelector('#v50-commit');
    if (!host || !footer || !commit || footer.querySelector('#v50-voice-edit')) return false;
    const wrap=document.createElement('div');
    wrap.className='v50-footer-actions';
    commit.parentNode.insertBefore(wrap,commit);
    wrap.appendChild(commit);
    const voice=document.createElement('button');
    voice.type='button';
    voice.id='v50-voice-edit';
    voice.className='v50-voice-edit';
    voice.textContent='🎤 声で修正';
    wrap.insertBefore(voice,commit);
    voice.onclick=()=>{
      const editor=window.__PFC_MEAL_EDITOR_V50__;
      const status=host.querySelector('#v50-status');
      if (!editor?.hasOpenDraft?.()) {
        if (status) status.textContent='食品カードを開いてから音声修正を使ってください。';
        return;
      }
      if (editorRecognition) {
        try { editorRecognition.stop(); } catch {}
        return;
      }
      startEditorVoice(voice,status);
    };
    return true;
  }

  function recoverFooterForDraft() {
    const host=document.getElementById('pfc-meal-editor-v50');
    if (!host?.classList.contains('show')) return;
    const kicker=host.querySelector('#v50-kicker')?.textContent || '';
    if (kicker === 'PHOTO INPUT' || kicker === 'PHOTO AI') return;
    const footer=host.querySelector('footer');
    if (footer) footer.style.display='';
  }

  function patchUnresolvedOpen() {
    const editor=window.__PFC_MEAL_EDITOR_V50__;
    if (!editor?.openFromUnresolved || editor.openFromUnresolved.__v501) return;
    const original=editor.openFromUnresolved;
    const wrapped=function(){
      const result=original.apply(this,arguments);
      recoverFooterForDraft();
      ensureVoiceButton();
      return result;
    };
    wrapped.__v501=true;
    editor.openFromUnresolved=wrapped;
  }

  function install() {
    ensureStyle();
    ensureVoiceButton();
    patchUnresolvedOpen();

    const e=engine();
    if (e) {
      e.voiceModel=VOICE_MODEL;
      e.voiceIntelligenceVersion=VOICE_INTELLIGENCE_VERSION;
      e.requestPlan=requestPlanV51;
      e.plannerPrompt=plannerPromptV51;
      e.recordNutritionContext=true;
      e.genericConfirmationMemory=true;
      e.foodMasterRepair=true;
    }
    window.sendVoiceChat=sendVoiceV51;

    const host=document.getElementById('pfc-meal-editor-v50');
    if (host && typeof MutationObserver !== 'undefined') {
      const observer=new MutationObserver(()=>{recoverFooterForDraft();ensureVoiceButton();});
      observer.observe(host,{attributes:true,subtree:true,childList:true,attributeFilter:['class','style']});
    }

    window.__PFC_MEAL_V501__={
      version:VERSION,
      voiceIntelligenceVersion:VOICE_INTELLIGENCE_VERSION,
      voiceModel:VOICE_MODEL,
      inEditorVoice:true,
      editorVoiceIndependentAutoSend:true,
      footerRecovery:true,
      singleLayerPreserved:true,
      genericConfirmationMemory:true,
      recordNutritionContext:true,
      foodMasterRepair:true,
      localRepairFastPath:true,
      buildRichRecordContext,
      parsePlanV51,
      plannerPromptV51,
      requestPlanV51,
      executePlanV51,
      tryLocalRepair
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();