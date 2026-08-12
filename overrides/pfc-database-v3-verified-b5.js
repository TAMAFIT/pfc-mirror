// PFC Mirror Database V3 Phase B5: source-verified common fish, vegetables and fruit.
(() => {
  'use strict';

  const VERSION = '3.5.0';
  const VERIFIED = [
    {
      name: 'まだら(生)',
      row: ['🐟魚介類','まだら(生)','まだら マダラ 真鱈 たら タラ 鱈 魚 さかな','100g',17.6,0.2,0.1,72],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース まだら 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10205_7', itemNo: '10205', per100g: { p: 17.6, f: 0.2, c: 0.1, kcal: 72, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '切り身サイズが一定ではないため1切への自動換算は行わない。' }
    },
    {
      name: 'スイートコーン(生)',
      row: ['🥦野菜','スイートコーン(生)','すいーとこーん スイートコーン とうもろこし トウモロコシ 玉蜀黍 コーン 野菜','100g',3.6,1.7,16.8,89],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース スイートコーン 未熟種子 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06175_7', itemNo: '06175', per100g: { p: 3.6, f: 1.7, c: 16.8, kcal: 89, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '廃棄率50%かつ個体差があるため1本への自動換算は行わない。' }
    },
    {
      name: 'ズッキーニ',
      row: ['🥦野菜','ズッキーニ','ずっきーに ズッキーニ 野菜 やさい','100g',1.3,0.1,2.8,16],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース ズッキーニ 果実 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06116_7', itemNo: '06116', per100g: { p: 1.3, f: 0.1, c: 2.8, kcal: 16, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'マンゴー(生)',
      row: ['🍎果物','マンゴー(生)','まんごー マンゴー 果物 くだもの フルーツ','100g',0.6,0.1,15.7,68],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース マンゴー 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=7_07132_7', itemNo: '07132', per100g: { p: 0.6, f: 0.1, c: 15.7, kcal: 68, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '廃棄率35%かつ果実サイズ差があるため1個への自動換算は行わない。' }
    },
    {
      name: 'ブルーベリー(生)',
      row: ['🍎果物','ブルーベリー(生)','ぶるーべりー ブルーベリー 果物 くだもの フルーツ','100g',0.5,0.1,12.9,48],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース ブルーベリー 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=7_07124_7', itemNo: '07124', per100g: { p: 0.5, f: 0.1, c: 12.9, kcal: 48, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'ネーブルオレンジ(生)',
      row: ['🍎果物','ネーブルオレンジ(生)','ねーぶるおれんじ ネーブルオレンジ オレンジ おれんじ 果物 くだもの フルーツ','100g',0.9,0.1,11.8,48],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース オレンジ ネーブル 砂じょう 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=7_07040_7', itemNo: '07040', per100g: { p: 0.9, f: 0.1, c: 11.8, kcal: 48, a: 0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '廃棄率35%かつ果実サイズ差があるため1個への自動換算は行わない。' }
    }
  ];

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･\s()（）]/g, '');
  }

  function install() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return;
    const added = [];
    const sourceMap = window.__PFC_DB_V3_VERIFIED_SOURCES__ || {};
    VERIFIED.forEach(entry => {
      const key = normalize(entry.name);
      if (!DB.some(row => normalize(row?.[1]) === key)) {
        DB.push(entry.row.slice());
        added.push(entry.name);
      }
      sourceMap[entry.name] = {
        source: entry.source,
        serving: entry.serving,
        confidence: 'high',
        verifiedVersion: VERSION
      };
    });
    window.__PFC_DB_V3_VERIFIED_SOURCES__ = sourceMap;
    window.__PFC_DB_V3_VERIFIED_B5__ = {
      version: VERSION,
      names: VERIFIED.map(x => x.name),
      added,
      sourcePolicy: 'MEXT edible-portion 100g; no guessed biological piece conversions'
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
