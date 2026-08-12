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
for (const file of [jsSource,cssSource,htmlPath]) if (!fs.existsSync(file)) throw new Error(`dish photo v3.4 dependency missing: ${file}`);

let js = fs.readFileSync(jsSource,'utf8');
const css = fs.readFileSync(cssSource);

function replaceOnce(from, to, label) {
  if (!js.includes(from)) throw new Error(`dish photo v3.4 patch anchor missing: ${label}`);
  js = js.replace(from, to);
}

replaceOnce('PFC Mirror V3.3:', 'PFC Mirror V3.4:', 'header');
replaceOnce("const VERSION = '3.3.0';", "const VERSION = '3.4.0';", 'version');
replaceOnce('const REQUEST_TIMEOUT_MS = 32000;', 'const REQUEST_TIMEOUT_MS = 35000;', 'timeout');

js = js.replace(
  /  function identityPrompt\(\) \{[\s\S]*?\n  \}\n\n  function buildRequestPayload/,
  `  function identityPrompt() {
    return \`あなたは食事写真の視覚的食品抽出器です。画像から直接見える食べ物だけを日本語で抽出し、JSONだけ返してください。
- 弁当・定食・ワンプレートは全体名だけで終わらず、区別できる主食・主菜・卵・野菜・漬物・副菜を個別に拾う。
- 見えない具、味、肉の部位、ソース、調理法を補完しない。具が見えないおにぎりは「おにぎり」とだけ書く。
- 料理名を断定できない場合は安全な一般名にしてambiguityへ候補を書く。
- visibleCountは独立した同一食品の境界を1つずつ確認して数えられる場合だけ整数。同じ個体を二重に数えず、別の副菜や飾りを混ぜない。少しでも曖昧ならnullを優先する。
- 重量、ml、P/F/C、kcal、油量、調味料量は推測しない。
- 食品でない画像はfoods=[]。説明文・Markdownは禁止。
形式: {"dishName":"","uncertain":true,"foods":[{"name":"","visibleCount":null,"ambiguity":"","note":""}]}
最大\${MAX_FOODS}食品。\`;
  }

  function buildRequestPayload`
);
if (!js.includes('少しでも曖昧ならnullを優先する')) throw new Error('dish photo v3.4 prompt patch failed');

replaceOnce(
  'maxOutputTokens:1024\n      }',
  "maxOutputTokens:768,\n        responseMimeType:'application/json'\n      }",
  'structured JSON config'
);

js = js.replace(
  /  async function identifyDish\(base64\) \{[\s\S]*?\n  \}\n\n  function nutritionPreview/,
  `  async function identifyDish(base64) {
    return await requestIdentity(base64);
  }

  function nutritionPreview`
);
if (!js.includes('return await requestIdentity(base64);')) throw new Error('dish photo v3.4 single-request patch failed');

replaceOnce(
  'latencyOptimized:true,\n    retryTransient:true,',
  'latencyOptimized:true,\n    structuredJson:true,\n    autoRetry:false,\n    retryTransient:false,',
  'single-request markers'
);
replaceOnce(
  'resolveFoods,\n    buildRequestPayload,',
  'resolveFoods,\n    identityPrompt,\n    buildRequestPayload,',
  'prompt diagnostics export'
);

const jsHash = createHash('sha256').update(js).digest('hex').slice(0,12);
const cssHash = createHash('sha256').update(css).digest('hex').slice(0,12);
fs.writeFileSync(jsOut,js,'utf8');
fs.copyFileSync(cssSource,cssOut);
let html = fs.readFileSync(htmlPath,'utf8');
for (const obsolete of ['pfc-scan-v28.js','pfc-scan-v28.css','pfc-dish-photo-v29.js','pfc-dish-photo-v29.css','pfc-dish-photo-v29-bootstrap.js']) {
  if (html.includes(obsolete)) throw new Error(`obsolete scan asset still injected before v3.4: ${obsolete}`);
}
if (!html.includes('pfc-dish-photo-v30.css')) html = html.replace('</head>',`    <link rel="stylesheet" href="pfc-dish-photo-v30.css?v=${cssHash}">\n</head>`);
if (!html.includes('pfc-dish-photo-v30.js')) html = html.replace('</body>',`    <script src="pfc-dish-photo-v30.js?v=${jsHash}"></script>\n</body>`);
fs.writeFileSync(htmlPath,html,'utf8');

for (const marker of [
  '__PFC_DISH_PHOTO_V30__',
  "VERSION = '3.4.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  "THINKING_LEVEL = 'minimal'",
  'REQUEST_TIMEOUT_MS = 35000',
  "responseMimeType:'application/json'",
  'maxOutputTokens:768',
  'structuredJson:true',
  'autoRetry:false',
  'retryTransient:false',
  'genericToSpecificBlocked:true',
  'aiAmountAutoApplied:false',
  'requiresUserAmount:true',
  '料理写真'
]) if (!js.includes(marker)) throw new Error(`dish photo v3.4 marker missing: ${marker}`);

const test = spawnSync(process.execPath,[path.join(root,'scripts','test-dish-photo-v30.mjs'),jsOut],{stdio:'inherit'});
if (test.status !== 0) throw new Error('dish photo v3.4 tests failed');
console.log(`PFC dish photo v3.4 applied (${jsHash}/${cssHash}).`);
