// PFC Mirror V2.3: dynamic model selector backed by GAS models.list.
(() => {
  'use strict';

  const VERSION = '2.3.1';
  const RATE_LIMIT_URL = 'https://aistudio.google.com/rate-limit?timeRange=last-28-days';
  const MODEL_STORAGE_KEY = 'tf_ai_model_preference';
  const LEGACY_MODEL_IDS = {
    'gemini31-lite': 'gemini-3.1-flash-lite',
    'gemini25-lite': 'gemini-2.5-flash-lite',
    'gemma4-26b': 'gemma-4-26b-a4b-it',
    'gemma4-31b': 'gemma-4-31b-it'
  };

  function normalizeStoredModel(value) {
    const raw = String(value || '').trim();
    return LEGACY_MODEL_IDS[raw] || raw;
  }

  function currentStoredModel() {
    return normalizeStoredModel(localStorage.getItem(MODEL_STORAGE_KEY));
  }

  function formatTokens(value) {
    const n = Number(value || 0);
    if (!n) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  }

  function modelLabel(model) {
    const name = String(model.displayName || model.id || '').trim() || model.id;
    const flags = [];
    if (model.preview) flags.push('Preview');
    if (model.thinking) flags.push('Thinking');
    return flags.length ? `${name} · ${flags.join(' / ')}` : name;
  }

  function ensureModelPickerUi(select) {
    const row = select.closest('.alc-toggle') || select.parentElement;
    if (!row) return null;
    row.classList.add('model-picker-row-v23');

    let actions = row.querySelector('.model-picker-actions-v23');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'model-picker-actions-v23';
      select.parentNode.insertBefore(actions, select);
      actions.appendChild(select);
    }

    let meta = row.querySelector('.model-picker-meta-v23');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'model-picker-meta-v23';
      meta.textContent = 'Gemini APIから利用可能モデルを取得します';
      row.appendChild(meta);
    }

    return { row, actions, meta };
  }

  function ensureManagerRateLimitButton() {
    const modal = document.getElementById('manager-modal');
    const box = modal?.querySelector('.modal-box');
    if (!box || box.querySelector('.manager-ai-limit-v23')) return;

    const section = document.createElement('div');
    section.className = 'manager-ai-limit-v23';
    section.innerHTML = `
      <div class="manager-ai-limit-title-v23">AI API 管理</div>
      <div class="manager-ai-limit-note-v23">Google AI Studioで、このプロジェクトのRPM / TPM / RPDを確認します。</div>
      <button type="button" class="manager-ai-limit-btn-v23">AI StudioのRate Limitを開く</button>
    `;
    const button = section.querySelector('.manager-ai-limit-btn-v23');
    button.onclick = () => window.open(RATE_LIMIT_URL, '_blank', 'noopener,noreferrer');

    const heading = box.querySelector('h3');
    if (heading?.nextSibling) box.insertBefore(section, heading.nextSibling);
    else box.prepend(section);
  }

  async function fetchAvailableModels() {
    if (typeof gasUrl !== 'string' || !gasUrl) throw new Error('GAS URL is unavailable');
    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ taskType: 'listModels' })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true || !Array.isArray(payload.models)) {
      throw new Error(payload?.message || 'モデル一覧の形式が不正です');
    }
    return payload.models;
  }

  function populateSelector(select, models, meta) {
    const saved = currentStoredModel();
    select.innerHTML = '';

    const ids = new Set(models.map(model => String(model.id || '')));
    if (saved && !ids.has(saved)) {
      const unavailable = document.createElement('option');
      unavailable.value = saved;
      unavailable.textContent = `現在一覧にないモデル: ${saved}`;
      unavailable.disabled = true;
      unavailable.selected = true;
      select.appendChild(unavailable);
    }

    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = modelLabel(model);
      const input = formatTokens(model.inputTokenLimit);
      const output = formatTokens(model.outputTokenLimit);
      option.title = [model.id, input ? `入力 ${input}` : '', output ? `出力 ${output}` : ''].filter(Boolean).join(' / ');
      if (saved && model.id === saved) option.selected = true;
      select.appendChild(option);
    });

    if (!saved && models.length) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'モデルを選択してください';
      placeholder.selected = true;
      placeholder.disabled = true;
      select.insertBefore(placeholder, select.firstChild);
    }

    select.disabled = false;
    if (meta) {
      const unavailableText = saved && !ids.has(saved) ? '・以前の選択は現在利用不可' : '';
      meta.textContent = `利用可能 ${models.length}モデル（models.list）${unavailableText}`;
    }
  }

  function showLoadError(select, meta, error) {
    const saved = currentStoredModel();
    select.innerHTML = '';
    const option = document.createElement('option');
    option.value = saved || 'gemini-3.1-flash-lite';
    option.textContent = saved ? `保存済み: ${saved}` : '3.1 Flash Lite（フォールバック）';
    option.selected = true;
    select.appendChild(option);
    select.disabled = false;
    if (meta) meta.textContent = 'モデル一覧を取得できませんでした。再読み込みで再取得します。';
    console.warn('[PFC Model Selector V2.3]', error);
  }

  async function initDynamicModelSelector() {
    const select = document.getElementById('ai-model-select');
    if (!select) return;
    const ui = ensureModelPickerUi(select);
    ensureManagerRateLimitButton();

    select.disabled = true;
    select.innerHTML = '<option>利用可能モデルを取得中...</option>';
    if (ui?.meta) ui.meta.textContent = 'Gemini API models.list を確認中...';

    try {
      const models = await fetchAvailableModels();
      populateSelector(select, models, ui?.meta);
    } catch (error) {
      showLoadError(select, ui?.meta, error);
    }
  }

  document.addEventListener('DOMContentLoaded', initDynamicModelSelector);

  window.__PFC_MODEL_SELECTOR_V23__ = {
    version: VERSION,
    source: 'models.list',
    selection: 'manual',
    rateLimitLocation: 'manager-mode',
    rateLimitUrl: RATE_LIMIT_URL,
    refresh: initDynamicModelSelector
  };
})();
