// PFC Mirror V2.1: smarter manual search + curated DB enrichment
(() => {
  'use strict';

  const VERSION = '2.1.0';
  const GENERIC_TOKENS = new Set([
    'こめ','ごはん','らいす','ぱん','めん','にく','とりにく','ぎゅうにく','ぶたにく',
    'さかな','やさい','さらだ','すーぷ','くだもの','ふるーつ','たまご','まめ','だいず',
    'こんびに','おかし','のみもの','さけ','おさけ','あぶら'
  ]);

  const DB_EXTENSIONS = [
    ['🥚卵・乳・大豆','卵白','らんぱく たまごのしろみ 卵の白身 エッグホワイト','1個',3.6,0,0.2,17],
    ['🥚卵・乳・大豆','木綿豆腐','もめんどうふ とうふ 豆腐 木綿','100g',7.0,4.9,1.5,73],
    ['🥚卵・乳・大豆','絹ごし豆腐','きぬごしどうふ きぬとうふ とうふ 豆腐 絹','100g',5.3,3.5,2.0,56],
    ['🥚卵・乳・大豆','無脂肪ヨーグルト','むしぼうよーぐると 脂肪ゼロ ヨーグルト 0脂肪','100g',4.0,0.3,5.7,43],
    ['🥚卵・乳・大豆','カッテージチーズ','かってーじちーず チーズ 高たんぱく','100g',13.3,4.5,1.9,99],
    ['🥚卵・乳・大豆','低脂肪牛乳','ていしぼうぎゅうにゅう ローファットミルク 牛乳 ミルク','200ml',7.6,2.0,11.0,92],
    ['🥚卵・乳・大豆','無調整豆乳','むちょうせいとうにゅう 豆乳 ソイミルク','200ml',7.2,4.0,6.2,92],
    ['🍚炭水化物','鮭おにぎり','さけおにぎり 鮭 おにぎり おむすび','1個',5.0,2.0,39.0,195],
    ['🍚炭水化物','梅おにぎり','うめおにぎり 梅 おにぎり おむすび','1個',4.0,0.5,39.0,180],
    ['🍚炭水化物','ツナマヨおにぎり','つなまよおにぎり ツナマヨ おにぎり おむすび','1個',5.0,7.0,40.0,245],
    ['🍖肉類','唐揚げ','からあげ から揚げ 鶏唐揚げ 鶏の唐揚げ チキン','100g',25.0,18.0,8.0,300],
    ['🍖肉類','とんかつ','豚カツ トンカツ ぶたかつ カツ','1枚',25.0,25.0,20.0,410],
    ['🍽️料理','親子丼','おやこどん 親子どんぶり 鶏卵丼','1杯',25.0,12.0,95.0,600],
    ['🍽️料理','牛丼','ぎゅうどん 牛どんぶり','1杯',22.0,20.0,90.0,640],
    ['🍽️料理','カレーライス','かれーらいす カレー ご飯カレー','1皿',15.0,18.0,105.0,650],
    ['🍽️料理','チャーハン','ちゃーはん 炒飯 焼き飯','1皿',15.0,20.0,90.0,600],
    ['🍽️料理','醤油ラーメン','しょうゆらーめん ラーメン 中華そば','1杯',20.0,15.0,80.0,550],
    ['🍽️料理','たこ焼き','たこやき タコ焼き','8個',12.0,15.0,45.0,360],
    ['🍽️料理','お好み焼き','おこのみやき お好み焼','1枚',20.0,25.0,70.0,600],
    ['🧈油脂類','はちみつ','蜂蜜 ハチミツ ハニー','20g',0,0,16.4,66],
    ['🧈油脂類','マヨネーズ','まよねーず マヨ','15g',0.2,11.3,0.7,100],
    ['🧈油脂類','オリーブオイル','おりーぶおいる オリーブ油 油','10g',0,10.0,0,90]
  ];

  const ALIAS_ENRICHMENTS = {
    '白米': ['しろめし','白ごはん','白ご飯','米飯','炊いた米'],
    '玄米': ['げんまいごはん','玄米ごはん','玄米ご飯'],
    '鶏むね(皮なし)': ['鶏胸','鶏胸肉','鳥胸','鳥胸肉','とりむね','チキンブレスト','皮なし鶏むね'],
    '鶏むね(皮あり)': ['皮あり鶏むね','皮付き鶏むね','鶏胸皮あり','鶏胸肉皮あり'],
    '鶏ささみ': ['鶏ササミ','ささ身','ササミ'],
    'ギリシャ': ['ギリシャヨーグルト','ギリシャヨーグルト無糖','高たんぱくヨーグルト'],
    'オイコス': ['oikos','OIKOS','高たんぱくヨーグルト'],
    '納豆': ['なっとう','納豆1パック','納豆パック'],
    'ブロッコリー': ['ぶろっこり','冷凍ブロッコリー'],
    'バナナ': ['ばなな一本','バナナ一本'],
    'インスタント味噌汁': ['即席味噌汁','即席みそ汁','インスタントみそ汁']
  };

  const preferredGeneric = {
    'こめ': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    'ごはん': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    'ぱん': ['食パン(6枚切)','食パン(8枚切)','ロールパン','ベーグル'],
    'めん': ['うどん(1玉)','そば(1玉)','中華麺','パスタ(ゆで)'],
    'たまご': ['卵','ゆで卵','卵白','だし巻き卵']
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

  function enrichDatabase() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) return;
    const existing = new Set(DB.map(item => String(item?.[1] || '')));
    for (const row of DB_EXTENSIONS) {
      if (!existing.has(row[1])) {
        DB.push(row.slice());
        existing.add(row[1]);
      }
    }
    for (const item of DB) {
      const name = String(item?.[1] || '');
      const extra = ALIAS_ENRICHMENTS[name];
      if (!extra?.length) continue;
      const tokens = new Set(String(item[2] || '').split(/\s+/).filter(Boolean));
      extra.forEach(token => tokens.add(token));
      item[2] = Array.from(tokens).join(' ');
    }
  }

  let dbIndex = [];
  function rebuildDbIndex() {
    if (typeof DB === 'undefined' || !Array.isArray(DB)) {
      dbIndex = [];
      return;
    }
    dbIndex = DB.map((item, index) => {
      const name = String(item?.[1] || '');
      const aliases = String(item?.[2] || '').split(/\s+/).filter(Boolean);
      return {
        source: 'db', index, item, name,
        nName: normalize(name),
        cName: compact(name),
        base: baseName(name),
        aliases: aliases.map(alias => ({ raw: alias, n: normalize(alias), c: compact(alias) }))
      };
    });
  }

  function genericPreferenceBonus(query, name) {
    const order = preferredGeneric[query];
    if (!order) return 0;
    const index = order.indexOf(name);
    return index < 0 ? 0 : Math.max(20, 140 - index * 20);
  }

  function scoreDbEntry(entry, rawQuery) {
    const query = normalize(rawQuery);
    const qCompact = compact(query);
    if (!qCompact) return 0;
    const qBase = baseName(query);
    const isGeneric = GENERIC_TOKENS.has(qCompact) || GENERIC_TOKENS.has(query);
    let score = 0;

    if (entry.nName === query || entry.cName === qCompact) score = 2400;
    else if (entry.base === qBase && qBase.length >= 2) score = 2200;
    else if (entry.nName.startsWith(query) || entry.cName.startsWith(qCompact)) score = 1600;
    else if (qCompact.length >= 2 && (entry.nName.includes(query) || entry.cName.includes(qCompact))) score = 1100;

    for (const alias of entry.aliases) {
      const aliasIsGeneric = GENERIC_TOKENS.has(alias.c) || GENERIC_TOKENS.has(alias.n);
      if (alias.n === query || alias.c === qCompact) {
        score = Math.max(score, aliasIsGeneric || isGeneric ? 420 : 1450);
      } else if (!aliasIsGeneric && qCompact.length >= 2 && (alias.n.startsWith(query) || alias.c.startsWith(qCompact))) {
        score = Math.max(score, 1000);
      } else if (!aliasIsGeneric && qCompact.length >= 2 && (alias.n.includes(query) || alias.c.includes(qCompact))) {
        score = Math.max(score, 650);
      }
    }

    if (isGeneric && score > 0) score += genericPreferenceBonus(qCompact, entry.name);
    return score;
  }

  function buildMyFoodMatches(rawQuery) {
    if (typeof myFoods === 'undefined' || !Array.isArray(myFoods)) return [];
    const query = normalize(rawQuery);
    const qCompact = compact(query);
    if (!qCompact) return [];
    return myFoods.map((item, index) => {
      const name = String(item?.N || item?.name || '');
      const nName = normalize(name);
      const cName = compact(name);
      let score = 0;
      if (nName === query || cName === qCompact) score = 2700;
      else if (nName.startsWith(query) || cName.startsWith(qCompact)) score = 1800;
      else if (qCompact.length >= 2 && (nName.includes(query) || cName.includes(qCompact))) score = 1250;
      if (score && item?.Fav) score += 80;
      if (score) score += Math.min(60, Number(item?.useCount || 0) * 3);
      return score ? { source: 'my', index, item, name, score } : null;
    }).filter(Boolean);
  }

  function searchFoods(rawQuery, limit = 12) {
    const dbMatches = dbIndex
      .map(entry => ({ ...entry, score: scoreDbEntry(entry, rawQuery) }))
      .filter(entry => entry.score > 0);
    const combined = [...buildMyFoodMatches(rawQuery), ...dbMatches]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ja'));

    const seen = new Set();
    const results = [];
    for (const result of combined) {
      const key = `${result.source}:${normalize(result.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(result);
      if (results.length >= limit) break;
    }
    return results;
  }

  function resultMeta(result) {
    if (result.source === 'my') {
      const x = result.item || {};
      return `My食品 · ${Math.round(Number(x.Cal || 0))} kcal`;
    }
    const x = result.item || [];
    const category = String(x[0] || '').replace(/^\S+/, match => match).trim();
    const unit = x[3] || '1人前';
    const kcal = Math.round(Number(x[7] || 0));
    return `${category} · ${unit} · ${kcal} kcal`;
  }

  function clearSearch() {
    const input = document.getElementById('s-inp');
    const result = document.getElementById('s-res');
    if (input) input.value = '';
    if (result) {
      result.innerHTML = '';
      result.style.display = 'none';
    }
    const clear = document.querySelector('.pfc-search-clear');
    if (clear) clear.classList.remove('show');
  }

  function smartFilterF() {
    const input = document.getElementById('s-inp');
    const resultBox = document.getElementById('s-res');
    if (!input || !resultBox) return;
    const rawQuery = input.value.trim();
    resultBox.innerHTML = '';
    const clear = document.querySelector('.pfc-search-clear');
    if (clear) clear.classList.toggle('show', !!rawQuery);

    if (!rawQuery) {
      resultBox.style.display = 'none';
      return;
    }

    const results = searchFoods(rawQuery, 12);
    resultBox.style.display = 'block';
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 's-item pfc-search-empty';
      empty.innerHTML = `<strong>「${escapeHtml(rawQuery)}」は見つかりませんでした</strong><small>別の名前で検索するか、My食品に登録できます</small>`;
      resultBox.appendChild(empty);
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
      resultBox.appendChild(row);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function enhanceManualSearchUi() {
    const input = document.getElementById('s-inp');
    const box = input?.closest('.s-box');
    if (!input || !box || box.dataset.pfcV21 === '1') return;
    box.dataset.pfcV21 = '1';
    input.placeholder = '食品名・別名で検索';
    input.autocomplete = 'off';
    input.setAttribute('enterkeyhint', 'search');

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'pfc-search-clear';
    clear.setAttribute('aria-label', '検索をクリア');
    clear.textContent = '×';
    clear.onclick = clearSearch;
    box.appendChild(clear);

    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        clearSearch();
        input.blur();
        return;
      }
      if (event.key === 'Enter' && !event.isComposing) {
        const first = document.querySelector('#s-res .pfc-search-result');
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    });
  }

  function install() {
    enrichDatabase();
    rebuildDbIndex();
    window.filterF = smartFilterF;
    window.__PFC_SEARCH_V21__ = {
      version: VERSION,
      addedDbRows: DB_EXTENSIONS.filter(row => typeof DB !== 'undefined' && DB.some(item => item?.[1] === row[1])).length,
      search: searchFoods,
      rebuild: rebuildDbIndex
    };
    enhanceManualSearchUi();
    document.documentElement.classList.add('pfc-v21');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
