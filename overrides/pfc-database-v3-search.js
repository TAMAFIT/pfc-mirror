// PFC Mirror Database V3 Phase C2: canonical search ranking and deduplication.
(() => {
  'use strict';

  const VERSION = '3.7.0';

  const CATEGORY_QUERY = {
    '米': { categories: ['staples'], prefer: ['白米','玄米','雑穀米','麦ご飯','パックご飯'] },
    'こめ': { categories: ['staples'], prefer: ['白米','玄米','雑穀米','麦ご飯','パックご飯'] },
    'ごはん': { categories: ['staples'], prefer: ['白米','玄米','雑穀米','麦ご飯','パックご飯'] },
    'パン': { categories: ['staples'], prefer: ['食パン(6枚切)','食パン(8枚切)','ロールパン','ベーグル'] },
    'ぱん': { categories: ['staples'], prefer: ['食パン(6枚切)','食パン(8枚切)','ロールパン','ベーグル'] },
    '麺': { categories: ['staples'], prefer: ['うどん(1玉)','そば(1玉)','パスタ(ゆで)','中華麺'] },
    'めん': { categories: ['staples'], prefer: ['うどん(1玉)','そば(1玉)','パスタ(ゆで)','中華麺'] },
    '肉': { categories: ['meat'], prefer: ['鶏むね(皮なし)','鶏もも(皮なし)','鶏ささみ','豚ヒレ','豚ロース(脂身無)','牛モモ(赤身)'] },
    'にく': { categories: ['meat'], prefer: ['鶏むね(皮なし)','鶏もも(皮なし)','鶏ささみ','豚ヒレ','豚ロース(脂身無)','牛モモ(赤身)'] },
    '鶏肉': { categories: ['meat'], nameHints: ['鶏','チキン'], prefer: ['鶏むね(皮なし)','鶏もも(皮なし)','鶏ささみ','鶏手羽元(皮つき)'] },
    'とりにく': { categories: ['meat'], nameHints: ['鶏','チキン'], prefer: ['鶏むね(皮なし)','鶏もも(皮なし)','鶏ささみ','鶏手羽元(皮つき)'] },
    '豚肉': { categories: ['meat'], nameHints: ['豚','ポーク'], prefer: ['豚ヒレ','豚ロース(脂身無)','豚肩ロース(脂身つき)','豚モモ(脂身無)'] },
    'ぶたにく': { categories: ['meat'], nameHints: ['豚','ポーク'], prefer: ['豚ヒレ','豚ロース(脂身無)','豚肩ロース(脂身つき)','豚モモ(脂身無)'] },
    '牛肉': { categories: ['meat'], nameHints: ['牛','ビーフ'], prefer: ['牛モモ(赤身)','牛ヒレ(赤身)','牛カタ(赤身)','牛サーロイン'] },
    'ぎゅうにく': { categories: ['meat'], nameHints: ['牛','ビーフ'], prefer: ['牛モモ(赤身)','牛ヒレ(赤身)','牛カタ(赤身)','牛サーロイン'] },
    '魚': { categories: ['seafood'], prefer: ['鮭(焼き)','サバ(生)','アジ(生)','まだら(生)','マグロ(赤身)'] },
    'さかな': { categories: ['seafood'], prefer: ['鮭(焼き)','サバ(生)','アジ(生)','まだら(生)','マグロ(赤身)'] },
    '野菜': { categories: ['vegetables'], prefer: ['ブロッコリー','キャベツ','トマト','ほうれん草','小松菜','白菜','ピーマン'] },
    'やさい': { categories: ['vegetables'], prefer: ['ブロッコリー','キャベツ','トマト','ほうれん草','小松菜','白菜','ピーマン'] },
    '果物': { categories: ['fruit'], prefer: ['バナナ','りんご','みかん','キウイ','ブルーベリー(生)','マンゴー(生)'] },
    'くだもの': { categories: ['fruit'], prefer: ['バナナ','りんご','みかん','キウイ','ブルーベリー(生)','マンゴー(生)'] },
    'フルーツ': { categories: ['fruit'], prefer: ['バナナ','りんご','みかん','キウイ','ブルーベリー(生)','マンゴー(生)'] },
    '卵': { categories: ['eggs-dairy-soy'], nameHints: ['卵','玉子','たまご'], prefer: ['全卵(M)','全卵(L)','ゆで卵','卵白'] },
    'たまご': { categories: ['eggs-dairy-soy'], nameHints: ['卵','玉子','たまご'], prefer: ['全卵(M)','全卵(L)','ゆで卵','卵白'] },
    '酒': { categories: ['alcohol'] },
    'お酒': { categories: ['alcohol'] },
    '飲み物': { categories: ['beverages','alcohol'] },
    'のみもの': { categories: ['beverages','alcohol'] }
  };

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/[()（）\[\]【】\-_/\s]/g, '');
  }

  function baseName(value) {
    return normalize(value).replace(/[（(].*?[)）]/g, '').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function queryRule(rawQuery) {
    const raw = String(rawQuery ?? '').normalize('NFKC').trim();
    return CATEGORY_QUERY[raw] || CATEGORY_QUERY[normalize(raw)] || null;
  }

  function sourcePriority(meta) {
    const kind = meta?.source?.kind || '';
    if (kind === 'mext' || kind === 'manufacturer' || kind === 'restaurant') return 40;
    if (kind === 'mirror-curated') return 20;
    return 0;
  }

  function canonicalItems() {
    const dbv3 = window.__PFC_DB_V3__;
    if (!dbv3?.items || typeof DB === 'undefined') return [];
    const groups = new Map();
    dbv3.items.forEach(meta => {
      const key = normalize(meta.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(meta);
    });

    return [...groups.values()].map(group => {
      return group.slice().sort((a, b) => {
        const sourceDiff = sourcePriority(b) - sourcePriority(a);
        if (sourceDiff) return sourceDiff;
        const aV3 = a.duplicateOf ? 1 : 0;
        const bV3 = b.duplicateOf ? 1 : 0;
        if (aV3 !== bV3) return aV3 - bV3;
        return a.runtimeIndex - b.runtimeIndex;
      })[0];
    });
  }

  function preferenceScore(rule, meta) {
    if (!rule) return 0;
    const prefer = rule.prefer || [];
    const index = prefer.indexOf(meta.name);
    if (index >= 0) return Math.max(40, 360 - index * 45);
    return 0;
  }

  function categoryScore(rule, meta) {
    if (!rule || !(rule.categories || []).includes(meta.category)) return 0;
    if (rule.nameHints?.length) {
      const haystack = `${meta.name} ${(meta.aliases || []).join(' ')}`;
      if (!rule.nameHints.some(hint => haystack.includes(hint))) return 0;
    }
    return 900 + preferenceScore(rule, meta) + sourcePriority(meta);
  }

  function scoreMeta(meta, rawQuery) {
    const query = normalize(rawQuery);
    const qCompact = compact(rawQuery);
    const qBase = baseName(rawQuery);
    if (!qCompact) return 0;
    const rule = queryRule(rawQuery);

    const nName = normalize(meta.name);
    const cName = compact(meta.name);
    const bName = baseName(meta.name);
    let score = 0;

    if (nName === query || cName === qCompact) score = 5200;
    else if (bName === qBase && qBase.length >= 1) score = 4700;
    else if (nName.startsWith(query) || cName.startsWith(qCompact)) score = 3000;
    else if (qCompact.length >= 2 && (nName.includes(query) || cName.includes(qCompact))) score = 2200;

    for (const alias of meta.aliases || []) {
      const a = normalize(alias);
      const ac = compact(alias);
      if (a === query || ac === qCompact) score = Math.max(score, 4100);
      else if (qCompact.length >= 2 && (a.startsWith(query) || ac.startsWith(qCompact))) score = Math.max(score, 2600);
      else if (qCompact.length >= 2 && (a.includes(query) || ac.includes(qCompact))) score = Math.max(score, 1700);
    }

    // Generic tags never act like a strong synonym. They only support deliberate broad queries.
    if (rule) score = Math.max(score, categoryScore(rule, meta));
    return score ? score + sourcePriority(meta) : 0;
  }

  function myFoodMatches(rawQuery) {
    if (typeof myFoods === 'undefined' || !Array.isArray(myFoods)) return [];
    const query = normalize(rawQuery);
    const qCompact = compact(rawQuery);
    if (!qCompact) return [];
    return myFoods.map((item, index) => {
      const name = String(item?.N || item?.name || '');
      const n = normalize(name);
      const c = compact(name);
      let score = 0;
      if (n === query || c === qCompact) score = 5600;
      else if (n.startsWith(query) || c.startsWith(qCompact)) score = 3200;
      else if (qCompact.length >= 2 && (n.includes(query) || c.includes(qCompact))) score = 2300;
      if (score && item?.Fav) score += 80;
      if (score) score += Math.min(60, Number(item?.useCount || 0) * 3);
      return score ? { source: 'my', index, item, name, score } : null;
    }).filter(Boolean);
  }

  function search(rawQuery, limit = 12) {
    const dbResults = canonicalItems()
      .map(meta => {
        const score = scoreMeta(meta, rawQuery);
        return score ? {
          source: 'db',
          index: meta.runtimeIndex,
          item: DB[meta.runtimeIndex],
          meta,
          name: meta.name,
          score
        } : null;
      })
      .filter(Boolean);

    return [...myFoodMatches(rawQuery), ...dbResults]
      .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'ja'))
      .slice(0, Math.max(1, Number(limit) || 12));
  }

  function resultMeta(result) {
    if (result.source === 'my') {
      const x = result.item || {};
      return `My食品 · ${Math.round(Number(x.Cal || 0))} kcal`;
    }
    const meta = result.meta || window.__PFC_DB_V3__?.get?.(result.index);
    const row = result.item || [];
    const category = String(row[0] || '').trim();
    const unit = meta?.input?.defaultUnit || row[3] || '1食';
    const defaultAmount = meta?.input?.defaultAmount;
    const amountText = meta && Number(defaultAmount) > 0 && window.__PFC_DB_V3__?.formatAmount
      ? window.__PFC_DB_V3__.formatAmount(meta, defaultAmount)
      : String(unit);
    const kcal = meta && window.__PFC_DB_V3__?.scale
      ? window.__PFC_DB_V3__.scale(result.index, Number(defaultAmount || meta.nutritionBasis.amount))?.kcal
      : Math.round(Number(row[7] || 0));
    return `${category} · ${amountText} · ${Math.round(Number(kcal || 0))} kcal`;
  }

  function clearSearch() {
    const input = document.getElementById('s-inp');
    const result = document.getElementById('s-res');
    if (input) input.value = '';
    if (result) {
      result.innerHTML = '';
      result.style.display = 'none';
    }
    document.querySelector('.pfc-search-clear')?.classList.remove('show');
  }

  function filterF() {
    const input = document.getElementById('s-inp');
    const box = document.getElementById('s-res');
    if (!input || !box) return;
    const query = input.value.trim();
    box.innerHTML = '';
    document.querySelector('.pfc-search-clear')?.classList.toggle('show', !!query);
    if (!query) {
      box.style.display = 'none';
      return;
    }

    const results = search(query, 12);
    box.style.display = 'block';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 's-item pfc-search-empty';
      empty.innerHTML = `<strong>「${escapeHtml(query)}」は見つかりませんでした</strong><small>別の名前で検索するか、My食品に登録できます</small>`;
      box.appendChild(empty);
      return;
    }

    results.forEach((result, order) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 's-item pfc-search-result';
      row.dataset.searchOrder = String(order);
      row.innerHTML = `<span class="pfc-search-main"><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml(resultMeta(result))}</small></span><span class="pfc-search-arrow">›</span>`;
      row.onclick = () => {
        if (result.source === 'my' && typeof selMyFd === 'function') selMyFd(result.index);
        else if (result.source === 'db' && typeof selFd === 'function') selFd(result.index);
        clearSearch();
      };
      box.appendChild(row);
    });
  }

  function install() {
    if (!window.__PFC_DB_V3__ || !window.__PFC_SEARCH_V21__) return;
    window.filterF = filterF;
    window.__PFC_SEARCH_V21__.search = search;
    window.__PFC_SEARCH_V21__.rebuildV3 = () => true;
    window.__PFC_DB_V3_SEARCH__ = {
      version: VERSION,
      search,
      canonicalCount: () => canonicalItems().length,
      duplicateCount: () => window.__PFC_DB_V3__.items.length - canonicalItems().length,
      categoryQueries: Object.keys(CATEGORY_QUERY)
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
