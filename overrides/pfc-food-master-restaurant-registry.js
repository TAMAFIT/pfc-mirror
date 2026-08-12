// Food Master D6: official restaurant nutrition registry.
(() => {
  'use strict';

  const VERSION = '6.0.0';
  const VERIFIED_AT = '2026-08-12';
  const PROVIDER = 'McDonald\'s Japan';
  const ENTRIES = [
    { name: 'ハンバーガー', canonicalId: 'restaurant:mcd-jp:hamburger', officialName: 'ハンバーガー', sourceUrl: 'https://www.mcdonalds.co.jp/products/1040/', nutrition: { p: 13.0, f: 9.5, c: 30.3, kcal: 259, a: 0 } },
    { name: 'チーズバーガー', canonicalId: 'restaurant:mcd-jp:cheeseburger', officialName: 'チーズバーガー', sourceUrl: 'https://www.mcdonalds.co.jp/products/1070/', nutrition: { p: 15.9, f: 13.5, c: 31.0, kcal: 310, a: 0 } },
    { name: 'ダブルチーズ', canonicalId: 'restaurant:mcd-jp:double-cheeseburger', officialName: 'ダブルチーズバーガー', sourceUrl: 'https://www.mcdonalds.co.jp/products/1360/', nutrition: { p: 26.4, f: 25.1, c: 31.8, kcal: 459, a: 0 } },
    { name: 'ビッグマック', canonicalId: 'restaurant:mcd-jp:big-mac', officialName: 'ビッグマック®', sourceUrl: 'https://www.mcdonalds.co.jp/products/1210/', nutrition: { p: 26.1, f: 28.0, c: 42.0, kcal: 524, a: 0 } },
    { name: 'フィレオフィッシュ', canonicalId: 'restaurant:mcd-jp:filet-o-fish', officialName: 'フィレオフィッシュ®', sourceUrl: 'https://www.mcdonalds.co.jp/products/1110/', nutrition: { p: 15.0, f: 14.2, c: 37.4, kcal: 338, a: 0 } },
    { name: 'チキチー', canonicalId: 'restaurant:mcd-jp:chikichee', officialName: 'チキチー® (マックチキン® チーズ)', sourceUrl: 'https://www.mcdonalds.co.jp/products/8000/', nutrition: { p: 16.4, f: 23.2, c: 40.3, kcal: 433, a: 0 } },
    { name: 'エグチ', canonicalId: 'restaurant:mcd-jp:eguchi', officialName: 'エグチ(エッグチーズバーガー)', sourceUrl: 'https://www.mcdonalds.co.jp/products/7070/', nutrition: { p: 22.4, f: 19.0, c: 31.2, kcal: 390, a: 0 } },
    { name: 'ポテト(S)', canonicalId: 'restaurant:mcd-jp:fries-s', officialName: 'マックフライポテト® Sサイズ', sourceUrl: 'https://www.mcdonalds.co.jp/products/2010/?size=2', nutrition: { p: 2.8, f: 10.7, c: 28.5, kcal: 221, a: 0 } },
    { name: 'ポテト(M)', canonicalId: 'restaurant:mcd-jp:fries-m', officialName: 'マックフライポテト® Mサイズ', sourceUrl: 'https://www.mcdonalds.co.jp/products/2010/', nutrition: { p: 5.3, f: 19.7, c: 51.8, kcal: 404, a: 0 } },
    { name: 'ポテト(L)', canonicalId: 'restaurant:mcd-jp:fries-l', officialName: 'マックフライポテト® Lサイズ', sourceUrl: 'https://www.mcdonalds.co.jp/products/2010/?size=3', nutrition: { p: 6.7, f: 24.8, c: 65.3, kcal: 509, a: 0 } },
    { name: 'ナゲット(5個)', canonicalId: 'restaurant:mcd-jp:nuggets-5', officialName: 'チキンマックナゲット® 5ピース', sourceUrl: 'https://www.mcdonalds.co.jp/products/1900/', nutrition: { p: 15.3, f: 16.1, c: 13.3, kcal: 262, a: 0 } }
  ];

  function normalize(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[®™・･\s()（）]/g, '');
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
        row[4] = entry.nutrition.p;
        row[5] = entry.nutrition.f;
        row[6] = entry.nutrition.c;
        row[7] = entry.nutrition.kcal;
        row[8] = entry.nutrition.a || 0;
        applied.push({ name: entry.name, index, canonicalId: entry.canonicalId });
      });

      hints[entry.name] = {
        source: {
          kind: 'restaurant',
          provider: PROVIDER,
          label: `${PROVIDER} 公式メニュー栄養情報`,
          url: entry.sourceUrl,
          productId: entry.canonicalId.split(':').pop(),
          officialName: entry.officialName,
          verifiedAt: VERIFIED_AT,
          servingNutrition: { ...entry.nutrition }
        },
        serving: {
          kind: 'official-menu-serving',
          measure: entry.name === 'ナゲット(5個)' ? '5個' : '1食',
          exactForEntry: true,
          note: 'マクドナルド公式の可食部1食当たり栄養情報。カスタマイズ時は異なる。'
        },
        confidence: 'high',
        canonicalId: entry.canonicalId,
        verifiedAt: VERIFIED_AT,
        verifiedVersion: VERSION
      };
    });

    window.__PFC_DB_V3_VERIFIED_SOURCES__ = hints;
    window.__PFC_FOOD_MASTER_RESTAURANT_REGISTRY__ = {
      version: VERSION,
      provider: PROVIDER,
      verifiedAt: VERIFIED_AT,
      count: ENTRIES.length,
      canonicalIds: ENTRIES.map(entry => entry.canonicalId),
      names: ENTRIES.map(entry => entry.name),
      applied,
      skipped
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
