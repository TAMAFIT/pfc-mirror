// PFC Mirror D8: free barcode + nutrition-label OCR input.
(() => {
  'use strict';

  const VERSION = '2.8.0';
  const ZXING_URL = 'https://unpkg.com/@zxing/browser@0.2.1';
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const OFF_API = 'https://world.openfoodfacts.org/api/v2/product/';
  const CACHE_PREFIX = 'scan:v28:barcode:';
  let scannerControls = null;
  let barcodeBusy = false;

  const n = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const round1 = value => Math.round(n(value) * 10) / 10;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalizeDigits(value) {
    return String(value ?? '').normalize('NFKC').replace(/[^0-9]/g, '');
  }

  function validChecksum(code) {
    const s = normalizeDigits(code);
    if (![8,12,13].includes(s.length)) return false;
    const body = s.slice(0, -1).split('').map(Number);
    const check = Number(s.at(-1));
    let sum = 0;
    if (s.length === 13 || s.length === 8) {
      for (let i = 0; i < body.length; i++) sum += body[i] * ((body.length - i) % 2 === 1 ? 3 : 1);
    } else {
      for (let i = 0; i < body.length; i++) sum += body[i] * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10 === check;
  }

  function parseServingGrams(value) {
    const s = String(value ?? '').normalize('NFKC');
    const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*g\b/i);
    return m ? Number(m[1]) : null;
  }

  function firstFinite(...values) {
    for (const value of values) if (Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function mapOpenFoodFactsProduct(payload, barcode) {
    const product = payload?.product;
    if (!product || payload?.status === 0) return null;
    const nu = product.nutriments || {};
    const per100 = {
      p: firstFinite(nu.proteins_100g, nu.proteins),
      f: firstFinite(nu.fat_100g, nu.fat),
      c: firstFinite(nu.carbohydrates_100g, nu.carbohydrates),
      kcal: firstFinite(nu['energy-kcal_100g'], nu['energy-kcal'])
    };
    if (Object.values(per100).some(v => v === null)) return null;
    const servingGrams = parseServingGrams(product.serving_size);
    return {
      barcode: normalizeDigits(barcode || product.code),
      name: String(product.product_name_ja || product.product_name || '商品名不明').trim(),
      brand: String(product.brands || '').trim(),
      quantity: String(product.quantity || '').trim(),
      servingSize: String(product.serving_size || '').trim(),
      servingGrams,
      basisAmount: 100,
      basisUnit: 'g',
      nutrition: { p: n(per100.p), f: n(per100.f), c: n(per100.c), a: 0, kcal: n(per100.kcal) },
      source: { kind: 'open-food-facts', confidence: 'medium', label: 'Open Food Facts', barcode: normalizeDigits(barcode || product.code) }
    };
  }

  function normalizeOcrText(text) {
    return String(text ?? '').normalize('NFKC')
      .replace(/[，,]/g, '.')
      .replace(/[：]/g, ':')
      .replace(/[Oo](?=\d)/g, '0')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function captureNumber(text, labels, unitPattern) {
    for (const label of labels) {
      const re = new RegExp(`${label}[^0-9]{0,24}([0-9]+(?:\\.[0-9]+)?)\\s*${unitPattern}`, 'i');
      const hit = text.match(re);
      if (hit) return Number(hit[1]);
    }
    return null;
  }

  function parseNutritionLabelText(rawText) {
    const text = normalizeOcrText(rawText);
    const kcal = captureNumber(text, ['エネルギー','熱量','calories?','energy'], 'k?cal');
    const p = captureNumber(text, ['たんぱく質','タンパク質','蛋白質','protein'], 'g');
    const f = captureNumber(text, ['脂質','fat'], 'g');
    const c = captureNumber(text, ['炭水化物','carbohydrate(?:s)?'], 'g');
    if ([kcal,p,f,c].some(v => v === null)) return null;

    let basisAmount = 1;
    let basisUnit = '食';
    let basisLabel = '1食当たり';
    const hundred = text.match(/100\s*(g|ml)\s*(?:当たり|あたり|per)/i);
    const counted = text.match(/(?:1\s*)?(個|食|包装|袋|本|パック|カップ)\s*(?:\(([0-9.]+)\s*g\))?\s*(?:当たり|あたり|per)/i);
    if (hundred) {
      basisAmount = 100;
      basisUnit = hundred[1].toLowerCase();
      basisLabel = `100${basisUnit}当たり`;
    } else if (counted) {
      basisAmount = 1;
      basisUnit = counted[1];
      basisLabel = `1${basisUnit}当たり`;
    }
    const grams = parseServingGrams(text.match(/(?:1\s*)?(?:個|食|包装|袋|本|パック|カップ)[^当]{0,20}/)?.[0] || '');
    return {
      name: '栄養表示から登録',
      basisAmount,
      basisUnit,
      basisLabel,
      servingGrams: grams,
      nutrition: { p, f, c, a: 0, kcal },
      source: { kind: 'label-ocr', confidence: 'medium', label: '栄養成分表示 OCR' },
      rawText: rawText
    };
  }

  function scaleCandidate(candidate, amount) {
    const m = n(amount) / Math.max(0.0001, n(candidate?.basisAmount) || 1);
    const nu = candidate?.nutrition || {};
    return {
      p: round1(n(nu.p) * m), f: round1(n(nu.f) * m), c: round1(n(nu.c) * m), a: round1(n(nu.a) * m), kcal: Math.round(n(nu.kcal) * m)
    };
  }

  function buildLogRecord(candidate, amount, displayName) {
    const scaled = scaleCandidate(candidate, amount);
    const unit = candidate?.basisUnit || '食';
    const name = String(displayName || candidate?.name || 'スキャン食品').trim();
    return {
      id: Date.now(), N: `${name}(${amount}${unit})`, P: scaled.p, F: scaled.f, C: scaled.c, A: scaled.a, Cal: scaled.kcal,
      U: `${candidate?.basisAmount || 1}${unit}`, time: typeof getAutoTime === 'function' ? getAutoTime() : '昼',
      _scan: { version: VERSION, source: candidate?.source?.kind || 'scan', confidence: candidate?.source?.confidence || 'medium', barcode: candidate?.barcode || null }
    };
  }

  function addRecord(record) {
    if (!record || typeof lst === 'undefined' || !Array.isArray(lst)) throw new Error('PFC log is unavailable');
    lst.push(record);
    if (typeof sv === 'function') sv();
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
    if (typeof showToast === 'function') showToast(`${record.N}を追加しました`);
  }

  function storage() { return window.mirrorStorage || window.localStorage; }
  function cacheGet(code) {
    try { return JSON.parse(storage().getItem(CACHE_PREFIX + code) || 'null'); } catch { return null; }
  }
  function cacheSet(code, value) {
    try { storage().setItem(CACHE_PREFIX + code, JSON.stringify({ ...value, cachedAt: Date.now() })); } catch {}
  }

  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-pfc-lib="${globalName}"]`);
      if (existing) { existing.addEventListener('load', () => resolve(window[globalName]), { once: true }); return; }
      const script = document.createElement('script');
      script.src = src; script.async = true; script.dataset.pfcLib = globalName;
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(`${globalName} not available`));
      script.onerror = () => reject(new Error(`${globalName} load failed`));
      document.head.appendChild(script);
    });
  }

  function ensureModal() {
    let modal = document.getElementById('pfc-scan-v28-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pfc-scan-v28-modal';
    modal.className = 'scan-v28-modal';
    modal.innerHTML = '<div class="scan-v28-sheet"><div class="scan-v28-head"><strong id="scan-v28-title">スキャン</strong><button type="button" id="scan-v28-close" aria-label="閉じる">×</button></div><div id="scan-v28-body"></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#scan-v28-close').onclick = closeModal;
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    return modal;
  }

  function openModal(title, html) {
    const modal = ensureModal();
    modal.querySelector('#scan-v28-title').textContent = title;
    modal.querySelector('#scan-v28-body').innerHTML = html;
    modal.classList.add('show');
    return modal;
  }

  function stopScanner() {
    try { scannerControls?.stop?.(); } catch {}
    scannerControls = null; barcodeBusy = false;
    const video = document.getElementById('scan-v28-video');
    try { video?.srcObject?.getTracks?.().forEach(t => t.stop()); } catch {}
  }
  function closeModal() { stopScanner(); document.getElementById('pfc-scan-v28-modal')?.classList.remove('show'); }

  function renderError(message, extra = '') {
    openModal('読み取りできませんでした', `<div class="scan-v28-message">${esc(message)}</div>${extra}<button class="scan-v28-primary" id="scan-v28-retry">閉じる</button>`);
    document.getElementById('scan-v28-retry').onclick = closeModal;
  }

  async function lookupBarcode(rawCode) {
    const code = normalizeDigits(rawCode);
    if (!validChecksum(code)) throw new Error('JAN/EAN/UPCコードとして確認できませんでした');
    const cached = cacheGet(code);
    if (cached?.candidate) return { ...cached.candidate, source: { ...(cached.candidate.source || {}), cached: true } };
    const fields = 'code,product_name,product_name_ja,brands,quantity,serving_size,nutriments';
    const response = await fetch(`${OFF_API}${encodeURIComponent(code)}.json?fields=${encodeURIComponent(fields)}`, { mode: 'cors' });
    if (!response.ok) throw new Error(`商品DBへの問い合わせに失敗しました (${response.status})`);
    const payload = await response.json();
    const candidate = mapOpenFoodFactsProduct(payload, code);
    if (!candidate) throw new Error('このコードの商品にP/F/C/kcalデータが見つかりませんでした');
    cacheSet(code, { candidate });
    return candidate;
  }

  function showCandidate(candidate) {
    stopScanner();
    const amount = candidate.servingGrams || candidate.basisAmount || 100;
    const scaled = scaleCandidate(candidate, amount);
    const sourceText = candidate.source?.kind === 'open-food-facts' ? 'Open Food Facts（公式未確認）' : '栄養成分表示OCR（要確認）';
    const modal = openModal('内容を確認', `
      <div class="scan-v28-source">${esc(sourceText)}</div>
      <label class="scan-v28-field">食品名<input id="scan-v28-name" value="${esc(candidate.name)}"></label>
      <label class="scan-v28-field">量<div class="scan-v28-amount-row"><input id="scan-v28-amount" type="number" min="0.1" step="0.1" value="${amount}"><span>${esc(candidate.basisUnit)}</span></div></label>
      <div class="scan-v28-nutrition" id="scan-v28-nutrition"><b>${scaled.kcal} kcal</b><span>P ${scaled.p}g</span><span>F ${scaled.f}g</span><span>C ${scaled.c}g</span></div>
      ${candidate.brand ? `<div class="scan-v28-note">${esc(candidate.brand)}${candidate.quantity ? ` · ${esc(candidate.quantity)}` : ''}</div>` : ''}
      <div class="scan-v28-note">数値を確認してから追加してください。</div>
      <button class="scan-v28-primary" id="scan-v28-add">この内容で追加</button>`);
    const amountInput = modal.querySelector('#scan-v28-amount');
    amountInput.oninput = () => {
      const x = scaleCandidate(candidate, amountInput.value);
      modal.querySelector('#scan-v28-nutrition').innerHTML = `<b>${x.kcal} kcal</b><span>P ${x.p}g</span><span>F ${x.f}g</span><span>C ${x.c}g</span>`;
    };
    modal.querySelector('#scan-v28-add').onclick = () => {
      const value = n(amountInput.value);
      if (value <= 0) return;
      const record = buildLogRecord(candidate, value, modal.querySelector('#scan-v28-name').value);
      addRecord(record); closeModal();
    };
  }

  async function processBarcode(code) {
    if (barcodeBusy) return;
    barcodeBusy = true;
    stopScanner(); barcodeBusy = true;
    openModal('商品を確認中', `<div class="scan-v28-loading"><span></span>JAN ${esc(code)} を照合しています</div>`);
    try { showCandidate(await lookupBarcode(code)); }
    catch (error) {
      const extra = '<button class="scan-v28-secondary" id="scan-v28-to-photo">栄養表示を写真で読む</button>';
      renderError(error.message || '商品を確認できませんでした', extra);
      const btn = document.getElementById('scan-v28-to-photo'); if (btn) btn.onclick = () => { closeModal(); selectOcrPhoto(); };
    }
  }

  async function startBarcode() {
    const modal = openModal('バーコード', `
      <video id="scan-v28-video" playsinline muted></video>
      <div class="scan-v28-guide"></div>
      <div class="scan-v28-note">JAN/EANコードを枠内に入れてください。</div>
      <div class="scan-v28-manual"><input id="scan-v28-code" inputmode="numeric" placeholder="コードを手入力"><button id="scan-v28-code-go">検索</button></div>
      <button class="scan-v28-secondary" id="scan-v28-code-image">画像からコードを読む</button>
      <input id="scan-v28-code-file" type="file" accept="image/*" capture="environment" hidden>`);
    modal.querySelector('#scan-v28-code-go').onclick = () => processBarcode(modal.querySelector('#scan-v28-code').value);
    modal.querySelector('#scan-v28-code-image').onclick = () => modal.querySelector('#scan-v28-code-file').click();
    modal.querySelector('#scan-v28-code-file').onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        const ZXing = await loadScript(ZXING_URL, 'ZXingBrowser');
        const reader = new ZXing.BrowserMultiFormatReader();
        const img = document.createElement('img'); img.src = URL.createObjectURL(file); await img.decode();
        const result = await reader.decodeFromImageElement(img); URL.revokeObjectURL(img.src); processBarcode(result.getText());
      } catch { renderError('画像からバーコードを読み取れませんでした'); }
    };
    try {
      const ZXing = await loadScript(ZXING_URL, 'ZXingBrowser');
      if (!modal.classList.contains('show')) return;
      const reader = new ZXing.BrowserMultiFormatReader();
      scannerControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, modal.querySelector('#scan-v28-video'), (result) => {
        if (result && !barcodeBusy) processBarcode(result.getText());
      });
    } catch (error) {
      const note = modal.querySelector('.scan-v28-note');
      if (note) note.textContent = 'カメラを開始できません。コード手入力または画像読取を使えます。';
    }
  }

  function selectOcrPhoto() {
    let input = document.getElementById('scan-v28-ocr-file');
    if (!input) {
      input = document.createElement('input'); input.id = 'scan-v28-ocr-file'; input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment'; input.hidden = true; document.body.appendChild(input);
      input.onchange = async e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) await runOcr(file); };
    }
    input.click();
  }

  async function runOcr(file) {
    openModal('栄養表示を読取中', '<div class="scan-v28-loading"><span></span><b id="scan-v28-progress">OCRを準備しています</b></div><div class="scan-v28-note">初回だけ日本語OCRデータの読み込みに時間がかかります。アプリの他のデータには影響しません。</div>');
    let worker;
    try {
      const Tesseract = await loadScript(TESSERACT_URL, 'Tesseract');
      worker = await Tesseract.createWorker('jpn+eng', 1, { logger: m => {
        const node = document.getElementById('scan-v28-progress');
        if (node && Number.isFinite(m.progress)) node.textContent = `OCR ${Math.round(m.progress * 100)}%`;
      }});
      const result = await worker.recognize(file);
      const parsed = parseNutritionLabelText(result?.data?.text || '');
      if (!parsed) {
        openModal('数値を確認', `<div class="scan-v28-message">P/F/C/kcalを自動抽出できませんでした。</div><textarea id="scan-v28-raw" rows="8">${esc(result?.data?.text || '')}</textarea><div class="scan-v28-note">写真を明るく、栄養成分表示を大きく撮ると改善します。</div><button class="scan-v28-primary" id="scan-v28-ocr-retry">撮り直す</button>`);
        document.getElementById('scan-v28-ocr-retry').onclick = () => { closeModal(); selectOcrPhoto(); };
      } else showCandidate(parsed);
    } catch (error) { renderError(error?.message || 'OCRに失敗しました'); }
    finally { try { await worker?.terminate?.(); } catch {} }
  }

  function install() {
    if (document.getElementById('scan-v28-actions')) return;
    const input = document.getElementById('s-inp');
    if (!input) return;
    const actions = document.createElement('div'); actions.id = 'scan-v28-actions'; actions.className = 'scan-v28-actions';
    actions.innerHTML = '<button type="button" id="scan-v28-barcode" aria-label="バーコードから食品を追加">コード</button><button type="button" id="scan-v28-photo" aria-label="栄養表示の写真から食品を追加">写真</button>';
    const host = input.closest('.search-box') || input.parentElement;
    host.insertAdjacentElement('afterend', actions);
    actions.querySelector('#scan-v28-barcode').onclick = startBarcode;
    actions.querySelector('#scan-v28-photo').onclick = selectOcrPhoto;
    document.documentElement.classList.add('pfc-scan-v28');
  }

  window.__PFC_SCAN_V28__ = {
    version: VERSION, localFirst: true, lazyLibraries: true,
    barcode: { zxing: '0.2.1', openFoodFactsFallback: true, validate: validChecksum, mapProduct: mapOpenFoodFactsProduct },
    ocr: { tesseract: '7.0.0', parseNutritionLabelText },
    parseServingGrams, scaleCandidate, buildLogRecord, lookupBarcode, startBarcode, selectOcrPhoto, install
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
