// PFC Mirror Food Master D2: MEXT-backed promotion batch 1.
(() => {
  'use strict';

  const VERSION = '3.8.0';
  const DATASET_SHA256 = '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c';
  const ENTRIES = [
    {
      name: '白米',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01088_7', itemNo: '01088', officialName: 'こめ　［水稲めし］　精白米　うるち米', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 2.5, f: 0.3, c: 37.1, kcal: 156, a: 0 } },
      canonicalId: 'mext:01088'
    },
    {
      name: 'オートミール',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01004_7', itemNo: '01004', officialName: 'えんばく　オートミール', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 13.7, f: 5.7, c: 69.1, kcal: 350, a: 0 } },
      canonicalId: 'mext:01004'
    },
    {
      name: 'パスタ(乾麺)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01063_7', itemNo: '01063', officialName: 'こむぎ　［マカロニ・スパゲッティ類］　マカロニ・スパゲッティ　乾', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 12.9, f: 1.8, c: 73.1, kcal: 347, a: 0 } },
      canonicalId: 'mext:01063'
    },
    {
      name: 'パスタ(ゆで)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01064_7', itemNo: '01064', officialName: 'こむぎ　［マカロニ・スパゲッティ類］　マカロニ・スパゲッティ　ゆで', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 5.8, f: 0.9, c: 32.2, kcal: 150, a: 0 } },
      canonicalId: 'mext:01064'
    },
    {
      name: 'コーンフレーク',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=1_01137_7', itemNo: '01137', officialName: 'とうもろこし　コーンフレーク', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 7.8, f: 1.7, c: 83.6, kcal: 380, a: 0 } },
      canonicalId: 'mext:01137'
    },
    {
      name: '鶏むね(皮なし)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11220_7', itemNo: '11220', officialName: '＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮なし　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 23.3, f: 1.9, c: 0.1, kcal: 105, a: 0 } },
      canonicalId: 'mext:11220'
    },
    {
      name: '鶏むね(皮あり)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11219_7', itemNo: '11219', officialName: '＜鳥肉類＞　にわとり　［若どり・主品目］　むね　皮つき　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 21.3, f: 5.9, c: 0.1, kcal: 133, a: 0 } },
      canonicalId: 'mext:11219'
    },
    {
      name: '鶏もも(皮なし)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11224_7', itemNo: '11224', officialName: '＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮なし　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 19, f: 5, c: 0, kcal: 113, a: 0 } },
      canonicalId: 'mext:11224'
    },
    {
      name: '鶏もも(皮あり)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11221_7', itemNo: '11221', officialName: '＜鳥肉類＞　にわとり　［若どり・主品目］　もも　皮つき　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 16.6, f: 14.2, c: 0, kcal: 190, a: 0 } },
      canonicalId: 'mext:11221'
    },
    {
      name: '砂肝',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11233_7', itemNo: '11233', officialName: '＜鳥肉類＞　にわとり　［副品目］　すなぎも　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 18.3, f: 1.8, c: 0, kcal: 86, a: 0 } },
      canonicalId: 'mext:11233'
    },
    {
      name: 'ローストビーフ',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11104_7', itemNo: '11104', officialName: '＜畜肉類＞　うし　［加工品］　ローストビーフ', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 21.7, f: 11.7, c: 0.9, kcal: 190, a: 0 } },
      canonicalId: 'mext:11104'
    },
    {
      name: '豚ヒレ',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11140_7', itemNo: '11140', officialName: '＜畜肉類＞　ぶた　［大型種肉］　ヒレ　赤肉　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 22.2, f: 3.7, c: 0.3, kcal: 118, a: 0 } },
      canonicalId: 'mext:11140'
    },
    {
      name: '豚ロース(脂身無)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11127_7', itemNo: '11127', officialName: '＜畜肉類＞　ぶた　［大型種肉］　ロース　赤肉　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 22.7, f: 5.6, c: 0.3, kcal: 140, a: 0 } },
      canonicalId: 'mext:11127'
    },
    {
      name: '豚バラ',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11129_7', itemNo: '11129', officialName: '＜畜肉類＞　ぶた　［大型種肉］　ばら　脂身つき　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 14.4, f: 35.4, c: 0.1, kcal: 366, a: 0 } },
      canonicalId: 'mext:11129'
    },
    {
      name: '豚ひき肉',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=11_11163_7', itemNo: '11163', officialName: '＜畜肉類＞　ぶた　［ひき肉］　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 17.7, f: 17.2, c: 0.1, kcal: 209, a: 0 } },
      canonicalId: 'mext:11163'
    },
    {
      name: 'うなぎ(蒲焼)',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=10_10070_7', itemNo: '10070', officialName: '＜魚類＞　うなぎ　かば焼', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 23, f: 21, c: 3.1, kcal: 285, a: 0 } },
      canonicalId: 'mext:10070'
    },
    {
      name: 'きゅうり',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=6_06065_7', itemNo: '06065', officialName: 'きゅうり　果実　生', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 1, f: 0.1, c: 3, kcal: 13, a: 0 } },
      canonicalId: 'mext:06065'
    },
    {
      name: '無脂肪ヨーグルト',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=13_13054_7', itemNo: '13054', officialName: '＜牛乳及び乳製品＞　（発酵乳・乳酸菌飲料）　ヨーグルト　無脂肪無糖', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 4, f: 0.3, c: 5.7, kcal: 37, a: 0 } },
      canonicalId: 'mext:13054'
    },
    {
      name: 'カッテージチーズ',
      source: { kind: 'mext', label: '文部科学省 日本食品標準成分表', url: 'https://fooddb.mext.go.jp/details/details.pl?ITEM_NO=13_13033_7', itemNo: '13033', officialName: '＜牛乳及び乳製品＞　（チーズ類）　ナチュラルチーズ　カテージ', datasetSha256: '0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c', verifiedAt: '2026-08-12', per100g: { p: 13.3, f: 4.5, c: 1.9, kcal: 99, a: 0 } },
      canonicalId: 'mext:13033'
    }
  ];

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
        skipped.push({ name: entry.name, reason: 'missing-db-row' });
        return;
      }

      indexes.forEach(index => {
        const row = DB[index];
        const grams = parseGramBasis(row?.[3]);
        if (!grams) {
          skipped.push({ name: entry.name, index, reason: 'non-gram-basis', basis: row?.[3] });
          return;
        }
        const scale = grams / 100;
        const n = entry.source.per100g;
        row[4] = round(n.p * scale);
        row[5] = round(n.f * scale);
        row[6] = round(n.c * scale);
        row[7] = round(n.kcal * scale);
        row[8] = round((n.a || 0) * scale);
        applied.push({ name: entry.name, index, grams, itemNo: entry.source.itemNo });
      });

      hints[entry.name] = {
        source: { ...entry.source },
        serving: {
          kind: 'mass-basis',
          measure: '100g',
          grams: 100,
          exactForEntry: true,
          note: 'MEXT可食部100g値を既存のg基準量へ比例換算。個数換算は行わない。'
        },
        confidence: 'high',
        canonicalId: entry.canonicalId,
        verifiedAt: entry.source.verifiedAt,
        verifiedVersion: VERSION
      };
    });

    window.__PFC_DB_V3_VERIFIED_SOURCES__ = hints;
    window.__PFC_DB_V3_MEXT_PROMOTED__ = {
      version: VERSION,
      datasetSha256: DATASET_SHA256,
      names: ENTRIES.map(entry => entry.name),
      itemNos: ENTRIES.map(entry => entry.source.itemNo),
      applied,
      skipped
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
