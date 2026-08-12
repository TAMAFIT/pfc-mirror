// PFC Mirror Database V3 Phase B: curated natural-unit metadata.
(() => {
  'use strict';

  const VERSION = '3.1.2';
  const BASE_VERSION = '3.1.0';
  const BUNDLE_MIGRATION_MARKER = 'pfc-db-v3-bundle-units-310';

  // These are semantic/unit corrections only. Nutrition values remain untouched.
  const MEAL_AS_ONE_SERVING = new Set([
    '海苔弁当','幕の内弁当','ハンバーグ弁当','チキン南蛮弁当','生姜焼き弁当',
    'カツ丼','親子丼','麻婆丼','中華丼','オムライス','ミートソース','カルボナーラ',
    'ナポリタン','明太子パスタ','ペペロンチーノ','ドリア','グラタン','冷やし中華',
    'ざるそば','焼きそば','カップ麺','ポテト(S)','ポテト(M)','ポテト(L)'
  ]);

  const PACKAGE_OVERRIDES = {
    'からあげクン': 'パック',
    'じゃがりこ': 'カップ',
    'アイス(カップ)': 'カップ'
  };

  // The legacy row is one tray/box, but the name itself specifies an item count.
  // Converting these to explicit count bases makes Quick Input behave naturally.
  const BUNDLE_COUNT_BASES = {
    'ナゲット(5個)': 5,
    '餃子(6個)': 6,
    '唐揚げ(5個)': 5
  };

  const RICE_SERVING_REFERENCE = {
    kind: 'maff-serving-guide',
    label: '農林水産省 食事バランスガイド SV早見表',
    url: 'https://www.maff.go.jp/j/syokuiku/zissen_navi/balance/chart.html',
    exact: false,
    presets: [
      { label: 'S', grams: 100 },
      { label: 'M', grams: 150 },
      { label: 'L', grams: 200 }
    ],
    note: '食事バランスガイド上の標準的な主食量。茶碗そのものの固定重量ではない。'
  };

  const EGG_SIZE_REFERENCE = {
    kind: 'maff-egg-standard',
    label: '農林水産省 鶏卵の規格',
    url: 'https://www.maff.go.jp/j/kokuji_tuti/kokuji/k0000481.html',
    exact: true,
    grossWeightRanges: {
      M: [58, 64],
      L: [64, 70]
    },
    note: '殻を含む重量区分。可食部gへの自動換算には使わない。'
  };

  function findByName(name) {
    const api = window.__PFC_DB_V3__;
    if (!api?.items) return [];
    return api.items.filter(item => item?.name === name);
  }

  function setNaturalServing(meta, unit = '食') {
    if (!meta?.input) return;
    meta.input.defaultUnit = unit;
    meta.input.defaultAmount = 1;
    meta.input.quickStep = 0.5;
    meta.input.quickMin = 0.5;
    meta.input.type = unit === '食' ? 'portion' : 'package';
    meta.unitConfidence = 'high';
  }

  function migrateBundleFavoriteSettings() {
    try {
      if (localStorage.getItem(BUNDLE_MIGRATION_MARKER) === '1') return;
      if (typeof favoriteSettings === 'undefined' || !favoriteSettings || typeof favoriteSettings !== 'object') {
        localStorage.setItem(BUNDLE_MIGRATION_MARKER, '1');
        return;
      }
      let changed = false;
      Object.entries(BUNDLE_COUNT_BASES).forEach(([name, count]) => {
        findByName(name).forEach(meta => {
          const setting = favoriteSettings[`db:${meta.runtimeIndex}`];
          if (!setting || !Number.isFinite(Number(setting.amount)) || Number(setting.amount) <= 0) return;
          // Before 3.1, 1 meant one legacy tray/box/plate. Preserve that meaning as N items.
          setting.amount = Math.round(Number(setting.amount) * count * 100) / 100;
          changed = true;
        });
      });
      if (changed && typeof saveFavoriteSettings === 'function') saveFavoriteSettings();
      localStorage.setItem(BUNDLE_MIGRATION_MARKER, '1');
    } catch (error) {
      console.warn('[PFC DB V3.1] bundle favorite migration skipped', error);
    }
  }

  function applyBundleCountBases() {
    Object.entries(BUNDLE_COUNT_BASES).forEach(([name, count]) => {
      findByName(name).forEach(meta => {
        meta.nutritionBasis.amount = count;
        meta.nutritionBasis.unit = '個';
        meta.nutritionBasis.type = 'count';
        meta.nutritionBasis.exact = true;
        meta.input.defaultUnit = '個';
        meta.input.defaultAmount = count;
        meta.input.quickStep = 1;
        meta.input.quickMin = 1;
        meta.input.type = 'count';
        meta.unitConfidence = 'high';
        meta.unitSource = { kind: 'legacy-name', label: `${name} の食品名に明示された個数` };
      });
    });
  }

  function applyVerifiedSources() {
    const hints = window.__PFC_DB_V3_VERIFIED_SOURCES__ || {};
    Object.entries(hints).forEach(([name, hint]) => {
      findByName(name).forEach(meta => {
        meta.source = { ...hint.source };
        meta.servingSource = { ...hint.serving };
        meta.confidence = hint.confidence || 'high';
        meta.verifiedVersion = hint.verifiedVersion;
        meta.unitConfidence = hint.serving?.exactForEntry === true ? 'high' : meta.unitConfidence;
        if (hint.canonicalId) meta.canonicalId = hint.canonicalId;
        else if (hint.source?.kind === 'mext' && hint.source?.itemNo) meta.canonicalId = `mext:${hint.source.itemNo}`;
        meta.provenance = {
          sourceKind: hint.source?.kind || null,
          sourceId: hint.source?.itemNo || hint.source?.productId || null,
          confidence: hint.confidence || 'high',
          verifiedAt: hint.verifiedAt || hint.source?.verifiedAt || null,
          verifiedVersion: hint.verifiedVersion || null,
          datasetSha256: hint.source?.datasetSha256 || null
        };
      });
    });
  }

  function applyNaturalUnits() {
    const api = window.__PFC_DB_V3__;
    if (!api?.items) return;

    api.items.forEach(meta => {
      if (MEAL_AS_ONE_SERVING.has(meta.name)) setNaturalServing(meta, '食');
      const packageUnit = PACKAGE_OVERRIDES[meta.name];
      if (packageUnit) setNaturalServing(meta, packageUnit);

      if (['白米','玄米','雑穀米','麦ご飯'].includes(meta.name)) {
        meta.input.references = [...(meta.input.references || []), RICE_SERVING_REFERENCE];
      }
      if (meta.name === '全卵(M)') {
        meta.input.references = [...(meta.input.references || []), { ...EGG_SIZE_REFERENCE, selectedSize: 'M' }];
      }
      if (meta.name === '全卵(L)') {
        meta.input.references = [...(meta.input.references || []), { ...EGG_SIZE_REFERENCE, selectedSize: 'L' }];
      }
    });
  }

  function install() {
    if (!window.__PFC_DB_V3__) return;
    migrateBundleFavoriteSettings();
    applyBundleCountBases();
    applyNaturalUnits();
    applyVerifiedSources();

    window.__PFC_DB_V3_CATALOG__ = {
      version: VERSION,
      baseVersion: BASE_VERSION,
      semanticOnly: true,
      bundleCountFoods: Object.keys(BUNDLE_COUNT_BASES),
      mealServingFoods: [...MEAL_AS_ONE_SERVING],
      packageOverrides: { ...PACKAGE_OVERRIDES },
      verifiedSourcesApplied: Object.keys(window.__PFC_DB_V3_VERIFIED_SOURCES__ || {}).length,
      provenanceSchema: 1,
      sources: {
        maffRiceServingGuide: RICE_SERVING_REFERENCE.url,
        maffEggStandard: EGG_SIZE_REFERENCE.url
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
