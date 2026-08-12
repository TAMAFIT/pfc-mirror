// PFC Mirror Database V3 Phase B2: source-verified high-frequency foods.
(() => {
  'use strict';

  const VERSION = '3.2.0';

  // All nutrition source values are MEXT Food Composition Database values.
  // Serving conversions are only applied when an official MAFF source gives a weight relationship.
  const VERIFIED = [
    {
      name: 'こいくち醤油',
      row: ['🧈油脂類','こいくち醤油','しょうゆ 醤油 こいくち 濃口しょうゆ 濃口醤油','大さじ1',1.4,0.0,1.4,14,0.4],
      source: {
        kind: 'mext',
        label: '文部科学省 食品成分データベース こいくちしょうゆ',
        url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=17_17007_7',
        itemNo: '17007',
        per100g: { p: 7.7, f: 0.0, c: 7.9, kcal: 76, a: 2.1 }
      },
      serving: {
        kind: 'maff-recipe-weight',
        label: '農林水産省 上州きんぴら',
        url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html',
        measure: '大さじ1',
        grams: 18,
        exactForEntry: true
      }
    },
    {
      name: '上白糖',
      row: ['🧈油脂類','上白糖','じょうはくとう 砂糖 さとう 白砂糖 ソフトシュガー','大さじ1',0.0,0.0,8.9,35],
      source: {
        kind: 'mext',
        label: '文部科学省 食品成分データベース 上白糖',
        url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=03_03003_6',
        itemNo: '03003',
        per100g: { p: 0.0, f: 0.0, c: 99.3, kcal: 391, a: 0.0 }
      },
      serving: {
        kind: 'maff-recipe-weight',
        label: '農林水産省 上州きんぴら',
        url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html',
        measure: '大さじ1',
        grams: 9,
        exactForEntry: true,
        derivation: '小さじ2=6g → 小さじ1=3g → 大さじ1=9g'
      }
    },
    {
      name: '米みそ(淡色辛みそ)',
      row: ['🧈油脂類','米みそ(淡色辛みそ)','みそ 味噌 米みそ 淡色みそ 淡色辛みそ','10g',1.3,0.6,2.2,18],
      source: {
        kind: 'mext',
        label: '文部科学省 食品成分データベース 米みそ 淡色辛みそ',
        url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=17_17045_7',
        itemNo: '17045',
        per100g: { p: 12.5, f: 6.0, c: 21.9, kcal: 182, a: 0.0 }
      },
      serving: {
        kind: 'mass-only',
        measure: '10g',
        grams: 10,
        exactForEntry: true,
        note: '大さじ換算は製品差を考慮して未適用。g入力を正本とする。'
      }
    },
    {
      name: '本みりん',
      row: ['🧈油脂類','本みりん','ほんみりん みりん 味醂 調味料','大さじ1',0.1,0.0,7.8,43,1.7],
      source: {
        kind: 'mext',
        label: '文部科学省 食品成分データベース 本みりん',
        url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=16_16025_6',
        itemNo: '16025',
        per100g: { p: 0.3, f: 0.0, c: 43.2, kcal: 241, a: 9.5 }
      },
      serving: {
        kind: 'maff-recipe-weight',
        label: '農林水産省 上州きんぴら',
        url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html',
        measure: '大さじ1',
        grams: 18,
        exactForEntry: true,
        derivation: '小さじ1=6g → 大さじ1=18g'
      }
    }
  ];

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･\s()（）]/g, '');
  }

  function addVerifiedRows() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return [];
    const added = [];
    VERIFIED.forEach(entry => {
      const key = normalize(entry.name);
      const exists = DB.some(row => normalize(row?.[1]) === key);
      if (exists) return;
      DB.push(entry.row.slice());
      added.push(entry.name);
    });
    return added;
  }

  function install() {
    const added = addVerifiedRows();
    window.__PFC_DB_V3_VERIFIED_SOURCES__ = Object.fromEntries(
      VERIFIED.map(entry => [entry.name, {
        source: entry.source,
        serving: entry.serving,
        confidence: 'high',
        verifiedVersion: VERSION
      }])
    );
    window.__PFC_DB_V3_VERIFIED__ = {
      version: VERSION,
      names: VERIFIED.map(x => x.name),
      added,
      sourcePolicy: 'MEXT nutrition + MAFF serving conversion when available'
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
