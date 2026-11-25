// P10e: the layout page, shared by the layout test (`npm run test:layout`) and the side-by-side shots (`npm run shots`).
// esbuild bundles tests/layout/entry.ts, the campaign states are built in Node (tests/layout/mkstate.ts), and the repo root is served on
// 127.0.0.1 (a file URL cannot fetch). `/page.html?fixture=<name>` renders the real scene screen for one fixture. Playwright is not a dependency
// of the package: it comes from the environment (NODE_PATH or a global install) and so does its Chromium.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundles the entry and writes the campaign states (`.superpowers/layout/`). */
export async function buildLayoutPage() {
  const out = resolve(root, '.superpowers/layout');
  mkdirSync(out, { recursive: true });
  await build({ entryPoints: [resolve(root, 'tests/layout/entry.ts')], outfile: resolve(out, 'entry.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'error' });
  await build({ entryPoints: [resolve(root, 'tests/layout/mkstate.ts')], outfile: resolve(out, 'mkstate.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'error', external: ['node:*'] });
  execFileSync('node', [resolve(out, 'mkstate.mjs'), resolve(out, 'states.json')], { cwd: root, stdio: 'inherit' });
}

// the page: the real stylesheet, the bundled entry
const page = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;height:100%;background:#000}</style></head><body><script type="module" src="/.superpowers/layout/entry.js"></script></body></html>';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/** Serves the repo root (and `/page.html`) on 127.0.0.1; resolves to `{ port, close }`. */
export async function serveRoot() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
    const file = join(root, url);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, close: () => server.close() };
}

/** Playwright's Chromium (from the environment). */
export function chromium() {
  return createRequire(import.meta.url)('playwright').chromium;
}

/** Opens the layout page for `fixture` and waits until the scene is drawn (and its backdrop, if it comes). */
export async function openLayout(browser, port, fixture, [width, height], query = '') {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/page.html?fixture=${fixture}${query}`);
  await p.waitForSelector('body[data-ready="true"]', { timeout: 20000 });
  try { await p.waitForSelector('.alius-scene[data-backdrop="image"]', { timeout: 8000 }); } catch { /* the layout test reports it */ }
  await p.waitForTimeout(700);
  return { page: p, errors };
}
