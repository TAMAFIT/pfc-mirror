// PFC Mirror D9: dish-photo identity only. AI never supplies nutrition values.
(() => {
  'use strict';

  const VERSION = '2.9.0';
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
        note: String(typeof item === 'object' ? item.note || item.amountHint || '' : '').slice(0,80)
      });
      if (foods.length >= 6) break;
    }
    if (!foods.length) return null;
    return { foods, dishName: String(data?.dishName || '').slice(0,80), uncertain: !!data?.uncertain };
  }

  function resolveFood(name) {
    const search = window.__PFC_DB_V3_SEARCH__?.search;
    if (typeof search !== 'function') return null;
    const hits = search(name, 6).filter(x => x?.source === 'db');
    const best = hits[0];
    if (!best || Number(best.score || 0) < 2000) return null;
    return best;
  }

  function resolveFoods(identity) {
    return (identity?.foods || []).map(ai => {
      const match = resolveFood(ai.name);
      if (!match) return { ai, match: null, amount: null, choices: [] };
      const meta = match.meta || window.__PFC_DB_V3__?.get?.(match.index);
      if (!meta) return { ai, match: null, amount: null, choices: [] };
      const amount = Number(meta.input?.defaultAmount || meta.nutritionBasis?.amount || 1);
      const choices = window.__PFC_DB_V3__?.amountChoices?.(match.index) || [];
      return { ai, match, meta, amount, choices };
    });
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
      const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.drawImage(img,0,0,width,height);
      return stripDataUrl(canvas.toDataURL('image/jpeg',JPEG_QUALITY));
    } finally { URL.revokeObjectURL(url); }
  }

  function endpoint() {
    try { if (typeof gasUrl !== 'undefined' && gasUrl) return gasUrl; } catch {}
    return 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
  }

  function identityPrompt() {
    return `あなたは食事写真の「食品名識別」専用です。画像に見える食品・料理を、日本の食事管理DBで検索しやすい一般的な日本語名に分解してください。\n\n絶対ルール:\n- カロリー、P/F/C、重量g、栄養値を推測・出力しない。\n- 量は確定しない。見た目の補足はnoteに短く書く程度。\n- 食品でない画像なら foods を空配列にする。\n- [DATA] や [UNKNOWN] は絶対に出力しない。\n- 説明文・Markdownは禁止。JSONだけ返す。\n- 料理全体としてDBにありそうなら料理名を優先し、明確に別食品が添えられている場合だけ分ける。\n\n形式:\n{"dishName":"料理名または空文字","uncertain":false,"foods":[{"name":"白米","confidence":0.92,"note":""}]}\n最大6食品。`;
  }

  async function identifyDish(base64) {
    const payload = {
      taskType: 'image',
      modelPreference: MODEL,
      contents: [{ parts: [{ text: identityPrompt() }] }],
      imageBase64: base64
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(endpoint(), { method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(payload), signal:controller.signal });
      if (!response.ok) throw new Error(`画像AI HTTP ${response.status}`);
      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseIdentityResponse(raw);
      if (!parsed) throw new Error('食品候補をJSONとして読み取れませんでした');
      return parsed;
    } finally { clearTimeout(timer); }
  }

  function modal(title, html) {
    const api = window.__PFC_SCAN_V28__;
    const host = document.getElementById('pfc-scan-v28-modal');
    if (!host) {
      api?.selectOcrPhoto?.();
      return null;
    }
    host.querySelector('#scan-v28-title').textContent = title;
    host.querySelector('#scan-v28-body').innerHTML = html;
    host.classList.add('show');
    return host;
  }

  function showModeChooser() {
    const host = modal('写真から追加', `
      <div class="dish-v29-choice-grid">
        <button type="button" id="dish-v29-label"><b>栄養表示</b><span>ラベルのP/F/C/kcalを端末内OCR</span></button>
        <button type="button" id="dish-v29-food"><b>料理写真</b><span>AIは食品名だけ判定。栄養値はFood Master</span></button>
      </div>
      <div class="scan-v28-note">栄養表示OCRは画像をAIへ送りません。料理写真だけ既存のGemini APIへ送信します。</div>`);
    if (!host) return;
    host.querySelector('#dish-v29-label').onclick = () => { host.classList.remove('show'); window.__PFC_SCAN_V28__?.selectOcrPhoto?.(); };
    host.querySelector('#dish-v29-food').onclick = () => { host.classList.remove('show'); selectDishPhoto(); };
  }

  function selectDishPhoto() {
    let input=document.getElementById('dish-v29-file');
    if(!input){
      input=document.createElement('input'); input.id='dish-v29-file'; input.type='file'; input.accept='image/*'; input.capture='environment'; input.hidden=true; document.body.appendChild(input);
      input.onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(file) await runDishPhoto(file);};
    }
    input.click();
  }

  function nutritionPreview(row) {
    const scaled=window.__PFC_DB_V3__?.scale?.(row.match.index,Number(row.amount));
    return scaled ? `${scaled.kcal} kcal · P ${scaled.p} / F ${scaled.f} / C ${scaled.c}` : '';
  }

  function showMatches(identity) {
    const rows=resolveFoods(identity);
    const matched=rows.filter(x=>x.match);
    if(!matched.length){
      const host=modal('Food Master候補なし','<div class="scan-v28-message">写真から食品名候補は取得できましたが、Food Masterに十分強く一致する食品がありませんでした。検索から手動で選んでください。</div><button class="scan-v28-primary" id="dish-v29-close">閉じる</button>');
      host?.querySelector('#dish-v29-close')?.addEventListener('click',()=>host.classList.remove('show'));
      return;
    }
    const cards=matched.map((row,i)=>{
      const meta=row.meta; const unit=meta.input?.defaultUnit || meta.nutritionBasis?.unit || '食';
      return `<label class="dish-v29-card" data-row="${i}"><div class="dish-v29-card-head"><input class="dish-v29-check" type="checkbox" checked><div><b>${esc(row.match.name)}</b><small>AI: ${esc(row.ai.name)} · ${Math.round(row.ai.confidence*100)}%</small></div></div><div class="dish-v29-amount"><input class="dish-v29-amount-input" type="number" min="0.1" step="0.1" value="${row.amount}"><span>${esc(unit)}</span></div><div class="dish-v29-pfc">${esc(nutritionPreview(row))}</div>${row.ai.note?`<small class="dish-v29-note">${esc(row.ai.note)}</small>`:''}</label>`;
    }).join('');
    const host=modal('Food Masterで確認',`${identity.dishName?`<div class="scan-v28-source">AI判定: ${esc(identity.dishName)}</div>`:''}${cards}<div class="scan-v28-note">量は写真から確定していません。実際に食べた量へ直してください。</div><button class="scan-v28-primary" id="dish-v29-add">選択した食品を追加</button>`);
    if(!host)return;
    host.querySelectorAll('.dish-v29-card').forEach((card,i)=>{
      const input=card.querySelector('.dish-v29-amount-input');
      input.oninput=()=>{matched[i].amount=Math.max(0.1,num(input.value));card.querySelector('.dish-v29-pfc').textContent=nutritionPreview(matched[i]);};
    });
    host.querySelector('#dish-v29-add').onclick=()=>{
      const records=[];
      host.querySelectorAll('.dish-v29-card').forEach((card,i)=>{
        if(!card.querySelector('.dish-v29-check').checked)return;
        const row=matched[i]; const amount=Math.max(0.1,num(card.querySelector('.dish-v29-amount-input').value));
        const record=window.__PFC_DB_V3__?.buildRecord?.(row.match.index,amount);
        if(record){record._photoAI={version:VERSION,identityOnly:true,model:MODEL,aiName:row.ai.name,visualConfidence:row.ai.confidence};records.push(record);}
      });
      if(!records.length)return;
      if(typeof lst==='undefined'||!Array.isArray(lst))return;
      lst.push(...records);
      if(typeof sv==='function')sv(); if(typeof ren==='function')ren(); if(typeof upd==='function')upd();
      if(typeof showToast==='function')showToast(`${records.length}件をFood Masterから追加しました`);
      host.classList.remove('show');
    };
  }

  async function runDishPhoto(file) {
    if(busy)return; busy=true;
    modal('料理写真を判定中','<div class="scan-v28-loading"><span></span><b>食品名を確認しています</b></div><div class="scan-v28-note">AIには食品名だけを判定させています。P/F/C/kcalはAIから採用しません。</div>');
    try {
      const base64=await compressImage(file);
      const identity=await identifyDish(base64);
      if(!identity.foods.length)throw new Error('食べ物として認識できませんでした');
      showMatches(identity);
    } catch(error) {
      const host=modal('判定できませんでした',`<div class="scan-v28-message">${esc(error?.message||'料理写真の判定に失敗しました')}</div><button class="scan-v28-primary" id="dish-v29-retry">撮り直す</button>`);
      host?.querySelector('#dish-v29-retry')?.addEventListener('click',()=>{host.classList.remove('show');selectDishPhoto();});
    } finally { busy=false; }
  }

  function install() {
    const button=document.getElementById('scan-v28-photo');
    if(!button)return;
    button.onclick=showModeChooser;
    button.setAttribute('aria-label','写真から食品を追加');
    document.documentElement.classList.add('pfc-dish-photo-v29');
  }

  window.__PFC_DISH_PHOTO_V29__={version:VERSION,model:MODEL,identityOnly:true,nutritionFromAI:false,parseIdentityResponse,resolveFoods,identifyDish,showModeChooser,selectDishPhoto,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
