// P10e: the posture dial's contact sheet. Renders the 13 base postures, the 47 presets of docs/content/blocking.md §7.3 and five
// drift states to `.superpowers/dial-sheet/sheet.html` (and `sheet.png` at deviceScaleFactor 2 when playwright is available).
// The author reviews the sheet; the mannequin's proportions are tuned by that review. Nothing here is committed.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '.superpowers/dial-sheet');
mkdirSync(out, { recursive: true });

const entry = `
import blockingPostures from '${root}/content/core/blockingPostures.json';
import { DRIFTS, PRESETS } from '${root}/tests/fixtures/dial/presets';
import { mannequinSvg } from '${root}/src/ui/scene/dial/draw';
import { poseOf } from '${root}/src/ui/scene/dial/points';

const cell = (svg, title, sub) => {
  const el = document.createElement('figure');
  const dial = document.createElement('div');
  dial.className = 'dial';
  dial.append(svg);
  const cap = document.createElement('figcaption');
  const t = document.createElement('b');
  t.textContent = title;
  const s = document.createElement('span');
  s.textContent = sub;
  cap.append(t, s);
  el.append(dial, cap);
  return el;
};
const section = (name, cells) => {
  const h = document.createElement('h2');
  h.textContent = name;
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(...cells);
  document.getElementById('sheet').append(h, grid);
};
section('13 base postures', blockingPostures.map((p) => cell(mannequinSvg(poseOf(p.id)), p.id, 'base')));
section('47 presets (blocking.md 7.3)', PRESETS.map((p) => cell(mannequinSvg(p), p.id, p.base + (p.item ? ' + ' + p.item : '') + (p.hint ? ' @ ' + p.hint : ''))));
section('5 drift states (dashed ghost = the target, amber = the drifting joint)', DRIFTS.map((d) => cell(mannequinSvg(d.actual, { target: d.target, hot: d.hot }), d.id, d.hot.join(', '))));
document.body.dataset.ready = 'true';
`;
writeFileSync(resolve(out, 'entry.ts'), entry);
await build({ entryPoints: [resolve(out, 'entry.ts')], outfile: resolve(out, 'bundle.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2022', logLevel: 'warning', loader: { '.json': 'json' } });

const css = ['00-vars.css', '61-blocking.css'].map((f) => readFileSync(resolve(root, 'css', f), 'utf8')).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Alius posture dial: contact sheet</title><style>
${css}
body { margin: 0; background: #0b0e13; color: #b8c4d6; font: 12px/1.3 ui-monospace, monospace; }
#sheet { padding: 16px 20px 40px; }
h2 { font: 600 14px ui-monospace, monospace; letter-spacing: 0.08em; text-transform: uppercase; margin: 22px 0 10px; color: #7fa6d6; }
.grid { display: grid; grid-template-columns: repeat(8, 200px); gap: 14px 12px; }
figure { margin: 0; }
.dial { width: 200px; height: 200px; border-radius: 50%; background: radial-gradient(circle at 50% 45%, #1a2433, #0a0e15 78%); box-shadow: inset 0 0 0 1px #2a3a52; }
.dial svg { width: 200px; height: 200px; }
figcaption { display: flex; flex-direction: column; align-items: center; margin-top: 4px; }
figcaption b { color: #d6e2f3; font-weight: 600; }
figcaption span { color: #6f8197; font-size: 10px; }
</style></head><body><div id="alius-shell"><div id="sheet"></div></div><script src="bundle.js"></script></body></html>`;
writeFileSync(resolve(out, 'sheet.html'), html);
console.log(`sheet.html: ${resolve(out, 'sheet.html')}`);

try {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1840, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('file://' + resolve(out, 'sheet.html'));
  await page.waitForSelector('body[data-ready="true"]');
  await page.screenshot({ path: resolve(out, 'sheet.png'), fullPage: true });
  await browser.close();
  console.log(`sheet.png:  ${resolve(out, 'sheet.png')}`);
} catch (e) {
  console.log(`sheet.png not written (${e instanceof Error ? e.message.split('\n')[0] : e}); open sheet.html in a browser`);
}
