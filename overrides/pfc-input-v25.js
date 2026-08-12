// PFC Mirror V2.5: compact non-voice input polish.
(() => {
  'use strict';

  const VERSION = '2.5.1';

  const fmt = value => {
    const n = Math.round(Number(value || 0) * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  function v3Meta(item) {
    return item?.source === 'db' ? window.__PFC_DB_V3__?.get?.(item.i) || null : null;
  }

  function getItemStep(item, amount) {
    const meta = v3Meta(item);
    if (meta) {
      if (Number(meta.nutritionBasis?.amount) > 0 && Number(meta.nutritionBasis.amount) < 1 && ['count','package'].includes(meta.input?.type)) {
        return Number(meta.nutritionBasis.amount);
      }
      const value = Number(meta.input?.quickStep);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const unit = typeof getFavoriteUnit === 'function' ? String(getFavoriteUnit(item) || '') : '';
    if (unit === 'g' || /ml/i.test(unit)) return 50;
    return Number(amount) <= 1 ? 0.5 : 1;
  }

  function getItemMin(item) {
    const meta = v3Meta(item);
    const value = Number(meta?.input?.quickMin);
    if (Number.isFinite(value) && value > 0) return value;
    const unit = typeof getFavoriteUnit === 'function' ? String(getFavoriteUnit(item) || '') : '';
    if (unit === 'g' || /ml/i.test(unit)) return 50;
    return 0.5;
  }

  function formatItemAmount(item, amount) {
    const meta = v3Meta(item);
    if (meta && window.__PFC_DB_V3__?.formatAmount) return window.__PFC_DB_V3__.formatAmount(meta, amount);
    const unit = typeof getFavoriteUnit === 'function' ? String(getFavoriteUnit(item) || '') : '';
    return `${fmt(amount)}${unit}`;
  }

  function rerenderFavorites() {
    const list = document.getElementById('f-list');
    if (list) list.dataset.cat = '';
    const favBtn = document.querySelector('.fav-cat-btn');
    if (favBtn && typeof shwList === 'function') shwList('⭐', favBtn);
  }

  function adjustFavorite(item, delta) {
    if (!item || typeof getFavoriteAmount !== 'function' || typeof getFavoriteSetting !== 'function') return;
    const current = Number(getFavoriteAmount(item)) || 1;
    const next = Math.max(getItemMin(item), current + delta);
    const setting = getFavoriteSetting(item.source, item.i);
    setting.amount = Math.round(next * 100) / 100;
    if (typeof saveFavoriteSettings === 'function') saveFavoriteSettings();
    rerenderFavorites();
  }

  function decorateQuickCards() {
    const manual = document.getElementById('manual-inp-sec');
    if (!manual?.classList.contains('quick-favorite-mode')) return;
    if (typeof getAllFavoriteItems !== 'function') return;

    const items = getAllFavoriteItems();
    const rows = Array.from(document.querySelectorAll('#f-list .favorite-quick-row'));
    rows.forEach((row, index) => {
      const item = items[index];
      if (!item || row.querySelector('.v25-stepper')) return;

      const amount = Number(getFavoriteAmount(item)) || 1;
      const step = getItemStep(item, amount);

      const oldAmount = row.querySelector('.favorite-chip-main em');
      if (oldAmount) oldAmount.classList.add('v25-old-amount');

      const stepper = document.createElement('div');
      stepper.className = 'v25-stepper';
      stepper.innerHTML = `
        <button type="button" class="v25-step v25-minus" aria-label="量を減らす">−</button>
        <button type="button" class="v25-amount" aria-label="この量で記録">${formatItemAmount(item, amount)}</button>
        <button type="button" class="v25-step v25-plus" aria-label="量を増やす">＋</button>`;

      const minus = stepper.querySelector('.v25-minus');
      const center = stepper.querySelector('.v25-amount');
      const plus = stepper.querySelector('.v25-plus');

      minus.onclick = event => {
        event.stopPropagation();
        adjustFavorite(item, -step);
      };
      plus.onclick = event => {
        event.stopPropagation();
        adjustFavorite(item, step);
      };
      center.onclick = event => {
        event.stopPropagation();
        if (typeof addFavoriteQuick === 'function') addFavoriteQuick(item.source, item.i);
      };

      row.appendChild(stepper);
    });
  }

  function installQuickDecorator() {
    if (typeof shwList !== 'function') return;
    const original = shwList;
    window.shwList = function (...args) {
      const result = original.apply(this, args);
      requestAnimationFrame(decorateQuickCards);
      return result;
    };
    requestAnimationFrame(decorateQuickCards);
  }

  function normalizeTypedUnit(value) {
    const raw = String(value || '').normalize('NFKC').toLowerCase();
    const map = {
      'グラム':'g', 'ｇ':'g', 'g':'g', 'ml':'ml', 'ｍｌ':'ml',
      '個':'個', '本':'本', '枚':'枚', '杯':'杯', 'パック':'パック', 'p':'パック',
      '粒':'粒', '切':'切', '切れ':'切れ', '玉':'玉', '束':'束', '缶':'缶', '袋':'袋',
      '皿':'皿', '食':'食', '箱':'箱', '尾':'尾', '貫':'貫', '合':'合', '個分':'個分',
      '大さじ':'大さじ', '小さじ':'小さじ', 'スクープ':'スクープ', 'ピース':'ピース'
    };
    return map[raw] || raw;
  }

  function parseCommand(raw) {
    const value = String(raw || '').normalize('NFKC').trim();
    const match = value.match(/^(.+?)[\s　]*([0-9]+(?:\.[0-9]+)?)[\s　]*(g|グラム|ml|mL|個分|個|本|枚|杯|パック|P|粒|切れ|切|玉|束|缶|袋|皿|食|箱|尾|貫|合|大さじ|小さじ|スクープ|ピース)?$/i);
    if (!match) return null;
    const food = match[1].trim();
    const amount = Number(match[2]);
    if (!food || !Number.isFinite(amount) || amount <= 0) return null;
    return { food, amount, typedUnit: normalizeTypedUnit(match[3] || '') };
  }

  function commandUnitMatches(index, typedUnit) {
    if (!typedUnit) return true;
    const meta = window.__PFC_DB_V3__?.get?.(index);
    if (!meta) return true;
    return normalizeTypedUnit(meta.input?.defaultUnit) === typedUnit;
  }

  function recordCommand(result, amount) {
    if (!result || result.source !== 'db' || typeof buildFavoriteLogItem !== 'function') return;
    const item = { source: 'db', i: result.index, name: result.name, isMy: false };
    const record = buildFavoriteLogItem(item, amount);
    if (!record || !Array.isArray(window.lst || (typeof lst !== 'undefined' ? lst : null))) return;

    if (typeof isCheatDay !== 'undefined' && isCheatDay && typeof recordOnCheatDay !== 'undefined' && !recordOnCheatDay) {
      if (typeof showToast === 'function') showToast('チートデイ設定により記録をスキップしました');
      return;
    }

    lst.push(record);
    if (typeof sv === 'function') sv();
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
    const input = document.getElementById('s-inp');
    const box = document.getElementById('s-res');
    if (input) input.value = '';
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    if (typeof showToast === 'function') showToast(`${record.N}を追加しました`);
  }

  function prependCommandCandidate() {
    const input = document.getElementById('s-inp');
    const box = document.getElementById('s-res');
    if (!input || !box) return;
    const command = parseCommand(input.value);
    if (!command || !window.__PFC_SEARCH_V21__?.search) return;

    const hit = window.__PFC_SEARCH_V21__.search(command.food, 3)
      .find(result => result?.source === 'db' && commandUnitMatches(result.index, command.typedUnit));
    if (!hit) return;

    const row = typeof DB !== 'undefined' ? DB[hit.index] : null;
    if (!row) return;
    const meta = window.__PFC_DB_V3__?.get?.(hit.index);
    const amountLabel = meta && window.__PFC_DB_V3__?.formatAmount
      ? window.__PFC_DB_V3__.formatAmount(meta, command.amount)
      : `${fmt(command.amount)}${typeof getFavoriteUnit === 'function' ? getFavoriteUnit({ source: 'db', i: hit.index }) : ''}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v25-command-hit pfc-search-result';
    button.innerHTML = `<span><strong>${hit.name}</strong><small>${amountLabel}で直接記録</small></span><b>追加</b>`;
    button.onclick = () => recordCommand(hit, command.amount);

    const previous = box.querySelector('.v25-command-hit');
    if (previous) previous.remove();
    box.insertBefore(button, box.firstChild);
    box.style.display = 'block';
  }

  function installCommandSearch() {
    if (typeof filterF !== 'function') return;
    const original = filterF;
    window.filterF = function (...args) {
      const result = original.apply(this, args);
      prependCommandCandidate();
      return result;
    };
  }

  function install() {
    installQuickDecorator();
    installCommandSearch();
    window.__PFC_INPUT_V25__ = {
      version: VERSION,
      visibleSmartPanel: false,
      basket: false,
      mealSets: false,
      quickStepper: true,
      smartCommandSearch: true,
      databaseV3Aware: !!window.__PFC_DB_V3__
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
