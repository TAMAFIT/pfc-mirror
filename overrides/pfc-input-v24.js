// PFC Mirror V2.4: non-voice smart input layer.
(() => {
  'use strict';

  const VERSION = '2.4.0';
  const SETS_KEY = 'tf_meal_sets_v24';
  const MAX_SETS = 12;
  const storage = window.mirrorStorage || window.localStorage;

  let basketMode = false;
  let basket = [];
  let lastAction = null;
  let snackTimer = null;
  let commandCandidate = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = value => {
    const n = Math.round(Number(value || 0) * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  };

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･\s]/g, '').trim();
  }

  function baseRecordName(value) {
    return String(value || '').replace(/[（(][^()（）]*[)）]\s*$/, '').trim();
  }

  function unitInfo(row) {
    const raw = String(row?.[3] || '1個').trim();
    const base = Math.max(0.0001, Number(raw.match(/[0-9.]+/)?.[0] || 1));
    const unit = raw.replace(/[0-9.\s]/g, '') || '個';
    return { raw, base, unit };
  }

  function dbDefaultAmount(index) {
    const row = typeof DB !== 'undefined' ? DB[index] : null;
    if (!row) return 1;
    const info = unitInfo(row);
    if (/g$/i.test(info.unit)) {
      if (/白米|玄米|オート/.test(String(row[1] || ''))) return 150;
      if (typeof getDbDefaultAmount === 'function') {
        const existing = Number(getDbDefaultAmount(index));
        if (existing > 0) return existing;
      }
      return info.base || 100;
    }
    if (/ml/i.test(info.unit)) return info.base;
    return info.base > 1 ? info.base : 1;
  }

  function myDefaultAmount(index) {
    if (typeof getMyDefaultAmount === 'function') {
      const value = Number(getMyDefaultAmount(index));
      if (value > 0) return value;
    }
    return 1;
  }

  function dbAlcoholBase(row) {
    if (typeof getDbAlcoholBase === 'function') {
      const value = Number(getDbAlcoholBase(row));
      if (Number.isFinite(value)) return value;
    }
    const direct = Number(row?.[8]);
    return Number.isFinite(direct) ? direct : 0;
  }

  function stepFor(kind, index, amount) {
    if (kind === 'my') return amount <= 1 ? 0.5 : 1;
    const row = typeof DB !== 'undefined' ? DB[index] : null;
    const info = unitInfo(row);
    if (/g$/i.test(info.unit)) return 50;
    if (/ml/i.test(info.unit)) return Math.max(50, Math.round(info.base / 2 / 10) * 10);
    if (info.base > 1) return Math.max(1, info.base / 2);
    return amount <= 1 ? 0.5 : 1;
  }

  function buildDbRecord(index, amount, time) {
    const row = typeof DB !== 'undefined' ? DB[index] : null;
    if (!row) return null;
    const info = unitInfo(row);
    const value = Math.max(0.01, Number(amount) || dbDefaultAmount(index));
    const multiplier = value / info.base;
    return {
      id: Date.now(),
      N: `${row[1]}(${fmt(value)}${info.unit})`,
      P: Number((Number(row[4] || 0) * multiplier).toFixed(1)),
      F: Number((Number(row[5] || 0) * multiplier).toFixed(1)),
      C: Number((Number(row[6] || 0) * multiplier).toFixed(1)),
      A: Number((dbAlcoholBase(row) * multiplier).toFixed(1)),
      Cal: Math.round(Number(row[7] || 0) * multiplier),
      U: row[3],
      time: time || (typeof getAutoTime === 'function' ? getAutoTime() : '朝'),
      _v24: { kind: 'db', index, amount: value, step: stepFor('db', index, value) }
    };
  }

  function buildMyRecord(index, amount, time) {
    const row = typeof myFoods !== 'undefined' ? myFoods[index] : null;
    if (!row) return null;
    const value = Math.max(0.01, Number(amount) || myDefaultAmount(index));
    return {
      id: Date.now(),
      N: `${row.N || row.name || 'My食品'}(${fmt(value)}個)`,
      P: Number((Number(row.P || 0) * value).toFixed(1)),
      F: Number((Number(row.F || 0) * value).toFixed(1)),
      C: Number((Number(row.C || 0) * value).toFixed(1)),
      A: Number((Number(row.A || 0) * value).toFixed(1)),
      Cal: Math.round(Number(row.Cal || 0) * value),
      U: '-',
      time: time || (typeof getAutoTime === 'function' ? getAutoTime() : '朝'),
      _v24: { kind: 'my', index, amount: value, step: stepFor('my', index, value) }
    };
  }

  function findDbIndexByName(name) {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return -1;
    const target = normalize(baseRecordName(name));
    return DB.findIndex(row => normalize(row?.[1]) === target);
  }

  function findMyIndexByName(name) {
    if (typeof myFoods === 'undefined' || !Array.isArray(myFoods)) return -1;
    const target = normalize(baseRecordName(name));
    return myFoods.findIndex(row => normalize(row?.N || row?.name) === target);
  }

  function amountFromRecord(record, index, kind = 'db') {
    const text = String(record?.N || '');
    const match = text.match(/[（(]\s*([0-9.]+)\s*([^()（）]*)[)）]\s*$/);
    if (match) return Number(match[1]);
    if (kind === 'my') return 1;
    const row = typeof DB !== 'undefined' ? DB[index] : null;
    if (!row) return 1;
    const baseP = Number(row[4] || 0);
    const ratio = baseP > 0 ? Number(record?.P || 0) / baseP : 0;
    return ratio > 0 ? unitInfo(row).base * ratio : dbDefaultAmount(index);
  }

  function annotateRecord(record) {
    if (!record || record._v24) return record;
    const dbIndex = findDbIndexByName(record.N);
    if (dbIndex >= 0) {
      const amount = amountFromRecord(record, dbIndex, 'db');
      record._v24 = { kind: 'db', index: dbIndex, amount, step: stepFor('db', dbIndex, amount) };
      return record;
    }
    const myIndex = findMyIndexByName(record.N);
    if (myIndex >= 0) {
      const amount = amountFromRecord(record, myIndex, 'my');
      record._v24 = { kind: 'my', index: myIndex, amount, step: stepFor('my', myIndex, amount) };
    }
    return record;
  }

  function cloneRecord(record, time) {
    const copy = JSON.parse(JSON.stringify(record || {}));
    copy.id = Date.now();
    copy.time = time || copy.time || (typeof getAutoTime === 'function' ? getAutoTime() : '朝');
    delete copy.isDummy;
    delete copy.dummyVersion;
    return annotateRecord(copy);
  }

  function persistAndRender() {
    if (typeof sv === 'function') sv();
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
    renderSmartPanel();
  }

  function canRecord() {
    if (typeof isCheatDay !== 'undefined' && isCheatDay && typeof recordOnCheatDay !== 'undefined' && !recordOnCheatDay) {
      if (typeof showToast === 'function') showToast('チートデイ設定により記録をスキップしました');
      return false;
    }
    return true;
  }

  function commitRecords(records, message) {
    const valid = (records || []).filter(Boolean);
    if (!valid.length || typeof lst === 'undefined' || !Array.isArray(lst) || !canRecord()) return;
    const now = Date.now();
    valid.forEach((record, i) => {
      record.id = now + i;
      annotateRecord(record);
      lst.push(record);
    });
    persistAndRender();
    lastAction = { ids: valid.map(x => x.id), message: message || `${valid.length}件を記録しました` };
    showActionSnack(lastAction.message, valid.length === 1 ? valid[0] : null);
  }

  function removeIds(ids) {
    if (typeof lst === 'undefined' || !Array.isArray(lst)) return;
    const idSet = new Set(ids.map(Number));
    for (let i = lst.length - 1; i >= 0; i -= 1) {
      if (idSet.has(Number(lst[i]?.id))) lst.splice(i, 1);
    }
    persistAndRender();
  }

  function undoLast() {
    if (!lastAction?.ids?.length) return;
    removeIds(lastAction.ids);
    lastAction = null;
    hideActionSnack();
    if (typeof showToast === 'function') showToast('記録を取り消しました');
  }

  function adjustLast(delta) {
    if (!lastAction?.ids || lastAction.ids.length !== 1 || typeof lst === 'undefined') return;
    const id = Number(lastAction.ids[0]);
    const indexInList = lst.findIndex(item => Number(item?.id) === id);
    if (indexInList < 0) return;
    const current = annotateRecord(lst[indexInList]);
    const meta = current?._v24;
    if (!meta) return;
    const nextAmount = Math.max(meta.step || 0.5, Number(meta.amount || 0) + delta);
    const next = meta.kind === 'db'
      ? buildDbRecord(meta.index, nextAmount, current.time)
      : buildMyRecord(meta.index, nextAmount, current.time);
    if (!next) return;
    next.id = id;
    lst[indexInList] = next;
    persistAndRender();
    showActionSnack(`${baseRecordName(next.N)}を${fmt(nextAmount)}に変更`, next);
  }

  function ensureSnack() {
    let snack = $('#pfc-action-snack-v24');
    if (snack) return snack;
    snack = document.createElement('div');
    snack.id = 'pfc-action-snack-v24';
    snack.innerHTML = '<span class="v24-snack-text"></span><div class="v24-snack-actions"></div>';
    document.body.appendChild(snack);
    return snack;
  }

  function showActionSnack(message, record) {
    const snack = ensureSnack();
    const actions = $('.v24-snack-actions', snack);
    $('.v24-snack-text', snack).textContent = `✓ ${message}`;
    actions.innerHTML = '';
    const meta = record?._v24;
    if (meta) {
      const unit = meta.kind === 'db' ? unitInfo(DB?.[meta.index]).unit : '個';
      const step = Number(meta.step || 0.5);
      const minus = document.createElement('button');
      minus.type = 'button'; minus.textContent = `−${fmt(step)}${unit}`;
      minus.onclick = () => adjustLast(-step);
      const plus = document.createElement('button');
      plus.type = 'button'; plus.textContent = `＋${fmt(step)}${unit}`;
      plus.onclick = () => adjustLast(step);
      actions.append(minus, plus);
    }
    const undo = document.createElement('button');
    undo.type = 'button'; undo.className = 'v24-undo'; undo.textContent = '取消';
    undo.onclick = undoLast;
    actions.appendChild(undo);
    snack.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(hideActionSnack, 6500);
  }

  function hideActionSnack() {
    const snack = $('#pfc-action-snack-v24');
    if (snack) snack.classList.remove('show');
  }

  function readMealSets() {
    try {
      const value = JSON.parse(storage.getItem(SETS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeMealSets(sets) {
    storage.setItem(SETS_KEY, JSON.stringify((sets || []).slice(0, MAX_SETS)));
  }

  function recordToSetItem(record) {
    const dbIndex = findDbIndexByName(record?.N);
    if (dbIndex >= 0) {
      return { kind: 'db', name: DB[dbIndex][1], amount: amountFromRecord(record, dbIndex, 'db') };
    }
    const myIndex = findMyIndexByName(record?.N);
    if (myIndex >= 0) {
      return { kind: 'my', name: myFoods[myIndex].N, amount: amountFromRecord(record, myIndex, 'my') };
    }
    const snapshot = JSON.parse(JSON.stringify(record || {}));
    delete snapshot.id;
    delete snapshot.time;
    delete snapshot.isDummy;
    delete snapshot.dummyVersion;
    return { kind: 'snapshot', snapshot };
  }

  function saveMealSet(records, suggestedName) {
    const valid = (records || []).filter(Boolean);
    if (!valid.length) {
      alert('保存できる食事がありません。');
      return;
    }
    const name = prompt('食事セット名', suggestedName || 'いつもの食事');
    if (name === null || !String(name).trim()) return;
    const sets = readMealSets();
    sets.unshift({
      id: `set-${Date.now()}`,
      name: String(name).trim(),
      items: valid.map(recordToSetItem),
      createdAt: Date.now(),
      lastUsedAt: 0
    });
    writeMealSets(sets);
    renderSmartPanel();
    if (typeof showToast === 'function') showToast(`「${String(name).trim()}」を保存しました`);
  }

  function buildSetRecords(set, time) {
    return (set?.items || []).map(item => {
      if (item.kind === 'db') {
        const index = typeof DB !== 'undefined' ? DB.findIndex(row => row?.[1] === item.name) : -1;
        return index >= 0 ? buildDbRecord(index, item.amount, time) : null;
      }
      if (item.kind === 'my') {
        const index = typeof myFoods !== 'undefined' ? myFoods.findIndex(row => row?.N === item.name) : -1;
        return index >= 0 ? buildMyRecord(index, item.amount, time) : null;
      }
      if (item.kind === 'snapshot') return cloneRecord(item.snapshot, time);
      return null;
    }).filter(Boolean);
  }

  function useMealSet(id) {
    const sets = readMealSets();
    const set = sets.find(item => item.id === id);
    if (!set) return;
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    const records = buildSetRecords(set, time);
    if (!records.length) return;
    set.lastUsedAt = Date.now();
    sets.sort((a, b) => Number(b.lastUsedAt || b.createdAt || 0) - Number(a.lastUsedAt || a.createdAt || 0));
    writeMealSets(sets);
    commitRecords(records, `${set.name}をまとめて記録`);
  }

  function deleteMealSet(id) {
    const sets = readMealSets();
    const set = sets.find(item => item.id === id);
    if (!set || !confirm(`「${set.name}」を削除しますか？`)) return;
    writeMealSets(sets.filter(item => item.id !== id));
    renderSmartPanel();
  }

  function previousMeal(time) {
    if (typeof hist === 'undefined' || !Array.isArray(hist)) return null;
    for (const day of hist) {
      const items = Array.isArray(day?.l) ? day.l.filter(item => item?.time === time) : [];
      if (items.length) return { date: day.d || '', items };
    }
    return null;
  }

  function copyPreviousMeal() {
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    const previous = previousMeal(time);
    if (!previous) return;
    const records = previous.items.map(item => cloneRecord(item, time));
    commitRecords(records, `前回の${time === '朝' ? '朝食' : time === '昼' ? '昼食' : '夕食'}をコピー`);
  }

  function foodSummary(records, limit = 3) {
    const names = (records || []).map(item => baseRecordName(item?.N)).filter(Boolean);
    const shown = names.slice(0, limit).join('・');
    return names.length > limit ? `${shown} ほか${names.length - limit}品` : shown;
  }

  function recentAmountForDb(index, time) {
    const target = normalize(DB?.[index]?.[1]);
    const sources = [];
    if (typeof lst !== 'undefined' && Array.isArray(lst)) sources.push({ l: lst });
    if (typeof hist !== 'undefined' && Array.isArray(hist)) sources.push(...hist);
    for (const day of sources) {
      const records = Array.isArray(day?.l) ? day.l : [];
      const found = records.find(item => (!time || item?.time === time) && normalize(baseRecordName(item?.N)) === target);
      if (found) return amountFromRecord(found, index, 'db');
    }
    return dbDefaultAmount(index);
  }

  function timeSuggestions(time) {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return [];
    const scores = new Map();
    const addRecord = (record, weight, dayIndex) => {
      const index = findDbIndexByName(record?.N);
      if (index < 0) return;
      const key = index;
      const current = scores.get(key) || { index, score: 0, count: 0 };
      current.score += weight + (record?.time === time ? 8 : 0) + Math.max(0, 10 - dayIndex);
      current.count += 1;
      scores.set(key, current);
    };
    if (typeof lst !== 'undefined' && Array.isArray(lst)) lst.forEach(record => addRecord(record, 12, 0));
    if (typeof hist !== 'undefined' && Array.isArray(hist)) {
      hist.slice(0, 45).forEach((day, dayIndex) => {
        (Array.isArray(day?.l) ? day.l : []).forEach(record => addRecord(record, 2, dayIndex));
      });
    }
    let results = Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, 6);
    if (!results.length && typeof getAllFavoriteItems === 'function') {
      results = getAllFavoriteItems().filter(item => item.source === 'db').slice(0, 6).map(item => ({ index: item.i, score: 1 }));
    }
    return results.map(item => ({ ...item, amount: recentAmountForDb(item.index, time) }));
  }

  function addSuggestion(index, amount) {
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    const record = buildDbRecord(index, amount, time);
    if (record) commitRecords([record], `${baseRecordName(record.N)}を記録`);
  }

  function basketEntryRecord(entry) {
    if (entry.kind === 'db') return buildDbRecord(entry.index, entry.amount, entry.time);
    if (entry.kind === 'my') return buildMyRecord(entry.index, entry.amount, entry.time);
    return null;
  }

  function addBasketEntry(kind, index, amount) {
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    const value = Number(amount) || (kind === 'db' ? dbDefaultAmount(index) : myDefaultAmount(index));
    const existing = basket.find(item => item.kind === kind && item.index === index && item.time === time);
    if (existing) existing.amount += value;
    else basket.push({ id: `basket-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, index, amount: value, time });
    renderSmartPanel();
    if (typeof showToast === 'function') showToast('まとめ入力に追加しました');
  }

  function adjustBasket(id, delta) {
    const item = basket.find(entry => entry.id === id);
    if (!item) return;
    const step = stepFor(item.kind, item.index, item.amount);
    item.amount = Math.max(step, Number(item.amount) + delta * step);
    renderSmartPanel();
  }

  function removeBasket(id) {
    basket = basket.filter(item => item.id !== id);
    renderSmartPanel();
  }

  function commitBasket() {
    const records = basket.map(basketEntryRecord).filter(Boolean);
    if (!records.length) return;
    const count = records.length;
    basket = [];
    basketMode = false;
    commitRecords(records, `${count}品をまとめて記録`);
  }

  function saveBasketAsSet() {
    const records = basket.map(basketEntryRecord).filter(Boolean);
    if (!records.length) return alert('まとめ入力に食品がありません。');
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    saveMealSet(records, `いつもの${time === '朝' ? '朝食' : time === '昼' ? '昼食' : '夕食'}`);
  }

  function toggleBasketMode() {
    basketMode = !basketMode;
    if (!basketMode && basket.length && !confirm('まとめ入力の内容を残したまま通常入力に戻しますか？')) {
      basketMode = true;
    }
    renderSmartPanel();
  }

  function parseSmartCommand(raw) {
    const text = String(raw || '').normalize('NFKC').trim();
    const match = text.match(/^(.+?)[\s　]*([0-9]+(?:\.[0-9]+)?)\s*(g|グラム|ml|mL|個|こ|杯|枚|本|玉|パック)?$/i);
    if (!match) return null;
    const foodText = match[1].trim();
    const amount = Number(match[2]);
    if (!foodText || !amount || !window.__PFC_SEARCH_V21__?.search) return null;
    const results = window.__PFC_SEARCH_V21__.search(foodText, 5);
    const hit = results.find(result => Number(result.score || 0) >= 600) || results[0];
    if (!hit) return null;
    return { hit, amount, typedUnit: match[3] || '' };
  }

  function commandLabel(candidate) {
    const result = candidate?.hit;
    if (!result) return '';
    let unit = '個';
    if (result.source === 'db') unit = unitInfo(result.item).unit;
    return `${result.name} ${fmt(candidate.amount)}${candidate.typedUnit || unit}`;
  }

  function executeCommand(candidate = commandCandidate) {
    if (!candidate?.hit) return;
    const { hit, amount } = candidate;
    if (basketMode) addBasketEntry(hit.source, hit.index, amount);
    else {
      const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
      const record = hit.source === 'db' ? buildDbRecord(hit.index, amount, time) : buildMyRecord(hit.index, amount, time);
      if (record) commitRecords([record], `${baseRecordName(record.N)}を記録`);
    }
    const input = $('#s-inp');
    const results = $('#s-res');
    if (input) input.value = '';
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
    commandCandidate = null;
  }

  function renderCommandSuggestion() {
    const input = $('#s-inp');
    const box = $('#s-res');
    if (!input || !box) return;
    commandCandidate = parseSmartCommand(input.value);
    $('.v24-command-hit', box)?.remove();
    if (!commandCandidate) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v24-command-hit';
    button.innerHTML = `<span><strong>${esc(commandLabel(commandCandidate))}</strong><small>${basketMode ? 'まとめ入力に追加' : 'このまま記録'}</small></span><b>↵</b>`;
    button.onclick = () => executeCommand(commandCandidate);
    box.insertBefore(button, box.firstChild);
    box.style.display = 'block';
  }

  function quantityPresets(kind, index, current) {
    const value = Number(current) || (kind === 'db' ? dbDefaultAmount(index) : myDefaultAmount(index));
    const step = stepFor(kind, index, value);
    let values;
    if (kind === 'db') {
      const info = unitInfo(DB?.[index]);
      if (info.base > 1 && !/g|ml/i.test(info.unit)) values = [Math.max(step, info.base / 2), info.base, info.base * 2];
      else values = [Math.max(step, value - step), value, value + step];
    } else values = [Math.max(step, value - step), value, value + step];
    return Array.from(new Set(values.map(v => Math.round(v * 10) / 10))).filter(v => v > 0);
  }

  function decorateQuickCards() {
    const panel = $('#manual-inp-sec');
    const list = $('#f-list');
    if (!panel?.classList.contains('quick-favorite-mode') || !list || typeof getAllFavoriteItems !== 'function') return;
    const favorites = getAllFavoriteItems();
    $$('.favorite-quick-row', list).forEach(row => {
      if (row.dataset.v24QtyReady === '1') return;
      const name = $('strong', row)?.textContent?.trim();
      const item = favorites.find(x => x.name === name);
      if (!item) return;
      row.dataset.v24QtyReady = '1';
      const current = typeof getFavoriteAmount === 'function' ? Number(getFavoriteAmount(item)) : (item.source === 'db' ? dbDefaultAmount(item.i) : myDefaultAmount(item.i));
      const unit = item.source === 'db' ? unitInfo(DB?.[item.i]).unit : '個';
      const holder = document.createElement('div');
      holder.className = 'v24-quick-qty';
      quantityPresets(item.source, item.i, current).forEach(value => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = `${fmt(value)}${unit}`;
        if (Math.abs(value - current) < 0.001) btn.classList.add('current');
        btn.onclick = event => {
          event.preventDefault(); event.stopPropagation();
          const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
          const record = item.source === 'db' ? buildDbRecord(item.i, value, time) : buildMyRecord(item.i, value, time);
          if (record) commitRecords([record], `${baseRecordName(record.N)}を記録`);
        };
        holder.appendChild(btn);
      });
      row.appendChild(holder);
    });
  }

  function installQuickObserver() {
    const list = $('#f-list');
    if (!list) return;
    new MutationObserver(() => requestAnimationFrame(decorateQuickCards)).observe(list, { childList: true, subtree: true });
  }

  function mealLabel(time) {
    return time === '朝' ? '朝食' : time === '昼' ? '昼食' : time === '晩' ? '夕食' : '間食';
  }

  function ensureSmartPanel() {
    if ($('#pfc-smart-input-v24')) return;
    const manual = $('#manual-inp-sec');
    const search = $('.s-box', manual);
    if (!manual || !search) return;
    const panel = document.createElement('section');
    panel.id = 'pfc-smart-input-v24';
    panel.innerHTML = `
      <div class="v24-head"><div><strong>スマート入力</strong><small>声を使わず最短で記録</small></div><button type="button" id="v24-basket-toggle">まとめ入力</button></div>
      <div id="v24-previous"></div>
      <div class="v24-section"><div class="v24-section-head"><strong>この時間によく使う</strong><small>履歴から自動</small></div><div id="v24-suggestions" class="v24-chip-row"></div></div>
      <div class="v24-section"><div class="v24-section-head"><strong>いつもの食事</strong><button type="button" id="v24-save-current">今の食事を保存</button></div><div id="v24-sets" class="v24-set-row"></div></div>
      <div id="v24-basket"></div>`;
    search.insertAdjacentElement('afterend', panel);
    $('#v24-basket-toggle', panel).onclick = toggleBasketMode;
    $('#v24-save-current', panel).onclick = () => {
      const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
      const records = typeof lst !== 'undefined' && Array.isArray(lst) ? lst.filter(item => item?.time === time) : [];
      saveMealSet(records, `いつもの${mealLabel(time)}`);
    };
  }

  function renderSmartPanel() {
    ensureSmartPanel();
    const panel = $('#pfc-smart-input-v24');
    if (!panel) return;
    const time = typeof getAutoTime === 'function' ? getAutoTime() : '朝';
    const previous = previousMeal(time);
    const previousBox = $('#v24-previous', panel);
    if (previous) {
      previousBox.innerHTML = `<button type="button" class="v24-prev-card"><span><small>前回の${esc(mealLabel(time))}${previous.date ? ` · ${esc(previous.date)}` : ''}</small><strong>${esc(foodSummary(previous.items))}</strong></span><b>もう一度</b></button>`;
      $('.v24-prev-card', previousBox).onclick = copyPreviousMeal;
    } else {
      previousBox.innerHTML = '<div class="v24-empty-line">履歴が増えると「前回の食事」を1タップでコピーできます</div>';
    }

    const suggestions = timeSuggestions(time);
    const suggestionBox = $('#v24-suggestions', panel);
    suggestionBox.innerHTML = suggestions.length ? suggestions.map(item => {
      const row = DB[item.index];
      const unit = unitInfo(row).unit;
      return `<button type="button" data-db="${item.index}" data-amount="${item.amount}"><strong>${esc(row[1])}</strong><small>${fmt(item.amount)}${esc(unit)}</small></button>`;
    }).join('') : '<span class="v24-muted">まだ候補がありません</span>';
    $$('button[data-db]', suggestionBox).forEach(btn => btn.onclick = () => addSuggestion(Number(btn.dataset.db), Number(btn.dataset.amount)));

    const sets = readMealSets();
    const setsBox = $('#v24-sets', panel);
    setsBox.innerHTML = sets.length ? sets.slice(0, 6).map(set => `<div class="v24-set-card"><button type="button" class="v24-set-use" data-set="${esc(set.id)}"><strong>${esc(set.name)}</strong><small>${set.items.length}品 · 1タップ記録</small></button><button type="button" class="v24-set-del" data-del="${esc(set.id)}" aria-label="削除">×</button></div>`).join('') : '<span class="v24-muted">食事を記録したあと「今の食事を保存」で作れます</span>';
    $$('[data-set]', setsBox).forEach(btn => btn.onclick = () => useMealSet(btn.dataset.set));
    $$('[data-del]', setsBox).forEach(btn => btn.onclick = event => { event.stopPropagation(); deleteMealSet(btn.dataset.del); });

    const toggle = $('#v24-basket-toggle', panel);
    toggle.classList.toggle('active', basketMode);
    toggle.textContent = basketMode ? 'まとめ入力中' : 'まとめ入力';
    const basketBox = $('#v24-basket', panel);
    if (!basketMode && !basket.length) {
      basketBox.innerHTML = '';
    } else {
      const rows = basket.map(item => {
        const record = basketEntryRecord(item);
        const meta = record?._v24;
        const unit = item.kind === 'db' ? unitInfo(DB?.[item.index]).unit : '個';
        return `<div class="v24-basket-row"><span><strong>${esc(baseRecordName(record?.N))}</strong><small>${fmt(item.amount)}${esc(unit)} · ${Math.round(record?.Cal || 0)} kcal</small></span><div><button type="button" data-bminus="${esc(item.id)}">−</button><button type="button" data-bplus="${esc(item.id)}">＋</button><button type="button" class="remove" data-bremove="${esc(item.id)}">×</button></div></div>`;
      }).join('');
      basketBox.innerHTML = `<div class="v24-basket-box"><div class="v24-basket-title"><strong>今回の食事</strong><small>${basket.length}品</small></div>${rows || '<div class="v24-muted">食品を検索・カテゴリからタップするとここに入ります</div>'}<div class="v24-basket-actions"><button type="button" id="v24-basket-save">セットとして保存</button><button type="button" id="v24-basket-commit" ${basket.length ? '' : 'disabled'}>${basket.length ? `${basket.length}品を記録` : '食品を選択'}</button></div></div>`;
      $$('[data-bminus]', basketBox).forEach(btn => btn.onclick = () => adjustBasket(btn.dataset.bminus, -1));
      $$('[data-bplus]', basketBox).forEach(btn => btn.onclick = () => adjustBasket(btn.dataset.bplus, 1));
      $$('[data-bremove]', basketBox).forEach(btn => btn.onclick = () => removeBasket(btn.dataset.bremove));
      $('#v24-basket-save', basketBox).onclick = saveBasketAsSet;
      $('#v24-basket-commit', basketBox).onclick = commitBasket;
    }
  }

  function wrapSelectionFunctions() {
    if (typeof window.selFd === 'function' && !window.selFd.__v24Wrapped) {
      const original = window.selFd;
      const wrapped = function (index) {
        if (basketMode) return addBasketEntry('db', Number(index), dbDefaultAmount(Number(index)));
        return original.apply(this, arguments);
      };
      wrapped.__v24Wrapped = true;
      window.selFd = wrapped;
    }
    if (typeof window.selMyFd === 'function' && !window.selMyFd.__v24Wrapped) {
      const original = window.selMyFd;
      const wrapped = function (index) {
        if (basketMode) return addBasketEntry('my', Number(index), myDefaultAmount(Number(index)));
        return original.apply(this, arguments);
      };
      wrapped.__v24Wrapped = true;
      window.selMyFd = wrapped;
    }
  }

  function detectNewRecords(beforeIds) {
    if (typeof lst === 'undefined' || !Array.isArray(lst)) return [];
    return lst.filter(item => !beforeIds.has(Number(item?.id)));
  }

  function wrapNativeCommit(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__v24Wrapped) return;
    const wrapped = function () {
      const before = new Set((typeof lst !== 'undefined' && Array.isArray(lst) ? lst : []).map(item => Number(item?.id)));
      const result = original.apply(this, arguments);
      const added = detectNewRecords(before);
      if (added.length) {
        added.forEach(annotateRecord);
        if (typeof sv === 'function') sv();
        lastAction = { ids: added.map(item => item.id), message: `${added.length === 1 ? baseRecordName(added[0].N) : `${added.length}品`}を記録` };
        showActionSnack(lastAction.message, added.length === 1 ? added[0] : null);
        renderSmartPanel();
      }
      return result;
    };
    wrapped.__v24Wrapped = true;
    window[name] = wrapped;
  }

  function wrapOpenFunction(name, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.__v24OpenWrapped) return;
    const wrapped = function () {
      const result = original.apply(this, arguments);
      setTimeout(() => { renderSmartPanel(); decorateQuickCards(); if (after) after(); }, 0);
      return result;
    };
    wrapped.__v24OpenWrapped = true;
    window[name] = wrapped;
  }

  function installSearchCommand() {
    const input = $('#s-inp');
    if (!input || input.dataset.v24Command === '1') return;
    input.dataset.v24Command = '1';
    input.addEventListener('input', () => requestAnimationFrame(renderCommandSuggestion));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        const candidate = parseSmartCommand(input.value);
        if (candidate) {
          event.preventDefault();
          event.stopImmediatePropagation();
          commandCandidate = candidate;
          executeCommand(candidate);
        }
      }
    }, true);
  }

  function install() {
    ensureSmartPanel();
    wrapSelectionFunctions();
    wrapNativeCommit('addM');
    wrapNativeCommit('addFavoriteQuick');
    wrapOpenFunction('toggleManualPanel');
    wrapOpenFunction('openMan');
    wrapOpenFunction('openQuickManualInput');
    installSearchCommand();
    installQuickObserver();
    renderSmartPanel();
    decorateQuickCards();
    setInterval(() => {
      wrapSelectionFunctions();
      installSearchCommand();
      decorateQuickCards();
    }, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 50), { once: true });
  else setTimeout(install, 50);

  window.__PFC_INPUT_V24__ = {
    version: VERSION,
    features: ['previous-meal-copy', 'meal-sets', 'basket', 'quantity-chips', 'time-suggestions', 'smart-command-search', 'undo-adjust'],
    refresh: renderSmartPanel,
    getBasket: () => basket.slice(),
    getMealSets: readMealSets
  };
})();
