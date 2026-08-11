import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const sourceAvatar = path.join(root, 'assets', 'trainer-ai-avatar.webp');
const outputAvatar = path.join(dist, 'trainer-ai-avatar.webp');

if (!fs.existsSync(dist)) throw new Error('dist/ is missing; build mirror first.');
if (!fs.existsSync(sourceAvatar)) throw new Error('Processed trainer avatar is missing.');

fs.copyFileSync(sourceAvatar, outputAvatar);

const htmlPath = path.join(dist, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html
  .replace(/new_tama\.png/g, 'trainer-ai-avatar.webp')
  .replace(/alt="たまちゃん"/g, 'alt="大林トレーナーAI"')
  .replace('🥚 たまちゃんコーチ', '大林トレーナーAI')
  .replace('手打ちでの修正や、細かい相談はここで聞くたまよ！', '食事やトレーニングの相談はこちらからどうぞ。');
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

for (const required of [outputAvatar, htmlPath, aiPath, stylePath]) {
  if (!fs.existsSync(required)) throw new Error(`Trainer overlay output missing: ${required}`);
}
if (!fs.readFileSync(htmlPath, 'utf8').includes('大林トレーナーAI')) {
  throw new Error('Trainer AI title was not applied.');
}
if (!fs.readFileSync(aiPath, 'utf8').includes('trainer-ai-avatar.webp')) {
  throw new Error('Dynamic chat avatar was not applied.');
}

console.log('Trainer AI avatar overlay applied.');
