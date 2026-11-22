// P10e: the scene stage's layout test, in a real browser (not part of `npm test`: it needs Chromium).
//   npm run test:layout
// esbuild bundles tests/layout/entry.ts, the campaign states are built in Node, the repo root is served on 127.0.0.1 (a file URL cannot
// fetch), and Chromium measures the scene at 1920x1080, 1280x800 and 2560x1440. Exits non-zero with the list of failures.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '.superpowers/layout');
mkdirSync(out, { recursive: true });

await build({ entryPoints: [resolve(root, 'tests/layout/entry.ts')], outfile: resolve(out, 'entry.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'error' });
await build({ entryPoints: [resolve(root, 'tests/layout/mkstate.ts')], outfile: resolve(out, 'mkstate.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'error', external: ['node:*'] });
execFileSync('node', [resolve(out, 'mkstate.mjs'), resolve(out, 'states.json')], { cwd: root, stdio: 'inherit' });
// the page: the real stylesheet, the bundled entry
const page = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>html,body{margin:0;height:100%;background:#000}</style></head><body><script type="module" src="/.superpowers/layout/entry.js"></script></body></html>';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(page); return; }
  const file = join(root, url);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const SIZES = [[1920, 1080], [1280, 800], [2560, 1440]];
const FIXTURES = ['one', 'three', 'curtain', 'long', 'physics', 'chips', 'chipsmany'];
const failures = [];
const fail = (size, fixture, what) => failures.push(`${size[0]}x${size[1]} ${fixture}: ${what}`);
const SHOTS = process.env.LAYOUT_SHOTS ? resolve(process.env.LAYOUT_SHOTS) : null;

/** Runs in the page: every measurement the assertions need. */
function measure() {
  /** The chip row's "+N" against the chips that really lie past its right edge (review I3). */
  const chipRowMeasure = () => {
    const row = document.querySelector('.alius-chip-row');
    if (!row) return null;
    const rr = row.getBoundingClientRect();
    const items = [...row.querySelectorAll('.alius-chip, button, summary, [data-chip-item]')].filter((el) => !el.hasAttribute('data-more-chips') && (el.tagName === 'SUMMARY' || el.closest('details') === null));
    const past = items.filter((el) => el.getBoundingClientRect().right > rr.right + 1).length;
    const more = row.querySelector('[data-more-chips]');
    return { overflow: row.dataset.overflow === 'true', more: more ? more.textContent : null, past, items: items.length, scrollW: row.scrollWidth, clientW: row.clientWidth };
  };

  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const q = (s) => document.querySelector(s);
  const imgs = [...document.querySelectorAll('.alius-sprite-img')].map(r);
  const UI = '.alius-topline-left, .alius-scene-tools, .alius-reply, .alius-chip-row, .alius-input-line, .alius-dock-card, .alius-dock-waiting, .alius-dial, .alius-stage-status > *, .alius-flash';
  return {
    vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
    backdrop: r(q('.alius-layer-backdrop')), backdropShown: getComputedStyle(q('.alius-layer-backdrop')).display !== 'none', image: q('.alius-scene')?.dataset.backdrop,
    sprites: imgs, reply: r(q('.alius-reply')), replyOverflow: q('.alius-reply')?.dataset.overflow, input: r(q('.alius-input-line')), dial: r(q('.alius-dial-face')),
    dock: r(q('.alius-dock-card')), curtain: r(q('.alius-curtain')), curtainOpen: q('.alius-curtain')?.dataset.open, stop: r(q('[data-stop-word]')),
    stopVisible: q('[data-stop-word]') ? getComputedStyle(q('[data-stop-word]')).visibility !== 'hidden' : false,
    chipRow: chipRowMeasure(),
    ui: [...document.querySelectorAll(UI)].map((el) => ({ sel: el.className || el.tagName, ...r(el) })).filter((b) => b.w > 0 && b.h > 0),
  };
}

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const size of SIZES) {
  for (const fixture of FIXTURES) {
    const p = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/page.html?fixture=${fixture}`);
    await p.waitForSelector('body[data-ready="true"]', { timeout: 20000 });
    try { await p.waitForSelector('.alius-scene[data-backdrop="image"]', { timeout: 8000 }); } catch { /* reported below */ }
    await p.waitForTimeout(700);
    const m = await p.evaluate(measure);
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, `${fixture}-${size[0]}x${size[1]}.png`) }); }
    await p.close();
    const [W, H] = size;
    const inside = (b) => b && b.x >= -1 && b.y >= -1 && b.r <= W + 1 && b.b <= H + 1;
    for (const e of errors) fail(size, fixture, `page error: ${e}`);
    // the backdrop covers the whole viewport
    if (!m.backdropShown || m.image !== 'image') fail(size, fixture, 'the backdrop image did not show');
    else if (!m.backdrop || Math.abs(m.backdrop.x) > 1 || Math.abs(m.backdrop.y) > 1 || Math.abs(m.backdrop.w - W) > 1 || Math.abs(m.backdrop.h - H) > 1) fail(size, fixture, `the backdrop box is ${JSON.stringify(m.backdrop)}, not the viewport`);
    if (m.scrollW > W + 1 || m.scrollH > H + 1) fail(size, fixture, `the page overflows: ${m.scrollW}x${m.scrollH}`);
    // the reply, the input and the dial lie inside the viewport
    if (!inside(m.reply)) fail(size, fixture, `the reply is not inside the viewport: ${JSON.stringify(m.reply)}`);
    if (!inside(m.input)) fail(size, fixture, `the input is not inside the viewport: ${JSON.stringify(m.input)}`);
    if (!inside(m.dial)) fail(size, fixture, `the dial is not inside the viewport: ${JSON.stringify(m.dial)}`);
    for (const b of m.ui) if (!inside(b)) fail(size, fixture, `${b.sel} overflows the viewport: ${JSON.stringify(b)}`);
    // the sprites: the head box is the top 22 % of each drawn box
    const heads = m.sprites.map((s) => ({ x: s.x, y: Math.max(0, s.y), r: s.r, b: s.y + s.h * 0.22 }));
    const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
    if (fixture === 'one' || fixture === 'long' || fixture === 'physics') {
      const sp = m.sprites[0];
      if (!sp) fail(size, fixture, 'no sprite');
      else {
        const top = Math.max(0, sp.y);
        const replyTop = m.reply ? m.reply.y : H;
        const visible = Math.min(sp.b ?? sp.y + sp.h, replyTop) - top;
        if (visible < H / 2 - 1) fail(size, fixture, `the sprite shows ${Math.round(visible)} px above the reply (needs ${Math.round(H / 2)})`);
        if (fixture === 'one' && W === 1920 && visible < 540) fail(size, fixture, `the sprite shows ${Math.round(visible)} px above the reply at 1920x1080 (needs 540)`);
      }
    }
    // nothing of the UI overlaps her head
    for (const b of m.ui) for (const hd of heads) if (hit(b, hd) && !(fixture === 'curtain' && b.sel.includes('curtain'))) fail(size, fixture, `${b.sel} overlaps a head box (${JSON.stringify(b)})`);
    if (fixture === 'three') {
      if (m.sprites.length !== 3) fail(size, fixture, `${m.sprites.length} sprites, not 3`);
      if (!m.dock) fail(size, fixture, 'no card in the dock');
      for (const hd of heads) if (m.dock && hit(m.dock, hd)) fail(size, fixture, 'the dock covers a head');
    }
    if (fixture === 'curtain') {
      const want = W <= 1400 ? 0.55 : 0.45;
      if (m.curtainOpen !== 'true') fail(size, fixture, 'the curtain did not open');
      else if (!m.curtain || Math.abs(m.curtain.w - W * want) > 2 || m.curtain.h < H - 2) fail(size, fixture, `the curtain is ${JSON.stringify(m.curtain)}, not ${want * 100}% wide and full height`);
      else for (const hd of heads) if (hd.x < m.curtain.r - 1) fail(size, fixture, `a head is under the curtain (x ${Math.round(hd.x)} < ${Math.round(m.curtain.r)})`);
    }
    if (fixture === 'long') {
      if (m.replyOverflow !== 'true') fail(size, fixture, 'a long reply shows no "more above"');
      if (m.reply && m.reply.h > H * 0.3 + 1) fail(size, fixture, `the reply is ${Math.round(m.reply.h)} px high (max 30% = ${Math.round(H * 0.3)})`);
    }
    if (fixture === 'chips') {
      const c = m.chipRow;
      if (!c) fail(size, fixture, 'no chip row');
      else if (c.past > 0) fail(size, fixture, `${c.past} chips of an ordinary row lie past its edge (the fixture is too wide for this size)`);
      else if (c.overflow || c.more !== null) fail(size, fixture, `a row that fits shows "${c.more}" (scrollWidth ${c.scrollW}, clientWidth ${c.clientW})`);
    }
    if (fixture === 'chipsmany') {
      const c = m.chipRow;
      if (!c || c.past === 0) fail(size, fixture, 'forty chips did not overflow the row');
      else if (!c.overflow || c.more !== `+${c.past}`) fail(size, fixture, `the row shows "${c.more}" for ${c.past} chips past its edge`);
    }
    if (fixture === 'physics' || fixture === 'three') {
      if (!m.stop || !m.stopVisible) fail(size, fixture, 'the stop word is not visible');
      else if (!inside(m.stop)) fail(size, fixture, `the stop word is outside the viewport: ${JSON.stringify(m.stop)}`);
    }
  }
}
await browser.close();
server.close();
if (failures.length > 0) {
  console.error(`layout test: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`layout test: ${SIZES.length} sizes x ${FIXTURES.length} fixtures, all good`);
