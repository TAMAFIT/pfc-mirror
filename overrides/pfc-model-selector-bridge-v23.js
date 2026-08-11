// PFC Mirror V2.3 compatibility bridge: replace legacy fixed model preference helpers.
(() => {
  'use strict';

  const KEY = 'tf_ai_model_preference';
  const LEGACY = {
    'gemini31-lite': 'gemini-3.1-flash-lite',
    'gemini25-lite': 'gemini-2.5-flash-lite',
    'gemma4-26b': 'gemma-4-26b-a4b-it',
    'gemma4-31b': 'gemma-4-31b-it'
  };

  const normalize = value => {
    const raw = String(value || '').trim();
    return LEGACY[raw] || raw;
  };

  const valid = value => /^(gemini|gemma)-[a-z0-9._-]+$/i.test(String(value || ''));

  window.getAIModelPreference = function () {
    const model = normalize(localStorage.getItem(KEY));
    return valid(model) ? model : 'gemini-3.1-flash-lite';
  };

  window.setAIModelPreference = function (value) {
    const model = normalize(value);
    if (!valid(model)) return;
    localStorage.setItem(KEY, model);
    const select = document.getElementById('ai-model-select');
    if (select && select.value !== model) select.value = model;
    const option = select?.selectedOptions?.[0];
    const label = option?.textContent?.trim() || model;
    if (typeof showToast === 'function') showToast(`AIモデル: ${label}`);
  };

  window.__PFC_MODEL_SELECTOR_BRIDGE_V23__ = {
    version: '2.3.0',
    directModelIds: true
  };
})();
