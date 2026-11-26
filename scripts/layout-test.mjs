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
const FIXTURES = ['one', 'two', 'three', 'four', 'curtain', 'long', 'physics', 'chips', 'chipsmany', 'dialname', 'dialwide', 'call', 'callhold', 'slap', 'slaphold', 'breath', 'breathhold', 'weight', 'weighthold', 'scenthold', 'jawhold', 'activityhold', 'thronehold', 'servicehold', 'shoehold', 'gulphold'];
const failures = [];
/** The fixtures with an instrument, her call or her slap drawn at the measure (Task 31). */
const INSTRUMENT_FIXTURES = new Set(['call', 'callhold', 'slap', 'slaphold', 'breath', 'breathhold', 'weight', 'weighthold', 'scenthold', 'jawhold', 'activityhold', 'thronehold', 'servicehold', 'shoehold', 'gulphold']);
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
    instrument: q('.alius-stage-dial')?.dataset.instrument ?? null,
    // her lines on the frame and the instrument's own controls (kit `say`, the moment layer's buttons); a line still fading in may sit off its place
    instrumentUi: [...document.querySelectorAll('.alius-her-lines .her-line, .alius-layer-moment button')].map((el) => ({ sel: el.className || el.tagName, ...r(el) })).filter((b) => b.w > 0 && b.h > 0),
    ui: [...document.querySelectorAll(UI)].map((el) => ({ sel: el.className || el.tagName, ...r(el) })).filter((b) => b.w > 0 && b.h > 0),
  };
}

const browser = await chromium().launch({ args: ['--no-sandbox'] });
for (const size of SIZES) {
  for (const fixture of FIXTURES) {
    const { page: p, errors } = await openLayout(browser, port, fixture, size, fixture.startsWith('slap') ? '&deferSlap=1' : ''); // the slap starts after the scene is measured
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
    // P10e-e Task 12: her slap draws under the scene's UI: mid-slap the stop word's pill (slaphold) and the input stay on top and clickable,
    // and once the camera is home the scene's layers are as they were
    if (fixture === 'slap' || fixture === 'slaphold') {
      const before = await p.evaluate(() => [...document.querySelectorAll('.alius-layer-backdrop, .alius-layer-sprites')].map((el) => el.getAttribute('style') ?? ''));
      await p.evaluate(() => window.__slapNow());
      await p.waitForTimeout(600);
      const mid = await p.evaluate((wantPill) => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects .alius-slap')) out.push('no slap drawn');
        if (document.querySelector('.alius-layer-moment .alius-slap, .alius-layer-ui .alius-slap')) out.push('the slap is drawn over the UI');
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input-line'));
        if (input !== 'ok') out.push(`the input line mid-slap: ${input}`);
        if (wantPill) { const pill = top(document.querySelector('[data-stop-word]')); if (pill !== 'ok') out.push(`the stop word mid-slap: ${pill}`); }
        if (!(document.querySelector('.alius-layer-backdrop')?.getAttribute('style') ?? '').includes('blur')) out.push('the camera did not take the backdrop');
        return out;
      }, fixture === 'slaphold');
      for (const f of mid) fail(size, fixture, f);
      await p.waitForTimeout(3600);
      const after = await p.evaluate(() => [...document.querySelectorAll('.alius-layer-backdrop, .alius-layer-sprites')].map((el) => el.getAttribute('style') ?? ''));
      if (JSON.stringify(after) !== JSON.stringify(before)) fail(size, fixture, `the camera did not put the layers back: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    }
    // P10e-e Task 14: the breath instrument draws under the scene's UI; mid-breath (Space held) the stop word's pill and the input stay on top
    // and clickable, and the pill ends the hold at once: the instrument is gone, the input and its line are as they were
    if (fixture === 'breathhold') {
      await p.waitForTimeout(2200); // the entry (1.8 s): the dark is down
      await p.mouse.move(size[0] * 0.5, size[1] * 0.3);
      await p.keyboard.down(' ');
      await p.waitForTimeout(300);
      const mid = await p.evaluate(() => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects > .alius-breath')) out.push('no breath drawn');
        if (document.querySelector('.alius-layer-moment .alius-breath, .alius-layer-ui .alius-breath')) out.push('the breath is drawn over the UI');
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input mid-breath: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word mid-breath: ${pill}`);
        for (const l of document.querySelectorAll('.alius-breath-hand .her-line')) {
          const r = l.getBoundingClientRect();
          if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) out.push(`her line "${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        const b = document.querySelector('.alius-input-line')?.getBoundingClientRect();
        if (!b || b.right > innerWidth || b.left < 0 || b.bottom > innerHeight) out.push(`the narrowed input line leaves the viewport: ${JSON.stringify(b)}`);
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      await p.keyboard.up(' ');
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-breath')) out.push('the stop word did not end the hold: the breath is still drawn');
        if (document.querySelector('.alius-breath-mirror') || document.querySelector('.alius-input[data-breath-letters]')) out.push('the input still carries the letters');
        const l = document.querySelector('.alius-input-line')?.getAttribute('style') ?? '';
        if (/width|border-color/.test(l)) out.push(`the input line was not put back: ${JSON.stringify(l)}`);
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 16: the weight instrument draws under the scene's UI; mid-weight (Space held, the level shown) the stop word's pill and the
    // input stay on top and clickable, her lines and the level stay in the frame, and the pill ends the hold at once: the instrument is gone,
    // the input and the reply are as they were
    if (fixture === 'weighthold') {
      await p.waitForTimeout(2000); // the entry (1.6 s): her view is in
      await p.mouse.move(size[0] * 0.5, size[1] * 0.3);
      await p.keyboard.down(' ');
      await p.waitForTimeout(1200);
      const mid = await p.evaluate(() => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects > .alius-weight')) out.push('no weight drawn');
        if (document.querySelector('.alius-layer-moment .alius-weight, .alius-layer-ui .alius-weight')) out.push('the weight is drawn over the UI');
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input mid-weight: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word mid-weight: ${pill}`);
        for (const l of document.querySelectorAll('.alius-weight-hand .her-line')) {
          const r = l.getBoundingClientRect();
          if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) out.push(`her line "${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        const v = document.querySelector('.alius-weight-vial')?.getBoundingClientRect();
        if (!v || v.left < 0 || v.right > innerWidth || v.top < 0 || v.bottom > innerHeight) out.push(`the level leaves the frame: ${JSON.stringify(v)}`);
        const line = document.querySelector('.alius-input-line')?.getBoundingClientRect();
        if (v && line && v.bottom > line.top) out.push(`the level covers the input line: ${JSON.stringify(v)} / ${JSON.stringify(line)}`);
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      await p.keyboard.up(' ');
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-weight')) out.push('the stop word did not end the hold: the weight is still drawn');
        if (document.querySelector('.alius-weight-mirror') || document.querySelector('.alius-input[data-weight-letters]')) out.push('the input still carries the letters');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 18: the scent instrument draws under the scene's UI; mid-breath (Space held) with her question's pills up, the stop word's
    // pill and the input stay on top and clickable, her lines and the pills stay in the frame, and the pill ends the hold at once: the
    // instrument is gone, the input, the reply and the frame's cursor are as they were
    if (fixture === 'scenthold') {
      await p.waitForTimeout(2000); // the entry (1.6 s): the dark is down
      await p.evaluate(() => { const s = window.__scent; for (const w of ['salt', 'her toes', 'heavy']) s.addWord(w, 'scent'); s.ask(); });
      await p.mouse.move(size[0] * 0.5, size[1] * 0.3);
      await p.keyboard.down(' ');
      await p.waitForTimeout(400);
      const mid = await p.evaluate(() => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects > .alius-scent')) out.push('no scent drawn');
        if (document.querySelector('.alius-layer-moment .alius-scent, .alius-layer-ui .alius-scent')) out.push('the scent is drawn over the UI');
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input mid-breath: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word mid-breath: ${pill}`);
        for (const l of document.querySelectorAll('.alius-scent-hand .her-line, .alius-scent .pw.pick')) {
          const r = l.getBoundingClientRect();
          if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) out.push(`"${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        if (document.querySelectorAll('.alius-scent .pw.pick').length === 0) out.push('her question shows no pills');
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      await p.keyboard.up(' ');
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-scent')) out.push('the stop word did not end the hold: the scent is still drawn');
        if (document.querySelector('.alius-scent-mirror') || document.querySelector('.alius-input[data-scent-letters]')) out.push('the input still carries the letters');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        const frame = document.querySelector('.alius-layer-frame')?.getAttribute('style') ?? '';
        if (/cursor/.test(frame)) out.push(`the frame's cursor was not put back: ${JSON.stringify(frame)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 24: her frame draws under the scene's UI (the controls between phases and GET UP in the moment layer); in the play and at
    // the forgotten end the stop word's pill and the input stay on top and clickable, the lines stay in the frame; the pill ends the hold at
    // once: the instrument is gone, the reply and the sprites as they were
    if (fixture === 'activityhold' || fixture === 'thronehold') {
      await p.waitForTimeout(2600); // the entry (2.2 s)
      await p.evaluate((f) => { const a = window.__activity; a.sense('She lays another sheet on the pile.', 'her'); a.say('who signs these.', 'self'); if (f === 'thronehold') window.__throne.throneCup(); else a.spawnUrge('itch'); }, fixture);
      await p.mouse.move(size[0] * 0.5, size[1] * 0.45);
      await p.waitForTimeout(300);
      const check = (when) => p.evaluate((w) => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects > .alius-activity')) out.push(`${w}: no frame drawn`);
        if (document.querySelector('.alius-layer-ui .alius-activity')) out.push(`${w}: the frame is drawn over the UI`);
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`${w}: the input: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`${w}: the stop word: ${pill}`);
        for (const l of document.querySelectorAll('.alius-activity .sense, .alius-activity .her-line')) {
          const r = l.getBoundingClientRect();
          if (r.width && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) out.push(`${w}: "${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        return out;
      }, when);
      for (const f of await check('playing')) fail(size, fixture, f);
      await p.evaluate(() => { const a = window.__activity; a.G.step = 'use'; a.finish('done'); });
      await p.waitForTimeout(6600);
      for (const f of await check('forgotten')) fail(size, fixture, f);
      const gu = await p.evaluate(() => getComputedStyle(document.querySelector('.alius-act-getUp')).display);
      if (gu === 'none') fail(size, fixture, 'the forgotten end shows no GET UP');
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-activity') || document.querySelector('.alius-activity-ui')) out.push('the stop word did not end the hold: the frame is still drawn');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        const sprites = document.querySelector('.alius-layer-sprites')?.getAttribute('style') ?? '';
        if (/transform|opacity/.test(sprites)) out.push(`the sprites were not put back: ${JSON.stringify(sprites)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 26: foot service under her desk: her signal raises her foot and the camera closes in on her sole; the close-up is drawn in
    // her frame's layer under the scene's UI, the stop word's pill and the input stay on top and clickable over it; the pill ends the hold at
    // once: the frame and its close-up are gone, the reply and the sprites as they were
    if (fixture === 'servicehold') {
      await p.waitForFunction(() => window.__activity.G.phase === 'loop', null, { timeout: 15000 }); // the entry (2.2 s of her clock)
      await p.evaluate(() => { const sv = window.__service; sv.SV.forceMeaning = 'kiss'; sv.svSignal(); });
      await p.waitForFunction(() => window.__service.SV.closeK > 0.95, null, { timeout: 15000 }).catch(() => {}); // her foot rises (650 ms), the camera eases in
      await p.waitForTimeout(100);
      const check = (when) => p.evaluate((w) => {
        const out = [];
        const close = document.querySelector('.alius-layer-effects .alius-activity > .alius-act-close');
        if (!close) out.push(`${w}: no close-up`);
        else if (getComputedStyle(close).display === 'none') out.push(`${w}: the close-up is not shown`);
        if (document.querySelector('.alius-layer-ui .alius-act-close')) out.push(`${w}: the close-up is drawn over the UI`);
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`${w}: the input: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`${w}: the stop word: ${pill}`);
        for (const l of document.querySelectorAll('.alius-activity .sense, .alius-activity .her-line')) {
          const r = l.getBoundingClientRect();
          if (r.width && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) out.push(`${w}: "${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        const img = document.querySelector('.alius-act-soleArt');
        if (img && img.naturalWidth) { const r = img.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) out.push(`${w}: the sole has no size`); }
        return out;
      }, when);
      for (const f of await check('close-up')) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-activity') || document.querySelector('.alius-act-close')) out.push('the stop word did not end the hold: the close-up is still drawn');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        const sprites = document.querySelector('.alius-layer-sprites')?.getAttribute('style') ?? '';
        if (/transform|opacity/.test(sprites)) out.push(`the sprites were not put back: ${JSON.stringify(sprites)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 28: shoe service draws in the effects layer under the scene's UI: her footwear and its dirt on the frame, the stop word's
    // pill and the input on top and clickable, her lines and the sensory lines in the frame; the pill ends the hold at once and the instrument is gone
    // P10e-e Task 30: gulp draws in the effects layer under the scene's UI: the tide high, a sensory line and her line in the frame, the stop
    // word's pill and the input on top and clickable; the pill ends the hold at once and the instrument is gone
    if (fixture === 'gulphold') {
      await p.waitForFunction(() => window.__gulp.G.phase === 'loop', null, { timeout: 15000 });
      await p.evaluate(() => { const g = window.__gulp; g.G.fill = 0.95; g.G.tasteCd = 0; g.update(16); });
      await p.waitForTimeout(400);
      const mid = await p.evaluate(() => {
        const out = [];
        const box = document.querySelector('.alius-layer-effects > .alius-gulp');
        if (!box) out.push('no gulp drawn');
        if (document.querySelector('.alius-layer-moment .alius-gulp, .alius-layer-ui .alius-gulp')) out.push('the gulp is drawn over the UI');
        const tide = document.querySelector('.alius-gulp-tide')?.getBoundingClientRect();
        if (!tide || tide.width <= 0 || tide.height <= 0) out.push(`the tide has no size: ${JSON.stringify(tide)}`);
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word: ${pill}`);
        for (const l of document.querySelectorAll('.alius-gulp-hand .her-line, .alius-gulp-hand .sense')) {
          const r = l.getBoundingClientRect();
          if (r.width && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) out.push(`"${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        if (document.querySelectorAll('.alius-gulp-hand .sense').length === 0) out.push('the taste\'s sensory line is not shown');
        if (document.querySelectorAll('.alius-gulp-hand .her-line').length === 0) out.push('her first words are not shown');
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-gulp')) out.push('the stop word did not end the hold: the gulp is still drawn');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity|transform/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    if (fixture === 'shoehold') {
      await p.waitForFunction(() => window.__shoe.G.phase === 'loop', null, { timeout: 15000 });
      await p.evaluate(() => { const s = window.__shoe; s.G.grit = 0.8; s.G.toldGrit = false; s.update(16); });
      await p.waitForTimeout(400);
      const mid = await p.evaluate(() => {
        const out = [];
        const box = document.querySelector('.alius-layer-effects > .alius-shoe');
        if (!box) out.push('no shoe drawn');
        if (document.querySelector('.alius-layer-moment .alius-shoe, .alius-layer-ui .alius-shoe')) out.push('the shoe is drawn over the UI');
        const wrap = document.querySelector('.alius-shoe-shoeWrap');
        const wr = wrap?.getBoundingClientRect();
        if (!wr || wr.width <= 0 || wr.height <= 0) out.push(`her footwear has no size: ${JSON.stringify(wr)}`);
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word: ${pill}`);
        for (const l of document.querySelectorAll('.alius-shoe-hand .her-line, .alius-shoe-hand .sense')) {
          const r = l.getBoundingClientRect();
          if (r.width && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)) out.push(`"${l.textContent}" leaves the frame: ${JSON.stringify(r)}`);
        }
        if (document.querySelectorAll('.alius-shoe-hand .sense').length === 0) out.push('the grit\'s sensory line is not shown');
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      const after = await p.evaluate(() => {
        const out = [];
        if (document.querySelector('.alius-shoe')) out.push('the stop word did not end the hold: the shoe is still drawn');
        const reply = document.querySelector('[role="log"]')?.getAttribute('style') ?? '';
        if (/opacity|transform/.test(reply)) out.push(`the reply was not put back: ${JSON.stringify(reply)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
    }
    // P10e-e Task 20: the jaw draws under the scene's UI, its mouth the input line; wide open with her band up and a line typed through the
    // ring, the stop word's pill and the input stay on top and clickable, her lines stay in the frame, the line and its ghost frames stay in
    // the frame; the pill ends the hold at once: the instrument is gone, the line, the field and the frame's cursor are as they were
    if (fixture === 'jawhold') {
      await p.waitForTimeout(300);
      // review I1: the reply never under the mouth, resting (the ring's floor) and wide open
      const clear = (when) => p.evaluate((w) => {
        const a = document.querySelector('[role="log"]')?.getBoundingClientRect(), b = document.querySelector('.alius-input-line')?.getBoundingClientRect();
        if (!a || !b || a.height === 0) return [`${w}: no reply or line to compare`];
        return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right ? [`${w}: the reply (bottom ${a.bottom.toFixed(1)}) runs under the mouth (top ${b.top.toFixed(1)})`] : [];
      }, when);
      for (const f of await clear('resting')) fail(size, fixture, f);
      await p.evaluate(() => { const j = window.__jaw; j.aim(1.2); j.move({ order: 'wider', orderMs: 6000 }); });
      await p.mouse.move(size[0] * 0.5, size[1] * 0.9);
      await p.focus('.alius-input');
      await p.keyboard.type('please');
      await p.waitForTimeout(900);
      for (const f of await clear('wide open')) fail(size, fixture, f);
      const mid = await p.evaluate(() => {
        const out = [];
        if (!document.querySelector('.alius-layer-effects > .alius-jaw')) out.push('no jaw drawn');
        if (document.querySelector('.alius-layer-moment .alius-jaw, .alius-layer-ui .alius-jaw')) out.push('the jaw is drawn over the UI');
        const top = (el) => { if (!el) return 'missing'; const b = el.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return hit === el || el.contains(hit) ? 'ok' : `covered by ${hit?.className ?? hit?.tagName}`; };
        const input = top(document.querySelector('.alius-input'));
        if (input !== 'ok') out.push(`the input, wide open: ${input}`);
        const pill = top(document.querySelector('[data-stop-word]'));
        if (pill !== 'ok') out.push(`the stop word, wide open: ${pill}`);
        const line = document.querySelector('.alius-input-line');
        if (!line || parseFloat(line.style.height) < 120) out.push(`the mouth did not open: ${line?.getAttribute('style')}`);
        if ((document.querySelector('.alius-jaw-mirror')?.textContent ?? '') === '') out.push('the letters typed through the ring are not drawn');
        for (const l of document.querySelectorAll('.alius-jaw-hand .her-line, .alius-input-line, .alius-jaw-band')) {
          const r = l.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) out.push(`"${l.className}" leaves the frame: ${JSON.stringify(r)}`);
        }
        if ([...document.querySelectorAll('.alius-jaw-band')].every((b) => getComputedStyle(b).opacity === '0')) out.push('her band is not shown');
        return out;
      });
      for (const f of mid) fail(size, fixture, f);
      await p.click('[data-stop-word]');
      await p.waitForTimeout(200);
      const after = await p.evaluate((before) => {
        const out = [];
        if (document.querySelector('.alius-jaw')) out.push('the stop word did not end the hold: the jaw is still drawn');
        if (document.querySelector('.alius-jaw-mirror, .alius-jaw-band, .alius-jaw-clip, .alius-jaw-rest') || document.querySelector('.alius-input[data-jaw-letters]')) out.push('the mouth still carries the jaw');
        const line = document.querySelector('.alius-input-line')?.getAttribute('style') ?? '';
        if (/height|margin|transform|--ache|border-color/.test(line)) out.push(`the line was not put back: ${JSON.stringify(line)}`);
        const frame = document.querySelector('.alius-layer-frame')?.getAttribute('style') ?? '';
        if (/cursor/.test(frame)) out.push(`the frame's cursor was not put back: ${JSON.stringify(frame)}`);
        return out;
      });
      for (const f of after) fail(size, fixture, f);
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
    // P10e-e Task 31: while an instrument draws (or her call, or her slap) the dial's circle stands where it does for `standing`, and the
    // instrument's own lines and controls stay inside the viewport (the generic checks above cover the scene's UI and the head boxes)
    if (INSTRUMENT_FIXTURES.has(fixture)) {
      const still = faceOf.get(`${W}x${H}`);
      if (!m.dial || !still) fail(size, fixture, 'no dial to compare');
      else if (Math.abs(m.dial.x - still.x) > 1 || Math.abs(m.dial.y - still.y) > 1) fail(size, fixture, `the instrument moved the dial's circle: ${Math.round(m.dial.x)},${Math.round(m.dial.y)} against ${Math.round(still.x)},${Math.round(still.y)} for standing`);
      if (!fixture.startsWith('call') && !fixture.startsWith('slap') && !m.instrument) fail(size, fixture, 'no instrument is drawing (the dial carries no data-instrument)');
      for (const b of m.instrumentUi) if (!inside(b)) fail(size, fixture, `the instrument's ${b.sel} is outside the viewport: ${JSON.stringify(b)}`);
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
