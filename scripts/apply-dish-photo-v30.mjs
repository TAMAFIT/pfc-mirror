import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root,'dist');
const jsSource = path.join(root,'overrides','pfc-dish-photo-v30.js');
const cssSource = path.join(root,'overrides','pfc-dish-photo-v30.css');
const jsOut = path.join(dist,'pfc-dish-photo-v30.js');
const cssOut = path.join(dist,'pfc-dish-photo-v30.css');
const htmlPath = path.join(dist,'index.html');
for (const file of [jsSource,cssSource,htmlPath]) if (!fs.existsSync(file)) throw new Error(`dish photo v3.7 dependency missing: ${file}`);

let js = fs.readFileSync(jsSource,'utf8');
const css = fs.readFileSync(cssSource);

function replaceOnce(from, to, label) {
  if (!js.includes(from)) throw new Error(`dish photo v3.7 patch anchor missing: ${label}`);
  js = js.replace(from, to);
}

replaceOnce('PFC Mirror V3.3:', 'PFC Mirror V3.7:', 'header');
replaceOnce("const VERSION = '3.3.0';", "const VERSION = '3.7.0';", 'version');
replaceOnce(
  'const REQUEST_TIMEOUT_MS = 32000;\n  const RETRY_DELAY_MS = 700;',
  "const REQUEST_TIMEOUT_MS = 22000;\n  const HEDGE_DELAY_MS = 4500;\n  const SECONDARY_GAS_URL = 'https://script.google.com/macros/s/AKfycbzmnAYgNXoNbS4UYDU7t1iO70j6OeXLm5CaIaN4P-8Mx27dqLPRU20ewtGAtiJjC0Z7FA/exec';",
  'resilience constants'
);

js = js.replace(
  /  function parseIdentityResponse\(raw\) \{[\s\S]*?\n  \}\n\n  function parentheticalDetail/,
  `  function parseIdentityResponse(raw) {
    const text = String(raw ?? '').trim().replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/,'').trim();
    let data;
    try { data = JSON.parse(text); } catch { return null; }

    let source = [];
    let dishName = '';
    let uncertain = false;
    if (Array.isArray(data)) {
      const dishGroups = data.filter(item => item && typeof item === 'object' && Array.isArray(item.foods));
      if (dishGroups.length) {
        source = dishGroups.flatMap(group => group.foods || []);
        dishName = String(dishGroups.find(group => group.dishName)?.dishName || '').slice(0,80);
        uncertain = dishGroups.some(group => group.uncertain === true);
      } else {
        source = data;
      }
    } else if (data && typeof data === 'object') {
      source = Array.isArray(data.foods) ? data.foods : [];
      dishName = String(data.dishName || '').slice(0,80);
      uncertain = !!data.uncertain;
    }
    if (!Array.isArray(source)) return null;

    const seen = new Map();
    const foods = [];
    for (const item of source) {
      const object = typeof item === 'object' && item ? item : {};
      const name = String(typeof item === 'string' ? item : object.name || '').trim();
      if (!name || name.length > 40) continue;
      const key = norm(name);
      const rawAmbiguity = String(object.ambiguity || '').trim().slice(0,100);
      const ambiguity = /^(?:clear|none|なし|明確|確実)$/i.test(rawAmbiguity) ? '' : rawAmbiguity;
      const parsed = {
        name,
        confidence: Math.max(0, Math.min(1, num(typeof item === 'string' ? 0 : object.confidence))),
        visibleCount: parseVisibleCount(object.visibleCount),
        ambiguity,
        note: String(object.note || '').trim().slice(0,100),
        rawCountCertain: object.countCertain === true,
        rawVariantVisible: object.variantVisible === true
      };
      if (seen.has(key)) {
        const existing = seen.get(key);
        existing.confidence = Math.max(existing.confidence, parsed.confidence);
        if (!existing.visibleCount && parsed.visibleCount) existing.visibleCount = parsed.visibleCount;
        if (!existing.ambiguity && parsed.ambiguity) existing.ambiguity = parsed.ambiguity;
        if (!existing.note && parsed.note) existing.note = parsed.note;
        existing.rawCountCertain = existing.rawCountCertain || parsed.rawCountCertain;
        existing.rawVariantVisible = existing.rawVariantVisible || parsed.rawVariantVisible;
        continue;
      }
      seen.set(key, parsed);
      foods.push(parsed);
      if (foods.length >= MAX_FOODS) break;
    }
    return { foods, dishName, uncertain };
  }

  function parentheticalDetail`
);
if (!js.includes('dishGroups.flatMap')) throw new Error('dish photo v3.7 grouped-array parser patch failed');

js = js.replace(
  /  function isUnsafeSpecificMatch\(ai, result\) \{[\s\S]*?\n  \}\n\n  function searchHits/,
  `  function isUnsafeSpecificMatch(ai, result) {
    if (!ai || !result) return true;
    const fold = value => norm(value)
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[・･]/g, '');
    const candidate = String(result.name || result.meta?.name || '');
    const q = fold(ai.name);
    const c = fold(candidate);
    if (!q || !c) return true;
    if (q === c) return false;
    if (c.includes(q) || q.includes(c)) return true;
    const aliases = Array.isArray(result.meta?.aliases) ? result.meta.aliases : [];
    if (aliases.some(alias => fold(alias) === q)) return false;
    return true;
  }

  function searchHits`
);
if (!js.includes('if (c.includes(q) || q.includes(c)) return true;')) throw new Error('dish photo v3.7 specificity guard patch failed');

js = js.replace(
  /  function endpoint\(\) \{[\s\S]*?\n  \}\n\n  function identityPrompt/,
  `  function endpoints() {
    let primary = 'https://script.google.com/macros/s/AKfycbxRNfeijUEwXwoFgBYbS60S5zn2fcuqHSm4TAbRePUzjTjqInXu10ZmK4cUvxoJ-dCAxw/exec';
    try { if (typeof gasUrl !== 'undefined' && gasUrl) primary = gasUrl; } catch {}
    return [primary, SECONDARY_GAS_URL].filter((url,index,list) => url && list.indexOf(url) === index);
  }

  function identityPrompt`
);
if (!js.includes('SECONDARY_GAS_URL].filter')) throw new Error('dish photo v3.7 endpoint pool patch failed');

js = js.replace(
  /  function identityPrompt\(\) \{[\s\S]*?\n  \}\n\n  function buildRequestPayload/,
  `  function identityPrompt() {
    return \`あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。同じ個体を二重に数えず、少しでも曖昧ならnullを優先する。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。
最大\${MAX_FOODS}食品。\`;
  }

  function buildRequestPayload`
);
if (!js.includes('少しでも曖昧ならnullを優先する')) throw new Error('dish photo v3.7 prompt patch failed');

replaceOnce(
  'maxOutputTokens:1024\n      }',
  `maxOutputTokens:768,
        responseMimeType:'application/json',
        responseJsonSchema:{
          type:'object',
          additionalProperties:false,
          required:['dishName','uncertain','foods'],
          properties:{
            dishName:{type:'string'},
            uncertain:{type:'boolean'},
            foods:{
              type:'array',
              maxItems:10,
              items:{
                type:'object',
                additionalProperties:false,
                required:['name','visibleCount','ambiguity','note'],
                properties:{
                  name:{type:'string'},
                  visibleCount:{type:['integer','null'],minimum:1,maximum:30},
                  ambiguity:{type:'string'},
                  note:{type:'string'}
                }
              }
            }
          }
        },
        mediaResolution:'MEDIA_RESOLUTION_LOW'
      }`,
  'structured schema config'
);

js = js.replace(
  /  async function requestIdentity\(base64\) \{[\s\S]*?\n  \}\n\n  async function identifyDish\(base64\) \{[\s\S]*?\n  \}\n\n  function nutritionPreview/,
  `  async function requestIdentityFrom(base64, url, controller = new AbortController()) {
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'text/plain'},
        body:JSON.stringify(buildRequestPayload(base64)),
        signal:controller.signal
      });
      if (!response.ok) throw new Error(\`画像AI HTTP \${response.status}\`);
      let data;
      try { data = await response.json(); }
      catch { throw new Error('GASからJSONではない応答が返りました'); }
      const raw = extractAiText(data);
      const upstreamError = classifyUpstreamText(raw);
      if (upstreamError) throw upstreamError;
      const parsed = parseIdentityResponse(raw);
      if (!parsed || !parsed.foods.length) {
        const sample = raw ? raw.replace(/\\s+/g,' ').slice(0,220) : '空の応答';
        throw new Error(\`Gemini応答を食品JSONとして読めませんでした: \${sample}\`);
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(\`画像AI経路が\${Math.round(REQUEST_TIMEOUT_MS/1000)}秒以内に応答しませんでした\`);
      throw error;
    } finally { clearTimeout(timer); }
  }

  function combinedRouteError(primaryError, secondaryError) {
    const p = String(primaryError?.message || primaryError || '不明').slice(0,140);
    const s = String(secondaryError?.message || secondaryError || '不明').slice(0,140);
    return new Error(\`画像AIの主系・予備系が両方失敗しました。主系: \${p} / 予備系: \${s}\`);
  }

  async function identifyDish(base64) {
    const urls = endpoints();
    if (urls.length < 2) return await requestIdentityFrom(base64, urls[0]);

    const controllers = [new AbortController(), new AbortController()];
    const primaryRaw = requestIdentityFrom(base64, urls[0], controllers[0]);
    const primary = primaryRaw.then(value => ({ok:true,value,which:0}), error => ({ok:false,error,which:0}));
    const first = await Promise.race([
      primary,
      wait(HEDGE_DELAY_MS).then(() => ({hedge:true}))
    ]);

    if (first?.ok === true) return first.value;

    const secondaryRaw = requestIdentityFrom(base64, urls[1], controllers[1]);
    const secondary = secondaryRaw.then(value => ({ok:true,value,which:1}), error => ({ok:false,error,which:1}));
    if (first?.ok === false) {
      const second = await secondary;
      if (second.ok) return second.value;
      throw combinedRouteError(first.error, second.error);
    }

    const next = await Promise.race([primary, secondary]);
    if (next.ok) {
      controllers[next.which === 0 ? 1 : 0].abort();
      return next.value;
    }
    const last = await (next.which === 0 ? secondary : primary);
    if (last.ok) {
      controllers[last.which === 0 ? 1 : 0].abort();
      return last.value;
    }
    throw next.which === 0 ? combinedRouteError(next.error,last.error) : combinedRouteError(last.error,next.error);
  }

  function nutritionPreview`
);
if (!js.includes('combinedRouteError') || !js.includes('HEDGE_DELAY_MS')) throw new Error('dish photo v3.7 hedged routing patch failed');

replaceOnce(
  '<button class="dish-v30-primary" id="dish-v30-add" disabled>量を確認した食品を追加</button>`);',
  '<button class="dish-v30-primary" id="dish-v30-add" disabled>量を確認した食品を追加</button><button class="dish-v30-primary" id="dish-v30-next">続けて別の写真を判定</button>`);',
  'continuous next-photo button'
);
replaceOnce(
  "const addButton = host.querySelector('#dish-v30-add');",
  "const addButton = host.querySelector('#dish-v30-add');\n    const nextButton = host.querySelector('#dish-v30-next');\n    if (nextButton) nextButton.onclick = () => { host.classList.remove('show'); choosePhotoSource(); };",
  'continuous next-photo handler'
);
replaceOnce(
  '<button class="dish-v30-primary" id="dish-v30-close-result">閉じる</button>`);',
  '<button class="dish-v30-primary" id="dish-v30-close-result">別の写真を判定</button>`);',
  'unmatched next-photo label'
);
replaceOnce(
  "host.querySelector('#dish-v30-close-result').onclick = () => host.classList.remove('show');",
  "host.querySelector('#dish-v30-close-result').onclick = () => { host.classList.remove('show'); choosePhotoSource(); };",
  'unmatched next-photo handler'
);

replaceOnce(
  'latencyOptimized:true,\n    retryTransient:true,',
  "latencyOptimized:true,\n    structuredJson:true,\n    structuredSchema:true,\n    mediaResolution:'MEDIA_RESOLUTION_LOW',\n    redundantEndpoints:true,\n    endpointCount:2,\n    hedgeDelayMs:HEDGE_DELAY_MS,\n    autoRetry:false,\n    retryTransient:false,",
  'resilience markers'
);
replaceOnce(
  'genericToSpecificBlocked:true,\n    visibleCount:true,',
  'genericToSpecificBlocked:true,\n    strictSpecificityGuard:true,\n    visibleCount:true,',
  'strict specificity marker'
);
replaceOnce(
  'resolveFoods,\n    buildRequestPayload,',
  'resolveFoods,\n    endpoints,\n    identityPrompt,\n    buildRequestPayload,',
  'diagnostics exports'
);

const jsHash = createHash('sha256').update(js).digest('hex').slice(0,12);
const cssHash = createHash('sha256').update(css).digest('hex').slice(0,12);
fs.writeFileSync(jsOut,js,'utf8');
fs.copyFileSync(cssSource,cssOut);
let html = fs.readFileSync(htmlPath,'utf8');
for (const obsolete of ['pfc-scan-v28.js','pfc-scan-v28.css','pfc-dish-photo-v29.js','pfc-dish-photo-v29.css','pfc-dish-photo-v29-bootstrap.js']) {
  if (html.includes(obsolete)) throw new Error(`obsolete scan asset still injected before v3.7: ${obsolete}`);
}
if (!html.includes('pfc-dish-photo-v30.css')) html = html.replace('</head>',`    <link rel="stylesheet" href="pfc-dish-photo-v30.css?v=${cssHash}">\n</head>`);
if (!html.includes('pfc-dish-photo-v30.js')) html = html.replace('</body>',`    <script src="pfc-dish-photo-v30.js?v=${jsHash}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');

for (const marker of [
  '__PFC_DISH_PHOTO_V30__',
  "VERSION = '3.7.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  "THINKING_LEVEL = 'minimal'",
  'REQUEST_TIMEOUT_MS = 22000',
  'HEDGE_DELAY_MS = 4500',
  "responseMimeType:'application/json'",
  'responseJsonSchema',
  "mediaResolution:'MEDIA_RESOLUTION_LOW'",
  'maxOutputTokens:768',
  'structuredJson:true',
  'structuredSchema:true',
  'redundantEndpoints:true',
  'endpointCount:2',
  'genericToSpecificBlocked:true',
  'strictSpecificityGuard:true',
  'aiAmountAutoApplied:false',
  'requiresUserAmount:true',
  '続けて別の写真を判定',
  '料理写真'
]) if (!js.includes(marker)) throw new Error(`dish photo v3.7 marker missing: ${marker}`);

const test = spawnSync(process.execPath,[path.join(root,'scripts','test-dish-photo-v30.mjs'),jsOut],{stdio:'inherit'});
if (test.status !== 0) throw new Error('dish photo v3.7 tests failed');
console.log(`PFC dish photo v3.7 applied (${jsHash}/${cssHash}).`);
