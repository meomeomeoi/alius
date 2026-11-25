// P10e chunk (e), Task 2: measures each hand's size factor once and writes it into content/core/handFonts.json (`scale`).
//   node scripts/measure-hands.mjs           (writes the registry)
//   node scripts/measure-hands.mjs --check   (prints the measured values and exits 1 if the registry differs; writes nothing)
// The rule is `measureHands` of docs/prototypes/cards.html, copied: the geometric mean of Caveat's x-height of `xvzow` over the
// hand's and Caveat's width of the sample line over the hand's, clamped to 0.7–1.6; here rounded to 0.01. Each face is loaded in
// Chromium from its woff2 under fonts/ (inlined as a data URL: a file URL cannot load fonts), nothing from the network.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const check = process.argv.includes('--check');

const registryFile = resolve(root, 'content/core/handFonts.json');
const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
const kebab = (family) => family.toLowerCase().replace(/ /g, '-');
const faces = registry.map(({ family }) => {
  const b64 = readFileSync(resolve(root, `fonts/hand-${kebab(family)}-400.woff2`)).toString('base64');
  return `@font-face { font-family: "${family}"; src: url("data:font/woff2;base64,${b64}") format("woff2"); }`;
}).join('\n');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>${faces}</style><body></body>`);
  const HS = await page.evaluate(async (HANDS) => {
    await Promise.all(HANDS.map((f) => document.fonts.load(`100px "${f}"`, 'Bring me the patrol roster before evening mess.')));
    const missing = HANDS.filter((f) => !document.fonts.check(`100px "${f}"`));
    if (missing.length > 0) throw new Error(`faces not loaded: ${missing.join(', ')}`);
    const HS = {};
    // measureHands (docs/prototypes/cards.html), as it is:
    function measureHands() {
      const c = document.createElement('canvas').getContext('2d');
      // the x-height and the width of a line, each against Caveat's; their geometric mean (a narrow hand with tall letters is neither shrunk nor blown up)
      const SAMPLE = 'Bring me the patrol roster before evening mess.';
      const xh = (f) => { c.font = `100px "${f}"`; return c.measureText('xvzow').actualBoundingBoxAscent; };
      const wd = (f) => { c.font = `100px "${f}"`; return c.measureText(SAMPLE).width; };
      const rx = xh('Caveat'), rw = wd('Caveat');
      for (const f of HANDS) HS[f] = Math.max(0.7, Math.min(1.6, Math.sqrt((rx / Math.max(1, xh(f))) * (rw / Math.max(1, wd(f))))));
    }
    measureHands();
    return HS;
  }, registry.map((e) => e.family));

  let differs = 0;
  const out = registry.map((e) => {
    const scale = Math.round(HS[e.family] * 100) / 100;
    if (scale !== e.scale) differs++;
    console.log(`${e.family.padEnd(26)} ${scale.toFixed(2)}${scale !== e.scale ? `  (was ${e.scale})` : ''}`);
    // the key order of an entry: id, name, family, scale, description
    const { id, name, family, description, scale: _old, ...rest } = e;
    return { id, name, family, scale, description, ...rest };
  });
  if (check) {
    if (differs > 0) { console.error(`${differs} scale(s) differ from the registry`); process.exitCode = 1; }
  } else {
    writeFileSync(registryFile, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`wrote ${registryFile} (${differs} changed)`);
  }
} finally {
  await browser.close();
}
