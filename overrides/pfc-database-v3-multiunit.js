// PFC Mirror Database V3 Phase C1: verified multi-unit input engine.
(() => {
  'use strict';

  const VERSION = '3.6.0';
  const activeUnits = new Map();

  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s・･]/g, '');
  const fmt = value => {
    const n = Math.round(Number(value || 0) * 100) / 100;
    return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, '').replace(/\.$/, '');
  };

  function api() { return window.__PFC_DB_V3__ || null; }

  function makeDefaultUnit(meta) {
    return {
      id: normalize(meta.input.defaultUnit),
      label: meta.input.defaultUnit,
      type: meta.input.type,
      basisPerUnit: 1,
      exact: true,
      source: 'nutrition-basis'
    };
  }

  function buildUnits(meta) {
    if (!meta?.input) return [];
    const units = [makeDefaultUnit(meta)];
    const serving = meta.servingSource;
    if (serving?.kind === 'maff-recipe-weight' && Number(serving.grams) > 0 && meta.input.defaultUnit !== 'g') {
      units.push({
        id: 'g',
        label: 'g',
        type: 'mass',
        basisPerUnit: 1 / Number(serving.grams),
        exact: serving.exactForEntry === true,
        source: serving.url || serving.label,
        note: `${meta.input.defaultUnit}1 = ${Number(serving.grams)}g`
      });
    }
    return units;
  }

  function units(index) {
    const meta = api()?.get?.(index);
    if (!meta) return [];
    if (!Array.isArray(meta.input.units)) meta.input.units = buildUnits(meta);
    return meta.input.units;
  }

  function defaultUnitId(index) {
    return units(index)[0]?.id || '';
  }

  function activeUnitId(index) {
    const available = units(index);
    const selected = activeUnits.get(Number(index));
    return available.some(unit => unit.id === selected) ? selected : (available[0]?.id || '');
  }

  function unit(index, unitId) {
    const available = units(index);
    return available.find(item => item.id === (unitId || activeUnitId(index))) || available[0] || null;
  }

  function toBasisAmount(index, amount, unitId) {
    const u = unit(index, unitId);
    const value = Number(amount);
    if (!u || !Number.isFinite(value) || value <= 0) return 0;
    return value * Number(u.basisPerUnit || 0);
  }

  function fromBasisAmount(index, basisAmount, unitId) {
    const u = unit(index, unitId);
    const value = Number(basisAmount);
    if (!u || !Number.isFinite(value) || value <= 0 || !Number(u.basisPerUnit)) return 0;
    return value / Number(u.basisPerUnit);
  }

  function convert(index, amount, fromUnitId, toUnitId) {
    const basisAmount = toBasisAmount(index, amount, fromUnitId);
    return fromBasisAmount(index, basisAmount, toUnitId);
  }

  function scaleInput(index, amount, unitId) {
    const basisAmount = toBasisAmount(index, amount, unitId);
    return basisAmount > 0 ? api()?.scale?.(index, basisAmount) || null : null;
  }

  function formatInput(index, amount, unitId) {
    const u = unit(index, unitId);
    if (!u) return fmt(amount);
    return u.label === '大さじ' || u.label === '小さじ' ? `${u.label}${fmt(amount)}` : `${fmt(amount)}${u.label}`;
  }

  function buildRecordInput(index, amount, unitId, time) {
    const dbv3 = api();
    const meta = dbv3?.get?.(index);
    const scaled = scaleInput(index, amount, unitId);
    if (!meta || !scaled) return null;
    return {
      id: Date.now(),
      N: `${meta.name}(${formatInput(index, amount, unitId)})`,
      P: scaled.p, F: scaled.f, C: scaled.c, A: scaled.a, Cal: scaled.kcal,
      U: meta.nutritionBasis.legacy,
      time: time || (typeof getAutoTime === 'function' ? getAutoTime() : '朝'),
      _dbv3: { id: meta.id, index, amount: Number(amount), unit: unit(index, unitId)?.label || '' }
    };
  }

  function choices(index, unitId) {
    const dbv3 = api();
    const meta = dbv3?.get?.(index);
    const u = unit(index, unitId);
    if (!meta || !u) return [];
    if (u.id === defaultUnitId(index)) return dbv3.amountChoices(index);
    if (u.id === 'g' && Number(meta.servingSource?.grams) > 0) {
      const g = Number(meta.servingSource.grams);
      return [...new Set([g / 2, g, g * 1.5, g * 2, g * 3].map(v => Math.round(v * 10) / 10))];
    }
    return [0.5, 1, 1.5, 2];
  }

  function ensureStyle() {
    if (document.getElementById('pfc-db-v3-multiunit-style')) return;
    const style = document.createElement('style');
    style.id = 'pfc-db-v3-multiunit-style';
    style.textContent = `
      .dbv3-unit-switch{display:flex;gap:5px;margin:7px 0 5px;padding:3px;background:#eef7f2;border-radius:10px;width:max-content;max-width:100%}
      .dbv3-unit-switch button{border:0;background:transparent;color:#687970;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:900;min-width:48px}
      .dbv3-unit-switch button.active{background:#fff;color:#187a51;box-shadow:0 1px 5px rgba(27,93,66,.12)}
      .dbv3-unit-note{font-size:9.5px;color:#82938b;margin:-1px 0 5px}
    `;
    document.head?.appendChild(style);
  }

  function currentBasisAmount(index) {
    const meta = api()?.get?.(index);
    const mul = Number(document.getElementById('m-mul')?.value || 1);
    return meta ? Number(meta.nutritionBasis.amount || 1) * mul : 0;
  }

  function renderChoices(index) {
    const box = document.getElementById('pst-btns');
    if (!box) return;
    const unitId = activeUnitId(index);
    box.innerHTML = '';
    box.style.display = 'grid';
    choices(index, unitId).forEach(value => {
      const button = document.createElement('div');
      button.className = 'a-btn';
      button.innerHTML = `<span>${formatInput(index, value, unitId)}</span>`;
      button.onclick = () => {
        box.querySelectorAll('.a-btn').forEach(x => x.classList.remove('sel'));
        button.classList.add('sel');
        window.updBd(value);
      };
      box.appendChild(button);
    });
  }

  function updatePreviewLabel(index, inputAmount) {
    const meta = api()?.get?.(index);
    const name = document.getElementById('pv-name');
    if (meta && name) name.textContent = `${meta.name} (${formatInput(index, inputAmount, activeUnitId(index))})`;
  }

  function renderSwitch(index) {
    document.getElementById('dbv3-unit-switch')?.remove();
    document.getElementById('dbv3-unit-note')?.remove();
    const available = units(index);
    if (available.length <= 1) return;
    const amountArea = document.getElementById('amt-area');
    const amountButtons = document.getElementById('pst-btns');
    if (!amountArea || !amountButtons) return;

    const switcher = document.createElement('div');
    switcher.id = 'dbv3-unit-switch';
    switcher.className = 'dbv3-unit-switch';
    available.forEach(u => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = u.label;
      button.classList.toggle('active', u.id === activeUnitId(index));
      button.onclick = () => {
        const basisBefore = currentBasisAmount(index) || Number(api()?.get(index)?.nutritionBasis.amount || 1);
        activeUnits.set(Number(index), u.id);
        const nextInput = fromBasisAmount(index, basisBefore, u.id);
        renderSwitch(index);
        renderChoices(index);
        window.updBd(nextInput);
      };
      switcher.appendChild(button);
    });
    amountArea.insertBefore(switcher, amountButtons);

    const selected = unit(index);
    if (selected?.note) {
      const note = document.createElement('div');
      note.id = 'dbv3-unit-note';
      note.className = 'dbv3-unit-note';
      note.textContent = selected.note;
      amountArea.insertBefore(note, amountButtons);
    }
  }

  function installUi() {
    if (typeof window.selFd !== 'function' || typeof window.updBd !== 'function') return;
    ensureStyle();
    const legacySelFd = window.selFd;
    const legacyUpdBd = window.updBd;
    const legacyAddM = window.addM;

    window.selFd = function (index) {
      activeUnits.set(Number(index), defaultUnitId(index));
      const result = legacySelFd.apply(this, arguments);
      renderSwitch(index);
      renderChoices(index);
      return result;
    };

    window.updBd = function (inputAmount) {
      if (typeof selIdx === 'undefined' || selIdx < 0 || units(selIdx).length <= 1) {
        return legacyUpdBd.apply(this, arguments);
      }
      const basisAmount = toBasisAmount(selIdx, inputAmount, activeUnitId(selIdx));
      const result = legacyUpdBd.call(this, basisAmount);
      updatePreviewLabel(selIdx, inputAmount);
      return result;
    };

    if (typeof legacyAddM === 'function') {
      window.addM = function () {
        if (typeof selIdx !== 'undefined' && selIdx >= 0 && units(selIdx).length > 1) {
          const meta = api()?.get(selIdx);
          const nameInput = document.getElementById('m-name');
          const basisAmount = currentBasisAmount(selIdx);
          const inputAmount = fromBasisAmount(selIdx, basisAmount, activeUnitId(selIdx));
          if (meta && nameInput && nameInput.value === meta.name) {
            nameInput.value = `${meta.name}(${formatInput(selIdx, inputAmount, activeUnitId(selIdx))})`;
          }
        }
        return legacyAddM.apply(this, arguments);
      };
    }
  }

  function install() {
    const dbv3 = api();
    if (!dbv3) return;
    dbv3.items.forEach(meta => { meta.input.units = buildUnits(meta); });
    const extension = {
      version: VERSION,
      getUnits: units,
      activeUnitId,
      toBasisAmount,
      fromBasisAmount,
      convert,
      scaleInput,
      buildRecordInput,
      formatInput,
      choices
    };
    window.__PFC_DB_V3_MULTIUNIT__ = extension;
    installUi();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
