// PFC Mirror V3.1: Gemini 3.5 Flash-Lite dish-photo identity with conservative visual rules.
(() => {
  'use strict';

  const VERSION = '3.1.0';
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
        countCertain: object.countCertain === true,
        variantVisible: object.variantVisible === true,
        ambiguity: String(object.ambiguity || '').trim().slice(0, 80),
        note: String(object.note || '').trim().slice(0, 80)
      };
      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.confidence = Math.max(existing.confidence, parsed.confidence);
        if (parsed.countCertain && parsed.visibleCount) {
          existing.visibleCount = parsed.visibleCount;
          existing.countCertain = true;
        }
        existing.variantVisible = existing.variantVisible || parsed.variantVisible;
        if (!existing.ambiguity && parsed.ambiguity) existing.ambiguity = parsed.ambiguity;
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

  function isUnsafeSpecificMatch(ai, result) {
    if (!ai || !result) return true;
    const candidate = String(result.name || result.meta?.name || '');
    const q = norm(ai.name);
    const c = norm(candidate);
    if (!q || !c) return true;
    if (q === c) return false;

    // Example: AI can only see "おにぎり", but search ranks "おにぎり(ツナ)".
    // Never infer an invisible filling/flavor/variant from the database ranking.
    const candidateBase = baseName(candidate);
    if (!ai.variantVisible && candidateBase === q && c !== q) return true;

    // Parenthetical variants are considered specific unless AI explicitly saw the variant.
    if (!ai.variantVisible && /[（(].+[)）]/.test(candidate) && c.includes(q)) return true;
    return false;
  }

  function resolveFood(ai) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function' || !ai?.name) return null;
    const hits = search(ai.name, 8).filter(x => x?.source === 'db' && Number(x.score || 0) >= 2000);
    return hits.find(hit => !isUnsafeSpecificMatch(ai, hit)) || null;
  }

  function resolveFoods(identity) {
    return (identity?.foods || []).map(ai => {
      const match = resolveFood(ai);
      if (!match) return { ai, match:null, reason:'no-safe-match' };
      const meta = match.meta || window.__PFC_DB_V3__?.get?.(match.index);
      if (!meta) return { ai, match:null, reason:'no-meta' };
      const defaultAmount = Number(meta.input?.defaultAmount || meta.nutritionBasis?.amount || 1);
      const unit = String(meta.input?.defaultUnit || meta.nutritionBasis?.unit || '');
      const countApplied = !!(ai.countCertain && ai.visibleCount && COUNT_UNITS.test(unit));
      const amount = countApplied ? defaultAmount * ai.visibleCount : defaultAmount;
      return { ai, match, meta, amount, countApplied };
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
      <div class="dish-v30-note">Gemini 3.5 Flash-Liteは見えている食品名と個数だけを判定し、P/F/C/kcalはFood Masterから取得します。</div>`);
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
    return `あなたは食事写真を監査する「視覚的食品識別器」です。栄養計算は別システムが行うため、画像から直接確認できる食品の同定だけをしてください。

最重要原則:
1. 見えていない情報を補完しない。具・味・肉の部位・ソース・調理法は視覚的証拠がある場合だけ具体化する。
2. 例えば具が見えないおにぎりは必ず「おにぎり」。ツナ・鮭・梅などを推測しない。variantVisible=false。
3. 弁当・定食・ワンプレートは「弁当」だけで終わらず、視覚的に区別できる食べ物を可能な限り個別列挙する。野菜・漬物・卵・副菜も食べられる物なら拾う。
4. 同じ食品が複数個はっきり見える場合だけvisibleCountで数える。重なり等で個数を確定できなければvisibleCount=null,countCertain=false。
5. 重量g、カロリー、P/F/C、油量、調味料量は絶対に推測・出力しない。
6. 唐揚げか照り焼き等を断定できない場合は、最も安全な一般名（例「鶏料理」）をnameにし、ambiguityに候補を書く。無理に高confidenceにしない。
7. confidenceは「その食品名が画像から直接確認できる確信度」。隠れた属性への自信ではない。0.95以上は視覚的にほぼ明白な場合だけ。
8. 飾りや容器は除外。食品でない画像ならfoods=[]。
9. 説明文・Markdown・[DATA]・[UNKNOWN]は禁止。JSONだけ返す。

例A: 具が見えないおにぎりが3個見える
{"dishName":"お弁当","uncertain":false,"foods":[{"name":"おにぎり","confidence":0.98,"visibleCount":3,"countCertain":true,"variantVisible":false,"ambiguity":"","note":"具は見えない"}]}

例B: 鶏肉の調理法が断定できない
{"dishName":"お弁当","uncertain":true,"foods":[{"name":"鶏料理","confidence":0.72,"visibleCount":2,"countCertain":true,"variantVisible":false,"ambiguity":"唐揚げまたは焼き物","note":""}]}

返却形式:
{"dishName":"料理全体の一般名または空文字","uncertain":false,"foods":[{"name":"白米","confidence":0.92,"visibleCount":1,"countCertain":true,"variantVisible":false,"ambiguity":"","note":""}]}

最大${MAX_FOODS}食品。画像全体を一度見た後、見落としがないか再確認してからJSONを返してください。`;
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
    const scaled = window.__PFC_DB_V3__?.scale?.(row.match.index, Number(row.amount));
    return scaled ? `${scaled.kcal} kcal · P ${scaled.p} / F ${scaled.f} / C ${scaled.c}` : '';
  }

  function aiMetaText(ai) {
    const parts = [`AI: ${ai.name}`, `${Math.round(ai.confidence*100)}%`];
    if (ai.visibleCount) parts.push(ai.countCertain ? `見える個数 ${ai.visibleCount}` : `個数候補 ${ai.visibleCount}`);
    if (ai.ambiguity) parts.push(`不確実: ${ai.ambiguity}`);
    return parts.join(' · ');
  }

  function showMatches(identity) {
    const resolved = resolveFoods(identity);
    const matched = resolved.filter(x => x.match);
    const unmatched = resolved.filter(x => !x.match);
    if (!matched.length) {
      const names = unmatched.map(x => `${esc(x.ai.name)}${x.ai.visibleCount ? ` ×${x.ai.visibleCount}` : ''}`).join('、');
      const host = modal('Food Master候補なし', `<div class="dish-v30-message">AIは ${names || '食品'} を認識しましたが、具体的な具・種類を勝手に補完せず、安全に一致するFood Master食品がありませんでした。</div><button class="dish-v30-primary" id="dish-v30-close-result">閉じる</button>`);
      host.querySelector('#dish-v30-close-result').onclick = () => host.classList.remove('show');
      return;
    }

    const cards = matched.map((row,i) => {
      const unit = row.meta.input?.defaultUnit || row.meta.nutritionBasis?.unit || '食';
      return `<label class="dish-v30-card" data-row="${i}"><div class="dish-v30-card-head"><input class="dish-v30-check" type="checkbox" checked><div><b>${esc(row.match.name)}</b><small>${esc(aiMetaText(row.ai))}</small></div></div><div class="dish-v30-amount"><input class="dish-v30-amount-input" type="number" min="0.1" step="0.1" value="${row.amount}"><span>${esc(unit)}</span></div><div class="dish-v30-pfc">${esc(nutritionPreview(row))}</div>${row.countApplied?'<small class="dish-v30-note">見えている個数を初期値へ反映しました。実際の量を確認してください。</small>':''}</label>`;
    }).join('');
    const unmatchedHtml = unmatched.length ? `<div class="dish-v30-message"><b>安全一致しなかった食品</b><br>${unmatched.map(x => `${esc(x.ai.name)}${x.ai.visibleCount?` ×${x.ai.visibleCount}`:''}`).join('、')}<br><small>具や種類が見えない食品を、Food Masterの特定バリエーションへ勝手に変換しません。</small></div>` : '';
    const host = modal('Food Masterで確認', `${identity.dishName?`<div class="dish-v30-badge">AI判定: ${esc(identity.dishName)}</div>`:''}${cards}${unmatchedHtml}<div class="dish-v30-note">個数は見えている場合のみ初期値へ反映します。重量は写真から確定しません。</div><button class="dish-v30-primary" id="dish-v30-add">選択した食品を追加</button>`);
    host.querySelectorAll('.dish-v30-card').forEach((card,i) => {
      const input = card.querySelector('.dish-v30-amount-input');
      input.oninput = () => { matched[i].amount = Math.max(0.1,num(input.value)); card.querySelector('.dish-v30-pfc').textContent = nutritionPreview(matched[i]); };
    });
    host.querySelector('#dish-v30-add').onclick = () => {
      const records = [];
      host.querySelectorAll('.dish-v30-card').forEach((card,i) => {
        if (!card.querySelector('.dish-v30-check').checked) return;
        const row = matched[i];
        const amount = Math.max(0.1, num(card.querySelector('.dish-v30-amount-input').value));
        const record = window.__PFC_DB_V3__?.buildRecord?.(row.match.index, amount);
        if (record) {
          record._photoAI = {
            version:VERSION,
            identityOnly:true,
            model:MODEL,
            aiName:row.ai.name,
            visualConfidence:row.ai.confidence,
            visibleCount:row.ai.visibleCount,
            countCertain:row.ai.countCertain,
            variantVisible:row.ai.variantVisible,
            ambiguity:row.ai.ambiguity || ''
          };
          records.push(record);
        }
      });
      if (!records.length || typeof lst === 'undefined' || !Array.isArray(lst)) return;
      lst.push(...records);
      if (typeof sv === 'function') sv();
      if (typeof ren === 'function') ren();
      if (typeof upd === 'function') upd();
      if (typeof showToast === 'function') showToast(`${records.length}件をFood Masterから追加しました`);
      host.classList.remove('show');
    };
  }

  async function runDishPhoto(file) {
    if (busy) return;
    busy = true;
    modal('料理写真を判定中','<div class="dish-v30-loading"><span></span><b>Gemini 3.5 Flash-Liteで確認しています</b></div><div class="dish-v30-note">見えていない具・味・重量は推測させません。</div>');
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
