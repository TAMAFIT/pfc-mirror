// PFC Mirror V2.1 search refinement for broad Japanese terms.
(() => {
  'use strict';

  const PREFERRED = {
    '米': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    'こめ': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    'ご飯': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    'ごはん': ['白米','玄米','雑穀米','麦ご飯','パックご飯'],
    '肉': ['鶏むね(皮なし)','鶏ささみ','鶏もも(皮なし)','鶏むね(皮あり)','豚ヒレ','牛モモ(赤身)','豚ロース(脂身無)','牛ヒレ(赤身)'],
    '鶏肉': ['鶏むね(皮なし)','鶏ささみ','鶏もも(皮なし)','鶏むね(皮あり)','鶏もも(皮あり)','鶏ひき肉'],
    '魚': ['鮭(焼き)','サバ缶(水煮)','サバ缶(味噌煮)'],
    '麺': ['うどん(1玉)','そば(1玉)','中華麺','パスタ(ゆで)','パスタ(乾麺)'],
    'めん': ['うどん(1玉)','そば(1玉)','中華麺','パスタ(ゆで)','パスタ(乾麺)'],
    'パン': ['食パン(6枚切)','食パン(8枚切)','ロールパン','ベーグル','フランスパン'],
    'ぱん': ['食パン(6枚切)','食パン(8枚切)','ロールパン','ベーグル','フランスパン']
  };

  function keyOf(value) {
    return String(value || '').normalize('NFKC').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function meta(result) {
    if (result.source === 'my') {
      const item = result.item || {};
      return `My食品 · ${Math.round(Number(item.Cal || 0))} kcal`;
    }
    const item = result.item || [];
    return `${item[0] || ''} · ${item[3] || '1人前'} · ${Math.round(Number(item[7] || 0))} kcal`;
  }

  function renderPreferred(rawQuery, preference) {
    const api = window.__PFC_SEARCH_V21__;
    const input = document.getElementById('s-inp');
    const box = document.getElementById('s-res');
    if (!api?.search || !input || !box) return false;

    const results = api.search(rawQuery, 30);
    if (!results.length) return false;
    const order = new Map(preference.map((name, index) => [name, index]));
    results.sort((a, b) => {
      const ai = order.has(a.name) ? order.get(a.name) : 999;
      const bi = order.has(b.name) ? order.get(b.name) : 999;
      if (ai !== bi) return ai - bi;
      return (b.score || 0) - (a.score || 0);
    });

    box.innerHTML = '';
    box.style.display = 'block';
    results.slice(0, 12).forEach((result, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 's-item pfc-search-result';
      row.dataset.searchOrder = String(index);
      row.innerHTML = `<span class="pfc-search-main"><strong>${escapeHtml(result.name)}</strong><small>${escapeHtml(meta(result))}</small></span><span class="pfc-search-arrow">›</span>`;
      row.onclick = () => {
        if (result.source === 'my' && typeof selMyFd === 'function') selMyFd(result.index);
        else if (result.source === 'db' && typeof selFd === 'function') selFd(result.index);
        input.value = '';
        box.innerHTML = '';
        box.style.display = 'none';
        document.querySelector('.pfc-search-clear')?.classList.remove('show');
      };
      box.appendChild(row);
    });
    document.querySelector('.pfc-search-clear')?.classList.add('show');
    return true;
  }

  function install() {
    const original = window.filterF;
    if (typeof original === 'function' && !original.__pfcBroadSearchWrapped) {
      const wrapped = function () {
        const raw = document.getElementById('s-inp')?.value?.trim() || '';
        const preference = PREFERRED[keyOf(raw)];
        if (preference && renderPreferred(raw, preference)) return;
        return original.apply(this, arguments);
      };
      wrapped.__pfcBroadSearchWrapped = true;
      window.filterF = wrapped;
    }
    if (typeof mkCat === 'function') mkCat();
    window.__PFC_SEARCH_V21_BROAD__ = { version: '2.1.1', preferredTerms: Object.keys(PREFERRED) };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
