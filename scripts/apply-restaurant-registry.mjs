import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const source = path.join(root, 'overrides', 'pfc-food-master-restaurant-registry.js');
const output = path.join(dist, 'pfc-food-master-restaurant-registry.js');
const htmlPath = path.join(dist, 'index.html');
if (!fs.existsSync(source) || !fs.existsSync(htmlPath)) throw new Error('Restaurant registry build dependency missing');

const content = fs.readFileSync(source);
const cache = createHash('sha256').update(content).digest('hex').slice(0, 12);
fs.copyFileSync(source, output);
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('pfc-food-master-restaurant-registry.js')) {
  const coreTag = '    <script src="pfc-database-v3.js?v=300"></script>';
  if (!html.includes(coreTag)) throw new Error('Database V3 core tag missing for restaurant registry');
  html = html.replace(coreTag, `    <script src="pfc-food-master-restaurant-registry.js?v=${cache}"></script>\n${coreTag}`);
}
fs.writeFileSync(htmlPath, html, 'utf8');

const built = fs.readFileSync(output, 'utf8');
for (const marker of ['__PFC_FOOD_MASTER_RESTAURANT_REGISTRY__', "VERSION = '7.0.0'", 'restaurant:mcd-jp:big-mac', 'restaurant:mcd-jp:fries-l', 'restaurant:mcd-jp:nuggets-5']) {
  if (!built.includes(marker)) throw new Error(`Restaurant registry marker missing: ${marker}`);
}
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
const mextPos = finalHtml.indexOf('pfc-food-master-mext-registry.js');
const restaurantPos = finalHtml.indexOf('pfc-food-master-restaurant-registry.js');
const corePos = finalHtml.indexOf('pfc-database-v3.js');
const catalogPos = finalHtml.indexOf('pfc-database-v3-catalog.js');
if (!(mextPos >= 0 && restaurantPos > mextPos && corePos > restaurantPos && catalogPos > corePos)) throw new Error('Restaurant registry script ordering is invalid');
if (!finalHtml.includes(`pfc-food-master-restaurant-registry.js?v=${cache}`)) throw new Error('Restaurant registry cache key missing');

const testPath = path.join(root, 'scripts', 'test-food-master-restaurant-registry.mjs');
const corePath = path.join(dist, 'pfc-database-v3.js');
const catalogPath = path.join(dist, 'pfc-database-v3-catalog.js');
for (const file of [testPath, corePath, catalogPath]) if (!fs.existsSync(file)) throw new Error(`Restaurant registry test dependency missing: ${file}`);
const test = spawnSync(process.execPath, [testPath, output, corePath, catalogPath], { stdio: 'inherit' });
if (test.status !== 0) throw new Error('Official restaurant Food Master registry test failed');

console.log(`Food Master restaurant registry applied (${cache}).`);
