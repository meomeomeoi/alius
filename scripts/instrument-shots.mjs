// P10e chunk (e): side-by-side shots of a prototype and its port (not part of `npm test`: it needs Chromium).
//   npm run shots -- <name> [--state <fixture>] [--moment <id>] [--sprite <file>]
// It builds the prototype (`npm run proto -- <name>`, .superpowers/prototypes/<name>.html) and the layout page (scripts/layout-page.mjs) with the
// same fixture, drives both to each named moment of scripts/instrument-moments.mjs and writes
//   .superpowers/shots/<name>/proto-<moment>.png, port-<moment>.png and pair-<moment>.png (the two side by side, the prototype on the left).
// `--state` draws every moment of the port from that layout fixture; `--moment` shoots one moment; `--sprite` is passed to the prototype's build
// (never commit the author's art: the shots stay in .superpowers/shots/, which git ignores). Exits non-zero when a moment fails or a page throws.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MOMENTS } from './instrument-moments.mjs';
import { buildLayoutPage, chromium, openLayout, root, serveRoot } from './layout-page.mjs';

const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const flags = new Set(['--state', '--moment', '--sprite']);
const name = args.find((a, i) => !a.startsWith('--') && !flags.has(args[i - 1] ?? ''));
const entry = name ? MOMENTS[name] : undefined;
if (!name || !entry) {
  console.error(`usage: npm run shots -- <name> [--state <fixture>] [--moment <id>] [--sprite <file>]\n  names with moments: ${Object.keys(MOMENTS).join(', ')}`);
  process.exit(1);
}
const only = opt('--moment');
const moments = entry.moments.filter((m) => only === undefined || m.id === only);
if (moments.length === 0) { console.error(`no moment "${only}" for ${name}: ${entry.moments.map((m) => m.id).join(', ')}`); process.exit(1); }
const settle = entry.settle ?? 400;

// the prototype and the layout page
const sprite = opt('--sprite');
execFileSync('node', [join(root, 'scripts/prototype.mjs'), name, ...(sprite ? ['--sprite', sprite] : [])], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
await buildLayoutPage();
const server = await serveRoot();
const out = resolve(root, '.superpowers/shots', name);
mkdirSync(out, { recursive: true });

/** A clip with negative x / y counted from the right / bottom edge, in the viewport. */
const clipOf = (c, size) => (c ? { x: c.x < 0 ? size[0] + c.x : c.x, y: c.y < 0 ? size[1] + c.y : c.y, width: c.width, height: c.height } : undefined);

const browser = await chromium().launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const failures = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const m of moments) {
  const size = m.size ?? entry.size ?? [1920, 1080]; // a moment may have its own size (cards: 1920x1080 and 1280x800)
  const clip = clipOf(m.clip ?? entry.clip, size);
  const ctx = { size, wait };
  // the prototype
  const proto = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  const protoErrors = [];
  proto.on('pageerror', (e) => protoErrors.push(e.message));
  await proto.goto(`http://127.0.0.1:${server.port}/.superpowers/prototypes/${name}.html`);
  await proto.evaluate(() => document.fonts.ready);
  if ((entry.hide ?? []).length > 0) await proto.addStyleTag({ content: `${entry.hide.join(', ')} { visibility: hidden !important; }` });
  // the port
  const state = opt('--state') ?? m.state ?? entry.state;
  const { page: port, errors: portErrors } = await openLayout(browser, server.port, state, size, m.query ?? '');
  await port.evaluate(() => document.fonts.ready);
  try {
    await m.proto(proto, ctx);
    await m.port(port, ctx);
    await wait(settle);
    const files = { proto: join(out, `proto-${m.id}.png`), port: join(out, `port-${m.id}.png`) };
    await proto.screenshot({ path: files.proto, clip });
    await port.screenshot({ path: files.port, clip });
    // the pair: both shots side by side, labelled, in one picture
    const pair = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
    const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
    await pair.setContent(`<!doctype html><style>body{margin:0;background:#111;color:#bbb;font:13px monospace;display:flex;gap:12px;padding:12px;width:max-content}
      figure{margin:0}figcaption{padding:0 0 6px}img{display:block;outline:1px solid #333}</style>
      <figure><figcaption>prototype · ${name} · ${m.id}</figcaption><img src="${img(files.proto)}"></figure>
      <figure><figcaption>port · ${state} · ${m.id}</figcaption><img src="${img(files.port)}"></figure>`);
    await pair.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const box = await pair.evaluate(() => ({ width: document.body.scrollWidth, height: document.body.scrollHeight }));
    await pair.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
    await pair.screenshot({ path: join(out, `pair-${m.id}.png`) });
    await pair.close();
    console.log(`${name} ${m.id}: ${files.proto}, ${files.port}`);
  } catch (err) {
    failures.push(`${m.id}: ${err.message}`);
  }
  for (const e of protoErrors) failures.push(`${m.id}: the prototype threw: ${e}`);
  for (const e of portErrors) failures.push(`${m.id}: the port threw: ${e}`);
  await proto.close();
  await port.close();
}
await browser.close();
server.close();
writeFileSync(join(out, 'index.txt'), moments.map((m) => `pair-${m.id}.png`).join('\n') + '\n');
if (failures.length > 0) {
  console.error(`shots: ${failures.length} failure(s)\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`shots: ${moments.length} moment(s) of ${name} in ${out}`);
