// PFC Mirror V3.3: low-latency Gemini 3.5 Flash-Lite visual identification with user-confirmed quantities.
(() => {
  'use strict';

  const VERSION = '3.3.0';
  const MODEL = 'gemini-3.5-flash-lite';
  const THINKING_LEVEL = 'minimal';
  const MAX_SIDE = 1024;
  const JPEG_QUALITY = 0.80;
  const MAX_FOODS = 10;
  const REQUEST_TIMEOUT_MS = 32000;
  const RETRY_DELAY_MS = 700;
  const COUNT_UNITS = /^(個|切れ|枚|本|玉|杯|粒|袋|パック|カップ|缶|食)$/;
  const CUT_STYLE_WORDS = ['千切り','細切り','薄切り','輪切り','角切り','短冊切り','拍子木切り','みじん切り','花形','飾り切り'];
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
  const baseName = value => norm(value).replace(/[（(].*?[)）]/g, '');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function cleanVisualFoodName(value) {
    const original = String(value || '').trim();
    let cleaned = original;
    for (const word of CUT_STYLE_WORDS) {
      cleaned = cleaned.replace(new RegExp('^' + word + '[の・\\s]*'), '');
      cleaned = cleaned.replace(new RegExp('[の・\\s]*' + word + '$'), '');
    }
    return cleaned.trim() || original;
  }

  function parseVisibleCount(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 30 ? n : null;
  }

  function parseAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
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
      const key = norm(name);
      const parsed = {
        name,
        confidence: Math.max(0, Math.min(1, num(typeof item === 'string' ? 0 : object.confidence))),
        visibleCount: parseVisibleCount(object.visibleCount),
        ambiguity: String(object.ambiguity || '').trim().slice(0, 100),
        note: String(object.note || (rawName !== name ? `見た目表記: ${rawName}` : '')).trim().slice(0, 100),
        rawCountCertain: object.countCertain === true,
        rawVariantVisible: object.variantVisible === true
      };
      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.confidence = Math.max(existing.confidence, parsed.confidence);
        if (!existing.visibleCount && parsed.visibleCount) existing.visibleCount = parsed.visibleCount;
        if (!existing.ambiguity && parsed.ambiguity) existing.ambiguity = parsed.ambiguity;
        if (!existing.note && parsed.note) existing.note = parsed.note;
        existing.rawCountCertain = existing.rawCountCertain || parsed.rawCountCertain;
        existing.rawVariantVisible = existing.rawVariantVisible || parsed.rawVariantVisible;
        continue;
      }
      seen.set(key, parsed);
      foods.push(parsed);
      if (foods.length >= MAX_FOODS) break;
    }
    return {
      foods,
      dishName: String(root?.dishName || '').slice(0,80),
      uncertain: !!root?.uncertain
    };
  }

  function parentheticalDetail(value) {
    const m = String(value || '').match(/[（(]([^()（）]+)[)）]/);
    return m ? norm(m[1]) : '';
  }

  function isUnsafeSpecificMatch(ai, result) {
    if (!ai || !result) return true;
    const candidate = String(result.name || result.meta?.name || '');
    const q = norm(ai.name);
    const c = norm(candidate);
    if (!q || !c) return true;
    if (q === c) return false;

    const candidateBase = baseName(candidate);
    const detail = parentheticalDetail(candidate);
    if (detail) {
      const explicitDetail = q.includes(detail) && q.includes(candidateBase);
      if (!explicitDetail) return true;
    }
    if (candidateBase === q && c !== q) return true;
    return false;
  }

  function searchHits(ai, minScore = 2000) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function' || !ai?.name) return [];
    return search(ai.name, 8).filter(x => x?.source === 'db' && Number(x.score || 0) >= minScore);
  }

  function resolveFood(ai) {
    return searchHits(ai).find(hit => !isUnsafeSpecificMatch(ai, hit)) || null;
  }

  function resolveFoods(identity) {
    return (identity?.foods || []).map(ai => {
      const match = resolveFood(ai);
      if (!match) return { ai, match:null, reason:'no-safe-match', amount:null, countSuggestion:null };
      const meta = match.meta || window.__PFC_DB_V3__?.get?.(match.index);
      if (!meta) return { ai, match:null, reason:'no-meta', amount:null, countSuggestion:null };
      const unit = String(meta.input?.defaultUnit || meta.nutritionBasis?.unit || '');
      const countSuggestion = ai.visibleCount && COUNT_UNITS.test(unit) ? ai.visibleCount : null;
      return { ai, match, meta, unit, amount:null, countSuggestion, countApplied:false };
    });
  }

  function ensureModal() {
    let modal = document.getElementById('pfc-dish-v30-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pfc-dish-v30-modal';
    modal.className = 'dish-v30-modal';
    modal.innerHTML = '<div class="dish-v30-sheet"><div class="dish-v30-head"><strong id="dish-v30-title">料理写真</strong><button type="button" id="dish-v30-close" aria-label="閉じる">×</button></div><div id="dish-v30-body"></div></div>';
    document.body.appendChild(modal);
    const close = () => modal.classList.remove('show');
    modal.querySelector('#dish-v30-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    return modal;
  }

  function modal(title, html) {
    const host = ensureModal();
    host.querySelector('#dish-v30-title').textContent = title;
    host.querySelector('#dish-v30-body').innerHTML = html;
    host.classList.add('show');
    return host;
  }

  function choosePhotoSource() {
    const host = modal('料理写真から追加', `
      <div class="dish-v30-source-grid">
        <button type="button" id="dish-v30-camera"><b>カメラで撮る</b><span>今の食事をその場で撮影</span></button>
        <button type="button" id="dish-v30-library"><b>カメラロールから選ぶ</b><span>保存済みの写真を選択</span></button>
      </div>
      <div class="dish-v30-note">AIは見えている食品を候補化します。種類と量は追加前に確認し、写真だけでP/F/C/kcalを確定しません。</div>`);
    host.querySelector('#dish-v30-camera').onclick = () => { host.classList.remove('show'); selectPhoto('camera'); };
    host.querySelector('#dish-v30-library').onclick = () => { host.classList.remove('show'); selectPhoto('library'); };
  }

  function selectPhoto(source) {
    const id = source === 'camera' ? 'dish-v30-camera-file' : 'dish-v30-library-file';
    let input = document.getElementById(id);
    if (!input) {
      input = document.createElement('input');
      input.id = id;
      input.type = 'file';
      input.accept = 'image/*';
      if (source === 'camera') input.setAttribute('capture', 'environment');
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
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,width,height);
      return stripDataUrl(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    } finally { URL.revokeObjectURL(url); }
  }

  function endpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }

  function identityPrompt() {
    return `食事写真から、画像で直接確認できる食品だけを日本語で抽出し、JSONだけ返してください。
ルール:
- 弁当・定食は全体名だけで終わらず、見分けられる主食・主菜・卵・野菜・漬物・副菜を個別に列挙する。
- 見えない具、味、肉の部位、ソース、調理法を推測しない。具が見えないおにぎりは必ず「おにぎり」。
- 唐揚げか焼き物か断定できない等は安全な一般名（例「鶏料理」）にし、ambiguityへ候補を書く。
- visibleCountは独立した個体を明確に数えられる時だけ整数。重なる・切れる・不明ならnull。
- 重量g/ml、P/F/C、kcal、油・調味料量は出さない。
- 食品でない画像はfoods=[]。Markdownや説明文は禁止。
形式: {"dishName":"お弁当","uncertain":true,"foods":[{"name":"おにぎり","visibleCount":3,"ambiguity":"","note":"具は見えない"}]}
最大${MAX_FOODS}食品。最後に個数と見落としだけ再確認してJSONを返す。`;
  }

  function buildRequestPayload(base64) {
    return {
      taskType:'image',
      modelPreference:MODEL,
      contents:[{parts:[{text:identityPrompt()}]}],
      imageBase64:base64,
      generationConfig:{
        thinkingConfig:{thinkingLevel:THINKING_LEVEL},
        maxOutputTokens:1024
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
    const error = new Error(text.slice(0, 420));
    error.retryable = /\b(?:429|500|502|503|504)\b/.test(text);
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
        error.retryable = [429,500,502,503,504].includes(response.status);
        throw error;
      }
      let data;
      try { data = await response.json(); }
      catch { throw new Error('GASからJSONではない応答が返りました'); }
      const raw = extractAiText(data);
      const upstreamError = classifyUpstreamText(raw);
      if (upstreamError) throw upstreamError;
      const parsed = parseIdentityResponse(raw);
      if (!parsed) {
        const sample = raw ? raw.replace(/\s+/g,' ').slice(0,220) : '空の応答';
        throw new Error(`Gemini応答を食品JSONとして読めませんでした: ${sample}`);
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Gemini 3.5 Flash-Liteが${Math.round(REQUEST_TIMEOUT_MS/1000)}秒以内に応答しませんでした`);
        timeoutError.retryable = false;
        throw timeoutError;
      }
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function identifyDish(base64) {
    try {
      return await requestIdentity(base64);
    } catch (error) {
      if (!error?.retryable) throw error;
      await wait(RETRY_DELAY_MS);
      return await requestIdentity(base64);
    }
  }

  function nutritionPreview(row) {
    const amount = parseAmount(row.amount);
    if (!amount) return '量を入力するとP/F/C/kcalを表示';
    const scaled = window.__PFC_DB_V3__?.scale?.(row.match.index, amount);
    return scaled ? `${scaled.kcal} kcal · P ${scaled.p} / F ${scaled.f} / C ${scaled.c}` : '栄養値を計算できませんでした';
  }

  function aiMetaText(ai, countSuggestion = null) {
    const parts = [`AI認識: ${ai.name}`];
    if (countSuggestion) parts.push(`個数候補 ${countSuggestion}`);
    else if (ai.visibleCount) parts.push(`見た目の個数候補 ${ai.visibleCount}`);
    if (ai.ambiguity) parts.push(`要確認: ${ai.ambiguity}`);
    return parts.join(' · ');
  }

  function dbSearch(query, limit = 18) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function') return [];
    const q = String(query || '').trim();
    if (!q) return [];
    return search(q, limit).filter(x => x?.source === 'db');
  }

  function applyDbMatch(row, result) {
    const meta = result?.meta || window.__PFC_DB_V3__?.get?.(result?.index);
    if (!result || !meta) return { ...row, match:null, meta:null, unit:'', countSuggestion:null };
    const unit = String(meta.input?.defaultUnit || meta.nutritionBasis?.unit || '');
    const countSuggestion = row?.ai?.visibleCount && COUNT_UNITS.test(unit) ? row.ai.visibleCount : null;
    return { ...row, match:result, meta, unit, countSuggestion, countApplied:false };
  }

  function editorRows(identity) {
    return resolveFoods(identity).map((row, index) => ({ ...row, id:`ai-${index}`, manualDb:false }));
  }

  function editorRowFromDb(result, index = 0) {
    const ai = { name:String(result?.name || ''), visibleCount:null, ambiguity:'', note:'', confidence:0 };
    return applyDbMatch({ ai, match:null, meta:null, unit:'', amount:null, countSuggestion:null, countApplied:false, id:`db-${Date.now()}-${index}`, manualDb:true }, result);
  }

  function dbResultMeta(result) {
    const meta = result?.meta || window.__PFC_DB_V3__?.get?.(result?.index);
    if (!meta) return '';
    const unit = meta.input?.defaultUnit || meta.nutritionBasis?.unit || '';
    const amount = meta.input?.defaultAmount || meta.nutritionBasis?.amount || '';
    const scaled = window.__PFC_DB_V3__?.scale?.(result.index, Number(amount));
    return [unit ? `基準 ${amount}${unit}` : '', scaled ? `${scaled.kcal} kcal` : ''].filter(Boolean).join(' · ');
  }

  function ensureDbPicker() {
    let picker = document.getElementById('dish-v30-db-picker');
    if (picker) return picker;
    picker = document.createElement('div');
    picker.id = 'dish-v30-db-picker';
    picker.className = 'dish-v30-db-picker';
    picker.innerHTML = '<div class="dish-v30-db-sheet"><div class="dish-v30-db-head"><strong>Food Masterから選択</strong><button type="button" id="dish-v30-db-close" aria-label="閉じる">×</button></div><input id="dish-v30-db-query" class="dish-v30-db-query" type="search" placeholder="食品名を検索"><div id="dish-v30-db-results" class="dish-v30-db-results"></div></div>';
    document.body.appendChild(picker);
    const close = () => picker.classList.remove('show');
    picker.querySelector('#dish-v30-db-close').onclick = close;
    picker.addEventListener('click', e => { if (e.target === picker) close(); });
    return picker;
  }

  function openDbPicker(initialQuery, onPick) {
    const picker = ensureDbPicker();
    const input = picker.querySelector('#dish-v30-db-query');
    const resultsHost = picker.querySelector('#dish-v30-db-results');
    const render = () => {
      const results = dbSearch(input.value, 18);
      resultsHost.innerHTML = results.length
        ? results.map((result, i) => `<button type="button" class="dish-v30-db-result" data-db-row="${i}"><b>${esc(result.name)}</b><small>${esc(dbResultMeta(result))}</small></button>`).join('')
        : '<div class="dish-v30-db-empty">食品名を入力してFood Masterを検索してください。</div>';
      resultsHost.querySelectorAll('.dish-v30-db-result').forEach(button => {
        button.onclick = () => {
          const result = results[Number(button.dataset.dbRow)];
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
    setTimeout(() => { try { input.focus(); input.select(); } catch {} }, 0);
  }

  function showMatches(identity) {
    const state = { rows:editorRows(identity) };
    const renderEditor = () => {
      const cards = state.rows.map((row, i) => {
        const matched = !!row.match;
        const title = matched ? row.match.name : row.ai.name;
        const unit = matched ? (row.unit || row.meta?.input?.defaultUnit || row.meta?.nutritionBasis?.unit || '食') : '';
        const status = matched ? aiMetaText(row.ai,row.countSuggestion) : `AI認識: ${row.ai.name}${row.ai.visibleCount ? ` · 個数候補 ${row.ai.visibleCount}` : ''}${row.ai.ambiguity ? ` · 要確認: ${row.ai.ambiguity}` : ''}`;
        const amountHtml = matched
          ? `<div class="dish-v30-amount"><input class="dish-v30-amount-input" type="number" min="0.1" step="0.1" value="${row.amount || ''}" placeholder="量を入力"><span>${esc(unit)}</span>${row.countSuggestion ? `<button type="button" class="dish-v30-use-count">候補${row.countSuggestion}${esc(unit)}</button>` : ''}</div><div class="dish-v30-pfc">${esc(nutritionPreview(row))}</div>`
          : '<div class="dish-v30-unmatched">Food Masterの食品を選ぶと量とP/F/C/kcalを入力できます。</div>';
        return `<div class="dish-v30-card dish-v30-editor-card${matched ? '' : ' is-unmatched'}" data-row="${i}"><div class="dish-v30-editor-head"><div><b>${esc(title)}</b><small>${esc(status)}</small></div><button type="button" class="dish-v30-delete" aria-label="カードを削除">×</button></div>${amountHtml}<div class="dish-v30-card-actions"><button type="button" class="dish-v30-change-db">${matched ? 'DBから変更' : 'DBから選ぶ'}</button></div></div>`;
      }).join('');
      const badge = identity.dishName ? `<div class="dish-v30-badge">AI判定: ${esc(identity.dishName)}</div>` : '';
      const empty = '<div class="dish-v30-message">食品カードがありません。</div>';
      const host = modal('写真認識を確認', `${badge}<div id="dish-v30-editor">${cards || empty}</div><button type="button" class="dish-v30-secondary" id="dish-v30-add-db">＋ DBから食品を追加</button><div class="dish-v30-note">AIが拾った食品はすべてカードとして残しています。不要なカードは削除し、種類が違うものはDBから変更できます。量を入力したカードだけ記録します。</div><button class="dish-v30-primary" id="dish-v30-add" disabled>量を入力した食品を追加</button>`);
      const addButton = host.querySelector('#dish-v30-add');
      const refreshAddState = () => { addButton.disabled = !state.rows.some(row => row.match && parseAmount(row.amount)); };

      host.querySelectorAll('.dish-v30-editor-card').forEach((card, i) => {
        const row = state.rows[i];
        card.querySelector('.dish-v30-delete').onclick = () => { state.rows.splice(i,1); renderEditor(); };
        card.querySelector('.dish-v30-change-db').onclick = () => {
          openDbPicker(row.match?.name || row.ai?.name || '', result => {
            state.rows[i] = applyDbMatch({ ...row, amount:null }, result);
            renderEditor();
          });
        };
        const input = card.querySelector('.dish-v30-amount-input');
        if (input) input.oninput = () => {
          row.amount = parseAmount(input.value);
          card.querySelector('.dish-v30-pfc').textContent = nutritionPreview(row);
          refreshAddState();
        };
        const useCount = card.querySelector('.dish-v30-use-count');
        if (useCount) useCount.onclick = () => {
          row.amount = row.countSuggestion;
          if (input) input.value = String(row.countSuggestion);
          card.querySelector('.dish-v30-pfc').textContent = nutritionPreview(row);
          refreshAddState();
        };
      });

      host.querySelector('#dish-v30-add-db').onclick = () => {
        openDbPicker('', result => {
          state.rows.push(editorRowFromDb(result,state.rows.length));
          renderEditor();
        });
      };

      addButton.onclick = () => {
        const records = [];
        for (const row of state.rows) {
          const amount = parseAmount(row.amount);
          if (!row.match || !amount) continue;
          const record = window.__PFC_DB_V3__?.buildRecord?.(row.match.index, amount);
          if (!record) continue;
          record._photoAI = {
            version:VERSION,
            identityOnly:true,
            model:MODEL,
            thinkingLevel:THINKING_LEVEL,
            aiName:row.manualDb ? '' : row.ai.name,
            visualConfidence:row.ai.confidence,
            visibleCountSuggestion:row.ai.visibleCount,
            ambiguity:row.ai.ambiguity || '',
            userConfirmedAmount:amount,
            manualDbSelected:!!row.manualDb,
            aiAmountAutoApplied:false,
            aiVariantFlagsTrusted:false
          };
          records.push(record);
        }
        if (!records.length || typeof lst === 'undefined' || !Array.isArray(lst)) return;
        lst.push(...records);
        if (typeof sv === 'function') sv();
        if (typeof ren === 'function') ren();
        if (typeof upd === 'function') upd();
        if (typeof showToast === 'function') showToast(`${records.length}件を確認して追加しました`);
        host.classList.remove('show');
      };
      refreshAddState();
    };
    renderEditor();
  }

  async function runDishPhoto(file) {
    if (busy) return;
    busy = true;
    modal('料理写真を判定中','<div class="dish-v30-loading"><span></span><b>Gemini 3.5 Flash-Liteで食品を確認しています</b></div><div class="dish-v30-note">低遅延設定で処理しています。種類・個数は候補として扱い、量や栄養値を写真だけで確定しません。</div>');
    try {
      const identity = await identifyDish(await compressImage(file));
      if (!identity.foods.length) throw new Error('食べ物として認識できませんでした');
      showMatches(identity);
    } catch (error) {
      const host = modal('判定できませんでした', `<div class="dish-v30-message">${esc(error?.message || '料理写真の判定に失敗しました')}</div><div class="dish-v30-note">エラー内容をそのまま表示しています。再発時はこの画面のスクショで原因を特定できます。</div><button class="dish-v30-primary" id="dish-v30-retry">写真を選び直す</button>`);
      host.querySelector('#dish-v30-retry').onclick = () => { host.classList.remove('show'); choosePhotoSource(); };
    } finally { busy = false; }
  }

  function install() {
    if (document.getElementById('dish-v30-action')) return;
    const input = document.getElementById('s-inp');
    if (!input) return;
    const actions = document.createElement('div');
    actions.id = 'dish-v30-actions';
    actions.className = 'dish-v30-actions';
    actions.innerHTML = '<button type="button" id="dish-v30-action" aria-label="料理写真から食品を追加">料理写真</button>';
    const anchor = input.closest('.search-box') || input.parentElement;
    anchor.insertAdjacentElement('afterend', actions);
    actions.querySelector('#dish-v30-action').onclick = choosePhotoSource;
    document.documentElement.classList.add('pfc-dish-photo-v30');
  }

  window.__PFC_DISH_PHOTO_V30__ = {
    version:VERSION,
    model:MODEL,
    thinkingLevel:THINKING_LEVEL,
    requestTimeoutMs:REQUEST_TIMEOUT_MS,
    imageMaxSide:MAX_SIDE,
    jpegQuality:JPEG_QUALITY,
    identityOnly:true,
    nutritionFromAI:false,
    conservativeVisual:true,
    genericToSpecificBlocked:true,
    visibleCount:true,
    aiAmountAutoApplied:false,
    aiVariantFlagsTrusted:false,
    requiresUserAmount:true,
    editablePhotoCards:true,
    dbPicker:true,
    removablePhotoCards:true,
    latencyOptimized:true,
    retryTransient:true,
    cameraRoll:true,
    camera:true,
    parseIdentityResponse,
    cleanVisualFoodName,
    isUnsafeSpecificMatch,
    resolveFood,
    resolveFoods,
    dbSearch,
    applyDbMatch,
    editorRows,
    editorRowFromDb,
    buildRequestPayload,
    extractAiText,
    classifyUpstreamText,
    identifyDish,
    choosePhotoSource,
    selectPhoto,
    install
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();