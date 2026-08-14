// PFC Mirror Dish Photo V4.0: AI-provisional portions + Food Master nutrition, fully editable before commit.
(() => {
  'use strict';

  const VERSION = '4.0.0';
  const MODEL = 'gemini-3.5-flash-lite';
  const THINKING_LEVEL = 'minimal';
  const MAX_SIDE = 512;
  const JPEG_QUALITY = 0.62;
  const MAX_FOODS = 12;
  const REQUEST_TIMEOUT_MS = 15000;
  const MIN_REQUEST_INTERVAL_MS = 5000;
  const RATE_LIMIT_RETRY_MS = 8000;
  const COUNT_UNITS = /^(個|切れ|枚|本|玉|杯|粒|袋|パック|カップ|缶|食)$/;
  const CUT_STYLE_WORDS = ['千切り','細切り','薄切り','輪切り','角切り','短冊切り','拍子木切り','みじん切り','花形','飾り切り'];
  let busy = false;
  let requestQueue = Promise.resolve();
  let nextRequestAt = 0;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function fold(value) {
    return norm(value)
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･]/g, '');
  }

  function cleanVisualFoodName(value) {
    const original = String(value || '').trim();
    let cleaned = original;
    for (const word of CUT_STYLE_WORDS) {
      cleaned = cleaned.replace(new RegExp('^' + word + '[の・\\s]*'), '');
      cleaned = cleaned.replace(new RegExp('[の・\\s]*' + word + '$'), '');
    }
    const key = fold(cleaned);
    if (/^(鶏|鶏肉)?の?(から揚げ|唐揚げ)$/.test(key) || key === 'から揚げ') return '唐揚げ';
    if (key === '玉子焼き') return '卵焼き';
    if (key === 'だし巻き玉子') return 'だし巻き卵';
    return cleaned.trim() || original;
  }

  function parsePositive(value, max = Infinity) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= max ? n : null;
  }

  function parseVisibleCount(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 30 ? n : null;
  }

  function roundEstimate(value, step = 5) {
    const n = parsePositive(value, 5000);
    if (!n) return null;
    return Math.max(step, Math.round(n / step) * step);
  }

  function parseIdentityResponse(raw) {
    const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    const root = Array.isArray(data) && data.length === 1 && data[0] && Array.isArray(data[0].foods) ? data[0] : data;
    const source = Array.isArray(root) ? root : root?.foods;
    if (!Array.isArray(source)) return null;
    const seen = new Map();
    const foods = [];
    for (const item of source) {
      const object = typeof item === 'object' && item ? item : {};
      const rawName = String(typeof item === 'string' ? item : object.name || '').trim();
      const name = cleanVisualFoodName(rawName);
      if (!name || name.length > 40) continue;
      const key = fold(name);
      const confidenceRaw = String(object.portionConfidence || object.estimateConfidence || '').toLowerCase();
      const portionConfidence = ['high','medium','low'].includes(confidenceRaw) ? confidenceRaw : 'low';
      const parsed = {
        name,
        visibleCount: parseVisibleCount(object.visibleCount),
        estimatedWeightG: roundEstimate(object.estimatedWeightG, 5),
        estimatedVolumeMl: roundEstimate(object.estimatedVolumeMl, 10),
        portionConfidence,
        ambiguity: String(object.ambiguity || '').trim().slice(0, 100),
        note: String(object.note || (rawName !== name ? `見た目表記: ${rawName}` : '')).trim().slice(0, 100)
      };
      if (seen.has(key)) {
        const existing = seen.get(key);
        if (!existing.visibleCount && parsed.visibleCount) existing.visibleCount = parsed.visibleCount;
        if (parsed.estimatedWeightG) existing.estimatedWeightG = roundEstimate((existing.estimatedWeightG || 0) + parsed.estimatedWeightG, 5);
        if (parsed.estimatedVolumeMl) existing.estimatedVolumeMl = roundEstimate((existing.estimatedVolumeMl || 0) + parsed.estimatedVolumeMl, 10);
        if (!existing.ambiguity && parsed.ambiguity) existing.ambiguity = parsed.ambiguity;
        if (!existing.note && parsed.note) existing.note = parsed.note;
        continue;
      }
      seen.set(key, parsed);
      foods.push(parsed);
      if (foods.length >= MAX_FOODS) break;
    }
    return { foods, dishName:String(root?.dishName || '').slice(0,80), uncertain:!!root?.uncertain };
  }

  function identityPrompt() {
    return `あなたは食事写真の視覚的食品抽出器です。画像から直接見える食品を、ユーザーが後で修正するための「仮入力」としてJSONだけで返してください。
ルール:
- 弁当・定食・ワンプレートは、主食・主菜・卵・野菜・漬物・副菜を見分けられる範囲で個別に列挙する。
- 同じ食材が切り方や置き場所だけ違う場合は1食品へまとめる。
- 見えない具、味、肉の部位、ソース、ブランドを推測しない。具が見えないおにぎりは必ず「おにぎり」。
- 調理法を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品を数えられる場合だけ整数。曖昧ならnull。
- estimatedWeightGは写真から見える可食部の概算重量。断定値ではなく、10〜20%程度ずれてもよい「編集前の仮値」として保守的に推定する。数えられる食品でも可能なら全体重量を推定する。
- 飲料・汁物など重量より容量が自然な場合のみestimatedVolumeMlを使う。
- portionConfidenceはhigh/medium/low。写真の遠近・重なり・容器で量が読みづらければlow。
- P/F/C、kcal、アルコール、油量、調味料量は絶対に出さない。栄養値はアプリのFood Masterが計算する。
- 食品でない画像はfoods=[]。説明文やMarkdownは禁止。
形式: {"dishName":"","uncertain":true,"foods":[{"name":"","visibleCount":null,"estimatedWeightG":null,"estimatedVolumeMl":null,"portionConfidence":"low","ambiguity":"","note":""}]}
最大${MAX_FOODS}食品。最後に重複・個数・見落とし・見えない具の推測がないか確認してからJSONを返す。`;
  }

  function endpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }

  function buildRequestPayload(base64) {
    return {
      taskType:'image',
      modelPreference:MODEL,
      contents:[{parts:[{text:identityPrompt()}]}],
      imageBase64:base64,
      generationConfig:{
        thinkingConfig:{thinkingLevel:THINKING_LEVEL},
        maxOutputTokens:1024,
        responseMimeType:'application/json',
        mediaResolution:'MEDIA_RESOLUTION_LOW'
      }
    };
  }

  function extractAiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  }

  function classifyUpstreamText(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    if (!/^GASエラー:/i.test(text) && !/^AI API /i.test(text)) return null;
    const error = new Error(text.slice(0,420));
    error.rateLimited = /\b429\b/.test(text);
    error.upstream = true;
    return error;
  }

  async function requestIdentity(base64) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint(), {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body:JSON.stringify(buildRequestPayload(base64)),
        signal:controller.signal
      });
      if (!response.ok) {
        const error = new Error(`画像AI HTTP ${response.status}`);
        error.rateLimited = response.status === 429;
        throw error;
      }
      let data;
      try { data = await response.json(); }
      catch { throw new Error('GASからJSONではない応答が返りました'); }
      const raw = extractAiText(data);
      const upstreamError = classifyUpstreamText(raw);
      if (upstreamError) throw upstreamError;
      const parsed = parseIdentityResponse(raw);
      if (!parsed) throw new Error(`Gemini応答を食品JSONとして読めませんでした: ${raw.replace(/\s+/g,' ').slice(0,180) || '空の応答'}`);
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`Gemini 3.5 Flash-Liteが${Math.round(REQUEST_TIMEOUT_MS/1000)}秒以内に応答しませんでした`);
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function waitForRequestSlot() {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay > 0) await wait(delay);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  }

  function enqueueIdentity(task) {
    const run = async () => {
      await waitForRequestSlot();
      try { return await task(); }
      catch (error) {
        if (!error?.rateLimited) throw error;
        await wait(RATE_LIMIT_RETRY_MS);
        nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
        return await task();
      }
    };
    const queued = requestQueue.then(run, run);
    requestQueue = queued.catch(() => {});
    return queued;
  }

  function identifyDish(base64) { return enqueueIdentity(() => requestIdentity(base64)); }

  function stripDataUrl(value) { return String(value || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i,''); }

  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await new Promise((resolve,reject) => { img.onload=resolve; img.onerror=()=>reject(new Error('画像を開けませんでした')); });
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,width,height);
      return stripDataUrl(canvas.toDataURL('image/jpeg',JPEG_QUALITY));
    } finally { URL.revokeObjectURL(url); }
  }

  function dbSearch(query, limit = 18) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function') return [];
    const q = String(query || '').trim();
    if (!q) return [];
    return search(q,limit).filter(x => x?.source === 'db');
  }

  function safeResolveFood(ai) {
    if (!ai?.name) return null;
    const q = fold(ai.name);
    for (const hit of dbSearch(ai.name,12)) {
      const meta = hit.meta || window.__PFC_DB_V3__?.get?.(hit.index);
      if (!meta) continue;
      if (fold(hit.name || meta.name) === q) return { ...hit, meta };
      if ((meta.aliases || []).some(alias => fold(alias) === q)) return { ...hit, meta };
    }
    return null;
  }

  function estimateForMeta(ai, meta, manual = false) {
    const unit = String(meta?.input?.defaultUnit || meta?.nutritionBasis?.unit || '');
    const fallback = parsePositive(meta?.input?.defaultAmount || meta?.nutritionBasis?.amount, 10000);
    if (COUNT_UNITS.test(unit) && ai?.visibleCount) return { amount:ai.visibleCount, unit, source:'ai-count', estimated:!manual };
    if (unit === 'g' && ai?.estimatedWeightG) return { amount:ai.estimatedWeightG, unit, source:'ai-weight', estimated:!manual };
    if (/^ml$/i.test(unit) && ai?.estimatedVolumeMl) return { amount:ai.estimatedVolumeMl, unit, source:'ai-volume', estimated:!manual };
    return { amount:fallback, unit, source:'db-default', estimated:!manual };
  }

  function makeEditorRow(ai, index) {
    const match = safeResolveFood(ai);
    if (!match) return { id:`ai-${index}`, ai, match:null, meta:null, unit:'', amount:null, estimateSource:'ai-only', estimated:true, userEditedAmount:false, manualDb:false };
    const meta = match.meta || window.__PFC_DB_V3__?.get?.(match.index);
    const estimate = estimateForMeta(ai,meta,false);
    return { id:`ai-${index}`, ai, match, meta, unit:estimate.unit, amount:estimate.amount, estimateSource:estimate.source, estimated:true, userEditedAmount:false, manualDb:false };
  }

  function applyDbMatch(row, result, manualSelection = true) {
    const meta = result?.meta || window.__PFC_DB_V3__?.get?.(result?.index);
    if (!result || !meta) return { ...row, match:null, meta:null, unit:'', amount:null };
    const estimate = estimateForMeta(row.ai,meta,false);
    return { ...row, match:{...result,meta}, meta, unit:estimate.unit, amount:estimate.amount, estimateSource:estimate.source, estimated:true, userEditedAmount:false, manualDb:row.manualDb || manualSelection };
  }

  function editorRowFromDb(result, index = 0) {
    const meta = result?.meta || window.__PFC_DB_V3__?.get?.(result?.index);
    const ai = { name:String(result?.name || meta?.name || ''), visibleCount:null, estimatedWeightG:null, estimatedVolumeMl:null, portionConfidence:'low', ambiguity:'', note:'' };
    const row = { id:`db-${Date.now()}-${index}`, ai, match:null, meta:null, unit:'', amount:null, estimateSource:'db-default', estimated:false, userEditedAmount:false, manualDb:true };
    const matched = applyDbMatch(row,result,true);
    matched.estimated = false;
    return matched;
  }

  function nutritionFor(row) {
    const amount = parsePositive(row?.amount,10000);
    if (!row?.match || !amount) return null;
    return window.__PFC_DB_V3__?.scale?.(row.match.index,amount) || null;
  }

  function nutritionText(row) {
    const scaled = nutritionFor(row);
    if (!scaled) return row?.match ? '量を確認するとP/F/C/kcalを計算できます' : 'Food Master未確定のためP/F/C/kcalは未計算';
    const prefix = row.userEditedAmount || row.manualDb ? '計算' : '推定';
    return `${prefix} ${scaled.kcal} kcal · P ${scaled.p} / F ${scaled.f} / C ${scaled.c}`;
  }

  function aiEstimateText(ai) {
    const parts = [];
    if (ai.visibleCount) parts.push(`見た目 ${ai.visibleCount}個候補`);
    if (ai.estimatedWeightG) parts.push(`約${ai.estimatedWeightG}g`);
    if (ai.estimatedVolumeMl) parts.push(`約${ai.estimatedVolumeMl}ml`);
    const label = ai.portionConfidence === 'high' ? '量推定:高' : ai.portionConfidence === 'medium' ? '量推定:中' : '量推定:低';
    if (parts.length) parts.push(label);
    return parts.join(' · ');
  }

  function dbResultMeta(result) {
    const meta = result?.meta || window.__PFC_DB_V3__?.get?.(result?.index);
    if (!meta) return '';
    const unit = meta.input?.defaultUnit || meta.nutritionBasis?.unit || '';
    const amount = meta.input?.defaultAmount || meta.nutritionBasis?.amount || '';
    const scaled = window.__PFC_DB_V3__?.scale?.(result.index,Number(amount));
    return [unit ? `基準 ${amount}${unit}` : '',scaled ? `${scaled.kcal} kcal` : ''].filter(Boolean).join(' · ');
  }

  function ensureModal() {
    let modal = document.getElementById('pfc-dish-v30-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pfc-dish-v30-modal';
    modal.className = 'dish-v30-modal';
    modal.innerHTML = '<div class="dish-v30-sheet"><div class="dish-v30-head"><strong id="dish-v30-title">料理写真</strong><button type="button" id="dish-v30-close" aria-label="閉じる">×</button></div><div id="dish-v30-body"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#dish-v30-close').onclick = () => modal.classList.remove('show');
    modal.addEventListener('click',e => { if (e.target === modal) modal.classList.remove('show'); });
    return modal;
  }

  function modal(title,html) {
    const host = ensureModal();
    host.querySelector('#dish-v30-title').textContent = title;
    host.querySelector('#dish-v30-body').innerHTML = html;
    host.classList.add('show');
    return host;
  }

  function ensureDbPicker() {
    let picker = document.getElementById('dish-v40-db-picker');
    if (picker) return picker;
    picker = document.createElement('div');
    picker.id = 'dish-v40-db-picker';
    picker.className = 'dish-v30-db-picker dish-v40-db-picker';
    picker.innerHTML = '<div class="dish-v30-db-sheet"><div class="dish-v30-db-head"><strong>Food Masterから選択</strong><button type="button" id="dish-v40-db-close" aria-label="閉じる">×</button></div><input id="dish-v40-db-query" class="dish-v30-db-query" type="search" placeholder="食品名を検索"><div id="dish-v40-db-results" class="dish-v30-db-results"></div></div>';
    document.body.appendChild(picker);
    const close = () => picker.classList.remove('show');
    picker.querySelector('#dish-v40-db-close').onclick = close;
    picker.addEventListener('click',e => { if (e.target === picker) close(); });
    return picker;
  }

  function openDbPicker(initialQuery,onPick) {
    const picker = ensureDbPicker();
    const input = picker.querySelector('#dish-v40-db-query');
    const resultsHost = picker.querySelector('#dish-v40-db-results');
    const render = () => {
      const results = dbSearch(input.value,18);
      resultsHost.innerHTML = results.length
        ? results.map((result,i) => `<button type="button" class="dish-v30-db-result" data-row="${i}"><b>${esc(result.name)}</b><small>${esc(dbResultMeta(result))}</small></button>`).join('')
        : '<div class="dish-v30-db-empty">食品名を入力してFood Masterを検索してください。</div>';
      resultsHost.querySelectorAll('[data-row]').forEach(button => {
        button.onclick = () => {
          const result = results[Number(button.dataset.row)];
          if (!result) return;
          picker.classList.remove('show');
          onPick(result);
        };
      });
    };
    input.value = String(initialQuery || '');
    input.oninput = render;
    render();
    picker.classList.add('show');
    setTimeout(() => { try { input.focus(); input.select(); } catch {} },0);
  }

  function showEditor(identity) {
    const state = { rows:(identity.foods || []).map(makeEditorRow) };
    const render = () => {
      const cards = state.rows.map((row,i) => {
        const matched = !!row.match;
        const title = matched ? row.match.name : row.ai.name;
        const estimate = aiEstimateText(row.ai);
        const detail = [estimate,row.ai.ambiguity ? `要確認: ${row.ai.ambiguity}` : '',row.ai.note || ''].filter(Boolean).join(' · ');
        const estimateBadge = row.userEditedAmount ? '<span class="dish-v40-state is-edited">編集済み</span>' : row.manualDb ? '<span class="dish-v40-state is-manual">DB追加</span>' : '<span class="dish-v40-state">AI仮入力</span>';
        const amount = matched
          ? `<div class="dish-v40-amount-row"><label>量</label><input class="dish-v40-amount" type="number" min="0.1" step="0.1" value="${row.amount ?? ''}"><span>${esc(row.unit || '')}</span></div><div class="dish-v40-nutrition">${esc(nutritionText(row))}</div>`
          : `<div class="dish-v40-provisional">${estimate ? `AI推定量: ${esc(estimate)}` : 'AI推定量: 不明'}<br><span>Food Masterを選ぶとP/F/C/kcalを仮計算できます。</span></div>`;
        return `<div class="dish-v30-card dish-v40-card${matched ? '' : ' is-unmatched'}" data-index="${i}"><div class="dish-v40-card-head"><div><div class="dish-v40-title-line"><b>${esc(title)}</b>${estimateBadge}</div><small>AI認識: ${esc(row.ai.name)}${detail ? ` · ${esc(detail)}` : ''}</small></div><button type="button" class="dish-v30-delete dish-v40-delete" aria-label="カードを削除">×</button></div>${amount}<div class="dish-v40-actions"><button type="button" class="dish-v30-change-db dish-v40-change-db">${matched ? 'DBから変更' : 'DBから選ぶ'}</button></div></div>`;
      }).join('');
      const badge = identity.dishName ? `<div class="dish-v30-badge">AI判定: ${esc(identity.dishName)}</div>` : '';
      const host = modal('写真認識を確認',`${badge}<div class="dish-v40-summary">AIが食品と量を仮入力しました。間違っている所だけ直して追加できます。</div><div id="dish-v40-editor">${cards || '<div class="dish-v30-message">食品カードがありません。</div>'}</div><button type="button" class="dish-v30-secondary" id="dish-v40-add-db">＋ DBから食品を追加</button><div class="dish-v40-footer-note">「推定」は写真からの仮量です。P/F/C/kcalはAIではなくFood Masterから計算しています。</div><button class="dish-v30-primary" id="dish-v40-commit">この内容で追加</button>`);
      const commit = host.querySelector('#dish-v40-commit');
      const usable = () => state.rows.filter(row => row.match && parsePositive(row.amount,10000));
      commit.disabled = usable().length === 0;

      host.querySelectorAll('.dish-v40-card').forEach((card,i) => {
        const row = state.rows[i];
        card.querySelector('.dish-v40-delete').onclick = () => { state.rows.splice(i,1); render(); };
        card.querySelector('.dish-v40-change-db').onclick = () => {
          openDbPicker(row.match?.name || row.ai?.name || '',result => {
            state.rows[i] = applyDbMatch(row,result,true);
            render();
          });
        };
        const input = card.querySelector('.dish-v40-amount');
        if (input) input.oninput = () => {
          row.amount = parsePositive(input.value,10000);
          row.userEditedAmount = true;
          row.estimated = false;
          card.querySelector('.dish-v40-nutrition').textContent = nutritionText(row);
          const stateBadge = card.querySelector('.dish-v40-state');
          if (stateBadge) { stateBadge.textContent = '編集済み'; stateBadge.className = 'dish-v40-state is-edited'; }
          commit.disabled = usable().length === 0;
        };
      });

      host.querySelector('#dish-v40-add-db').onclick = () => {
        openDbPicker('',result => { state.rows.push(editorRowFromDb(result,state.rows.length)); render(); });
      };

      commit.onclick = () => {
        const records = [];
        for (const row of usable()) {
          const amount = parsePositive(row.amount,10000);
          const record = window.__PFC_DB_V3__?.buildRecord?.(row.match.index,amount);
          if (!record) continue;
          record._photoAI = {
            version:VERSION,
            model:MODEL,
            provisional:true,
            aiName:row.manualDb ? '' : row.ai.name,
            visibleCount:row.ai.visibleCount,
            estimatedWeightG:row.ai.estimatedWeightG,
            estimatedVolumeMl:row.ai.estimatedVolumeMl,
            portionConfidence:row.ai.portionConfidence,
            estimateSource:row.estimateSource,
            userEditedAmount:!!row.userEditedAmount,
            manualDbSelected:!!row.manualDb,
            nutritionSource:'Food Master'
          };
          records.push(record);
        }
        if (!records.length || typeof lst === 'undefined' || !Array.isArray(lst)) return;
        lst.push(...records);
        if (typeof sv === 'function') sv();
        if (typeof ren === 'function') ren();
        if (typeof upd === 'function') upd();
        if (typeof showToast === 'function') showToast(`${records.length}件を写真から追加しました`);
        host.classList.remove('show');
      };
    };
    render();
  }

  function choosePhotoSource() {
    const host = modal('料理写真から追加','<div class="dish-v30-source-grid"><button type="button" id="dish-v40-camera"><b>カメラで撮る</b><span>今の食事をその場で撮影</span></button><button type="button" id="dish-v40-library"><b>カメラロールから選ぶ</b><span>保存済みの写真を選択</span></button></div><div class="dish-v40-footer-note">AIが食品名と量を仮入力し、P/F/C/kcalはFood Masterから計算します。追加前にすべて編集できます。</div>');
    host.querySelector('#dish-v40-camera').onclick = () => { host.classList.remove('show'); selectPhoto('camera'); };
    host.querySelector('#dish-v40-library').onclick = () => { host.classList.remove('show'); selectPhoto('library'); };
  }

  function selectPhoto(source) {
    const id = source === 'camera' ? 'dish-v40-camera-file' : 'dish-v40-library-file';
    let input = document.getElementById(id);
    if (!input) {
      input = document.createElement('input');
      input.id = id;
      input.type = 'file';
      input.accept = 'image/*';
      if (source === 'camera') input.setAttribute('capture','environment');
      input.hidden = true;
      document.body.appendChild(input);
      input.onchange = async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) await runDishPhoto(file);
      };
    }
    input.click();
  }

  async function runDishPhoto(file) {
    if (busy) return;
    busy = true;
    modal('料理写真を判定中','<div class="dish-v30-loading"><span></span><b>Gemini 3.5 Flash-Liteで食品と量を仮入力しています</b></div><div class="dish-v40-footer-note">P/F/C/kcalはAIに作らせず、認識後にFood Masterから計算します。</div>');
    try {
      const identity = await identifyDish(await compressImage(file));
      if (!identity.foods.length) throw new Error('食べ物として認識できませんでした');
      showEditor(identity);
    } catch (error) {
      const host = modal('判定できませんでした',`<div class="dish-v30-message">${esc(error?.message || '料理写真の判定に失敗しました')}</div><button class="dish-v30-primary" id="dish-v40-retry">写真を選び直す</button>`);
      host.querySelector('#dish-v40-retry').onclick = () => { host.classList.remove('show'); choosePhotoSource(); };
    } finally { busy = false; }
  }

  function install() {
    const action = document.getElementById('dish-v30-action');
    if (!action) return false;
    action.onclick = choosePhotoSource;
    action.setAttribute('aria-label','料理写真からAI仮入力して追加');
    document.documentElement.classList.add('pfc-dish-photo-v40');
    return true;
  }

  window.__PFC_DISH_PHOTO_V40__ = {
    version:VERSION,
    model:MODEL,
    thinkingLevel:THINKING_LEVEL,
    nutritionFromAI:false,
    nutritionSource:'Food Master',
    provisionalAmounts:true,
    editableAmounts:true,
    removableCards:true,
    dbReplacement:true,
    dbAddition:true,
    oneRequestPerPhoto:true,
    imageMaxSide:MAX_SIDE,
    jpegQuality:JPEG_QUALITY,
    requestTimeoutMs:REQUEST_TIMEOUT_MS,
    minRequestIntervalMs:MIN_REQUEST_INTERVAL_MS,
    parseIdentityResponse,
    cleanVisualFoodName,
    identityPrompt,
    buildRequestPayload,
    safeResolveFood,
    estimateForMeta,
    makeEditorRow,
    applyDbMatch,
    editorRowFromDb,
    nutritionFor,
    nutritionText,
    aiEstimateText,
    dbSearch,
    identifyDish,
    choosePhotoSource,
    selectPhoto,
    install
  };

  const boot = () => {
    if (install()) return;
    let attempts = 0;
    const timer = setInterval(() => { attempts += 1; if (install() || attempts >= 20) clearInterval(timer); },100);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
