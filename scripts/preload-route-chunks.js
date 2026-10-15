/**
 * Adds <link rel="modulepreload"> hints for a lazy route's chunks to that route's prerendered page.
 *
 * Angular emits the lazy chunk of a route only after the router asks for it, which happens after the main bundle
 * has downloaded and run: a request chain html -> main -> route chunk -> its shared chunks. With the hints the
 * browser fetches the route's chunks in parallel with the main bundle, while the HTML is still being read.
 * Nothing about the app changes; the same files are simply requested earlier.
 *
 * Runs after `ng build` (see the "build" script). Chunk names are hashed and change on every build, so the
 * route's chunk is found by the selector of its component, not by name.
 */
const fs = require('fs');
const path = require('path');

const BROWSER_DIR = path.join(__dirname, '..', 'dist', 'aura-time', 'browser');
/** prerendered page -> selector of the component its lazy route loads */
const ROUTES = { 'app/index.html': 'app-clock' };

const read = file => fs.readFileSync(path.join(BROWSER_DIR, file), 'utf8');

/** Chunks imported statically (import ... from "./x.js", import "./x.js", export ... from "./x.js"). */
function staticImports(source) {
  const found = new Set();
  const pattern = /(?:^|[;}\s])(?:import|export)\s*(?:[^'"()]*?\s*from\s*)?["']\.\/([^"']+\.js)["']/g;
  for (let match; (match = pattern.exec(source)); ) found.add(match[1]);
  return [...found];
}

/** Chunks loaded with a dynamic import() from the main bundle. */
function dynamicImports(source) {
  const found = new Set();
  const pattern = /import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g;
  for (let match; (match = pattern.exec(source)); ) found.add(match[1]);
  return [...found];
}

function main() {
  if (!fs.existsSync(BROWSER_DIR)) throw new Error('Run "ng build" first: ' + BROWSER_DIR + ' does not exist.');
  const files = fs.readdirSync(BROWSER_DIR);
  const mainFile = files.find(f => /^main-.*\.js$/.test(f));
  if (!mainFile) throw new Error('No main bundle found.');
  const lazyCandidates = dynamicImports(read(mainFile));

  for (const [page, selector] of Object.entries(ROUTES)) {
    const pagePath = path.join(BROWSER_DIR, page);
    if (!fs.existsSync(pagePath)) {
      console.warn(`preload-route-chunks: ${page} was not prerendered, skipped.`);
      continue;
    }
    let html = fs.readFileSync(pagePath, 'utf8');

    const routeChunk = lazyCandidates.find(f => read(f).includes(selector));
    if (!routeChunk) throw new Error(`preload-route-chunks: no lazy chunk contains "${selector}" (did the route move?)`);

    // The route chunk and everything it imports, except what the page already loads.
    const already = new Set([...html.matchAll(/href="([^"]+\.js)"/g)].map(m => m[1]));
    const wanted = [];
    const visit = file => {
      if (wanted.includes(file) || already.has(file)) return;
      wanted.push(file);
      for (const dep of staticImports(read(file))) visit(dep);
    };
    visit(routeChunk);

    const tags = wanted.filter(f => !html.includes(`href="${f}"`)).map(f => `<link rel="modulepreload" href="${f}">`);
    if (!tags.length) continue;
    // before the main script, so the requests start as early as possible
    const anchor = html.search(/<script src="polyfills[^"]*" type="module">/);
    if (anchor < 0) throw new Error(`preload-route-chunks: could not find where to add the hints in ${page}`);
    html = html.slice(0, anchor) + tags.join('') + html.slice(anchor);
    fs.writeFileSync(pagePath, html);
    console.log(`preload-route-chunks: ${page} now preloads ${wanted.length} chunk(s): ${wanted.join(', ')}`);
  }
}

main();
