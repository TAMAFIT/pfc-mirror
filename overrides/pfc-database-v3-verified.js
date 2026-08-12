// PFC Mirror Database V3: source-verified high-frequency foods.
(() => {
  'use strict';

  const VERSION = '3.4.0';

  // Nutrition source values are MEXT Food Composition Database values.
  // Serving conversions are only applied when an official source gives a defensible relationship.
  const VERIFIED = [
    {
      name: 'こいくち醤油',
      row: ['🧈油脂類','こいくち醤油','しょうゆ 醤油 こいくち 濃口しょうゆ 濃口醤油','大さじ1',1.4,0.0,1.4,14,0.4],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース こいくちしょうゆ', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=17_17007_7', itemNo: '17007', per100g: { p: 7.7, f: 0.0, c: 7.9, kcal: 76, a: 2.1 } },
      serving: { kind: 'maff-recipe-weight', label: '農林水産省 上州きんぴら', url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html', measure: '大さじ1', grams: 18, exactForEntry: true }
    },
    {
      name: '上白糖',
      row: ['🧈油脂類','上白糖','じょうはくとう 砂糖 さとう 白砂糖 ソフトシュガー','大さじ1',0.0,0.0,8.9,35],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 上白糖', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=03_03003_6', itemNo: '03003', per100g: { p: 0.0, f: 0.0, c: 99.3, kcal: 391, a: 0.0 } },
      serving: { kind: 'maff-recipe-weight', label: '農林水産省 上州きんぴら', url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html', measure: '大さじ1', grams: 9, exactForEntry: true, derivation: '小さじ2=6g → 小さじ1=3g → 大さじ1=9g' }
    },
    {
      name: '米みそ(淡色辛みそ)',
      row: ['🧈油脂類','米みそ(淡色辛みそ)','みそ 味噌 米みそ 淡色みそ 淡色辛みそ','10g',1.3,0.6,2.2,18],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 米みそ 淡色辛みそ', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=17_17045_7', itemNo: '17045', per100g: { p: 12.5, f: 6.0, c: 21.9, kcal: 182, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '10g', grams: 10, exactForEntry: true, note: '大さじ換算は製品差を考慮して未適用。g入力を正本とする。' }
    },
    {
      name: '本みりん',
      row: ['🧈油脂類','本みりん','ほんみりん みりん 味醂 調味料','大さじ1',0.1,0.0,7.8,43,1.7],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 本みりん', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=16_16025_6', itemNo: '16025', per100g: { p: 0.3, f: 0.0, c: 43.2, kcal: 241, a: 9.5 } },
      serving: { kind: 'maff-recipe-weight', label: '農林水産省 上州きんぴら', url: 'https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/32_10_gunma.html', measure: '大さじ1', grams: 18, exactForEntry: true, derivation: '小さじ1=6g → 大さじ1=18g' }
    },
    {
      name: '豚肩ロース(脂身つき)',
      row: ['🍖肉類','豚肩ロース(脂身つき)','ぶたかたろーす 豚肩ロース 肩ロース ポーク 豚肉','100g',17.1,19.2,0.1,237],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 豚 大型種肉 かたロース 脂身つき 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11119_7', itemNo: '11119', per100g: { p: 17.1, f: 19.2, c: 0.1, kcal: 237, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: '鶏手羽元(皮つき)',
      row: ['🍖肉類','鶏手羽元(皮つき)','とりてばもと 手羽元 てばもと 鶏肉 チキン','100g',18.2,12.8,0.0,175],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 若どり 手羽もと 皮つき 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11286_7', itemNo: '11286', per100g: { p: 18.2, f: 12.8, c: 0.0, kcal: 175, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '骨付きで個体差が大きいため「1本」の自動g換算は行わない。' }
    },
    {
      name: 'サバ(生)',
      row: ['🐟魚介類','サバ(生)','さば サバ 鯖 まさば マサバ 魚 さかな','100g',20.6,16.8,0.3,211],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース まさば 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10154_7', itemNo: '10154', per100g: { p: 20.6, f: 16.8, c: 0.3, kcal: 211, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'アジ(生)',
      row: ['🐟魚介類','アジ(生)','あじ アジ 鯵 まあじ マアジ 魚 さかな','100g',19.7,4.5,0.1,112],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース まあじ 皮つき 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10003_7', itemNo: '10003', per100g: { p: 19.7, f: 4.5, c: 0.1, kcal: 112, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'ピーマン',
      row: ['🥦野菜','ピーマン','ぴーまん ピーマン 青ピーマン やさい 野菜','100g',0.9,0.2,5.1,20],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 青ピーマン 果実 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06245_7', itemNo: '06245', per100g: { p: 0.9, f: 0.2, c: 5.1, kcal: 20, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'なす',
      row: ['🥦野菜','なす','なす ナス 茄子 やさい 野菜','100g',1.1,0.1,5.1,18],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース なす 果実 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06191_7', itemNo: '06191', per100g: { p: 1.1, f: 0.1, c: 5.1, kcal: 18, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: '白菜',
      row: ['🥦野菜','白菜','はくさい 白菜 やさい 野菜','100g',0.8,0.1,3.2,13],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース はくさい 結球葉 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06233_7', itemNo: '06233', per100g: { p: 0.8, f: 0.1, c: 3.2, kcal: 13, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: '小松菜',
      row: ['🥦野菜','小松菜','こまつな 小松菜 やさい 野菜','100g',1.5,0.2,2.4,13],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース こまつな 葉 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06086_7', itemNo: '06086', per100g: { p: 1.5, f: 0.2, c: 2.4, kcal: 13, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'アスパラガス',
      row: ['🥦野菜','アスパラガス','あすぱらがす アスパラ アスパラガス やさい 野菜','100g',2.6,0.2,3.9,21],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース アスパラガス 若茎 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=06_06007_6', itemNo: '06007', per100g: { p: 2.6, f: 0.2, c: 3.9, kcal: 21, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
    },
    {
      name: 'にんにく',
      row: ['🥦野菜','にんにく','にんにく ニンニク 大蒜 ガーリック やさい 野菜','100g',6.4,0.9,27.5,129],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース にんにく りん茎 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06223_7', itemNo: '06223', per100g: { p: 6.4, f: 0.9, c: 27.5, kcal: 129, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true, note: '1片の重量は個体差があるため自動換算しない。' }
    },
    {
      name: '長ねぎ',
      row: ['🥦野菜','長ねぎ','ながねぎ 長ねぎ 根深ねぎ ねぎ ネギ やさい 野菜','100g',1.4,0.1,8.3,35],
      source: { kind: 'mext', label: '文部科学省 食品成分データベース 根深ねぎ 葉 軟白 生', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06226_7', itemNo: '06226', per100g: { p: 1.4, f: 0.1, c: 8.3, kcal: 35, a: 0.0 } },
      serving: { kind: 'mass-only', measure: '100g', grams: 100, exactForEntry: true }
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
      VERIFIED.map(entry => [entry.name, { source: entry.source, serving: entry.serving, confidence: 'high', verifiedVersion: VERSION }])
    );
    window.__PFC_DB_V3_VERIFIED__ = {
      version: VERSION,
      names: VERIFIED.map(x => x.name),
      added,
      sourcePolicy: 'MEXT nutrition + official serving conversion only when defensible'
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
