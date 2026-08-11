// PFC Mirror V2.2: realistic manager dummy-data simulator
(() => {
  'use strict';

  const VERSION = '2.2.0';

  function hashSeed(text) {
    let h = 2166136261;
    for (const ch of String(text)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
  }

  function chance(rng, probability) {
    return rng() < probability;
  }

  function roundTo(value, step) {
    return Math.max(step, Math.round(value / step) * step);
  }

  function localDateLabel(date) {
    return date.toLocaleDateString();
  }

  function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getDbRow(name) {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return null;
    return DB.find(row => row?.[1] === name) || null;
  }

  function unitInfo(row) {
    const raw = String(row?.[3] || '1個');
    if (/g/i.test(raw)) return { base: Number(raw.match(/[0-9.]+/)?.[0] || 100), unit: 'g', gram: true };
    const base = Number(raw.match(/[0-9.]+/)?.[0] || 1);
    const unit = raw.replace(/[0-9.\s]/g, '') || '個';
    return { base, unit, gram: false };
  }

  function makeFoodRecord(name, amount, time, id) {
    const row = getDbRow(name);
    if (!row) return null;
    const info = unitInfo(row);
    const multiplier = Number(amount) / info.base;
    const p = Number(row[4] || 0) * multiplier;
    const f = Number(row[5] || 0) * multiplier;
    const c = Number(row[6] || 0) * multiplier;
    const a = Number.isFinite(Number(row[8])) ? Number(row[8]) * multiplier : 0;
    const cal = Math.round(Number(row[7] || 0) * multiplier);
    const amountText = Number.isInteger(Number(amount)) ? String(Number(amount)) : Number(amount).toFixed(1);
    return {
      id,
      N: `${name}(${amountText}${info.unit})`,
      P: Number(p.toFixed(1)),
      F: Number(f.toFixed(1)),
      C: Number(c.toFixed(1)),
      A: Number(a.toFixed(1)),
      Cal: cal,
      U: row[3],
      time,
      isDummy: true,
      dummyVersion: VERSION
    };
  }

  function addFoods(target, definitions, baseId) {
    definitions.forEach((definition, index) => {
      const [name, amount, time] = definition;
      const record = makeFoodRecord(name, amount, time, baseId + index);
      if (record) target.push(record);
    });
  }

  const breakfasts = [
    [['白米', 150, '朝'], ['納豆', 1, '朝'], ['卵', 1, '朝'], ['インスタント味噌汁', 1, '朝']],
    [['オートミール', 45, '朝'], ['ヨーグルト', 150, '朝'], ['バナナ', 1, '朝']],
    [['食パン(6枚切)', 2, '朝'], ['卵', 2, '朝'], ['ヨーグルト', 100, '朝']],
    [['白米', 120, '朝'], ['鮭(焼き)', 1, '朝'], ['インスタント味噌汁', 1, '朝']],
    [['白米', 180, '朝'], ['納豆', 1, '朝'], ['卵白', 2, '朝'], ['卵', 1, '朝']]
  ];

  const weekdayLunches = [
    [['白米', 200, '昼'], ['鶏むね(皮なし)', 180, '昼'], ['ブロッコリー', 100, '昼']],
    [['白米', 180, '昼'], ['サラダチキン', 1, '昼'], ['ゆで卵', 1, '昼'], ['グリーンサラダ', 1, '昼']],
    [['うどん(1玉)', 2, '昼'], ['卵', 1, '昼']],
    [['そば(1玉)', 1, '昼'], ['サラダチキンバー', 1, '昼'], ['ゆで卵', 1, '昼']],
    [['鮭おにぎり', 2, '昼'], ['サラダチキン', 1, '昼']]
  ];

  const dinners = [
    [['白米', 180, '晩'], ['鶏もも(皮なし)', 180, '晩'], ['キャベツ', 100, '晩'], ['インスタント味噌汁', 1, '晩']],
    [['白米', 180, '晩'], ['鮭(焼き)', 2, '晩'], ['木綿豆腐', 150, '晩'], ['ほうれん草', 100, '晩']],
    [['白米', 200, '晩'], ['豚ロース(脂身無)', 180, '晩'], ['キャベツ', 120, '晩']],
    [['白米', 160, '晩'], ['鶏むね(皮なし)', 200, '晩'], ['ブロッコリー', 120, '晩'], ['インスタント味噌汁', 1, '晩']],
    [['白米', 200, '晩'], ['牛モモ(赤身)', 150, '晩'], ['グリーンサラダ', 1, '晩']]
  ];

  const restaurantMeals = [
    [['親子丼', 1, '昼']],
    [['牛丼', 1, '昼']],
    [['カレーライス', 1, '昼']],
    [['醤油ラーメン', 1, '昼'], ['ゆで卵', 1, '昼']],
    [['とんかつ', 1, '晩'], ['白米', 200, '晩']],
    [['唐揚げ', 180, '晩'], ['白米', 200, '晩']]
  ];

  const snacks = [
    [['オイコス', 1, '間食']],
    [['バナナ', 1, '間食']],
    [['プロテインバー(一本)', 1, '間食']],
    [['ナッツ(小掴み)', 20, '間食']],
    [['ヨーグルト', 150, '間食'], ['はちみつ', 15, '間食']]
  ];

  function buildRealisticFoodDay(date, dayOffset, rng) {
    const records = [];
    const dow = date.getDay();
    const weekend = dow === 0 || dow === 6;
    const baseId = Date.now() - dayOffset * 100000;

    // A few days are intentionally absent to mimic real-world missed logging.
    if (chance(rng, weekend ? 0.055 : 0.025)) return records;

    const breakfastChance = weekend ? 0.78 : 0.92;
    if (chance(rng, breakfastChance)) addFoods(records, pick(rng, breakfasts), baseId + 100);

    if (weekend && chance(rng, 0.58)) addFoods(records, pick(rng, restaurantMeals), baseId + 200);
    else if (chance(rng, 0.97)) addFoods(records, pick(rng, weekdayLunches), baseId + 200);

    if (chance(rng, weekend ? 0.92 : 0.97)) {
      if (weekend && chance(rng, 0.28)) addFoods(records, pick(rng, restaurantMeals), baseId + 300);
      else addFoods(records, pick(rng, dinners), baseId + 300);
    }

    if (chance(rng, weekend ? 0.55 : 0.38)) addFoods(records, pick(rng, snacks), baseId + 400);

    // Higher-carb / social day every 9-14 days, represented by plausible foods rather than a synthetic PFC block.
    if (dayOffset % (9 + Math.floor(rng() * 6)) === 0 && chance(rng, 0.7)) {
      addFoods(records, [['白米', roundTo(100 + rng() * 100, 25), '晩']], baseId + 500);
    }

    // Alcohol only when alcohol tracking is enabled, with weekend bias.
    if (typeof TG !== 'undefined' && TG?.alcMode && chance(rng, weekend ? 0.38 : 0.10)) {
      const beer = getDbRow('ビール(5%)') ? 'ビール(5%)' : (getDbRow('ビール') ? 'ビール' : null);
      if (beer) addFoods(records, [[beer, weekend ? 2 : 1, '晩']], baseId + 600);
    }

    // Roughly 7% of days look like incomplete logging: one meal disappears.
    if (records.length >= 5 && chance(rng, 0.07)) {
      const mealToDrop = pick(rng, ['朝', '昼', '晩']);
      const filtered = records.filter(record => record.time !== mealToDrop);
      return filtered.length ? filtered : records;
    }

    return records;
  }

  window.mgrGenerateFoodDummy = function mgrGenerateFoodDummyRealistic(months) {
    const nMonths = Math.min(12, Math.max(1, Number(months) || 1));
    if (!confirm(`過去${nMonths}ヶ月分の現実寄り食事シミュレーションを生成しますか？\n\n実際の記録は残し、同期間の旧ダミーだけ置き換えます。`)) return;
    if (typeof hist === 'undefined' || typeof svHist !== 'function') return;

    const today = new Date();
    const days = nMonths * 30;
    let generatedDays = 0;
    let generatedFoods = 0;

    for (let i = 1; i <= days; i += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const label = localDateLabel(date);
      const rng = mulberry32(hashSeed(`${VERSION}:food:${isoDate(date)}:${nMonths}`));
      const existing = hist.find(h => h.d === label);
      const realRecords = Array.isArray(existing?.l) ? existing.l.filter(item => !item?.isDummy) : [];
      const simulated = buildRealisticFoodDay(date, i, rng);
      const combined = realRecords.concat(simulated);

      if (combined.length) {
        svHist(label, combined);
        if (simulated.length) generatedDays += 1;
        generatedFoods += simulated.length;
      } else if (existing && Array.isArray(existing.l) && existing.l.some(item => item?.isDummy)) {
        hist = hist.filter(h => h.d !== label);
      }
    }

    localStorage.setItem('tf_hist', JSON.stringify(hist));
    if (typeof showToast === 'function') showToast(`${generatedDays}日・${generatedFoods}件の現実寄り食事データを生成しました`);
    if (typeof rHist === 'function') rHist();
    const active = document.querySelector('.g-btn.act');
    if (active && typeof drawGraph === 'function') drawGraph(active.textContent === '週間' ? 'week' : 'month', active);
  };

  function latestRealBodyRecord() {
    if (typeof bodyData === 'undefined' || !Array.isArray(bodyData)) return null;
    return bodyData
      .filter(item => !item?.isDummy && Number(item?.w) > 0)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .pop() || null;
  }

  window.mgrGenerateBodyDummy = function mgrGenerateBodyDummyRealistic(months) {
    const nMonths = Math.min(12, Math.max(1, Number(months) || 1));
    if (!confirm(`過去${nMonths}ヶ月分の現実寄り体組成シミュレーションを生成しますか？\n\n実際の測定値は上書きしません。`)) return;
    if (typeof bodyData === 'undefined' || !Array.isArray(bodyData)) return;

    const today = new Date();
    const days = nMonths * 30;
    const real = latestRealBodyRecord();
    const endWeight = Number(real?.w) > 0 ? Number(real.w) : 70.0;
    const endFat = Number(real?.f) > 0 ? Number(real.f) : 19.5;
    const endWaist = Number(real?.waist) > 0 ? Number(real.waist) : 82.0;
    const weeklyLoss = 0.32;
    const weeklyFatLoss = 0.12;
    const weeklyWaistLoss = 0.22;
    const weeks = days / 7;
    const startWeight = endWeight + weeklyLoss * weeks;
    const startFat = endFat + weeklyFatLoss * weeks;
    const startWaist = endWaist + weeklyWaistLoss * weeks;
    let previousNoise = 0;
    let count = 0;

    // Replace prior dummy points in range, but never touch real measurements.
    const firstDate = new Date(today);
    firstDate.setDate(today.getDate() - days);
    const firstIso = isoDate(firstDate);
    const todayIso = isoDate(today);
    bodyData = bodyData.filter(item => !item?.isDummy || String(item.date) < firstIso || String(item.date) >= todayIso);

    for (let i = days; i >= 1; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = isoDate(date);
      if (bodyData.some(item => item.date === dateKey && !item?.isDummy)) continue;

      const rng = mulberry32(hashSeed(`${VERSION}:body:${dateKey}:${nMonths}`));
      const dow = date.getDay();
      const weekend = dow === 0 || dow === 6;
      // Real users do not necessarily measure every day.
      if (!chance(rng, weekend ? 0.62 : 0.80)) continue;

      const progress = (days - i) / Math.max(1, days - 1);
      const trendWeight = startWeight + (endWeight - startWeight) * progress;
      const trendFat = startFat + (endFat - startFat) * progress;
      const trendWaist = startWaist + (endWaist - startWaist) * progress;

      // Autocorrelated water noise + weekend sodium/carb bump.
      const dailyShock = (rng() - 0.5) * 0.55;
      previousNoise = previousNoise * 0.55 + dailyShock;
      const weekendBump = (dow === 0 || dow === 1) && chance(rng, 0.45) ? 0.35 + rng() * 0.55 : 0;
      const weight = trendWeight + previousNoise + weekendBump;
      const fat = trendFat + (rng() - 0.5) * 0.55 + weekendBump * 0.12;
      const waist = trendWaist + (rng() - 0.5) * 0.7 + weekendBump * 0.18;

      bodyData.push({
        date: dateKey,
        w: Number(weight.toFixed(1)),
        f: Number(Math.max(4, fat).toFixed(1)),
        waist: Number(Math.max(50, waist).toFixed(1)),
        isDummy: true,
        dummyVersion: VERSION
      });
      count += 1;
    }

    bodyData.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    localStorage.setItem('tf_body', JSON.stringify(bodyData));
    if (typeof showToast === 'function') showToast(`${count}件の現実寄り体組成データを生成しました`);
    if (typeof renderBodyList === 'function') renderBodyList();
    const active = document.querySelector('.b-tog-btn.act');
    if (active && typeof drawBodyGraph === 'function') drawBodyGraph(active.textContent.includes('A') ? 'A' : 'B', active);
  };

  function polishManagerCopy() {
    const foodBtn = document.querySelector('button[onclick*="mgrGenerateFoodDummy"]');
    const bodyBtn = document.querySelector('button[onclick*="mgrGenerateBodyDummy"]');
    if (foodBtn) foodBtn.innerHTML = '🍱 現実寄りの食事履歴を生成';
    if (bodyBtn) bodyBtn.innerHTML = '📉 現実寄りの体組成履歴を生成';
    const section = foodBtn?.parentElement;
    if (section && !section.querySelector('.dummy-sim-note')) {
      const note = document.createElement('div');
      note.className = 'dummy-sim-note';
      note.style.cssText = 'font-size:11px;line-height:1.55;color:#667085;background:#eef8f3;border:1px solid #cdebdc;border-radius:9px;padding:9px 10px;margin:6px 0 2px;';
      note.textContent = '曜日・外食・間食・記録漏れ・日々の体重変動まで含むシミュレーションです。実データは残し、ダミーだけ再生成できます。';
      section.insertBefore(note, foodBtn);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', polishManagerCopy, { once: true });
  else polishManagerCopy();

  window.__PFC_DUMMY_V22__ = { version: VERSION, mode: 'realistic-simulation' };
})();
