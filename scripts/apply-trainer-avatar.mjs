import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const sourceAvatar = path.join(root, 'assets', 'trainer-ai-avatar.webp');
const outputAvatar = path.join(dist, 'trainer-ai-avatar.webp');
const sourceV21Js = path.join(root, 'overrides', 'pfc-v21.js');
const sourceV21SearchFixJs = path.join(root, 'overrides', 'pfc-v21-search-fix.js');
const sourceV21Css = path.join(root, 'overrides', 'pfc-v21.css');
const sourceDummyV22Js = path.join(root, 'overrides', 'pfc-dummy-v22.js');
const sourceModelSelectorV23Js = path.join(root, 'overrides', 'pfc-model-selector-v23.js');
const sourceModelBridgeV23Js = path.join(root, 'overrides', 'pfc-model-selector-bridge-v23.js');
const sourceInputV25Js = path.join(root, 'overrides', 'pfc-input-v25.js');
const sourceInputV25Css = path.join(root, 'overrides', 'pfc-input-v25.css');
const outputV21Js = path.join(dist, 'pfc-v21.js');
const outputV21SearchFixJs = path.join(dist, 'pfc-v21-search-fix.js');
const outputV21Css = path.join(dist, 'pfc-v21.css');
const outputDummyV22Js = path.join(dist, 'pfc-dummy-v22.js');
const outputModelSelectorV23Js = path.join(dist, 'pfc-model-selector-v23.js');
const outputModelBridgeV23Js = path.join(dist, 'pfc-model-selector-bridge-v23.js');
const outputInputV25Js = path.join(dist, 'pfc-input-v25.js');
const outputInputV25Css = path.join(dist, 'pfc-input-v25.css');

if (!fs.existsSync(dist)) throw new Error('dist/ is missing; build mirror first.');
for (const required of [sourceAvatar, sourceV21Js, sourceV21SearchFixJs, sourceV21Css, sourceDummyV22Js, sourceModelSelectorV23Js, sourceModelBridgeV23Js, sourceInputV25Js, sourceInputV25Css]) {
  if (!fs.existsSync(required)) throw new Error(`Mirror overlay source missing: ${required}`);
}

fs.copyFileSync(sourceAvatar, outputAvatar);
fs.copyFileSync(sourceV21Js, outputV21Js);
fs.copyFileSync(sourceV21SearchFixJs, outputV21SearchFixJs);
fs.copyFileSync(sourceV21Css, outputV21Css);
fs.copyFileSync(sourceDummyV22Js, outputDummyV22Js);
fs.copyFileSync(sourceModelSelectorV23Js, outputModelSelectorV23Js);
fs.copyFileSync(sourceModelBridgeV23Js, outputModelBridgeV23Js);
fs.copyFileSync(sourceInputV25Js, outputInputV25Js);
fs.copyFileSync(sourceInputV25Css, outputInputV25Css);

const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html
  .replace(/new_tama\.png/g, 'trainer-ai-avatar.webp')
  .replace(/alt="たまちゃん"/g, 'alt="大林トレーナーAI"')
  .replace('🥚 たまちゃんコーチ', '大林トレーナーAI')
  .replace('手打ちでの修正や、細かい相談はここで聞くたまよ！', '食事やトレーニングの相談はこちらからどうぞ。');

if (!html.includes('pfc-v21.css')) {
  html = html.replace('</head>', '    <link rel="stylesheet" href="pfc-v21.css?v=210">\n</head>');
}
if (!html.includes('pfc-input-v25.css')) {
  html = html.replace('</head>', '    <link rel="stylesheet" href="pfc-input-v25.css?v=250">\n</head>');
}
if (!html.includes('pfc-v21.js')) {
  html = html.replace('</body>', '    <script src="pfc-v21.js?v=210"></script>\n</body>');
}
if (!html.includes('pfc-v21-search-fix.js')) {
  html = html.replace('</body>', '    <script src="pfc-v21-search-fix.js?v=211"></script>\n</body>');
}
if (!html.includes('pfc-dummy-v22.js')) {
  html = html.replace('</body>', '    <script src="pfc-dummy-v22.js?v=220"></script>\n</body>');
}
if (!html.includes('pfc-model-selector-bridge-v23.js')) {
  html = html.replace('</body>', '    <script src="pfc-model-selector-bridge-v23.js?v=230"></script>\n</body>');
}
if (!html.includes('pfc-model-selector-v23.js')) {
  html = html.replace('</body>', '    <script src="pfc-model-selector-v23.js?v=230"></script>\n</body>');
}
if (!html.includes('pfc-input-v25.js')) {
  html = html.replace('</body>', '    <script src="pfc-input-v25.js?v=250"></script>\n</body>');
}
fs.writeFileSync(htmlPath, html, 'utf8');

const aiPath = path.join(dist, 'ai.js');
let ai = fs.readFileSync(aiPath, 'utf8');
ai = ai.replace(
  "iconDiv.innerHTML = '<img src=\"new_tama.png\">';",
  "iconDiv.innerHTML = role === 'bot' ? '<img src=\"trainer-ai-avatar.webp\" alt=\"大林トレーナーAI\">' : '<div class=\"user-chat-icon\">YOU</div>';"
);
fs.writeFileSync(aiPath, ai, 'utf8');

const stylePath = path.join(dist, 'style.css');
fs.appendFileSync(stylePath, `\n/* Mirror: Obayashi trainer AI avatar + dynamic model selector */\n#tama-chat-btn img, .msg.bot .icon img {\n  object-fit: contain !important;\n  object-position: center center !important;\n  background: #fff;\n}\n#tama-chat-btn img {\n  transform: scale(1.08);\n}\n.user-chat-icon {\n  width: 100%;\n  height: 100%;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: #eef2f5;\n  color: #607080;\n  font-size: 9px;\n  font-weight: 800;\n}\n.model-picker-row-v23 {\n  flex-wrap: wrap;\n}\n.model-picker-actions-v23 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: 1 1 100%;\n  margin-top: 7px;\n}\n.model-picker-actions-v23 #ai-model-select {\n  flex: 1 1 auto;\n  min-width: 0;\n  width: auto !important;\n}\n.model-rate-limit-btn-v23 {\n  flex: 0 0 auto;\n  border: 1px solid #cfe7dd;\n  background: #f4fbf8;\n  color: #167a59;\n  border-radius: 9px;\n  padding: 7px 10px;\n  font-size: 12px;\n  font-weight: 800;\n  cursor: pointer;\n  white-space: nowrap;\n}\n.model-picker-meta-v23 {\n  flex: 1 1 100%;\n  font-size: 10px;\n  color: #738079;\n  margin-top: 4px;\n  line-height: 1.35;\n}\n`, 'utf8');

for (const required of [outputAvatar, outputV21Js, outputV21SearchFixJs, outputV21Css, outputDummyV22Js, outputModelSelectorV23Js, outputModelBridgeV23Js, outputInputV25Js, outputInputV25Css, htmlPath, aiPath, stylePath]) {
  if (!fs.existsSync(required)) throw new Error(`Mirror overlay output missing: ${required}`);
}
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const finalAi = fs.readFileSync(aiPath, 'utf8');
const finalV21Js = fs.readFileSync(outputV21Js, 'utf8');
const finalV21SearchFixJs = fs.readFileSync(outputV21SearchFixJs, 'utf8');
const finalV21Css = fs.readFileSync(outputV21Css, 'utf8');
const finalDummyV22Js = fs.readFileSync(outputDummyV22Js, 'utf8');
const finalModelSelectorV23Js = fs.readFileSync(outputModelSelectorV23Js, 'utf8');
const finalModelBridgeV23Js = fs.readFileSync(outputModelBridgeV23Js, 'utf8');
const finalInputV25Js = fs.readFileSync(outputInputV25Js, 'utf8');
const finalInputV25Css = fs.readFileSync(outputInputV25Css, 'utf8');
if (!finalHtml.includes('大林トレーナーAI')) throw new Error('Trainer AI title was not applied.');
if (!finalAi.includes('trainer-ai-avatar.webp')) throw new Error('Dynamic chat avatar was not applied.');
if (!finalHtml.includes('pfc-v21.js') || !finalHtml.includes('pfc-v21-search-fix.js') || !finalHtml.includes('pfc-v21.css')) {
  throw new Error('PFC V2.1 assets were not injected.');
}
if (!finalHtml.includes('pfc-dummy-v22.js')) throw new Error('PFC dummy V2.2 asset was not injected.');
if (!finalHtml.includes('pfc-model-selector-v23.js') || !finalHtml.includes('pfc-model-selector-bridge-v23.js')) {
  throw new Error('PFC model selector V2.3 assets were not injected.');
}
if (!finalHtml.includes('pfc-input-v25.js') || !finalHtml.includes('pfc-input-v25.css')) {
  throw new Error('PFC compact input V2.5 assets were not injected.');
}
if (finalHtml.includes('pfc-input-v24.js') || finalHtml.includes('pfc-input-v24.css')) {
  throw new Error('Deprecated PFC V2.4 smart panel assets leaked into the build.');
}
for (const marker of ['__PFC_SEARCH_V21__', 'smartFilterF', 'DB_EXTENSIONS', "VERSION = '2.1.0'"]) {
  if (!finalV21Js.includes(marker)) throw new Error(`PFC V2.1 JS marker missing: ${marker}`);
}
for (const marker of ['__PFC_SEARCH_V21_BROAD__', "version: '2.1.1'", "'米'", "'肉'"]) {
  if (!finalV21SearchFixJs.includes(marker)) throw new Error(`PFC V2.1 search refinement marker missing: ${marker}`);
}
for (const marker of ['.btn-voice-main', '#voice-ui-window', '.pfc-search-result']) {
  if (!finalV21Css.includes(marker)) throw new Error(`PFC V2.1 CSS marker missing: ${marker}`);
}
for (const marker of ['__PFC_DUMMY_V22__', "VERSION = '2.2.0'", 'realistic-simulation', 'buildRealisticFoodDay', 'weeklyLoss']) {
  if (!finalDummyV22Js.includes(marker)) throw new Error(`PFC dummy V2.2 marker missing: ${marker}`);
}
for (const marker of ['__PFC_MODEL_SELECTOR_V23__', "source: 'models.list'", '上限を見る', 'taskType: \'listModels\'']) {
  if (!finalModelSelectorV23Js.includes(marker)) throw new Error(`PFC model selector V2.3 marker missing: ${marker}`);
}
for (const marker of ['__PFC_MODEL_SELECTOR_BRIDGE_V23__', 'directModelIds: true', 'gemini-3.1-flash-lite']) {
  if (!finalModelBridgeV23Js.includes(marker)) throw new Error(`PFC model bridge V2.3 marker missing: ${marker}`);
}
for (const marker of ['__PFC_INPUT_V25__', "VERSION = '2.5.0'", 'visibleSmartPanel: false', 'quickStepper: true', 'smartCommandSearch: true']) {
  if (!finalInputV25Js.includes(marker)) throw new Error(`PFC input V2.5 JS marker missing: ${marker}`);
}
for (const marker of ['.v25-stepper', '.v25-amount', '.v25-command-hit']) {
  if (!finalInputV25Css.includes(marker)) throw new Error(`PFC input V2.5 CSS marker missing: ${marker}`);
}

console.log('Trainer AI + PFC V2.1 + realistic dummy V2.2 + dynamic model selector V2.3 + compact input V2.5 overlay applied.');
