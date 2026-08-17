import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root,'dist');
const engineSource = path.join(root,'overrides','pfc-meal-engine-v50.js');
const editorSource = path.join(root,'overrides','pfc-meal-editor-v50.js');
const hardeningSource = path.join(root,'overrides','pfc-meal-v501-hardening.js');
const agentSource = path.join(root,'overrides','pfc-agent-v60.js');
const cssSource = path.join(root,'overrides','pfc-meal-editor-v50.css');
const engineOut = path.join(dist,'pfc-meal-engine-v50.js');
const editorOut = path.join(dist,'pfc-meal-editor-v50.js');
const hardeningOut = path.join(dist,'pfc-meal-v501-hardening.js');
const agentOut = path.join(dist,'pfc-agent-v60.js');
const cssOut = path.join(dist,'pfc-meal-editor-v50.css');
const htmlPath = path.join(dist,'index.html');
const aiPath = path.join(dist,'ai.js');
for (const file of [engineSource,editorSource,hardeningSource,agentSource,cssSource,htmlPath,aiPath]) if (!fs.existsSync(file)) throw new Error(`Meal Engine dependency missing: ${file}`);

const engine = fs.readFileSync(engineSource,'utf8');
const editorRaw = fs.readFileSync(editorSource,'utf8');
const rootClassBug = "    document.documentElement.classList.add('pfc-meal-editor-v50');\n";
const editor = editorRaw.replace(rootClassBug,'');
if (editor === editorRaw || editor.includes("document.documentElement.classList.add('pfc-meal-editor-v50')")) throw new Error('Meal Editor v5 root-class white-screen guard failed');
const hardening = fs.readFileSync(hardeningSource,'utf8');
const agent = fs.readFileSync(agentSource,'utf8');
const css = fs.readFileSync(cssSource);

const test = spawnSync(process.execPath,[path.join(root,'scripts','test-meal-engine-v50.mjs'),engineSource,editorSource,cssSource],{stdio:'inherit'});
if (test.status !== 0) throw new Error('Meal Engine v5 tests failed');
const voiceTest = spawnSync(process.execPath,[path.join(root,'scripts','test-voice-v51.mjs'),hardeningSource],{stdio:'inherit'});
if (voiceTest.status !== 0) throw new Error('Voice Intelligence v5.1 tests failed');
const agentTest = spawnSync(process.execPath,[path.join(root,'scripts','test-agent-v60.mjs'),agentSource],{stdio:'inherit'});
if (agentTest.status !== 0) throw new Error('Agent Runtime v6 tests failed');
for (const source of [hardeningSource,agentSource]) {
  const syntax = spawnSync(process.execPath,['--check',source],{stdio:'inherit'});
  if (syntax.status !== 0) throw new Error(`Syntax check failed: ${source}`);
}
for (const marker of [
  "VERSION = '5.0.1'",
  "VOICE_INTELLIGENCE_VERSION = '5.1.0'",
  "VOICE_MODEL = 'gemini-3.5-flash-lite'",
  'inEditorVoice:true',
  'footerRecovery:true',
  'singleLayerPreserved:true',
  'foodMasterRepair:true'
]) if (!hardening.includes(marker)) throw new Error(`Meal/Voice hardening marker missing: ${marker}`);
for (const marker of [
  "VERSION = '6.0.0'",
  "MODEL = 'gemini-3.5-flash-lite'",
  'capabilityAgent:true',
  'iterativeToolUse:true',
  "name:'confirm_pending_action'",
  "name:'delete_all_today'",
  "name:'repair_record'",
  "name:'edit_open_draft'",
  "nutritionTruth:'Food Master'",
  "destructiveConfirmation:'runtime-gated'"
]) if (!agent.includes(marker)) throw new Error(`Agent Runtime v6 marker missing: ${marker}`);
if (agent.includes('function yesAnswer(') || agent.includes('planConfirmationV51')) throw new Error('Rigid confirmation logic leaked into Agent Runtime v6');

const hash = content => createHash('sha256').update(content).digest('hex').slice(0,12);
const engineHash = hash(engine);
const editorHash = hash(editor);
const hardeningHash = hash(hardening);
const agentHash = hash(agent);
const cssHash = hash(css);
fs.writeFileSync(engineOut,engine,'utf8');
fs.writeFileSync(editorOut,editor,'utf8');
fs.writeFileSync(hardeningOut,hardening,'utf8');
fs.writeFileSync(agentOut,agent,'utf8');
fs.writeFileSync(cssOut,css);

let html = fs.readFileSync(htmlPath,'utf8');
if (!html.includes('pfc-dish-photo-v40.js')) throw new Error('Dish photo v4 base must load before Meal Engine v5');
if (!html.includes('pfc-meal-editor-v50.css')) html = html.replace('</head>',`    <link rel="stylesheet" href="pfc-meal-editor-v50.css?v=${cssHash}">\n</head>`);
if (!html.includes('pfc-meal-engine-v50.js')) {
  html = html.replace('</body>',`    <script src="pfc-meal-engine-v50.js?v=${engineHash}"></script>\n    <script src="pfc-meal-editor-v50.js?v=${editorHash}"></script>\n    <script src="pfc-meal-v501-hardening.js?v=${hardeningHash}"></script>\n    <script src="pfc-agent-v60.js?v=${agentHash}"></script>\n</body>`);
} else if (!html.includes('pfc-agent-v60.js')) {
  html = html.replace('</body>',`    <script src="pfc-agent-v60.js?v=${agentHash}"></script>\n</body>`);
}
fs.writeFileSync(htmlPath,html,'utf8');

let ai = fs.readFileSync(aiPath,'utf8');
ai = ai
  .replace(/たまちゃん考え中\.\.\./g,'大林トレーナーAIが回答中…')
  .replace(/たまちゃん考え中…/g,'大林トレーナーAIが回答中…');
fs.writeFileSync(aiPath,ai,'utf8');

const finalHtml = fs.readFileSync(htmlPath,'utf8');
const finalAi = fs.readFileSync(aiPath,'utf8');
const finalEditor = fs.readFileSync(editorOut,'utf8');
const dishPos = finalHtml.indexOf('pfc-dish-photo-v40.js');
const enginePos = finalHtml.indexOf('pfc-meal-engine-v50.js');
const editorPos = finalHtml.indexOf('pfc-meal-editor-v50.js');
const hardeningPos = finalHtml.indexOf('pfc-meal-v501-hardening.js');
const agentPos = finalHtml.indexOf('pfc-agent-v60.js');
if (!(dishPos >= 0 && enginePos > dishPos && editorPos > enginePos && hardeningPos > editorPos && agentPos > hardeningPos)) throw new Error('Meal/Agent script ordering is invalid');
for (const marker of [
  `pfc-meal-engine-v50.js?v=${engineHash}`,
  `pfc-meal-editor-v50.js?v=${editorHash}`,
  `pfc-meal-v501-hardening.js?v=${hardeningHash}`,
  `pfc-agent-v60.js?v=${agentHash}`,
  `pfc-meal-editor-v50.css?v=${cssHash}`
]) if (!finalHtml.includes(marker)) throw new Error(`Cache-busted asset missing: ${marker}`);
if (finalEditor.includes("document.documentElement.classList.add('pfc-meal-editor-v50')")) throw new Error('Published Meal Editor would hide the document root');
if (finalAi.includes('たまちゃん考え中')) throw new Error('Legacy Tama thinking label remains in ai.js');
if (!finalAi.includes('大林トレーナーAIが回答中')) throw new Error('Trainer thinking label was not applied');
for (const marker of ['legacyCommandTags:false','transactionalMutations:true','nonAlcoholAZeroGuard:true']) if (!engine.includes(marker)) throw new Error(`Meal Engine v5 marker missing: ${marker}`);
for (const marker of ['singleLayerEditor:true','directNameEditing:true','inlineDbSearch:true','voiceDraftEditing:true']) if (!editor.includes(marker)) throw new Error(`Meal Editor v5 marker missing: ${marker}`);

console.log(`Meal Engine v5 + Agent Runtime v6 applied (${engineHash}/${editorHash}/${hardeningHash}/${agentHash}/${cssHash}).`);
