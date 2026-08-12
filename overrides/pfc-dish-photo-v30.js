// PFC Mirror V3.0: dish-photo input only. Barcode/OCR paths are intentionally removed.
(() => {
  'use strict';

  const VERSION = '3.0.0';
  const MODEL = 'gemini31-lite';
  const MAX_SIDE = 1024;
  const JPEG_QUALITY = 0.82;
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function parseIdentityResponse(raw) {
    const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
    let data;
    try { data = JSON.parse(text); } catch { return null; }
    const source = Array.isArray(data) ? data : data?.foods;
    if (!Array.isArray(source)) return null;
    const seen = new Set();
    const foods = [];
    for (const item of source) {
      const name = String(typeof item === 'string' ? item : item?.name || '').trim();
      if (!name || name.length > 40) continue;
      const key = name.normalize('NFKC').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      foods.push({
        name,
        confidence: Math.max(0, Math.min(1, num(typeof item === 'object' ? item.confidence : 0.5))),
        note: String(typeof item === 'object' ? item.note || '' : '').slice(0, 80)
      });
      if (foods.length >= 6) break;
    }
    return { foods, dishName: String(data?.dishName || '').slice(0,80), uncertain: !!data?.uncertain };
  }

  function resolveFood(name) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function') return null;
    const best = search(name, 6).find(x => x?.source === 'db');
    if (!best || Number(best.score || 0) < 2000) return null;
    return best;
  }

  function resolveFoods(identity) {
    return (identity?.foods || []).map(ai => {
      const match = resolveFood(ai.name);
      if (!match) return { ai, match: null };
      const meta = match.meta || window.__PFC_DB_V3__?.get?.(match.index);
      if (!meta) return { ai, match: null };
      const amount = Number(meta.input?.defaultAmount || meta.nutritionBasis?.amount || 1);
      return { ai, match, meta, amount };
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
      <div class="dish-v30-note">AIは食品名だけを判定します。P/F/C/kcalはFood Masterの値を使います。</div>`);
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
    return `あなたは食事写真の食品名識別専用です。画像に見える食品・料理を、日本の食事管理DBで検索しやすい一般的な日本語名に分解してください。\n\n絶対ルール:\n- カロリー、P/F/C、重量g、栄養値を推測・出力しない。\n- 量は確定しない。\n- 食品でない画像なら foods を空配列にする。\n- [DATA] や [UNKNOWN] は出力しない。\n- 説明文・Markdownは禁止。JSONだけ返す。\n- 料理全体としてDBにありそうなら料理名を優先し、明確に別食品が添えられている場合だけ分ける。\n\n形式:\n{"dishName":"料理名または空文字","uncertain":false,"foods":[{"name":"白米","confidence":0.92,"note":""}]}\n最大6食品。`;
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

  function showMatches(identity) {
    const matched = resolveFoods(identity).filter(x => x.match);
    if (!matched.length) {
      const host = modal('Food Master候補なし','<div class="dish-v30-message">食品名は判定できましたが、Food Masterに十分強く一致する候補がありませんでした。</div><button class="dish-v30-primary" id="dish-v30-close-result">閉じる</button>');
      host.querySelector('#dish-v30-close-result').onclick = () => host.classList.remove('show');
      return;
    }
    const cards = matched.map((row,i) => {
      const unit = row.meta.input?.defaultUnit || row.meta.nutritionBasis?.unit || '食';
      return `<label class="dish-v30-card" data-row="${i}"><div class="dish-v30-card-head"><input class="dish-v30-check" type="checkbox" checked><div><b>${esc(row.match.name)}</b><small>AI判定: ${esc(row.ai.name)} · ${Math.round(row.ai.confidence*100)}%</small></div></div><div class="dish-v30-amount"><input class="dish-v30-amount-input" type="number" min="0.1" step="0.1" value="${row.amount}"><span>${esc(unit)}</span></div><div class="dish-v30-pfc">${esc(nutritionPreview(row))}</div></label>`;
    }).join('');
    const host = modal('Food Masterで確認', `${identity.dishName?`<div class="dish-v30-badge">AI判定: ${esc(identity.dishName)}</div>`:''}${cards}<div class="dish-v30-note">写真から量は確定しません。実際に食べた量へ直してください。</div><button class="dish-v30-primary" id="dish-v30-add">選択した食品を追加</button>`);
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
        if (record) { record._photoAI = { version:VERSION, identityOnly:true, model:MODEL, aiName:row.ai.name, visualConfidence:row.ai.confidence }; records.push(record); }
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
    modal('料理写真を判定中','<div class="dish-v30-loading"><span></span><b>食品名を確認しています</b></div><div class="dish-v30-note">AIには食品名だけを判定させています。</div>');
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

  window.__PFC_DISH_PHOTO_V30__ = { version:VERSION, model:MODEL, identityOnly:true, nutritionFromAI:false, cameraRoll:true, camera:true, parseIdentityResponse, resolveFoods, identifyDish, choosePhotoSource, selectPhoto, install };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
