const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const browserDist = path.join(rootDir, 'dist', 'aura-time', 'browser');
const extensionDist = path.join(rootDir, 'dist-extension');
const manifestSrc = path.join(rootDir, 'extension', 'manifest.json');

console.log('Packaging AuraTime as a New Tab extension...');

if (!fs.existsSync(browserDist)) {
  console.error('Error: dist/aura-time/browser not found. Run "npm run build" first.');
  process.exit(1);
}

// Fresh output folder
if (fs.existsSync(extensionDist)) {
  fs.rmSync(extensionDist, { recursive: true, force: true });
}
fs.mkdirSync(extensionDist, { recursive: true });
fs.cpSync(browserDist, extensionDist, { recursive: true });
fs.copyFileSync(manifestSrc, path.join(extensionDist, 'manifest.json'));

// Manifest V3 pages run under a CSP that forbids inline event handlers and inline scripts.
// Angular's critical-CSS step emits <link rel="stylesheet" media="print" onload="this.media='all'">:
// drop the handler (and the print media) so the stylesheet simply loads.
const indexCsr = path.join(extensionDist, 'index.csr.html');
if (!fs.existsSync(indexCsr)) {
  console.error('Error: index.csr.html missing from the build output.');
  process.exit(1);
}
let html = fs.readFileSync(indexCsr, 'utf8');
html = html.replace(/\s+media="print"\s+onload="this\.media='all'"/g, '');
fs.writeFileSync(indexCsr, html);
fs.copyFileSync(indexCsr, path.join(extensionDist, 'index.html'));

// Self-check: fail the build rather than ship a page the browser will refuse to run.
const problems = [];
const inlineHandler = html.match(/<[^>]+\son[a-z]+\s*=/gi);
if (inlineHandler) problems.push(`inline event handlers: ${inlineHandler.slice(0, 3).join(' | ')}`);
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(
  m => !/\bsrc\s*=/.test(m[1]) && !/type\s*=\s*["']application\/(json|ld\+json)["']/.test(m[1])
);
if (inlineScripts.length) problems.push(`${inlineScripts.length} inline <script> block(s)`);
if (/javascript:/i.test(html)) problems.push('javascript: URL');

const manifest = JSON.parse(fs.readFileSync(path.join(extensionDist, 'manifest.json'), 'utf8'));
const referenced = [manifest.chrome_url_overrides && manifest.chrome_url_overrides.newtab, ...Object.values(manifest.icons || {})];
for (const file of referenced.filter(Boolean)) {
  if (!fs.existsSync(path.join(extensionDist, file))) problems.push(`manifest references a missing file: ${file}`);
}

if (problems.length) {
  console.error('Extension build check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}

console.log('OK: dist-extension/ created and checked (no inline handlers/scripts, manifest files present).');
console.log('How to test:');
console.log('  1. Open chrome://extensions (or edge://extensions) and enable Developer mode.');
console.log('  2. Click "Load unpacked" and select the dist-extension folder.');
console.log('  3. Open a new tab: it shows the clock. The USB screen page is index.csr.html#/screen.');
