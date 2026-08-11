import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const sourceAvatar = path.join(root, 'assets', 'trainer-ai-avatar.webp');
const outputAvatar = path.join(dist, 'trainer-ai-avatar.webp');
const sourceV21Js = path.join(root, 'overrides', 'pfc-v21.js');
const sourceV21Css = path.join(root, 'overrides', 'pfc-v21.css');
const outputV21Js = path.join(dist, 'pfc-v21.js');
const outputV21Css = path.join(dist, 'pfc-v21.css');

if (!fs.existsSync(dist)) throw new Error('dist/ is missing; build mirror first.');
for (const required of [sourceAvatar, sourceV21Js, sourceV21Css]) {
  if (!fs.existsSync(required)) throw new Error(`Mirror overlay source missing: ${required}`);
}

fs.copyFileSync(sourceAvatar, outputAvatar);
fs.copyFileSync(sourceV21Js, outputV21Js);
fs.copyFileSync(sourceV21Css, outputV21Css);

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
if (!html.includes('pfc-v21.js')) {
  html = html.replace('</body>', '    <script src="pfc-v21.js?v=210"></script>\n</body>');
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
fs.appendFileSync(stylePath, `\n/* Mirror: Obayashi trainer AI avatar */\n#tama-chat-btn img, .msg.bot .icon img {\n  object-fit: contain !important;\n  object-position: center center !important;\n  background: #fff;\n}\n#tama-chat-btn img {\n  transform: scale(1.08);\n}\n.user-chat-icon {\n  width: 100%;\n  height: 100%;\n  border-radius: 50%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: #eef2f5;\n  color: #607080;\n  font-size: 9px;\n  font-weight: 800;\n}\n`, 'utf8');

for (const required of [outputAvatar, outputV21Js, outputV21Css, htmlPath, aiPath, stylePath]) {
  if (!fs.existsSync(required)) throw new Error(`Mirror overlay output missing: ${required}`);
}
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const finalAi = fs.readFileSync(aiPath, 'utf8');
const finalV21Js = fs.readFileSync(outputV21Js, 'utf8');
const finalV21Css = fs.readFileSync(outputV21Css, 'utf8');
if (!finalHtml.includes('大林トレーナーAI')) throw new Error('Trainer AI title was not applied.');
if (!finalAi.includes('trainer-ai-avatar.webp')) throw new Error('Dynamic chat avatar was not applied.');
if (!finalHtml.includes('pfc-v21.js') || !finalHtml.includes('pfc-v21.css')) throw new Error('PFC V2.1 assets were not injected.');
for (const marker of ['__PFC_SEARCH_V21__', 'smartFilterF', 'DB_EXTENSIONS', "VERSION = '2.1.0'"]) {
  if (!finalV21Js.includes(marker)) throw new Error(`PFC V2.1 JS marker missing: ${marker}`);
}
for (const marker of ['.btn-voice-main', '#voice-ui-window', '.pfc-search-result']) {
  if (!finalV21Css.includes(marker)) throw new Error(`PFC V2.1 CSS marker missing: ${marker}`);
}

console.log('Trainer AI + PFC V2.1 overlay applied.');
