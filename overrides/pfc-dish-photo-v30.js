// PFC Mirror V3.2: Gemini 3.5 Flash-Lite visual identification with user-confirmed quantities.
(() => {
  'use strict';

  const VERSION = '3.2.0';
  const MODEL = 'gemini-3.5-flash-lite';
  const MAX_SIDE = 1280;
  const JPEG_QUALITY = 0.86;
  const MAX_FOODS = 10;
  const COUNT_UNITS = /^(個|切れ|枚|本|玉|杯|粒|袋|パック|カップ|缶|食)$/;
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').trim();
  const baseName = value => norm(value).replace(/[（(].*?[)）]/g, '');

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
        confidence: Math.max(0, Math.min(1, num(typeof item === 'string' ? 0.5 : object.confidence))),
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
      <div class="dish-v30-note">AIは見えている食品を候補化します。種類と量は追加前に人が確認し、写真だけでP/F/C/kcalを確定しません。</div>`);
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
    return `あなたは食事写真の「視覚的食品抽出器」です。栄養値や量の確定は別システムと人間が行います。画像から直接見える事実だけをJSONで返してください。

厳守:
1. 弁当・定食・ワンプレートは全体名だけで終わらず、視覚的に区別できる食品をできる限り個別列挙する。野菜・漬物・卵・副菜も拾う。
2. 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。ツナ・鮭・梅などにしない。
3. 食品名は画像だけで言える最も一般的で安全な日本語名にする。唐揚げか焼き物か断定できなければ「鶏料理」とし、ambiguityに候補を書く。
4. visibleCountは「画面上で独立した個体数を数えられる食品」だけに使う。数えにくい、重なる、切断される場合はnull。数は回答前にもう一度数え直す。
5. 重量g、ml、カロリー、P/F/C、油量、調味料量、1本=何g等は絶対に推測しない。
6. confidenceは食品名そのものの視覚的確信度だけ。0.95以上は形状が非常に明白な場合だけ。ただしアプリはこの数値を確定判定には使わない。
7. variantVisible/countCertain等の安全判断フラグは返さない。安全判定はアプリ側で行う。
8. 食品でない画像ならfoods=[]。説明文、Markdown、[DATA]、[UNKNOWN]は禁止。JSONだけ返す。

例:
{"dishName":"お弁当","uncertain":true,"foods":[{"name":"おにぎり","confidence":0.96,"visibleCount":3,"ambiguity":"","note":"具は見えない"},{"name":"鶏料理","confidence":0.76,"visibleCount":2,"ambiguity":"唐揚げまたは焼き物","note":""},{"name":"卵焼き","confidence":0.9,"visibleCount":3,"ambiguity":"","note":""},{"name":"にんじん","confidence":0.9,"visibleCount":null,"ambiguity":"","note":"少量の副菜"}]}

最大${MAX_FOODS}食品。画像全体を確認→食品を列挙→個数を再確認、の順でJSONだけ返してください。`;
  }

  async function identifyDish(base64) {
    const payload = { taskType:'image', modelPreference:MODEL, contents:[{parts:[{text:identityPrompt()}]}], imageBase64:base64 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint(), { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(payload), signal:controller.signal });
      if (!response.ok) throw new Error(`画像AI HTTP ${response.status}`);
      const data = await response.json();
      const parsed = parseIdentityResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
      if (!parsed) throw new Error('食品候補を読み取れませんでした');
      return parsed;
    } finally { clearTimeout(timer); }
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
    modal('料理写真を判定中','<div class="dish-v30-loading"><span></span><b>Gemini 3.5 Flash-Liteで食品を確認しています</b></div><div class="dish-v30-note">種類・個数は候補として扱い、量や栄養値を写真だけで確定しません。</div>');
    try {
      const identity = await identifyDish(await compressImage(file));
      if (!identity.foods.length) throw new Error('食べ物として認識できませんでした');
      showMatches(identity);
    } catch (error) {
      const host = modal('判定できませんでした', `<div class="dish-v30-message">${esc(error?.message || '料理写真の判定に失敗しました')}</div><button class="dish-v30-primary" id="dish-v30-retry">写真を選び直す</button>`);
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
    identityOnly:true,
    nutritionFromAI:false,
    conservativeVisual:true,
    genericToSpecificBlocked:true,
    visibleCount:true,
    aiAmountAutoApplied:false,
    aiVariantFlagsTrusted:false,
    requiresUserAmount:true,
    cameraRoll:true,
    camera:true,
    parseIdentityResponse,
    isUnsafeSpecificMatch,
    resolveFood,
    resolveFoods,
    identifyDish,
    choosePhotoSource,
    selectPhoto,
    install
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
