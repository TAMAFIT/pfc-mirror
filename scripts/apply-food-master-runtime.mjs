import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const dist = path.join(root, 'dist');
const runtimeSource = path.join(root, 'overrides', 'pfc-food-master-runtime.js');
const runtimeOutput = path.join(dist, 'pfc-food-master-runtime.js');
const htmlPath = path.join(dist, 'index.html');
const manifestPath = path.join(dist, 'food-master-manifest.json');

for (const required of [runtimeSource, htmlPath]) {
  if (!fs.existsSync(required)) throw new Error(`Food Master runtime dependency missing: ${required}`);
}

const runtimeTemplate = fs.readFileSync(runtimeSource, 'utf8');
if (!runtimeTemplate.includes('__PFC_FOOD_MASTER_BUILD_FINGERPRINT__')) {
  throw new Error('Food Master build fingerprint placeholder is missing.');
}

const dataFiles = [
  'pfc-database-v3-verified.js',
  'pfc-database-v3-verified-b5.js',
  'pfc-database-v3.js',
  'pfc-database-v3-catalog.js',
  'pfc-database-v3-manual.js',
  'pfc-database-v3-multiunit.js',
  'pfc-database-v3-search.js'
];
for (const file of dataFiles) {
  if (!fs.existsSync(path.join(dist, file))) throw new Error(`Food Master data asset missing: ${file}`);
}

const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const fingerprintInput = dataFiles
  .map(file => `${file}:${hash(fs.readFileSync(path.join(dist, file)))}`)
  .concat(`runtime-template:${hash(runtimeTemplate)}`)
  .join('\n');
const fingerprint = hash(fingerprintInput).slice(0, 32);

const runtimeBuilt = runtimeTemplate.replace('__PFC_FOOD_MASTER_BUILD_FINGERPRINT__', fingerprint);
fs.writeFileSync(runtimeOutput, runtimeBuilt, 'utf8');

let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('pfc-food-master-runtime.js')) {
  const inputTag = '    <script src="pfc-input-v25.js?v=251"></script>';
  if (!html.includes(inputTag)) throw new Error('PFC input V2.5 tag missing for Food Master runtime injection.');
  html = html.replace(inputTag, `    <script src="pfc-food-master-runtime.js?v=100"></script>\n${inputTag}`);
}
fs.writeFileSync(htmlPath, html, 'utf8');

const scriptUrl = file => {
  const pattern = new RegExp(`<script[^>]+src=["']([^"']*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`, 'i');
  const match = html.match(pattern);
  return match?.[1] || file;
};

const assetFiles = [...dataFiles, 'pfc-food-master-runtime.js'];
const assets = assetFiles.map(file => ({
  url: scriptUrl(file),
  sha256: hash(fs.readFileSync(path.join(dist, file)))
}));
assets.push({ url: 'index.html', sha256: hash(fs.readFileSync(htmlPath)) });

const manifest = {
  schemaVersion: 1,
  fingerprint,
  generatedAt: new Date().toISOString(),
  strategy: 'local-first-next-launch',
  assets
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const searchPos = finalHtml.indexOf('pfc-database-v3-search.js');
const runtimePos = finalHtml.indexOf('pfc-food-master-runtime.js');
const inputPos = finalHtml.indexOf('pfc-input-v25.js');
if (!(searchPos >= 0 && runtimePos > searchPos && inputPos > runtimePos)) {
  throw new Error('Food Master runtime script order is invalid.');
}
if (!finalHtml.includes('pfc-food-master-runtime.js?v=100')) throw new Error('Food Master runtime cache version is stale.');
if (!runtimeBuilt.includes(`const BUILD_FINGERPRINT = '${fingerprint}'`)) throw new Error('Food Master runtime fingerprint injection failed.');

console.log(`Food Master runtime ready: ${fingerprint}`);
