// PFC Mirror Database V3 Phase A: compatibility-safe unit metadata and scaling engine.
(() => {
  'use strict';

  const VERSION = '3.0.0';
  const LEGACY_SOURCE_ROWS = 408;
  const MIGRATION_MARKER = 'pfc-db-v3-favorite-units-300';

  const GENERIC_ALIAS_TOKENS = new Set([
    '肉','にく','魚','さかな','米','こめ','ごはん','麺','めん','パン','ぱん',
    '野菜','やさい','果物','くだもの','フルーツ','ふるーつ','コンビニ','こんびに',
    'お菓子','おかし','スイーツ','すいーつ','酒','お酒','飲み物','スープ','すーぷ','汁'
  ].map(normalize));

  const DISPLAY_UNIT_OVERRIDES = {
    'パックご飯': 'パック',
    '納豆': 'パック',
    'ケンタッキー': 'ピース',
    'プロテイン(標準:ザバス等)': 'スクープ',
    'プロテイン(高:ゴルスタ等)': 'スクープ',
    'ホエイ(牛乳)': 'スクープ',
    'ソイプロテイン': 'スクープ'
  };

  const DEFAULT_AMOUNT_OVERRIDES = {
    '白米': 150,
    '玄米': 150,
    '雑穀米': 150,
    '麦ご飯': 150,
    'パスタ(乾麺)': 100,
    'パスタ(ゆで)': 200,
    '鶏むね(皮なし)': 100,
    '鶏むね(皮あり)': 100,
    '鶏ささみ': 100,
    '鶏もも(皮なし)': 100,
    '鶏もも(皮あり)': 100
  };

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･\s]/g, '')
      .trim();
  }

  function fmt(value) {
    const n = Math.round(Number(value || 0) * 100) / 100;
    return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, '').replace(/\.$/, '');
  }

  function parseNumber(value) {
    const raw = String(value || '').trim();
    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(raw)) {
      const [a, b] = raw.split('/').map(Number);
      return b ? a / b : 0;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeCountUnit(rawUnit, name) {
    const u = String(rawUnit || '');
    if (/^P$/i.test(u)) {
      if (name === 'ケンタッキー') return { id: 'piece', label: 'ピース', type: 'count' };
      return { id: 'package', label: 'パック', type: 'package' };
    }
    const map = {
      '個': ['count','個'], '本': ['count','本'], '枚': ['count','枚'], '切': ['count','切'],
      '切れ': ['count','切れ'], '粒': ['count','粒'], '玉': ['count','玉'], '束': ['count','束'],
      '缶': ['package','缶'], '袋': ['package','袋'], '箱': ['package','箱'], 'パック': ['package','パック'],
      '小袋': ['package','小袋'], '杯': ['portion','杯'], '皿': ['portion','皿'], '食': ['portion','食'],
      '人前': ['portion','人前'], '舟': ['portion','舟'], 'かけ': ['count','かけ'], '片': ['count','片'],
      '尾': ['count','尾'], '貫': ['count','貫'], '合': ['portion','合'], '個分': ['portion','個分'],
      'スクープ': ['portion','スクープ']
    };
    const hit = map[u];
    return hit ? { id: normalize(hit[1]), label: hit[1], type: hit[0] } : { id: normalize(u), label: u, type: 'portion' };
  }

  function parseLegacyBasis(row) {
    const name = String(row?.[1] || '');
    const raw = String(row?.[3] || '').normalize('NFKC').trim();
    let match = raw.match(/^([0-9.]+)g$/i);
    if (match) return { amount: Number(match[1]), unit: 'g', type: 'mass', raw, exact: true };
    match = raw.match(/^([0-9.]+)ml$/i);
    if (match) return { amount: Number(match[1]), unit: 'ml', type: 'volume', raw, exact: true };
    match = raw.match(/^(大さじ|小さじ)([0-9./]+)$/);
    if (match) return { amount: parseNumber(match[2]), unit: match[1], type: 'cooking', raw, exact: true };
    match = raw.match(/^([0-9.]+(?:\/[0-9.]+)?)(個分|小袋|人前|切れ|パック|スクープ|個|本|枚|切|粒|玉|束|缶|袋|杯|皿|食|箱|P|舟|かけ|片|尾|貫|合)$/i);
    if (match) {
      const unit = normalizeCountUnit(match[2], name);
      return { amount: parseNumber(match[1]), unit: unit.label, type: unit.type, raw, exact: true };
    }
    if (/^(S|M|L|並|小|大|特盛|メガ)$/i.test(raw)) {
      return { amount: 1, unit: inferServingUnit(row), type: 'size', raw, exact: false, variant: raw };
    }
    if (/^(小鉢|一口|少々)$/i.test(raw)) {
      return { amount: 1, unit: raw, type: 'portion', raw, exact: false, vague: true };
    }
    return { amount: 1, unit: raw || '食', type: 'portion', raw, exact: false, vague: true };
  }

  function inferServingUnit(row) {
    const category = String(row?.[0] || '');
    const name = String(row?.[1] || '');
    if (/シェイク|ドリンク|コーヒー|ジュース/.test(name)) return '杯';
    if (/カレー/.test(name)) return '皿';
    if (/丼|ラーメン|うどん|そば|スープ|汁/.test(name)) return '杯';
    if (/弁当|定食|パスタ|オムライス|ドリア|グラタン|焼きそば|冷やし中華/.test(name)) return '食';
    if (/コンビニ/.test(category)) return '食';
    return '食';
  }

  function normalizeCategory(row) {
    const legacy = String(row?.[0] || '');
    const name = String(row?.[1] || '');
    if (legacy.includes('炭水化物')) return 'staples';
    if (legacy.includes('肉類')) return 'meat';
    if (legacy.includes('魚介')) return 'seafood';
    if (legacy.includes('卵・乳・大豆')) return 'eggs-dairy-soy';
    if (legacy.includes('野菜')) return 'vegetables';
    if (legacy.includes('果物')) return 'fruit';
    if (legacy.includes('汁物')) return 'soup';
    if (legacy.includes('油脂')) return 'fats-condiments';
    if (legacy.includes('コンビニ')) return 'convenience';
    if (legacy.includes('サプリ')) return 'supplements';
    if (legacy.includes('酒・ジュース')) {
      const a = Number(row?.[8]);
      return Number.isFinite(a) && a > 0 ? 'alcohol' : 'beverages';
    }
    if (legacy.includes('ジャンク・菓子')) {
      if (/(牛丼|豚丼|カレー|定食|ラーメン|チャーハン|餃子|麻婆豆腐|唐揚げ|ピザ|たこ焼き|お好み焼き|うな牛)/.test(name)) return 'dishes';
      if (/(バーガー|マック|ポテト\([SML]\)|ナゲット|ケンタッキー|クリスピー|ツイスター)/.test(name)) return 'fast-food';
      return 'snacks-sweets';
    }
    if (legacy.includes('料理')) return 'dishes';
    return 'other';
  }

  function baseName(name) {
    return String(name || '').replace(/[（(]([^()（）]+)[)）]\s*$/, '').trim();
  }

  function variantLabel(name, basis) {
    if (basis?.variant) return basis.variant;
    const match = String(name || '').match(/[（(]([^()（）]+)[)）]\s*$/);
    return match ? match[1] : '';
  }

  function defaultAmountFor(row, basis) {
    const name = String(row?.[1] || '');
    if (Number.isFinite(Number(DEFAULT_AMOUNT_OVERRIDES[name]))) return Number(DEFAULT_AMOUNT_OVERRIDES[name]);
    if (basis.type === 'mass') return Math.max(0.01, basis.amount);
    if (basis.type === 'volume') return Math.max(1, basis.amount);
    return Math.max(0.01, basis.amount || 1);
  }

  function quickStepFor(row, basis, defaultAmount) {
    const name = String(row?.[1] || '');
    if (basis.type === 'mass') {
      if (/クレアチン/.test(name)) return 1;
      if (defaultAmount <= 10) return 1;
      if (defaultAmount <= 30) return 5;
      if (defaultAmount <= 60) return 10;
      return 50;
    }
    if (basis.type === 'volume') return defaultAmount >= 500 ? 100 : 50;
    if (basis.type === 'cooking') return 0.5;
    if (basis.type === 'portion' || basis.type === 'size') {
      if (basis.amount < 1) return basis.amount;
      return 0.5;
    }
    if (basis.type === 'package') return 1;
    if (basis.type === 'count') {
      if (basis.amount >= 10) return 5;
      return 1;
    }
    return 1;
  }

  function displayUnitFor(row, basis) {
    const name = String(row?.[1] || '');
    if (DISPLAY_UNIT_OVERRIDES[name]) return DISPLAY_UNIT_OVERRIDES[name];
    if (basis.type === 'size') return inferServingUnit(row);
    return basis.unit;
  }

  function formatAmount(meta, amount) {
    const unit = meta?.input?.defaultUnit || '';
    const value = fmt(amount);
    if (unit === '大さじ' || unit === '小さじ') return `${unit}${value}`;
    return `${value}${unit}`;
  }

  function buildMeta(row, index) {
    const basis = parseLegacyBasis(row);
    const defaultAmount = defaultAmountFor(row, basis);
    const aliases = String(row?.[2] || '').split(/\s+/).filter(Boolean);
    const genericTags = aliases.filter(alias => GENERIC_ALIAS_TOKENS.has(normalize(alias)));
    const specificAliases = aliases.filter(alias => !GENERIC_ALIAS_TOKENS.has(normalize(alias)));
    const name = String(row?.[1] || '');
    const a = Number.isFinite(Number(row?.[8])) ? Number(row[8]) : 0;
    const category = normalizeCategory(row);
    const displayUnit = displayUnitFor(row, basis);
    const confidence = basis.vague ? 'low' : (index >= LEGACY_SOURCE_ROWS ? 'medium' : 'medium');

    return {
      id: `db:${normalize(name)}:${index}`,
      legacyIndex: index < LEGACY_SOURCE_ROWS ? index : null,
      runtimeIndex: index,
      name,
      baseName: baseName(name),
      variant: variantLabel(name, basis),
      legacyCategory: String(row?.[0] || ''),
      category,
      aliases: specificAliases,
      genericTags,
      nutritionBasis: {
        amount: basis.amount,
        unit: basis.unit,
        type: basis.type,
        legacy: basis.raw,
        exact: basis.exact
      },
      nutrition: {
        p: Number(row?.[4] || 0),
        f: Number(row?.[5] || 0),
        c: Number(row?.[6] || 0),
        a,
        kcal: Number(row?.[7] || 0)
      },
      input: {
        defaultUnit: displayUnit,
        defaultAmount,
        quickStep: quickStepFor(row, basis, defaultAmount),
        quickMin: basis.amount < 1 ? basis.amount : (basis.type === 'mass' ? Math.min(defaultAmount, Math.max(1, quickStepFor(row, basis, defaultAmount))) : (basis.type === 'volume' ? Math.min(defaultAmount, 50) : (basis.type === 'cooking' || basis.type === 'portion' || basis.type === 'size' ? 0.5 : 1))),
        type: basis.type
      },
      source: {
        kind: index >= LEGACY_SOURCE_ROWS ? 'mirror-curated' : 'legacy',
        label: index >= LEGACY_SOURCE_ROWS ? 'Mirror curated extension' : 'Legacy PFC DB'
      },
      confidence
    };
  }

  let items = [];
  let byIndex = new Map();

  function rebuild() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) {
      items = [];
      byIndex = new Map();
      return;
    }
    items = DB.map(buildMeta);
    byIndex = new Map(items.map(item => [item.runtimeIndex, item]));

    const firstByCanonical = new Map();
    items.forEach(item => {
      const key = normalize(item.name);
      const first = firstByCanonical.get(key);
      if (!first) firstByCanonical.set(key, item);
      else item.duplicateOf = first.id;
    });
  }

  function get(index) {
    return byIndex.get(Number(index)) || null;
  }

  function multiplierFor(index, amount) {
    const meta = get(index);
    if (!meta) return 0;
    const basis = Number(meta.nutritionBasis.amount || 1);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !basis) return 0;
    return value / basis;
  }

  function scale(index, amount) {
    const meta = get(index);
    const multiplier = multiplierFor(index, amount);
    if (!meta || !multiplier) return null;
    const n = meta.nutrition;
    return {
      amount: Number(amount),
      unit: meta.input.defaultUnit,
      multiplier,
      p: Number((n.p * multiplier).toFixed(1)),
      f: Number((n.f * multiplier).toFixed(1)),
      c: Number((n.c * multiplier).toFixed(1)),
      a: Number((n.a * multiplier).toFixed(1)),
      kcal: Math.round(n.kcal * multiplier)
    };
  }

  function amountChoices(index) {
    const meta = get(index);
    if (!meta) return [];
    const base = Number(meta.input.defaultAmount || meta.nutritionBasis.amount || 1);
    const step = Number(meta.input.quickStep || 1);
    const type = meta.input.type;
    const name = meta.name;
    let values = [];

    if (/^(白米|玄米|雑穀米|麦ご飯)$/.test(name)) values = [100,150,200,250,300,400];
    else if (type === 'mass') {
      if (base <= 10) values = [Math.max(1, base-step*2), Math.max(1, base-step), base, base+step, base+step*2];
      else if (base <= 30) values = [Math.max(step, base-step*2), Math.max(step, base-step), base, base+step, base+step*2];
      else values = [Math.max(step, base-step), base, base+step, base+step*2, base+step*3];
    } else if (type === 'volume') {
      values = base >= 500 ? [250,350,500,750,1000] : [Math.max(50,base-100), Math.max(50,base-50), base, base+50, base+100];
    } else if (type === 'cooking') values = [0.5,1,1.5,2];
    else if (base < 1) values = [base, base*2, base*3, base*4];
    else if ((type === 'count' || type === 'package') && base >= 5) values = [Math.max(1, base-step), base, base+step, base+step*2];
    else if (type === 'count' || type === 'package') values = [0.5,1,2,3];
    else values = [0.5,1,1.5,2];

    return [...new Set(values.map(v => Math.round(v * 100) / 100).filter(v => Number.isFinite(v) && v > 0))].sort((a,b) => a-b);
  }

  function buildRecord(index, amount, time) {
    const meta = get(index);
    const scaled = scale(index, amount);
    if (!meta || !scaled) return null;
    const row = DB[index];
    return {
      id: Date.now(),
      N: `${meta.name}(${formatAmount(meta, amount)})`,
      P: scaled.p,
      F: scaled.f,
      C: scaled.c,
      A: scaled.a,
      Cal: scaled.kcal,
      U: row?.[3] || `${meta.nutritionBasis.amount}${meta.nutritionBasis.unit}`,
      time: time || (typeof getAutoTime === 'function' ? getAutoTime() : '朝'),
      _dbv3: { id: meta.id, index, amount: Number(amount), unit: meta.input.defaultUnit }
    };
  }

  function migrateFavoriteAmounts() {
    try {
      if (localStorage.getItem(MIGRATION_MARKER) === '1') return;
      if (typeof favoriteSettings === 'undefined' || !favoriteSettings || typeof favoriteSettings !== 'object') {
        localStorage.setItem(MIGRATION_MARKER, '1');
        return;
      }
      let changed = false;
      Object.entries(favoriteSettings).forEach(([key, setting]) => {
        const match = key.match(/^db:(\d+)$/);
        if (!match || !setting || !Number.isFinite(Number(setting.amount)) || Number(setting.amount) <= 0) return;
        const index = Number(match[1]);
        const meta = get(index);
        const row = typeof DB !== 'undefined' ? DB[index] : null;
        if (!meta || !row) return;
        const legacyUnit = String(row[3] || '');
        // Legacy quick input treated every non-g unit as a multiplier, not a real amount.
        if (!legacyUnit.includes('g')) {
          const basis = Number(meta.nutritionBasis.amount || 1);
          if (basis !== 1) {
            setting.amount = Math.round(Number(setting.amount) * basis * 100) / 100;
            changed = true;
          }
        }
      });
      if (changed && typeof saveFavoriteSettings === 'function') saveFavoriteSettings();
      localStorage.setItem(MIGRATION_MARKER, '1');
    } catch (error) {
      console.warn('[PFC DB V3] favorite migration skipped', error);
    }
  }

  function installCompatibilityOverrides() {
    const legacyGetDbDefaultAmount = window.getDbDefaultAmount;
    const legacyGetFavoriteUnit = window.getFavoriteUnit;
    const legacyFormatFavoriteAmount = window.formatFavoriteAmount;
    const legacyBuildFavoriteLogItem = window.buildFavoriteLogItem;

    window.getDbDefaultAmount = function (index) {
      const meta = get(index);
      if (!meta) return typeof legacyGetDbDefaultAmount === 'function' ? legacyGetDbDefaultAmount(index) : 1;
      if (typeof getFavoriteSetting === 'function') {
        const setting = getFavoriteSetting('db', index);
        if (Number.isFinite(Number(setting?.amount)) && Number(setting.amount) > 0) return Number(setting.amount);
      }
      return meta.input.defaultAmount;
    };

    window.getFavoriteUnit = function (item) {
      if (item?.source === 'db') return get(item.i)?.input?.defaultUnit || '';
      return typeof legacyGetFavoriteUnit === 'function' ? legacyGetFavoriteUnit(item) : '個';
    };

    window.formatFavoriteAmount = function (item) {
      if (item?.source === 'db') {
        const meta = get(item.i);
        const amount = typeof getFavoriteAmount === 'function' ? getFavoriteAmount(item) : meta?.input?.defaultAmount;
        if (meta) return formatAmount(meta, amount);
      }
      return typeof legacyFormatFavoriteAmount === 'function' ? legacyFormatFavoriteAmount(item) : '';
    };

    window.buildFavoriteLogItem = function (item, amount) {
      if (item?.source === 'db') return buildRecord(item.i, amount);
      return typeof legacyBuildFavoriteLogItem === 'function' ? legacyBuildFavoriteLogItem(item, amount) : null;
    };
  }

  function install() {
    rebuild();
    migrateFavoriteAmounts();
    installCompatibilityOverrides();
    window.__PFC_DB_V3__ = {
      version: VERSION,
      phase: 'A',
      legacySourceRows: LEGACY_SOURCE_ROWS,
      get items() { return items; },
      get,
      rebuild,
      scale,
      buildRecord,
      multiplierFor,
      amountChoices,
      formatAmount,
      parseLegacyBasis,
      stats: () => ({
        effectiveRows: items.length,
        legacyRows: items.filter(x => x.source.kind === 'legacy').length,
        curatedRows: items.filter(x => x.source.kind === 'mirror-curated').length,
        duplicates: items.filter(x => x.duplicateOf).length,
        unitTypes: items.reduce((acc, x) => { acc[x.input.type] = (acc[x.input.type] || 0) + 1; return acc; }, {})
      })
    };
    document.documentElement.classList.add('pfc-db-v3');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
