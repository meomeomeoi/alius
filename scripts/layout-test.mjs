// P10e: the scene stage's layout test, in a real browser (not part of `npm test`: it needs Chromium).
//   npm run test:layout
// Playwright is not a dependency of the package: it comes from the environment (NODE_PATH or a global install, e.g. /opt/node-tools) and so does
// its Chromium; nothing is declared in package.json for it.
// The page and its server are scripts/layout-page.mjs (shared with `npm run shots`); Chromium measures the scene at 1920x1080, 1280x800
// and 2560x1440. Exits non-zero with the list of failures.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildLayoutPage, chromium, openLayout, serveRoot } from './layout-page.mjs';

await buildLayoutPage();
const server = await serveRoot();
const port = server.port;

const SIZES = [[1920, 1080], [1280, 800], [2560, 1440]];
const FIXTURES = ['one', 'two', 'three', 'four', 'curtain', 'long', 'physics', 'chips', 'chipsmany', 'dialname', 'dialwide', 'call', 'callhold'];
const failures = [];
const faceOf = new Map(); // the dial's circle for `standing` (fixture `one`), per size
const fail = (size, fixture, what) => failures.push(`${size[0]}x${size[1]} ${fixture}: ${what}`);
const SHOTS = process.env.LAYOUT_SHOTS ? resolve(process.env.LAYOUT_SHOTS) : null;

/** Every box of the UI a head must stay clear of (the dock is measured as the box that clips its cards, not as each card). */
const UI = '.alius-topline-left, .alius-scene-tools, .alius-reply, .alius-chip-row, .alius-input-line, .alius-stage-dock, .alius-dock-waiting, .alius-dial, .alius-dial-label, .alius-stop-pill, .alius-stage-status > *, .alius-flash';

/**
 * Runs in the page: the pan that puts each sprite in the middle of the view (found by measuring the sprite at pan 0 and at pan 1, not from the code's
 * own formula), then her box and the UI at that pan (A2). The easing is off while it measures.
 */
function perWoman(ui) {
  const root = document.querySelector('.alius-scene');
  root.classList.add('alius-look-still');
  const imgs = () => [...document.querySelectorAll('.alius-sprite-img')];
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const at = (pan) => { root.style.setProperty('--alius-pan', String(pan)); void root.offsetWidth; return imgs().map((e) => { const b = e.getBoundingClientRect(); return (b.left + b.right) / 2; }); };
  const c0 = at(0);
  const c1 = at(1);
  const W = innerWidth;
  return c0.map((x0, k) => {
    const pan = Math.abs(x0 - c1[k]) < 0.5 ? 0.5 : Math.min(1, Math.max(0, (x0 - W / 2) / (x0 - c1[k])));
    at(pan);
    return { k, pan, sprite: box(imgs()[k]), ui: [...document.querySelectorAll(ui)].map((el) => ({ sel: el.className || el.tagName, ...box(el) })).filter((b) => b.w > 0 && b.h > 0) };
  });
}

/** Runs in the page: every measurement the assertions need. */
function measure(UI) {
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
  return {
    vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
    backdrop: r(q('.alius-layer-backdrop')), backdropShown: getComputedStyle(q('.alius-layer-backdrop')).display !== 'none', image: q('.alius-scene')?.dataset.backdrop,
    sprites: imgs, reply: r(q('.alius-reply')), replyOverflow: q('.alius-reply')?.dataset.overflow, input: r(q('.alius-input-line')), dial: r(q('.alius-dial-face')),
    dialName: q('.alius-dial-name')?.textContent ?? null, dialSub: q('.alius-dial-sub')?.textContent ?? null, dialLabel: r(q('.alius-dial-label')),
    dock: r(q('.alius-dock-card')), curtain: r(q('.alius-curtain')), curtainOpen: q('.alius-curtain')?.dataset.open, stop: r(q('[data-stop-word]')),
    stopVisible: q('[data-stop-word]') ? getComputedStyle(q('[data-stop-word]')).visibility !== 'hidden' : false,
    chipRow: chipRowMeasure(),
    callWord: r(q('.alius-call-w')), callCards: [...document.querySelectorAll('.alius-call-card')].map(r),
    ui: [...document.querySelectorAll(UI)].map((el) => ({ sel: el.className || el.tagName, ...r(el) })).filter((b) => b.w > 0 && b.h > 0),
  };
}

const browser = await chromium().launch({ args: ['--no-sandbox'] });
for (const size of SIZES) {
  for (const fixture of FIXTURES) {
    const { page: p, errors } = await openLayout(browser, port, fixture, size);
    const m = await p.evaluate(measure, UI);
    // review I1: the stop word stays clickable over her call's fan (P15a: the stop word always ends a hold)
    if (fixture === 'callhold') {
      const pill = await p.evaluate(() => {
        const el = document.querySelector('[data-stop-word]');
        if (!el) return 'missing';
        if (!document.querySelector('.alius-call-card')) return 'no call drawn';
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`;
      });
      if (pill !== 'ok') fail(size, fixture, `the stop word during her call: ${pill}`);
    }
    // the stop word stays on top and clickable with the dial's menu open (the safety control is never covered)
    if (fixture === 'physics') {
      const pill = await p.evaluate(() => {
        const f = document.querySelector('details.alius-dial-fan');
        if (f) f.open = true;
        const el = document.querySelector('[data-stop-word]');
        if (!el) return 'missing';
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        const ok = hit === el || el.contains(hit);
        if (f) f.open = false;
        return ok ? 'ok' : 'covered';
      });
      if (pill !== 'ok') fail(size, fixture, `the stop word with the dial's menu open: ${pill}`);
    }
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, `${fixture}-${size[0]}x${size[1]}.png`) }); }
    // A2: each woman at the pan that centres her (several women only); a screenshot of each when asked
    const per = ['two', 'three', 'four'].includes(fixture) ? await p.evaluate(perWoman, UI) : [];
    if (SHOTS && per.length > 0) {
      for (const w of per) {
        await p.evaluate((pan) => { document.querySelector('.alius-scene').style.setProperty('--alius-pan', String(pan)); }, w.pan);
        await p.screenshot({ path: join(SHOTS, `${fixture}-${size[0]}x${size[1]}-woman${w.k + 1}.png`) });
      }
    }
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
    // knee-length sprites never hang in the air: every drawn sprite reaches past the bottom edge (the cut at the knees is off screen)
    for (const [k, sp] of m.sprites.entries()) if (sp.y + sp.h < H - 1) fail(size, fixture, `sprite ${k + 1} ends at ${Math.round(sp.y + sp.h)} px, above the bottom edge (${H}): it hangs in the air`);
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
    // A2: at the pan that centres her, each woman's head box is inside the viewport and nothing of the UI overlaps it
    for (const w of per) {
      const head = { x: w.sprite.x, y: Math.max(0, w.sprite.y), r: w.sprite.r, b: w.sprite.y + w.sprite.h * 0.22 };
      if (head.x < -1 || head.r > W + 1 || head.y < -1) fail(size, fixture, `woman ${w.k + 1}: her head box is outside the viewport at pan ${w.pan.toFixed(2)} (${JSON.stringify(head)})`);
      for (const b of w.ui) if (hit(b, head)) fail(size, fixture, `woman ${w.k + 1} at pan ${w.pan.toFixed(2)}: ${b.sel} overlaps her head box (${JSON.stringify(b)})`);
    }
    if (fixture === 'two') {
      if (m.sprites.length !== 2) fail(size, fixture, `${m.sprites.length} sprites, not 2`);
      for (const hd of heads) if (hd.x < -1 || hd.r > W + 1) fail(size, fixture, `at the default view a head is not on screen (${JSON.stringify(hd)})`);
    }
    if (fixture === 'four') {
      if (m.sprites.length !== 4) fail(size, fixture, `${m.sprites.length} sprites, not 4`);
      if (!m.dock) fail(size, fixture, 'no card in the dock');
      if (m.sprites.every((sp) => sp.x >= -1 && sp.r <= W + 1)) fail(size, fixture, 'every one of four women is on screen at the default view: some should be past its edges');
    }
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
    // P10e-e: the dial's circle never moves: a 30-character name of hers wraps under it, and the circle stands where it does for `standing`
    if (fixture === 'one') faceOf.set(`${W}x${H}`, m.dial);
    if (fixture === 'dialname' && (m.dialName !== 'LOW' || m.dialSub !== 'BOWING')) fail(size, fixture, `the label reads "${m.dialName}" / "${m.dialSub}", not LOW over BOWING`);
    if (fixture === 'dialwide') {
      const still = faceOf.get(`${W}x${H}`);
      if (!m.dial || !still) fail(size, fixture, 'no dial to compare');
      else if (Math.abs(m.dial.x - still.x) > 1 || Math.abs(m.dial.y - still.y) > 1) fail(size, fixture, `a long label moved the circle: ${Math.round(m.dial.x)},${Math.round(m.dial.y)} against ${Math.round(still.x)},${Math.round(still.y)} for standing`);
      if (m.dialLabel && m.dialLabel.h < 50) fail(size, fixture, `a 30-character name over BOWING and EYES DOWN is ${Math.round(m.dialLabel.w)}x${Math.round(m.dialLabel.h)}: it did not wrap into four lines`);
      if (m.dialLabel && (m.dialLabel.b > H - 2 || m.dialLabel.r > W - 2)) fail(size, fixture, `the tallest label reaches the viewport's edge: ${JSON.stringify(m.dialLabel)}`);
    }
    // P10e-e Task 9: her word and the fan stay inside the viewport and off her face
    if (fixture === 'call' || fixture === 'callhold') {
      if (!m.callWord || m.callCards.length !== 4) fail(size, fixture, `the call is not drawn (word ${JSON.stringify(m.callWord)}, ${m.callCards.length} cards)`);
      for (const b of [m.callWord, ...m.callCards].filter(Boolean)) {
        if (!inside(b)) fail(size, fixture, `a part of the call is outside the viewport: ${JSON.stringify(b)}`);
        // her face: the middle third of the head box (cards.html puts her word at 74 vw, "beside her, never on her face": the prototype's own
        // sprite box reaches past it at 1280x800, so the whole head box is not the measure)
        for (const hd of heads) { const third = (hd.r - hd.x) / 3; const face = { ...hd, x: hd.x + third, r: hd.r - third }; if (hit(b, face)) fail(size, fixture, `a part of the call overlaps her face: ${JSON.stringify(b)} face ${JSON.stringify(face)}`); }
      }
    }
    if (['physics', 'three', 'four'].includes(fixture) && m.stop) {
      // A1: a small pill in the bottom-right corner, over the dial, clear of the dial, the reply, the chips and the input
      if (m.stop.r < W * 0.8 || m.stop.y < H * 0.5) fail(size, fixture, `the stop word is not in the bottom-right corner: ${JSON.stringify(m.stop)}`);
      if (m.stop.h > 44 || m.stop.w > 220) fail(size, fixture, `the stop word is not a small pill: ${Math.round(m.stop.w)}x${Math.round(m.stop.h)}`);
      for (const [name, b] of [['the dial', m.dial], ['the reply', m.reply], ['the input', m.input]]) if (b && hit(m.stop, b)) fail(size, fixture, `the stop word overlaps ${name}`);
    }
    if (fixture === 'physics' || fixture === 'three' || fixture === 'four') {
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
