import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const runtimeSource = path.join(root, 'overrides', 'pfc-food-master-runtime.js');
const runtimeOutput = path.join(dist, 'pfc-food-master-runtime.js');
const htmlPath = path.join(dist, 'index.html');
const manifestPath = path.join(dist, 'food-master-manifest.json');

for (const required of [runtimeSource, htmlPath]) if (!fs.existsSync(required)) throw new Error(`Food Master runtime dependency missing: ${required}`);

const restaurantApply = path.join(root, 'scripts', 'apply-restaurant-registry.mjs');
if (!fs.existsSync(restaurantApply)) throw new Error(`Restaurant registry apply script missing: ${restaurantApply}`);
const restaurantResult = spawnSync(process.execPath, [restaurantApply], { stdio: 'inherit' });
if (restaurantResult.status !== 0) throw new Error('Restaurant registry build step failed');

const runtimeTemplate = fs.readFileSync(runtimeSource, 'utf8');
if (!runtimeTemplate.includes('__PFC_FOOD_MASTER_BUILD_FINGERPRINT__')) throw new Error('Food Master build fingerprint placeholder is missing.');
const dataFiles = ['pfc-database-v3-verified.js','pfc-database-v3-verified-b5.js','pfc-database-v3-mext-promoted.js','pfc-food-master-mext-registry.js','pfc-food-master-restaurant-registry.js','pfc-database-v3.js','pfc-database-v3-catalog.js','pfc-database-v3-manual.js','pfc-database-v3-multiunit.js','pfc-database-v3-search.js'];
for (const file of dataFiles) if (!fs.existsSync(path.join(dist, file))) throw new Error(`Food Master data asset missing: ${file}`);
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const fingerprintInput = dataFiles.map(file => `${file}:${hash(fs.readFileSync(path.join(dist, file)))}`).concat(`runtime-template:${hash(runtimeTemplate)}`).join('\n');
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

// V3.8 remains the conservative transport/base layer. V4 replaces the review flow with provisional editable cards.
const dishApply = path.join(root, 'scripts', 'apply-dish-photo-v30.mjs');
if (!fs.existsSync(dishApply)) throw new Error('Dish photo v3.8 build script missing');
const dishResult = spawnSync(process.execPath, [dishApply], { stdio: 'inherit' });
if (dishResult.status !== 0) throw new Error('Dish photo v3.8 build step failed');
const dishV40Apply = path.join(root, 'scripts', 'apply-dish-photo-v40.mjs');
if (!fs.existsSync(dishV40Apply)) throw new Error('Dish photo v4 build script missing');
const dishV40Result = spawnSync(process.execPath, [dishV40Apply], { stdio: 'inherit' });
if (dishV40Result.status !== 0) throw new Error('Dish photo v4 build step failed');
html = fs.readFileSync(htmlPath, 'utf8');

const scriptUrl = file => {
  const pattern = new RegExp(`<script[^>]+src=["']([^"']*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`, 'i');
  return html.match(pattern)?.[1] || file;
};
const assetFiles = [...dataFiles, 'pfc-food-master-runtime.js', 'pfc-dish-photo-v30.js', 'pfc-dish-photo-v30.css', 'pfc-dish-photo-v40.js', 'pfc-dish-photo-v40.css'];
const assets = assetFiles.map(file => ({ url: scriptUrl(file), sha256: hash(fs.readFileSync(path.join(dist, file))) }));
assets.push({ url: 'index.html', sha256: hash(fs.readFileSync(htmlPath)) });
const manifest = { schemaVersion: 2, fingerprint, generatedAt: new Date().toISOString(), strategy: 'local-first-next-launch', officialProviderAssets: ['pfc-food-master-mext-registry.js', 'pfc-food-master-restaurant-registry.js'], assets };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const mextPos = finalHtml.indexOf('pfc-food-master-mext-registry.js');
const restaurantPos = finalHtml.indexOf('pfc-food-master-restaurant-registry.js');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
const searchPos = finalHtml.indexOf('pfc-database-v3-search.js');
const runtimePos = finalHtml.indexOf('pfc-food-master-runtime.js');
const inputPos = finalHtml.indexOf('pfc-input-v25.js');
const dishPos = finalHtml.indexOf('pfc-dish-photo-v30.js');
const dishV40Pos = finalHtml.indexOf('pfc-dish-photo-v40.js');
if (!(mextPos >= 0 && restaurantPos > mextPos && corePos > restaurantPos && searchPos > corePos && runtimePos > searchPos && inputPos > runtimePos && dishPos > inputPos && dishV40Pos > dishPos)) throw new Error('Food Master runtime/dish photo script order is invalid.');
if (!finalHtml.includes('pfc-food-master-runtime.js?v=100')) throw new Error('Food Master runtime cache version is stale.');
if (!finalHtml.includes('pfc-dish-photo-v30.js?v=') || !finalHtml.includes('pfc-dish-photo-v30.css?v=')) throw new Error('Dish photo v3.8 base assets missing');
if (!finalHtml.includes('pfc-dish-photo-v40.js?v=') || !finalHtml.includes('pfc-dish-photo-v40.css?v=')) throw new Error('Dish photo v4 final assets missing');
for (const obsolete of ['pfc-scan-v28.js','pfc-scan-v28.css','pfc-dish-photo-v29.js','pfc-dish-photo-v29.css','pfc-dish-photo-v29-bootstrap.js']) if (finalHtml.includes(obsolete)) throw new Error(`obsolete scan asset leaked into final HTML: ${obsolete}`);
if (!runtimeBuilt.includes(`const BUILD_FINGERPRINT = '${fingerprint}'`)) throw new Error('Food Master runtime fingerprint injection failed.');

console.log(`Food Master runtime ready with dish photo v4: ${fingerprint}`);
