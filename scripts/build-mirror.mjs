import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('_source_pfc');
const dist = path.resolve('dist');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('Pinned PFC source checkout is missing.');
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const blockedTopLevel = new Set([
  '.git', '.github', '.voicedev', 'gas', 'scripts', 'node_modules',
  'AGENTS.md', 'package.json', 'package-lock.json', '.clasp.json', '.clasprc.json',
  'refactor.py', 'main-inline-temp.txt'
]);

function copySafe(srcDir, destDir, depth = 0) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (depth === 0 && blockedTopLevel.has(entry.name)) continue;
    if (entry.name === '.git') continue;
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copySafe(src, dest, depth + 1);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}
copySafe(source, dist);

const colorMap = new Map([
  ['#f55a94', '#22a06b'], ['#F55A94', '#22A06B'],
  ['#f0528d', '#1f9d68'], ['#F0528D', '#1F9D68'],
  ['#ef4f8d', '#1f9d68'], ['#EF4F8D', '#1F9D68'],
  ['#f65f95', '#25a96f'], ['#F65F95', '#25A96F'],
  ['#ef5b94', '#24a46d'], ['#EF5B94', '#24A46D'],
  ['#f7659b', '#2eae76'], ['#F7659B', '#2EAE76'],
  ['#fb84aa', '#57c795'], ['#FB84AA', '#57C795'],
  ['#f676a3', '#46b984'], ['#F676A3', '#46B984'],
  ['#ff86aa', '#54c491'], ['#FF86AA', '#54C491'],
  ['#ff86b0', '#54c491'], ['#FF86B0', '#54C491'],
  ['#ff83ad', '#4fc08c'], ['#FF83AD', '#4FC08C'],
  ['#ff7fa9', '#49bd88'], ['#FF7FA9', '#49BD88'],
  ['#ff7aa2', '#4dbe8a'], ['#FF7AA2', '#4DBE8A'],
  ['#ff7a9d', '#4dbe8a'], ['#FF7A9D', '#4DBE8A'],
  ['#ff74aa', '#42b982'], ['#FF74AA', '#42B982'],
  ['#ff4f93', '#1b965f'], ['#FF4F93', '#1B965F'],
  ['#fdf2f4', '#effaf4'], ['#FDF2F4', '#EFFAF4'],
  ['#fff0f6', '#e7f7ee'], ['#FFF0F6', '#E7F7EE'],
  ['#fff1f7', '#ebf9f1'], ['#FFF1F7', '#EBF9F1'],
  ['#fff2f8', '#effaf4'], ['#FFF2F8', '#EFFAF4'],
  ['#fff3f8', '#f0faf4'], ['#FFF3F8', '#F0FAF4'],
  ['#fff6fa', '#f4fbf7'], ['#FFF6FA', '#F4FBF7'],
  ['#fff7fb', '#f5fcf8'], ['#FFF7FB', '#F5FCF8'],
  ['#fff8fb', '#f6fcf9'], ['#FFF8FB', '#F6FCF9'],
  ['#ffe5f0', '#dff5e9'], ['#FFE5F0', '#DFF5E9'],
  ['#ffd1e3', '#ccefdc'], ['#FFD1E3', '#CCEFDC'],
  ['#f6cfe0', '#ccebd9'], ['#F6CFE0', '#CCEBD9'],
  ['#f2d9e4', '#d8eee2'], ['#F2D9E4', '#D8EEE2'],
  ['#f0c8d8', '#c7e7d5'], ['#F0C8D8', '#C7E7D5']
]);
const rgbMap = new Map([
  ['245, 90, 148', '34, 160, 107'],
  ['245,90,148', '34,160,107'],
  ['245, 82, 141', '31, 157, 104'],
  ['245,82,141', '31,157,104'],
  ['240, 82, 141', '31, 157, 104'],
  ['240,82,141', '31,157,104'],
  ['239, 79, 141', '31, 157, 104'],
  ['239,79,141', '31,157,104'],
  ['246, 95, 149', '37, 169, 111'],
  ['246,95,149', '37,169,111']
]);

function greenify(text) {
  for (const [from, to] of colorMap) text = text.split(from).join(to);
  for (const [from, to] of rgbMap) text = text.split(from).join(to);
  return text;
}

for (const file of ['style.css', 'index.html']) {
  const target = path.join(dist, file);
  if (fs.existsSync(target)) {
    fs.writeFileSync(target, greenify(fs.readFileSync(target, 'utf8')), 'utf8');
  }
}

// Isolate mirror data from production. GitHub Pages project sites share one origin,
// so every copied application script uses a prefixed storage adapter instead of raw localStorage.
for (const file of ['app.js', 'ai.js', 'main-inline.js', 'tamachan-data.js', 'database.js']) {
  const target = path.join(dist, file);
  if (!fs.existsSync(target)) continue;
  const text = fs.readFileSync(target, 'utf8').replace(/\blocalStorage\b/g, 'mirrorStorage');
  fs.writeFileSync(target, text, 'utf8');
}

const storageAdapter = `(() => {\n  const PREFIX = 'pfc-mirror:v1:';\n  const backing = window.localStorage;\n  const keys = () => Array.from({length: backing.length}, (_, i) => backing.key(i)).filter(k => k && k.startsWith(PREFIX));\n  const api = {\n    getItem(key) { return backing.getItem(PREFIX + String(key)); },\n    setItem(key, value) { backing.setItem(PREFIX + String(key), String(value)); },\n    removeItem(key) { backing.removeItem(PREFIX + String(key)); },\n    clear() { for (const key of keys()) backing.removeItem(key); },\n    key(index) { const key = keys()[index]; return key ? key.slice(PREFIX.length) : null; }\n  };\n  Object.defineProperty(api, 'length', { get() { return keys().length; } });\n  window.mirrorStorage = api;\n})();\n`;
fs.writeFileSync(path.join(dist, 'mirror-storage.js'), storageAdapter, 'utf8');

const manifestPath = path.join(dist, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  manifest.name = 'たまフィットPFC Mirror';
  manifest.short_name = 'PFC Mirror';
  manifest.description = 'たまフィットPFC 安全検証用ミラー';
  manifest.background_color = '#22a06b';
  manifest.theme_color = '#22a06b';
  manifest.icons = [{ src: 'icon-mirror.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

const iosManifestPath = path.join(dist, 'manifest-ios.json');
if (fs.existsSync(iosManifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(iosManifestPath, 'utf8').replace(/^\uFEFF/, ''));
  manifest.name = 'たまフィットPFC Mirror';
  manifest.short_name = 'PFC Mirror';
  manifest.background_color = '#22a06b';
  manifest.theme_color = '#22a06b';
  manifest.icons = [{ src: 'icon-mirror.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }];
  fs.writeFileSync(iosManifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#22a06b"/><circle cx="256" cy="218" r="142" fill="#fff" opacity=".14"/><path d="M146 158h220v60h-80v166h-60V218h-80z" fill="#fff"/><circle cx="256" cy="119" r="30" fill="#fff"/><text x="256" y="454" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#fff">MIRROR</text></svg>\n`;
fs.writeFileSync(path.join(dist, 'icon-mirror.svg'), iconSvg, 'utf8');

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html
  .replace(/<title>たまフィットPFC<\/title>/, '<title>たまフィットPFC Mirror</title>')
  .replace(/<meta name="apple-mobile-web-app-title" content="たまPFC">/, '<meta name="apple-mobile-web-app-title" content="PFC Mirror">')
  .replace(/href="icon\.png"/g, 'href="icon-mirror.svg"')
  .replace(/(<script src="database\.js[^>]*><\/script>)/, '<script src="mirror-storage.js"></script>\n    $1')
  .replace(/たまフィットPFC(?=<\/h1>)/, 'たまフィットPFC Mirror');
fs.writeFileSync(path.join(dist, 'index.html'), html, 'utf8');

// Never ship production deployment machinery in the mirror artifact.
for (const forbidden of ['gas', '.github', '.voicedev', '.clasp.json', '.clasprc.json']) {
  if (fs.existsSync(path.join(dist, forbidden))) throw new Error(`Forbidden production artifact leaked into mirror: ${forbidden}`);
}

for (const required of ['index.html', 'style.css', 'database.js', 'tamachan-data.js', 'app.js', 'ai.js', 'main-inline.js', 'manifest.json', 'sw.js', 'mirror-storage.js', 'icon-mirror.svg']) {
  if (!fs.existsSync(path.join(dist, required))) throw new Error(`Mirror build missing ${required}`);
}

console.log('Mirror build ready:', dist);
