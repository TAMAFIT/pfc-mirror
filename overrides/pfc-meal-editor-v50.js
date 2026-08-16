// PFC Mirror Meal Editor V5.0: one-layer editable workspace shared by photo and voice.
(() => {
  'use strict';

  const VERSION = '5.0.0';
  const MAX_SIDE = 512;
  const JPEG_QUALITY = 0.68;
  let draft = null;
  let busy = false;

  const engine = () => window.__PFC_MEAL_ENGINE_V50__ || null;
  const dbv3 = () => window.__PFC_DB_V3__ || null;
  const multi = () => window.__PFC_DB_V3_MULTIUNIT__ || null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 10000 ? Number(value) : null;
  const countUnit = unit => /^(個|切れ|切|枚|本|玉|杯|粒|袋|パック|カップ|缶|食|人前|ピース)$/.test(String(unit || ''));

  function makeId(prefix='row') { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

  function createRow(spec = {}) {
    const query = String(spec.query || spec.name || '').trim();
    const row = {
      id:makeId(spec.source || 'row'),
      source:spec.source || 'manual',
      query,
      dbIndex:null,
      dbName:'',
      amount:positive(spec.amountValue || spec.amount),
      unit:String(spec.amountUnit || spec.unit || ''),
      ai:spec.ai || null,
      edited:false
    };
    const match = engine()?.safeResolveFood?.(query);
    if (match) bindMatch(row, match, false);
    return row;
  }

  function estimatePhotoAmount(row, meta) {
    const ai = row.ai || {};
    const unit = String(meta?.input?.defaultUnit || '');
    if (countUnit(unit) && positive(ai.visibleCount)) return Number(ai.visibleCount);
    if (unit === 'g' && positive(ai.estimatedWeightG)) return Number(ai.estimatedWeightG);
    if (/^ml$/i.test(unit) && positive(ai.estimatedVolumeMl)) return Number(ai.estimatedVolumeMl);
    return positive(meta?.input?.defaultAmount || meta?.nutritionBasis?.amount) || 1;
  }

  function bindMatch(row, result, manual = true) {
    const meta = result?.meta || dbv3()?.get?.(result?.index);
    if (!meta) return row;
    row.dbIndex = Number(result.index);
    row.dbName = String(result.name || meta.name || '');
    row.query = row.dbName;
    const units = multi()?.getUnits?.(row.dbIndex) || [];
    const requested = engine()?.unitCanon?.(row.unit || '');
    const selected = units.find(u => engine()?.unitCanon?.(u.label) === requested) || units[0];
    row.unit = selected?.label || meta.input?.defaultUnit || '';
    if (!positive(row.amount)) row.amount = row.source === 'photo' ? estimatePhotoAmount(row, meta) : positive(meta.input?.defaultAmount || meta.nutritionBasis?.amount) || 1;
    row.edited = row.edited || manual;
    return row;
  }

  function rowRecord(row, forcedId) {
    if (!Number.isFinite(Number(row?.dbIndex)) || !positive(row?.amount)) return null;
    return engine()?.buildTrustedRecord?.(row.dbIndex, Number(row.amount), row.unit, typeof getAutoTime === 'function' ? getAutoTime() : '', forcedId) || null;
  }

  function rowNutrition(row) {
    const record = rowRecord(row);
    if (!record) return null;
    const validation = engine()?.validateTrustedRecord?.(record);
    return validation?.ok ? record : null;
  }

  function ensureHost() {
    let host = document.getElementById('pfc-meal-editor-v50');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'pfc-meal-editor-v50';
    host.className = 'pfc-meal-editor-v50';
    host.innerHTML = '<div class="v50-sheet"><header><div><small id="v50-kicker">MEAL DRAFT</small><h2 id="v50-title">食事を確認</h2></div><button type="button" id="v50-close" aria-label="閉じる">×</button></header><div id="v50-body" class="v50-body"></div><footer><div id="v50-status" class="v50-status"></div><button type="button" id="v50-commit" class="v50-commit">この内容で記録</button></footer></div>';
    document.body.appendChild(host);
    host.querySelector('#v50-close').onclick = close;
    host.addEventListener('click', event => { if (event.target === host) close(); });
    host.querySelector('#v50-commit').onclick = commit;
    return host;
  }

  function open(nextDraft) {
    draft = nextDraft;
    const host = ensureHost();
    host.classList.add('show');
    document.documentElement.classList.add('v50-editor-open');
    render();
  }

  function close() {
    ensureHost().classList.remove('show');
    document.documentElement.classList.remove('v50-editor-open');
    draft = null;
  }

  function statusText() {
    if (!draft) return '';
    const unresolved = draft.rows.filter(row => !Number.isFinite(Number(row.dbIndex))).length;
    const invalid = draft.rows.filter(row => Number.isFinite(Number(row.dbIndex)) && !positive(row.amount)).length;
    if (!draft.rows.length) return '食品を1件以上追加してください。';
    if (unresolved) return `Food Master未確定: ${unresolved}件。食品名を入力して候補を選んでください。`;
    if (invalid) return `量が未確定: ${invalid}件。`;
    return `${draft.rows.length}件すべてFood Masterで計算できます。`;
  }

  function canCommit() {
    return !!draft?.rows?.length && draft.rows.every(row => Number.isFinite(Number(row.dbIndex)) && positive(row.amount) && rowNutrition(row));
  }

  function detailText(row) {
    const ai = row.ai || {};
    const parts = [];
    if (row.source === 'photo') parts.push('AI写真認識');
    if (positive(ai.visibleCount)) parts.push(`見た目 ${ai.visibleCount}個`);
    if (positive(ai.estimatedWeightG)) parts.push(`推定 約${ai.estimatedWeightG}g`);
    if (positive(ai.estimatedVolumeMl)) parts.push(`推定 約${ai.estimatedVolumeMl}ml`);
    if (ai.portionConfidence) parts.push(`量推定 ${ai.portionConfidence}`);
    if (ai.ambiguity) parts.push(`要確認: ${ai.ambiguity}`);
    return parts.join(' · ');
  }

  function unitOptions(row) {
    if (!Number.isFinite(Number(row.dbIndex))) return [];
    return multi()?.getUnits?.(row.dbIndex) || [{ id:String(row.unit), label:String(row.unit) }];
  }

  function render() {
    if (!draft) return;
    const host = ensureHost();
    host.querySelector('#v50-title').textContent = draft.title || '食事を確認';
    host.querySelector('#v50-kicker').textContent = draft.source === 'photo' ? 'PHOTO → MEAL DRAFT' : 'MEAL DRAFT';
    const body = host.querySelector('#v50-body');
    const cards = draft.rows.map((row,index) => {
      const nutrition = rowNutrition(row);
      const units = unitOptions(row);
      const unitControl = units.length > 1
        ? `<select class="v50-unit">${units.map(u => `<option value="${esc(u.label)}"${engine()?.unitCanon?.(u.label)===engine()?.unitCanon?.(row.unit)?' selected':''}>${esc(u.label)}</option>`).join('')}</select>`
        : `<span class="v50-unit-label">${esc(row.unit || '')}</span>`;
      const macro = nutrition
        ? `<div class="v50-macros"><span>P <b>${Number(nutrition.P).toFixed(1)}</b>g</span><span>F <b>${Number(nutrition.F).toFixed(1)}</b>g</span><span>C <b>${Number(nutrition.C).toFixed(1)}</b>g</span><strong>${Math.round(Number(nutrition.Cal)).toLocaleString()} kcal</strong></div>`
        : `<div class="v50-macros is-unresolved">${Number.isFinite(Number(row.dbIndex)) ? '量を入力するとP/F/C/kcalを表示' : 'Food Masterの候補を選ぶとP/F/C/kcalを表示'}</div>`;
      const badge = row.edited ? '編集済み' : row.source === 'photo' ? 'AI仮入力' : '追加';
      return `<section class="v50-card${Number.isFinite(Number(row.dbIndex))?'':' is-unresolved'}" data-row="${index}"><div class="v50-card-head"><span class="v50-badge">${badge}</span><button type="button" class="v50-delete" aria-label="削除">×</button></div><label class="v50-label">食品名</label><input class="v50-name" type="search" autocomplete="off" enterkeyhint="search" value="${esc(row.query)}" placeholder="食品名を入力"><div class="v50-suggestions"></div>${detailText(row)?`<small class="v50-detail">${esc(detailText(row))}</small>`:''}<div class="v50-amount-wrap"><label>量</label><input class="v50-amount" type="number" inputmode="decimal" min="0.1" step="0.1" value="${row.amount ?? ''}" placeholder="量">${unitControl}</div>${macro}</section>`;
    }).join('');
    body.innerHTML = `${draft.dishName ? `<div class="v50-dish-name">AI判定: ${esc(draft.dishName)}</div>` : ''}<div class="v50-guide">食品名・量は直接編集できます。候補はカード内に表示されるため、別レイヤーは開きません。</div>${cards || '<div class="v50-empty">食品がありません。</div>'}<button type="button" id="v50-add-row" class="v50-add-row">＋ Food Masterから食品を追加</button>`;
    host.querySelector('#v50-status').textContent = statusText();
    host.querySelector('#v50-commit').disabled = !canCommit();

    body.querySelectorAll('.v50-card').forEach((card,index) => wireCard(card,index));
    body.querySelector('#v50-add-row').onclick = () => {
      draft.rows.push(createRow({ source:'manual' }));
      render();
      setTimeout(() => body.querySelectorAll('.v50-name')[draft.rows.length - 1]?.focus(), 0);
    };
  }

  function showSuggestions(card, row) {
    const box = card.querySelector('.v50-suggestions');
    const query = String(row.query || '').trim();
    if (!query) { box.innerHTML = ''; box.classList.remove('show'); return; }
    const results = engine()?.searchFood?.(query, 6) || [];
    if (!results.length) {
      box.innerHTML = '<div class="v50-no-hit">候補がありません。別の食品名を入力してください。</div>';
      box.classList.add('show');
      return;
    }
    box.innerHTML = results.map((result,i) => {
      const meta = result.meta || dbv3()?.get?.(result.index);
      const amount = Number(meta?.input?.defaultAmount || meta?.nutritionBasis?.amount || 1);
      const preview = dbv3()?.scale?.(result.index, amount);
      return `<button type="button" data-hit="${i}"><b>${esc(result.name)}</b><small>${esc(meta?.input?.defaultAmount || '')}${esc(meta?.input?.defaultUnit || '')}${preview ? ` · ${preview.kcal} kcal` : ''}</small></button>`;
    }).join('');
    box.classList.add('show');
    box.querySelectorAll('[data-hit]').forEach(button => {
      button.onclick = () => {
        const result = results[Number(button.dataset.hit)];
        bindMatch(row, result, true);
        render();
      };
    });
  }

  function updateMacroInCard(card,row) {
    const macro = card.querySelector('.v50-macros');
    const nutrition = rowNutrition(row);
    if (!nutrition) {
      macro.className = 'v50-macros is-unresolved';
      macro.textContent = Number.isFinite(Number(row.dbIndex)) ? '量を入力するとP/F/C/kcalを表示' : 'Food Masterの候補を選ぶとP/F/C/kcalを表示';
    } else {
      macro.className = 'v50-macros';
      macro.innerHTML = `<span>P <b>${Number(nutrition.P).toFixed(1)}</b>g</span><span>F <b>${Number(nutrition.F).toFixed(1)}</b>g</span><span>C <b>${Number(nutrition.C).toFixed(1)}</b>g</span><strong>${Math.round(Number(nutrition.Cal)).toLocaleString()} kcal</strong>`;
    }
    const host = ensureHost();
    host.querySelector('#v50-status').textContent = statusText();
    host.querySelector('#v50-commit').disabled = !canCommit();
  }

  function wireCard(card,index) {
    const row = draft.rows[index];
    card.querySelector('.v50-delete').onclick = () => { draft.rows.splice(index,1); render(); };
    const name = card.querySelector('.v50-name');
    name.onfocus = () => showSuggestions(card,row);
    name.oninput = () => {
      row.query = name.value;
      row.edited = true;
      if (row.dbName && engine()?.unitCanon?.(row.query) !== engine()?.unitCanon?.(row.dbName) && row.query !== row.dbName) {
        row.dbIndex = null; row.dbName = ''; row.amount = row.amount || null;
        card.classList.add('is-unresolved');
      }
      showSuggestions(card,row);
      updateMacroInCard(card,row);
    };
    name.onkeydown = event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const hit = engine()?.safeResolveFood?.(row.query);
        if (hit) { bindMatch(row,hit,true); render(); }
      }
    };
    const amount = card.querySelector('.v50-amount');
    amount.oninput = () => { row.amount = positive(amount.value); row.edited = true; updateMacroInCard(card,row); };
    const unit = card.querySelector('.v50-unit');
    if (unit) unit.onchange = () => { row.unit = unit.value; row.edited = true; updateMacroInCard(card,row); };
  }

  function commit() {
    if (!draft || !canCommit()) return;
    const before = typeof lst !== 'undefined' && Array.isArray(lst) ? JSON.parse(JSON.stringify(lst)) : [];
    const records = [];
    const seed = Date.now();
    draft.rows.forEach((row,index) => {
      const record = rowRecord(row, seed + index + 1);
      if (!record) return;
      record._mealDraft = { version:VERSION, source:draft.source, aiName:row.ai?.name || '', edited:!!row.edited, nutritionSource:'Food Master' };
      records.push(record);
    });
    if (records.length !== draft.rows.length) return;
    const validations = records.map(record => engine()?.validateTrustedRecord?.(record));
    if (validations.some(result => !result?.ok)) return;
    if (typeof lst === 'undefined' || !Array.isArray(lst)) return;
    lst.push(...records);
    if (typeof sv === 'function') sv();
    else (window.mirrorStorage || window.localStorage).setItem('tf_dat', JSON.stringify(lst));
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
    try {
      const tx = { id:`tx-${Date.now()}`, createdAt:Date.now(), version:VERSION, summary:records.map(r => engine()?.stripRecordName?.(r.N) || r.N).join('、'), changedIds:records.map(r => r.id), before, after:JSON.parse(JSON.stringify(lst)) };
      (window.mirrorStorage || window.localStorage).setItem('pfc_v50_last_transaction', JSON.stringify(tx));
    } catch {}
    if (typeof showToast === 'function') showToast(`${records.length}件をFood Masterから記録しました`);
    close();
  }

  function plannerContext() {
    if (!draft) return [];
    return draft.rows.map((row,index) => ({ ref:`d${index+1}`, name:row.query, amount:row.amount, unit:row.unit, resolved: Number.isFinite(Number(row.dbIndex)) }));
  }

  function targetDraftRow(ref, query) {
    const match = String(ref || '').match(/^d(\d+)$/);
    if (match) return { row:draft.rows[Number(match[1])-1], index:Number(match[1])-1 };
    const nq = engine()?.unitCanon?.(query) || String(query || '');
    for (let i=draft.rows.length-1;i>=0;i--) {
      const name = engine()?.unitCanon?.(draft.rows[i].query) || draft.rows[i].query;
      if (nq && (name.includes(nq) || nq.includes(name))) return { row:draft.rows[i], index:i };
    }
    return null;
  }

  function applyVoicePlan(plan) {
    if (!draft) return { ok:false, message:'編集画面が開いていません。' };
    const confirm = plan?.operations?.find(op => op.needsConfirmation);
    if (confirm) return { ok:false, message:confirm.confirmationQuestion || 'どの食品かもう少し具体的に教えてください。' };
    const replies = [];
    let changed = false;
    for (const op of plan?.operations || []) {
      if (op.op === 'question' || op.op === 'noop') { if (op.answer) replies.push(op.answer); continue; }
      if (op.op === 'add') {
        const row = createRow({ source:'voice-draft', query:op.foodQuery, amountValue:op.amountValue, amountUnit:op.amountUnit });
        draft.rows.push(row); changed = true; continue;
      }
      const target = targetDraftRow(op.targetRef, op.targetQuery || op.foodQuery);
      if (!target) { replies.push('編集対象を特定できませんでした。'); continue; }
      if (op.op === 'delete') { draft.rows.splice(target.index,1); changed = true; continue; }
      if (op.op === 'update') {
        if (op.replacementQuery) {
          target.row.query = op.replacementQuery;
          target.row.dbIndex = null; target.row.dbName = '';
          const resolved = engine()?.safeResolveFood?.(op.replacementQuery);
          if (resolved) bindMatch(target.row,resolved,true);
        }
        if (positive(op.amountValue)) target.row.amount = Number(op.amountValue);
        if (op.amountUnit) target.row.unit = op.amountUnit;
        target.row.edited = true; changed = true;
      }
      if (op.op === 'undo') replies.push('編集中のカードは手動で戻してください。');
    }
    if (changed) render();
    if (!replies.length) replies.push('写真の編集内容を更新しました。');
    return { ok:true, message:replies.join(' '), changed:[] };
  }

  function openFromUnresolved(items) {
    const rows = (items || []).map(item => createRow({ source:'voice', query:item.query || '', amountValue:item.amountValue, amountUnit:item.amountUnit }));
    open({ source:'voice', title:'Food Masterで確認', rows, dishName:'' });
  }

  function rowsFromPhoto(identity) {
    return (identity?.foods || []).map(ai => createRow({ source:'photo', query:ai.name, ai }));
  }

  async function compressImage(file) {
    let bitmap = null;
    let width = 0, height = 0;
    try {
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(file, { imageOrientation:'from-image' });
        width = bitmap.width; height = bitmap.height;
      }
    } catch {}
    if (!bitmap) {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image(); img.decoding = 'async'; img.src = url;
        await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=()=>reject(new Error('画像を開けませんでした')); });
        bitmap = img; width = img.naturalWidth || img.width; height = img.naturalHeight || img.height;
      } finally { setTimeout(() => URL.revokeObjectURL(url),0); }
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width,height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    try { bitmap.close?.(); } catch {}
    return canvas.toDataURL('image/jpeg',JPEG_QUALITY).replace(/^data:image\/jpeg;base64,/, '');
  }

  function choosePhotoSource() {
    const host = ensureHost();
    draft = { source:'source', title:'料理写真から追加', rows:[], dishName:'' };
    host.classList.add('show'); document.documentElement.classList.add('v50-editor-open');
    host.querySelector('#v50-title').textContent = '料理写真から追加';
    host.querySelector('#v50-kicker').textContent = 'PHOTO INPUT';
    host.querySelector('#v50-body').innerHTML = '<div class="v50-source-grid"><button type="button" id="v50-camera"><b>カメラで撮る</b><span>今の食事を撮影</span></button><button type="button" id="v50-library"><b>カメラロールから選ぶ</b><span>保存済みの写真を選択</span></button></div><div class="v50-guide">写真AIは食品名と量の仮値だけを作ります。P/F/C/kcalはFood Masterから計算します。</div>';
    host.querySelector('footer').style.display = 'none';
    host.querySelector('#v50-camera').onclick = () => selectPhoto('camera');
    host.querySelector('#v50-library').onclick = () => selectPhoto('library');
  }

  function selectPhoto(source) {
    const host = ensureHost(); host.classList.remove('show'); document.documentElement.classList.remove('v50-editor-open'); draft = null;
    const id = `v50-photo-${source}`;
    let input = document.getElementById(id);
    if (!input) {
      input = document.createElement('input'); input.id=id; input.type='file'; input.accept='image/*'; input.hidden=true;
      if (source === 'camera') input.setAttribute('capture','environment');
      document.body.appendChild(input);
      input.onchange = async event => {
        const file = event.target.files?.[0]; event.target.value='';
        if (file) await runPhoto(file);
      };
    }
    input.click();
  }

  async function runPhoto(file) {
    if (busy) return; busy = true;
    const host = ensureHost(); host.classList.add('show'); document.documentElement.classList.add('v50-editor-open');
    host.querySelector('footer').style.display = 'none';
    host.querySelector('#v50-title').textContent = '料理写真を解析中'; host.querySelector('#v50-kicker').textContent = 'PHOTO AI';
    host.querySelector('#v50-body').innerHTML = '<div class="v50-loading"><span></span><b>食品と量の仮入力を作成しています…</b><small>P/F/C/kcalはAIに生成させません。</small></div>';
    try {
      const photo = window.__PFC_DISH_PHOTO_V40__;
      if (!photo?.identifyDish) throw new Error('料理写真AIを利用できません');
      const identity = await photo.identifyDish(await compressImage(file));
      if (!identity?.foods?.length) throw new Error('食べ物として認識できませんでした');
      host.querySelector('footer').style.display = '';
      open({ source:'photo', title:'写真認識を確認', dishName:identity.dishName || '', rows:rowsFromPhoto(identity) });
    } catch (error) {
      host.querySelector('#v50-title').textContent = '判定できませんでした';
      host.querySelector('#v50-body').innerHTML = `<div class="v50-error">${esc(error?.message || '料理写真の判定に失敗しました')}</div><button type="button" id="v50-photo-retry" class="v50-add-row">写真を選び直す</button>`;
      host.querySelector('#v50-photo-retry').onclick = choosePhotoSource;
    } finally { busy=false; }
  }

  function install() {
    const action = document.getElementById('dish-v30-action');
    if (action) { action.onclick = choosePhotoSource; action.setAttribute('aria-label','料理写真をMeal Draftへ読み込む'); }
    ensureHost().querySelector('footer').style.display = '';
    document.documentElement.classList.add('pfc-meal-editor-v50');
  }

  window.__PFC_MEAL_EDITOR_V50__ = {
    version:VERSION,
    singleLayerEditor:true,
    directNameEditing:true,
    inlineDbSearch:true,
    removableCards:true,
    voiceDraftEditing:true,
    photoUsesFoodMasterNutrition:true,
    hasOpenDraft:() => !!draft && draft.source !== 'source',
    plannerContext,
    applyVoicePlan,
    openFromUnresolved,
    choosePhotoSource,
    runPhoto,
    createRow,
    bindMatch,
    rowNutrition,
    install
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
