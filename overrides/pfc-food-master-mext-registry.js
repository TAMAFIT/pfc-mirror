// Food Master V4: central MEXT source-of-truth registry.
// Generated/maintained against the official MEXT main composition workbook.
(() => {
  'use strict';

  const VERSION = '4.0.0';
  const DATASET_SHA256 = '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c';

  // REGISTRY_DATA_START
  const ENTRIES = [
  {
    "name": "こいくち醤油",
    "source": {
      "kind": "mext",
      "label": "文部科学省 日本食品標準成分表",
      "itemNo": "17007",
      "officialName": "＜調味料類＞　（しょうゆ類）　こいくちしょうゆ",
      "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c",
      "verifiedAt": "2026-08-12",
      "per100g": { "p": 7.7, "f": 0.0, "c": 7.9, "kcal": 76.0, "a": 2.1 }
    },
    "canonicalId": "mext:17007"
  },
  {
    "name": "上白糖",
    "source": {
      "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "03003", "officialName": "（砂糖類）　車糖　上白糖", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12",
      "per100g": { "p": 0.0, "f": 0.0, "c": 99.3, "kcal": 391.0, "a": 0.0 }
    }, "canonicalId": "mext:03003"
  },
  {
    "name": "米みそ(淡色辛みそ)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "17045", "officialName": "＜調味料類＞　（みそ類）　米みそ　淡色辛みそ", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 12.5, "f": 6.0, "c": 21.9, "kcal": 182.0, "a": 0.0 } }, "canonicalId": "mext:17045"
  },
  {
    "name": "本みりん",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "16015", "officialName": "＜アルコール飲料類＞　（混成酒類）　みりん　本みりん", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.3, "f": 0.0, "c": 43.2, "kcal": 241.0, "a": 9.5 } }, "canonicalId": "mext:16015"
  },
  {
    "name": "豚肩ロース(脂身つき)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11119", "officialName": "＜畜肉類＞　ぶた　［大型種肉］　かたロース　脂身つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 17.1, "f": 19.2, "c": 0.1, "kcal": 237.0, "a": 0.0 } }, "canonicalId": "mext:11119"
  },
  {
    "name": "鶏手羽元(皮つき)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11286", "officialName": "＜鳥肉類＞　にわとり　［若どり・副品目］　手羽もと　皮つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 18.2, "f": 12.8, "c": 0.0, "kcal": 175.0, "a": 0.0 } }, "canonicalId": "mext:11286"
  },
  {
    "name": "サバ(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "10154", "officialName": "＜魚類＞　（さば類）　まさば　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 20.6, "f": 16.8, "c": 0.3, "kcal": 211.0, "a": 0.0 } }, "canonicalId": "mext:10154"
  },
  {
    "name": "アジ(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "10003", "officialName": "＜魚類＞　（あじ類）　まあじ　皮つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 19.7, "f": 4.5, "c": 0.1, "kcal": 112.0, "a": 0.0 } }, "canonicalId": "mext:10003"
  },
  {
    "name": "ピーマン",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06245", "officialName": "ピーマン　果実　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.9, "f": 0.2, "c": 5.1, "kcal": 20.0, "a": 0.0 } }, "canonicalId": "mext:06245"
  },
  {
    "name": "なす",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06191", "officialName": "なす　果実　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 1.1, "f": 0.1, "c": 5.1, "kcal": 18.0, "a": 0.0 } }, "canonicalId": "mext:06191"
  },
  {
    "name": "白菜",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06233", "officialName": "はくさい　結球葉　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.8, "f": 0.1, "c": 3.2, "kcal": 13.0, "a": 0.0 } }, "canonicalId": "mext:06233"
  },
  {
    "name": "小松菜",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06086", "officialName": "こまつな　葉　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 1.5, "f": 0.2, "c": 2.4, "kcal": 13.0, "a": 0.0 } }, "canonicalId": "mext:06086"
  },
  {
    "name": "アスパラガス",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06007", "officialName": "アスパラガス　若茎　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 2.6, "f": 0.2, "c": 3.9, "kcal": 21.0, "a": 0.0 } }, "canonicalId": "mext:06007"
  },
  {
    "name": "にんにく",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06223", "officialName": "にんにく　りん茎　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 6.4, "f": 0.9, "c": 27.5, "kcal": 129.0, "a": 0.0 } }, "canonicalId": "mext:06223"
  },
  {
    "name": "長ねぎ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06226", "officialName": "根深ねぎ　葉　軟白　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 1.4, "f": 0.1, "c": 8.3, "kcal": 35.0, "a": 0.0 } }, "canonicalId": "mext:06226"
  },
  {
    "name": "まだら(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "10205", "officialName": "＜魚類＞　まだら　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 17.6, "f": 0.2, "c": 0.1, "kcal": 72.0, "a": 0.0 } }, "canonicalId": "mext:10205"
  },
  {
    "name": "スイートコーン(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06175", "officialName": "スイートコーン　未熟種子　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 3.6, "f": 1.7, "c": 16.8, "kcal": 89.0, "a": 0.0 } }, "canonicalId": "mext:06175"
  },
  {
    "name": "ズッキーニ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06116", "officialName": "ズッキーニ　果実　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 1.3, "f": 0.1, "c": 2.8, "kcal": 16.0, "a": 0.0 } }, "canonicalId": "mext:06116"
  },
  {
    "name": "マンゴー(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "07132", "officialName": "マンゴー　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.6, "f": 0.1, "c": 16.9, "kcal": 68.0, "a": 0.0 } }, "canonicalId": "mext:07132"
  },
  {
    "name": "ブルーベリー(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "07124", "officialName": "ブルーベリー　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.5, "f": 0.1, "c": 12.9, "kcal": 48.0, "a": 0.0 } }, "canonicalId": "mext:07124"
  },
  {
    "name": "ネーブルオレンジ(生)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "07040", "officialName": "オレンジ　ネーブル　砂じょう　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 0.9, "f": 0.1, "c": 11.8, "kcal": 48.0, "a": 0.0 } }, "canonicalId": "mext:07040"
  },
  {
    "name": "白米",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "01088", "officialName": "こめ　［水稲めし］　精白米　うるち米", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 2.5, "f": 0.3, "c": 37.1, "kcal": 156.0, "a": 0.0 } }, "canonicalId": "mext:01088"
  },
  {
    "name": "オートミール",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "01004", "officialName": "えんばく　オートミール", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 13.7, "f": 5.7, "c": 69.1, "kcal": 350.0, "a": 0.0 } }, "canonicalId": "mext:01004"
  },
  {
    "name": "パスタ(乾麺)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "01063", "officialName": "こむぎ　［マカロニ・スパゲッティ類］　マカロニ・スパゲッティ　乾", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 12.9, "f": 1.8, "c": 73.1, "kcal": 347.0, "a": 0.0 } }, "canonicalId": "mext:01063"
  },
  {
    "name": "パスタ(ゆで)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "01064", "officialName": "こむぎ　［マカロニ・スパゲッティ類］　マカロニ・スパゲッティ　ゆで", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 5.8, "f": 0.9, "c": 32.2, "kcal": 150.0, "a": 0.0 } }, "canonicalId": "mext:01064"
  },
  {
    "name": "コーンフレーク",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "01137", "officialName": "とうもろこし　コーンフレーク", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 7.8, "f": 1.7, "c": 83.6, "kcal": 380.0, "a": 0.0 } }, "canonicalId": "mext:01137"
  },
  {
    "name": "鶏むね(皮なし)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11220", "officialName": "＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮なし　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 23.3, "f": 1.9, "c": 0.1, "kcal": 105.0, "a": 0.0 } }, "canonicalId": "mext:11220"
  },
  {
    "name": "鶏むね(皮あり)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11219", "officialName": "＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 21.3, "f": 5.9, "c": 0.1, "kcal": 133.0, "a": 0.0 } }, "canonicalId": "mext:11219"
  },
  {
    "name": "鶏もも(皮なし)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11224", "officialName": "＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮なし　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 19.0, "f": 5.0, "c": 0.0, "kcal": 113.0, "a": 0.0 } }, "canonicalId": "mext:11224"
  },
  {
    "name": "鶏もも(皮あり)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11221", "officialName": "＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 16.6, "f": 14.2, "c": 0.0, "kcal": 190.0, "a": 0.0 } }, "canonicalId": "mext:11221"
  },
  {
    "name": "砂肝",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11233", "officialName": "＜鳥肉類＞　にわとり　［副品目］　すなぎも　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 18.3, "f": 1.8, "c": 0.0, "kcal": 86.0, "a": 0.0 } }, "canonicalId": "mext:11233"
  },
  {
    "name": "ローストビーフ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11104", "officialName": "＜畜肉類＞　うし　［加工品］　ローストビーフ", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 21.7, "f": 11.7, "c": 0.9, "kcal": 190.0, "a": 0.0 } }, "canonicalId": "mext:11104"
  },
  {
    "name": "豚ヒレ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11140", "officialName": "＜畜肉類＞　ぶた　［大型種肉］　ヒレ　赤肉　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 22.2, "f": 3.7, "c": 0.3, "kcal": 118.0, "a": 0.0 } }, "canonicalId": "mext:11140"
  },
  {
    "name": "豚ロース(脂身無)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11127", "officialName": "＜畜肉類＞　ぶた　［大型種肉］　ロース　赤肉　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 22.7, "f": 5.6, "c": 0.3, "kcal": 140.0, "a": 0.0 } }, "canonicalId": "mext:11127"
  },
  {
    "name": "豚バラ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11129", "officialName": "＜畜肉類＞　ぶた　［大型種肉］　ばら　脂身つき　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 14.4, "f": 35.4, "c": 0.1, "kcal": 366.0, "a": 0.0 } }, "canonicalId": "mext:11129"
  },
  {
    "name": "豚ひき肉",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "11163", "officialName": "＜畜肉類＞　ぶた　［ひき肉］　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 17.7, "f": 17.2, "c": 0.1, "kcal": 209.0, "a": 0.0 } }, "canonicalId": "mext:11163"
  },
  {
    "name": "うなぎ(蒲焼)",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "10070", "officialName": "＜魚類＞　うなぎ　かば焼", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 23.0, "f": 21.0, "c": 3.1, "kcal": 285.0, "a": 0.0 } }, "canonicalId": "mext:10070"
  },
  {
    "name": "きゅうり",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "06065", "officialName": "きゅうり　果実　生", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 1.0, "f": 0.1, "c": 3.0, "kcal": 13.0, "a": 0.0 } }, "canonicalId": "mext:06065"
  },
  {
    "name": "無脂肪ヨーグルト",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "13054", "officialName": "＜牛乳及び乳製品＞　（発酵乳・乳酸菌飲料）　ヨーグルト　無脂肪無糖", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 4.0, "f": 0.3, "c": 5.7, "kcal": 37.0, "a": 0.0 } }, "canonicalId": "mext:13054"
  },
  {
    "name": "カッテージチーズ",
    "source": { "kind": "mext", "label": "文部科学省 日本食品標準成分表", "itemNo": "13033", "officialName": "＜牛乳及び乳製品＞　（チーズ類）　ナチュラルチーズ　カテージ", "datasetSha256": "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c", "verifiedAt": "2026-08-12", "per100g": { "p": 13.3, "f": 4.5, "c": 1.9, "kcal": 99.0, "a": 0.0 } }, "canonicalId": "mext:13033"
  }
];
  // REGISTRY_DATA_END

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･\s()（）]/g, '');
  }

  function parseGramBasis(raw) {
    const match = String(raw || '').normalize('NFKC').trim().match(/^([0-9]+(?:\.[0-9]+)?)g$/i);
    if (!match) return null;
    const grams = Number(match[1]);
    return Number.isFinite(grams) && grams > 0 ? grams : null;
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function install() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return;
    const hints = window.__PFC_DB_V3_VERIFIED_SOURCES__ || {};
    const applied = [];
    const skipped = [];

    ENTRIES.forEach(entry => {
      const key = normalize(entry.name);
      const indexes = [];
      DB.forEach((row, index) => {
        if (normalize(row?.[1]) === key) indexes.push(index);
      });
      if (!indexes.length) {
        skipped.push({ name: entry.name, itemNo: entry.source.itemNo, reason: 'missing-db-row' });
        return;
      }

      indexes.forEach(index => {
        const row = DB[index];
        const grams = parseGramBasis(row?.[3]);
        if (!grams) {
          skipped.push({ name: entry.name, itemNo: entry.source.itemNo, index, reason: 'non-gram-basis', basis: row?.[3] });
          return;
        }
        const scale = grams / 100;
        const n = entry.source.per100g;
        row[4] = round(n.p * scale);
        row[5] = round(n.f * scale);
        row[6] = round(n.c * scale);
        row[7] = round(n.kcal * scale);
        row[8] = round((n.a || 0) * scale);
        applied.push({ name: entry.name, itemNo: entry.source.itemNo, index, grams });
      });

      const previous = hints[entry.name] || {};
      hints[entry.name] = {
        ...previous,
        source: { ...entry.source },
        serving: previous.serving || {
          kind: 'mass-basis', measure: '100g', grams: 100, exactForEntry: true,
          note: 'MEXT可食部100g値を既存のg基準量へ比例換算。個数換算は行わない。'
        },
        confidence: 'high',
        canonicalId: entry.canonicalId,
        verifiedAt: entry.source.verifiedAt,
        verifiedVersion: VERSION
      };
    });

    window.__PFC_DB_V3_VERIFIED_SOURCES__ = hints;
    window.__PFC_FOOD_MASTER_MEXT_REGISTRY__ = {
      version: VERSION,
      datasetSha256: DATASET_SHA256,
      count: ENTRIES.length,
      names: ENTRIES.map(entry => entry.name),
      itemNos: ENTRIES.map(entry => entry.source.itemNo),
      applied,
      skipped
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
