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
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
  const baseName = value => norm(value).replace(/[（(].*?[)）]/g, '');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    const source = Array.isArray(data) ? data : data?.foods;
    if (!Array.isArray(source)) return null;
    const seen = new Map();
    const foods = [];
    for (const item of source) {
      const object = typeof item === 'object' && item ? item : {};
      const name = String(typeof item === 'string' ? item : object.name || '').trim();
      if (!name || name.length > 40) continue;
      const key = norm(name);
      const parsed = {
        name,
        confidence: Math.max(0, Math.min(1, num(typeof item === 'string' ? 0 : object.confidence))),
        visibleCount: parseVisibleCount(object.visibleCount),
        ambiguity: String(object.ambiguity || '').trim().slice(0, 100),
        note: String(object.note || '').trim().slice(0, 100),
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
      dishName: String(data?.dishName || '').slice(0,80),
      uncertain: !!data?.uncertain
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

  function showMatches(identity) {
    const resolved = resolveFoods(identity);
    const matched = resolved.filter(x => x.match);
    const unmatched = resolved.filter(x => !x.match);

    if (!matched.length) {
      const names = unmatched.map(x => `${esc(x.ai.name)}${x.ai.visibleCount ? ` ×${x.ai.visibleCount}候補` : ''}`).join('、');
      const host = modal('食品を確認してください', `<div class="dish-v30-message">AIは ${names || '食品'} を認識しましたが、Food Masterの特定食品へ安全に自動一致できませんでした。具・種類・量を勝手に補完しないため、この結果は記録しません。</div><button class="dish-v30-primary" id="dish-v30-close-result">閉じる</button>`);
      host.querySelector('#dish-v30-close-result').onclick = () => host.classList.remove('show');
      return;
    }

    const cards = matched.map((row,i) => {
      const unit = row.unit || row.meta.input?.defaultUnit || row.meta.nutritionBasis?.unit || '食';
      const placeholder = row.countSuggestion ? String(row.countSuggestion) : '量を入力';
      const countNote = row.countSuggestion
        ? `<small class="dish-v30-note">AIの個数候補は ${row.countSuggestion}${esc(unit)}。未確定なので自動入力していません。</small>`
        : '<small class="dish-v30-note">写真から重量・量は確定しません。実際の量を入力してください。</small>';
      return `<label class="dish-v30-card" data-row="${i}"><div class="dish-v30-card-head"><input class="dish-v30-check" type="checkbox" checked><div><b>${esc(row.match.name)}</b><small>${esc(aiMetaText(row.ai,row.countSuggestion))}</small></div></div><div class="dish-v30-amount"><input class="dish-v30-amount-input" type="number" min="0.1" step="0.1" value="" placeholder="${esc(placeholder)}"><span>${esc(unit)}</span></div><div class="dish-v30-pfc">${esc(nutritionPreview(row))}</div>${countNote}</label>`;
    }).join('');

    const unmatchedHtml = unmatched.length ? `<div class="dish-v30-message"><b>種類の確認が必要な食品</b><br>${unmatched.map(x => `${esc(x.ai.name)}${x.ai.visibleCount?` ×${x.ai.visibleCount}候補`:''}${x.ai.ambiguity?`（${esc(x.ai.ambiguity)}）`:''}`).join('、')}<br><small>Food Masterの特定バリエーションへ自動変換していません。例: 「おにぎり」から「ツナおにぎり」へは変換しません。</small></div>` : '';
    const host = modal('写真認識を確認', `${identity.dishName?`<div class="dish-v30-badge">AI判定: ${esc(identity.dishName)}</div>`:''}${cards}${unmatchedHtml}<div class="dish-v30-note">AIの個数・種類は候補です。量を確認した食品だけ追加できます。</div><button class="dish-v30-primary" id="dish-v30-add" disabled>量を確認した食品を追加</button>`);

    const addButton = host.querySelector('#dish-v30-add');
    const refreshAddState = () => {
      const cardsNow = [...host.querySelectorAll('.dish-v30-card')];
      addButton.disabled = !cardsNow.some(card => card.querySelector('.dish-v30-check').checked && parseAmount(card.querySelector('.dish-v30-amount-input').value));
    };

    host.querySelectorAll('.dish-v30-card').forEach((card,i) => {
      const input = card.querySelector('.dish-v30-amount-input');
      const check = card.querySelector('.dish-v30-check');
      input.oninput = () => {
        matched[i].amount = parseAmount(input.value);
        card.querySelector('.dish-v30-pfc').textContent = nutritionPreview(matched[i]);
        refreshAddState();
      };
      check.onchange = refreshAddState;
    });

    addButton.onclick = () => {
      const records = [];
      host.querySelectorAll('.dish-v30-card').forEach((card,i) => {
        if (!card.querySelector('.dish-v30-check').checked) return;
        const row = matched[i];
        const amount = parseAmount(card.querySelector('.dish-v30-amount-input').value);
        if (!amount) return;
        const record = window.__PFC_DB_V3__?.buildRecord?.(row.match.index, amount);
        if (record) {
          record._photoAI = {
            version:VERSION,
            identityOnly:true,
            model:MODEL,
            thinkingLevel:THINKING_LEVEL,
            aiName:row.ai.name,
            visualConfidence:row.ai.confidence,
            visibleCountSuggestion:row.ai.visibleCount,
            ambiguity:row.ai.ambiguity || '',
            userConfirmedAmount:amount,
            aiAmountAutoApplied:false,
            aiVariantFlagsTrusted:false
          };
          records.push(record);
        }
      });
      if (!records.length || typeof lst === 'undefined' || !Array.isArray(lst)) return;
      lst.push(...records);
      if (typeof sv === 'function') sv();
      if (typeof ren === 'function') ren();
      if (typeof upd === 'function') upd();
      if (typeof showToast === 'function') showToast(`${records.length}件を確認して追加しました`);
      host.classList.remove('show');
    };
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
    latencyOptimized:true,
    retryTransient:true,
    cameraRoll:true,
    camera:true,
    parseIdentityResponse,
    isUnsafeSpecificMatch,
    resolveFood,
    resolveFoods,
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
