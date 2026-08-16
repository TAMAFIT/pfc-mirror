// PFC Mirror Meal Engine V5.0: trusted Food Master mutations + structured voice command planning.
(() => {
  'use strict';

  const VERSION = '5.0.0';
  const VOICE_MODEL = 'gemini-3.1-flash-lite';
  const LAST_TX_KEY = 'pfc_v50_last_transaction';
  const PENDING_KEY = 'pfc_v50_pending_action';
  const MAX_RECENT = 12;
  const REQUEST_TIMEOUT_MS = 30000;
  let voiceBusy = false;

  const normalize = value => String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[・･\s]/g, '')
    .trim();
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clone = value => JSON.parse(JSON.stringify(value));
  const storage = () => window.mirrorStorage || window.localStorage;
  const dbv3 = () => window.__PFC_DB_V3__ || null;
  const multi = () => window.__PFC_DB_V3_MULTIUNIT__ || null;
  const searchApi = () => window.__PFC_DB_V3_SEARCH__ || null;
  const isPositive = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 10000;
  const unitCanon = value => {
    const raw = normalize(value);
    if (!raw) return '';
    if (/^(g|ぐらむ|グラム)$/.test(raw)) return 'g';
    if (/^(ml|みり|ミリ|みりりっとる|ミリリットル)$/.test(raw)) return 'ml';
    if (/^(こ|個)$/.test(raw)) return '個';
    if (/^(たま|玉)$/.test(raw)) return '玉';
    if (/^(はい|杯)$/.test(raw)) return '杯';
    if (/^(ほん|本)$/.test(raw)) return '本';
    if (/^(まい|枚)$/.test(raw)) return '枚';
    if (/^(きれ|切れ|切)$/.test(raw)) return '切れ';
    if (/^(ぱっく|パック|p)$/.test(raw)) return 'パック';
    if (/^(にんまえ|人前)$/.test(raw)) return '人前';
    if (/^(しょく|食)$/.test(raw)) return '食';
    return String(value || '').trim();
  };

  function searchFood(query, limit = 8) {
    const api = searchApi();
    if (!api?.search) return [];
    return api.search(String(query || '').trim(), limit).filter(row => row?.source === 'db');
  }

  function safeResolveFood(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    const nq = normalize(q);
    const results = searchFood(q, 16);
    if (!results.length) return null;

    if (/^(米|お米|ご飯|ごはん|白米|ライス)$/.test(q)) {
      const rice = results.find(row => row.name === '白米') || searchFood('白米', 4).find(row => row.name === '白米');
      if (rice) return rice;
    }

    const exact = results.find(row => normalize(row.name) === nq);
    if (exact) return exact;

    const aliasExact = results.filter(row => (row.meta?.aliases || []).some(alias => normalize(alias) === nq));
    if (aliasExact.length === 1) return aliasExact[0];

    const baseMatches = results.filter(row => normalize(row.meta?.baseName || row.name.replace(/[（(].*?[)）]/g, '')) === nq);
    if (baseMatches.length === 1) return baseMatches[0];

    return null;
  }

  function getUnit(index, requestedUnit) {
    const meta = dbv3()?.get?.(index);
    if (!meta) return null;
    const requested = unitCanon(requestedUnit);
    const units = multi()?.getUnits?.(index) || [{ id: normalize(meta.input.defaultUnit), label: meta.input.defaultUnit }];
    if (!requested) return units[0] || null;
    const hit = units.find(item => unitCanon(item.label) === requested || unitCanon(item.id) === requested);
    if (hit) return hit;
    if (unitCanon(meta.input.defaultUnit) === requested) return units[0] || { id: normalize(meta.input.defaultUnit), label: meta.input.defaultUnit };
    return null;
  }

  function buildTrustedRecord(index, amount, unitLabel, time, forcedId) {
    const meta = dbv3()?.get?.(index);
    if (!meta || !isPositive(amount)) return null;
    const selectedUnit = getUnit(index, unitLabel);
    if (!selectedUnit) return null;
    let record = null;
    if (multi()?.buildRecordInput) record = multi().buildRecordInput(index, Number(amount), selectedUnit.id, time);
    if (!record) record = dbv3()?.buildRecord?.(index, Number(amount), time) || null;
    if (!record) return null;
    if (forcedId) record.id = forcedId;
    record._mealEngine = { version: VERSION, nutritionSource: 'Food Master', trusted: true };
    return record;
  }

  function validateTrustedRecord(record) {
    if (!record || !record._dbv3 || !Number.isFinite(Number(record._dbv3.index))) return { ok:false, reason:'Food Master参照がありません' };
    const meta = dbv3()?.get?.(record._dbv3.index);
    if (!meta) return { ok:false, reason:'Food Master食品を解決できません' };
    for (const key of ['P','F','C','A','Cal']) {
      if (!Number.isFinite(Number(record[key])) || Number(record[key]) < 0) return { ok:false, reason:`${key}が不正です` };
    }
    if (meta.category !== 'alcohol' && Number(record.A || 0) !== 0) return { ok:false, reason:'非アルコール食品にアルコール量が入っています' };
    return { ok:true, meta };
  }

  function persistRecords(records) {
    if (typeof lst === 'undefined' || !Array.isArray(lst)) throw new Error('食事記録を参照できません');
    lst.splice(0, lst.length, ...records);
    if (typeof sv === 'function') sv();
    else storage().setItem('tf_dat', JSON.stringify(lst));
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
  }

  function getLastTransaction() {
    try { return JSON.parse(storage().getItem(LAST_TX_KEY) || 'null'); } catch { return null; }
  }
  function setLastTransaction(tx) {
    if (!tx) storage().removeItem(LAST_TX_KEY);
    else storage().setItem(LAST_TX_KEY, JSON.stringify(tx));
  }
  function getPendingAction() {
    try { return JSON.parse(storage().getItem(PENDING_KEY) || 'null'); } catch { return null; }
  }
  function setPendingAction(value) {
    if (!value) storage().removeItem(PENDING_KEY);
    else storage().setItem(PENDING_KEY, JSON.stringify(value));
  }

  function stripRecordName(name) {
    return String(name || '').replace(/^🤖\s*/, '').replace(/[（(][^()（）]*[0-9][^()（）]*[)）]\s*$/, '').trim();
  }

  function buildRecordRefs() {
    const refs = new Map();
    const rows = [];
    const source = (typeof lst !== 'undefined' && Array.isArray(lst)) ? lst.slice(-MAX_RECENT).reverse() : [];
    source.forEach((item, index) => {
      const ref = `r${index + 1}`;
      refs.set(ref, Number(item.id));
      rows.push({ ref, time:item.time || '', name:stripRecordName(item.N), displayName:String(item.N || '') });
    });
    return { refs, rows };
  }

  function currentTotals() {
    const source = (typeof lst !== 'undefined' && Array.isArray(lst)) ? lst : [];
    return source.reduce((acc, item) => {
      acc.kcal += Number(item.Cal || 0); acc.p += Number(item.P || 0); acc.f += Number(item.F || 0); acc.c += Number(item.C || 0); acc.a += Number(item.A || 0);
      return acc;
    }, { kcal:0,p:0,f:0,c:0,a:0 });
  }

  function plannerPrompt() {
    return `あなたは食事管理アプリの操作プランナーです。ユーザーの自然な日本語・音声認識の揺れ・省略を理解し、アプリ操作をJSONだけで返してください。

最重要:
- P/F/C/A/kcalは絶対に生成しない。栄養値はアプリのFood Masterだけが決定する。
- 「登録した」「削除した」など実行済みの表現を勝手に確定しない。あなたは操作計画だけ作る。
- 質問なら記録操作をしない。複合発話なら操作と質問を同じoperations配列へ分ける。
- recentRecordsのrefは現在の記録を指す。修正・削除は可能ならrefを使う。
- mealDraftがある場合、「これ」「この」「今の」は原則mealDraftを優先する。
- 量を変更していない修正ではpreserveAmount=true。属性や食品名だけの修正で既存量を100g等へ戻さない。
- 「今の全部消して」「さっき入れたの全部消して」は、直前トランザクションを元に戻すundoを優先する。
- 「今日の記録を全部消して」は危険操作。delete + scope=allToday + needsConfirmation=trueにする。
- 重要な対象が複数あり特定不能ならneedsConfirmation=trueでconfirmationQuestionを返す。
- 今日以外の過去/未来記録は実行せずnoopにする。
- 音声で「さんたま」は3玉、「にぱっく」は2パック等、食事文脈の数量として自然に解釈する。

operation形式:
{
  "op":"add|update|delete|undo|question|noop",
  "foodQuery":"食品名",
  "replacementQuery":"置換後食品名",
  "amountValue":3,
  "amountUnit":"g|ml|個|玉|杯|本|枚|切れ|パック|食|人前|",
  "targetRef":"r1 または d1",
  "targetQuery":"対象食品名",
  "scope":"single|lastTransaction|allToday",
  "preserveAmount":true,
  "needsConfirmation":false,
  "confirmationQuestion":"",
  "answer":"質問への短い日本語回答"
}

出力形式:
{"operations":[...],"reply":"必要なら短い補足。操作結果の断定は禁止"}
JSON以外は禁止。`;
  }

  function buildPlannerContext() {
    const { refs, rows } = buildRecordRefs();
    const totals = currentTotals();
    const lastTx = getLastTransaction();
    let draft = [];
    try { draft = window.__PFC_MEAL_EDITOR_V50__?.plannerContext?.() || []; } catch {}
    const targets = (typeof TG !== 'undefined' && TG) ? { kcal:TG.cal, p:TG.p, f:TG.f, c:TG.c } : {};
    return {
      refs,
      context: {
        currentTime: new Date().toISOString(),
        currentMeal: typeof getAutoTime === 'function' ? getAutoTime() : '',
        targets,
        totals: { kcal:Math.round(totals.kcal), p:Number(totals.p.toFixed(1)), f:Number(totals.f.toFixed(1)), c:Number(totals.c.toFixed(1)), a:Number(totals.a.toFixed(1)) },
        recentRecords: rows,
        lastTransaction: lastTx ? { id:lastTx.id, summary:lastTx.summary || '', changedIds:lastTx.changedIds || [] } : null,
        mealDraft: draft
      }
    };
  }

  function gasEndpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }

  function extractAiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim() : '';
  }

  function parsePlan(raw) {
    const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch { return null; }
    if (!parsed || !Array.isArray(parsed.operations)) return null;
    const allowed = new Set(['add','update','delete','undo','question','noop']);
    parsed.operations = parsed.operations.filter(op => op && allowed.has(op.op)).slice(0, 12).map(op => ({
      op:op.op,
      foodQuery:String(op.foodQuery || '').slice(0,80),
      replacementQuery:String(op.replacementQuery || '').slice(0,80),
      amountValue:isPositive(op.amountValue) ? Number(op.amountValue) : null,
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

  async function requestPlan(text) {
    const built = buildPlannerContext();
    const payload = {
      taskType:'chat',
      modelPreference:VOICE_MODEL,
      contents:[{parts:[{text:`${plannerPrompt()}\n\n【アプリ状態】\n${JSON.stringify(built.context)}\n\n【ユーザー発言】\n${String(text || '').trim()}`}]}],
      generationConfig:{ maxOutputTokens:900, responseMimeType:'application/json', temperature:0.1 }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(gasEndpoint(), { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(payload), signal:controller.signal });
      if (!response.ok) throw new Error(`音声AI HTTP ${response.status}`);
      const data = await response.json();
      const raw = extractAiText(data);
      if (/^GASエラー:/i.test(raw)) throw new Error(raw.slice(0,240));
      const plan = parsePlan(raw);
      if (!plan) throw new Error('音声AIの操作計画を読めませんでした');
      return { plan, refs:built.refs };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('音声AIが30秒以内に応答しませんでした');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function resolveTargetIds(op, refMap, working) {
    if (op.scope === 'allToday') return working.map(item => Number(item.id)).filter(Boolean);
    if (op.scope === 'lastTransaction') {
      const tx = getLastTransaction();
      return (tx?.changedIds || []).map(Number).filter(id => working.some(item => Number(item.id) === id));
    }
    if (op.targetRef && refMap?.has(op.targetRef)) return [refMap.get(op.targetRef)];
    const query = normalize(op.targetQuery || op.foodQuery || '');
    if (!query) return [];
    const hit = working.slice().reverse().find(item => normalize(stripRecordName(item.N)).includes(query) || query.includes(normalize(stripRecordName(item.N))));
    return hit ? [Number(hit.id)] : [];
  }

  function recordDbIndex(record) {
    if (Number.isFinite(Number(record?._dbv3?.index))) return Number(record._dbv3.index);
    const resolved = safeResolveFood(stripRecordName(record?.N));
    return resolved ? Number(resolved.index) : null;
  }

  function recordAmount(record, index) {
    if (isPositive(record?._dbv3?.amount)) return Number(record._dbv3.amount);
    const meta = dbv3()?.get?.(index);
    return Number(meta?.input?.defaultAmount || meta?.nutritionBasis?.amount || 1);
  }

  function makeTransaction(before, after, summary, changedIds) {
    return { id:`tx-${Date.now()}`, createdAt:Date.now(), version:VERSION, summary, changedIds:[...new Set(changedIds.map(Number).filter(Boolean))], before, after };
  }

  function undoLastTransaction() {
    const tx = getLastTransaction();
    if (!tx?.before || !Array.isArray(tx.before)) return { ok:false, message:'取り消せる直前操作がありません。' };
    persistRecords(clone(tx.before));
    setLastTransaction(null);
    return { ok:true, message:'直前の操作を元に戻しました。', changed:[] };
  }

  function executeDeleteAllConfirmed() {
    const before = (typeof lst !== 'undefined' && Array.isArray(lst)) ? clone(lst) : [];
    persistRecords([]);
    const tx = makeTransaction(before, [], '今日の記録をすべて削除', before.map(x => x.id));
    setLastTransaction(tx);
    setPendingAction(null);
    return { ok:true, message:`${before.length}件の記録を削除しました。`, changed:[] };
  }

  function executePlan(plan, refMap) {
    if (!plan?.operations?.length) return { ok:false, message:plan?.reply || '操作内容を特定できませんでした。' };
    const dangerous = plan.operations.find(op => op.op === 'delete' && op.scope === 'allToday');
    if (dangerous) {
      setPendingAction({ type:'deleteAllToday', createdAt:Date.now() });
      return { ok:false, confirmation:true, message:dangerous.confirmationQuestion || '今日の記録をすべて削除しますか？' };
    }
    if (plan.operations.some(op => op.needsConfirmation)) {
      const op = plan.operations.find(x => x.needsConfirmation);
      return { ok:false, confirmation:true, message:op.confirmationQuestion || '対象をもう少し具体的に教えてください。' };
    }
    if (plan.operations.some(op => op.op === 'undo')) return undoLastTransaction();

    const before = (typeof lst !== 'undefined' && Array.isArray(lst)) ? clone(lst) : [];
    let working = clone(before);
    const changed = [];
    const changedIds = [];
    const unresolved = [];
    const replies = [];
    let idSeed = Date.now();

    for (const op of plan.operations) {
      if (op.op === 'question') { if (op.answer) replies.push(op.answer); continue; }
      if (op.op === 'noop') { if (op.answer) replies.push(op.answer); continue; }

      if (op.op === 'add') {
        const resolved = safeResolveFood(op.foodQuery);
        if (!resolved) { unresolved.push({ query:op.foodQuery, amountValue:op.amountValue, amountUnit:op.amountUnit, source:'voice' }); continue; }
        const meta = resolved.meta || dbv3()?.get?.(resolved.index);
        const amount = op.amountValue || Number(meta?.input?.defaultAmount || meta?.nutritionBasis?.amount || 1);
        const record = buildTrustedRecord(resolved.index, amount, op.amountUnit || meta?.input?.defaultUnit, typeof getAutoTime === 'function' ? getAutoTime() : '', ++idSeed);
        const validation = validateTrustedRecord(record);
        if (!validation.ok) throw new Error(validation.reason);
        working.push(record); changed.push(record); changedIds.push(record.id);
        continue;
      }

      const targetIds = resolveTargetIds(op, refMap, working);
      if (!targetIds.length) { unresolved.push({ query:op.targetQuery || op.foodQuery, operation:op.op, source:'voice-target' }); continue; }

      if (op.op === 'delete') {
        const set = new Set(targetIds.map(Number));
        working = working.filter(item => !set.has(Number(item.id)));
        changedIds.push(...targetIds);
        continue;
      }

      if (op.op === 'update') {
        for (const targetId of targetIds) {
          const pos = working.findIndex(item => Number(item.id) === Number(targetId));
          if (pos < 0) continue;
          const existing = working[pos];
          let index = recordDbIndex(existing);
          if (op.replacementQuery) {
            const replacement = safeResolveFood(op.replacementQuery);
            if (!replacement) { unresolved.push({ query:op.replacementQuery, operation:'update', targetId, source:'voice' }); continue; }
            index = Number(replacement.index);
          }
          if (!Number.isFinite(index)) { unresolved.push({ query:stripRecordName(existing.N), operation:'update', targetId, source:'voice' }); continue; }
          const existingAmount = recordAmount(existing, index);
          const amount = op.amountValue || existingAmount;
          const unit = op.amountValue ? (op.amountUnit || existing?._dbv3?.unit || dbv3()?.get(index)?.input?.defaultUnit) : (existing?._dbv3?.unit || dbv3()?.get(index)?.input?.defaultUnit);
          const replacementRecord = buildTrustedRecord(index, amount, unit, existing.time, existing.id);
          const validation = validateTrustedRecord(replacementRecord);
          if (!validation.ok) throw new Error(validation.reason);
          working[pos] = replacementRecord; changed.push(replacementRecord); changedIds.push(replacementRecord.id);
        }
      }
    }

    if (unresolved.length) return { ok:false, unresolved, message:'Food Masterで特定できない項目があります。編集画面で確認してください。' };

    const mutating = plan.operations.some(op => ['add','update','delete'].includes(op.op));
    if (mutating) {
      persistRecords(working);
      const names = changed.map(item => stripRecordName(item.N));
      const summary = names.length ? names.join('、') : '食事記録を更新';
      setLastTransaction(makeTransaction(before, clone(working), summary, changedIds));
    }

    if (mutating) {
      const adds = plan.operations.filter(op => op.op === 'add').length;
      const updates = plan.operations.filter(op => op.op === 'update').length;
      const deletes = plan.operations.filter(op => op.op === 'delete').length;
      if (adds) replies.unshift(`${adds}件を記録しました。`);
      if (updates) replies.unshift(`${updates}件を修正しました。`);
      if (deletes) replies.unshift(`${deletes}件を削除しました。`);
    }
    if (!replies.length && plan.reply) replies.push(plan.reply);
    return { ok:true, message:replies.join(' '), changed };
  }

  function resultCards(items) {
    const rows = (items || []).map(item => `<div class="v50-result-card"><b>${escapeHtml(stripRecordName(item.N))}</b><span>P ${Number(item.P||0).toFixed(1)} / F ${Number(item.F||0).toFixed(1)} / C ${Number(item.C||0).toFixed(1)}</span><strong>${Math.round(Number(item.Cal||0)).toLocaleString()} kcal</strong></div>`).join('');
    return rows ? `<div class="v50-result-list">${rows}</div>` : '';
  }

  function yesAnswer(text) { return /^(はい|うん|お願い|お願いします|実行|削除|消して|ok|オーケー)$/i.test(String(text || '').trim()); }
  function noAnswer(text) { return /^(いいえ|いや|やめ|やめて|キャンセル|中止|戻る)$/i.test(String(text || '').trim()); }

  async function sendVoiceV50() {
    const inputEl = document.getElementById('v-chat-input');
    const text = String(inputEl?.value || '').trim();
    if (!text || voiceBusy) return;
    voiceBusy = true;
    const status = document.getElementById('v-status-text');
    if (inputEl) { inputEl.value = ''; inputEl.disabled = true; }
    if (status) status.textContent = '音声を解析中…';
    if (typeof addChatMsg === 'function') addChatMsg('user', text);
    const loadingId = typeof addChatMsg === 'function' ? addChatMsg('bot', '音声を解析中…') : null;

    try {
      const pending = getPendingAction();
      if (pending?.type === 'deleteAllToday') {
        let result;
        if (yesAnswer(text)) result = executeDeleteAllConfirmed();
        else if (noAnswer(text)) { setPendingAction(null); result = { ok:false, message:'削除をキャンセルしました。' }; }
        else result = { ok:false, message:'削除する場合は「はい」、やめる場合は「キャンセル」と言ってください。' };
        if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
        if (typeof addChatMsg === 'function') addChatMsg('bot', result.message, true);
        return;
      }

      const { plan, refs } = await requestPlan(text);
      if (status) status.textContent = 'Food Masterを照合中…';
      let result;
      const editor = window.__PFC_MEAL_EDITOR_V50__;
      if (editor?.hasOpenDraft?.()) result = editor.applyVoicePlan(plan);
      else result = executePlan(plan, refs);

      if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
      if (result?.unresolved?.length && editor?.openFromUnresolved) {
        editor.openFromUnresolved(result.unresolved);
      }
      const message = result?.message || plan.reply || '処理しました。';
      if (typeof addChatMsg === 'function') addChatMsg('bot', escapeHtml(message) + resultCards(result?.changed || []), true);
    } catch (error) {
      if (loadingId && typeof removeMsg === 'function') removeMsg(loadingId);
      if (typeof addChatMsg === 'function') addChatMsg('bot', `音声処理に失敗しました。${escapeHtml(error?.message || '')}`, true);
    } finally {
      if (status) status.textContent = 'マイクOFF';
      if (inputEl) inputEl.disabled = false;
      voiceBusy = false;
    }
  }

  function installVoice() {
    window.sendVoiceChat = sendVoiceV50;
    document.documentElement.classList.add('pfc-meal-engine-v50');
  }

  window.__PFC_MEAL_ENGINE_V50__ = {
    version:VERSION,
    voiceModel:VOICE_MODEL,
    nutritionSource:'Food Master',
    legacyCommandTags:false,
    transactionalMutations:true,
    nonAlcoholAZeroGuard:true,
    searchFood,
    safeResolveFood,
    getUnit,
    buildTrustedRecord,
    validateTrustedRecord,
    parsePlan,
    requestPlan,
    executePlan,
    undoLastTransaction,
    buildRecordRefs,
    currentTotals,
    stripRecordName,
    unitCanon,
    plannerPrompt,
    installVoice
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installVoice, { once:true });
  else installVoice();
})();
