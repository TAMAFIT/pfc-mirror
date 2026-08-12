// PFC Mirror Database V3 Phase A: manual-input compatibility adapter.
(() => {
  'use strict';

  const VERSION = '3.0.0';

  function api() {
    return window.__PFC_DB_V3__ || null;
  }

  function numberValue(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    if (typeof parseNum === 'function') return parseNum(el.value);
    return Number(el.value) || 0;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function displayPreview(index, amount, scaled) {
    const dbv3 = api();
    const meta = dbv3?.get(index);
    if (!meta || !scaled) return;

    const preview = document.getElementById('pv-bar');
    if (preview) preview.style.display = 'block';
    const name = document.getElementById('pv-name');
    if (name) name.textContent = `${meta.name} (${dbv3.formatAmount(meta, amount)})`;
    const stat = document.getElementById('pv-stat');
    if (stat) {
      const aText = (typeof TG !== 'undefined' && TG?.alcMode && scaled.a > 0) ? ` A${scaled.a.toFixed(1)}` : '';
      stat.textContent = `${scaled.kcal}kcal (P${scaled.p.toFixed(1)} F${scaled.f.toFixed(1)} C${scaled.c.toFixed(1)}${aText})`;
    }
  }

  function renderAmountChoices(index, preferredAmount) {
    const dbv3 = api();
    const meta = dbv3?.get(index);
    if (!meta) return;

    const rice = document.getElementById('rice-btns');
    const portion = document.getElementById('pst-btns');
    if (!portion) return;
    if (rice) {
      rice.innerHTML = '';
      rice.style.display = 'none';
    }
    portion.innerHTML = '';
    portion.style.display = 'grid';

    const values = dbv3.amountChoices(index);
    values.forEach(value => {
      const button = document.createElement('div');
      button.className = 'a-btn';
      button.innerHTML = `<span>${dbv3.formatAmount(meta, value)}</span>`;
      if (Math.abs(Number(value) - Number(preferredAmount)) < 0.0001) button.classList.add('sel');
      button.onclick = () => {
        document.querySelectorAll('.a-btn').forEach(x => x.classList.remove('sel'));
        button.classList.add('sel');
        window.updBd(value);
      };
      portion.appendChild(button);
    });
  }

  function install() {
    const dbv3 = api();
    if (!dbv3 || typeof window.selFd !== 'function' || typeof window.updBd !== 'function') return;

    const legacySelFd = window.selFd;
    const legacyUpdBd = window.updBd;
    const legacyCalcM = window.calcM;

    window.updBd = function (value) {
      if (typeof selIdx === 'undefined' || selIdx < 0) return legacyUpdBd.apply(this, arguments);
      const meta = dbv3.get(selIdx);
      const row = typeof DB !== 'undefined' ? DB[selIdx] : null;
      const amount = Number(value);
      const scaled = dbv3.scale(selIdx, amount);
      if (!meta || !row || !scaled) return legacyUpdBd.apply(this, arguments);

      setValue('m-mul', Number(scaled.multiplier.toFixed(4)));
      setValue('m-name', meta.name);
      setValue('m-p', Number(row[4] || 0));
      setValue('m-f', Number(row[5] || 0));
      setValue('m-c', Number(row[6] || 0));
      setValue('m-a', Number.isFinite(Number(row[8])) ? Number(row[8]) : 0);
      setValue('m-cal', scaled.kcal);
      displayPreview(selIdx, amount, scaled);
    };

    window.calcM = function () {
      if (typeof selIdx === 'undefined' || selIdx < 0 || !dbv3.get(selIdx)) {
        return typeof legacyCalcM === 'function' ? legacyCalcM.apply(this, arguments) : undefined;
      }

      const meta = dbv3.get(selIdx);
      const row = typeof DB !== 'undefined' ? DB[selIdx] : null;
      if (!row) return typeof legacyCalcM === 'function' ? legacyCalcM.apply(this, arguments) : undefined;

      // If the user manually edited the base macros, preserve the legacy custom calculation path.
      const baseA = Number.isFinite(Number(row[8])) ? Number(row[8]) : 0;
      const edited = Math.abs(numberValue('m-p') - Number(row[4] || 0)) > 0.01 ||
        Math.abs(numberValue('m-f') - Number(row[5] || 0)) > 0.01 ||
        Math.abs(numberValue('m-c') - Number(row[6] || 0)) > 0.01 ||
        Math.abs(numberValue('m-a') - baseA) > 0.01;
      if (edited) return typeof legacyCalcM === 'function' ? legacyCalcM.apply(this, arguments) : undefined;

      const multiplier = numberValue('m-mul') || 1;
      const amount = Number(meta.nutritionBasis.amount || 1) * multiplier;
      const scaled = dbv3.scale(selIdx, amount);
      if (!scaled) return typeof legacyCalcM === 'function' ? legacyCalcM.apply(this, arguments) : undefined;
      setValue('m-cal', scaled.kcal);
      displayPreview(selIdx, amount, scaled);
    };

    window.selFd = function (index) {
      const result = legacySelFd.apply(this, arguments);
      const meta = dbv3.get(index);
      if (!meta) return result;

      const favoriteItem = { source: 'db', i: index, name: meta.name, isMy: false };
      const preferred = typeof getFavoriteAmount === 'function'
        ? Number(getFavoriteAmount(favoriteItem))
        : Number(meta.input.defaultAmount);
      const amount = Number.isFinite(preferred) && preferred > 0 ? preferred : Number(meta.input.defaultAmount || meta.nutritionBasis.amount || 1);

      renderAmountChoices(index, amount);
      window.updBd(amount);
      if (typeof ensureAmountPanelVisible === 'function') requestAnimationFrame(ensureAmountPanelVisible);
      return result;
    };

    window.__PFC_DB_V3_MANUAL__ = {
      version: VERSION,
      unitAwareButtons: true,
      storedKcalScaling: true,
      explicitAlcoholOnly: true
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
