// P10e chunk (e): the named moments of each instrument for the side-by-side shots (`npm run shots -- <name>`, scripts/instrument-shots.mjs).
// Each instrument task adds its entry: the moments its brief names, how to drive the prototype there and how to drive the port there.
//
// An entry:
//   state    the layout fixture the port is drawn from (tests/layout/mkstate.ts; `--state <fixture>` overrides it for every moment)
//   size     [width, height] (default 1920x1080)
//   clip     optional { x, y, width, height } (negative x / y count from the right / bottom edge): both shots are cropped to it
//   hide     selectors of the prototype hidden in its shots (its panel, its log: prototype only)
//   rasterSprite  true: without `--sprite`, the prototype gets the layout fixture's sprite drawn as a PNG at run time (an SVG with only a viewBox
//            has no natural size for a prototype that sizes its <img> by layout)
//   moments  [{ id, state?, query?, clip?, size?, proto(page, ctx), port(page, ctx) }]
//            `proto` runs in the built prototype page (.superpowers/prototypes/<name>.html): drive it through its hooks (`window.__S`, `window.__G()`,
//            `window.__forceO`, `window.__begin()`, …), its globals (a top-level `let` / `function` of its script is reachable from
//            `page.evaluate`), its panel's buttons or the mouse and keys. `port` runs in the layout page (`/page.html?fixture=<state><query>`):
//            drive it through the DOM, the mouse and keys. Both end at the moment to shoot; the script waits `settle` ms (default 400) after each.
//            ctx: { size, wait(ms) }; `port` also gets `ctx.proto` (the prototype's page), to act on both at the same moment.
// Shots are deviceScaleFactor 1 (for looking at, not for print).

/** cards.html: the dial's label (Task 6). The circle stays put, the label hangs under it; her name over the base name. */
const dialCorner = { x: -560, y: -440, width: 560, height: 440 };

export const MOMENTS = {
  slap: slapMoments(),
  breath: breathMoments(),
  cards: {
    state: 'one',
    clip: dialCorner,
    hide: ['#panel', '#log'],
    moments: [
      {
        id: 'dial-base', // the base name alone (no name of hers): standing
        state: 'one',
        proto: (p) => setPose(p, 'standing', null),
        port: async () => {},
      },
      {
        id: 'dial-named', // her name over the base name: Low / bowing (the EYES line under them in the port)
        state: 'dialname',
        proto: (p) => setPose(p, 'bowing', null),
        port: async () => {},
      },
      {
        id: 'dial-wide', // a name of 30 characters wraps under the circle; the circle has not moved
        state: 'dialwide',
        proto: (p) => setPose(p, 'bowing', 'All the way down, where I want'),
        port: async () => {},
      },
      ...cardMoments([1920, 1080], ''),
      ...cardMoments([1280, 800], '-1280'),
    ],
  },
};

/**
 * cards.html: her hand of cards and the posture call (Tasks 7–10). The port's dock is drawn from the `three` fixture (a moment, a punishment, a
 * task and her step; the prototype deals a milestone, a punishment, a claim and a task), the call from `call` (Ann, ritual, calls Low among
 * Attention, Rest, Low and Pup: the prototype's own names, its style set to ritual and its random pick made Low).
 */
function cardMoments(size, suffix) {
  const dock = { x: 0, y: Math.round(size[1] * 0.3) - 40, width: 520, height: Math.round(size[1] * 0.46) + 80 };
  const frame = { x: 0, y: 0, width: size[0], height: size[1] };
  const openProto = (kind) => (p) => p.evaluate((k) => { const el = [...document.querySelectorAll('#dock .card.collapsed')].find((c) => c.querySelector('.kind')?.textContent === k); el?.click(); }, kind);
  const openPort = (kind) => (p) => p.evaluate((k) => { const el = [...document.querySelectorAll('.alius-dock-card[data-collapsed="true"]')].find((c) => c.querySelector('.alius-scard-kind')?.textContent === k); el?.querySelector('.alius-scard-head')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, kind);
  const call = async (p) => {
    await p.evaluate(() => { window.__S.style = 'ritual'; const r = Math.random; Math.random = () => 0.5; window.__call(); Math.random = r; });
  };
  return [
    { id: `stack${suffix}`, state: 'three', size, clip: dock, proto: openProto('punishment'), port: openPort('punishment') },
    { id: `task${suffix}`, state: 'three', size, clip: dock, proto: openProto('task'), port: openPort('task') },
    // the port's call is held back (`&deferCall=1`) and started with the prototype's: the prototype is driven first, then the port, so the port's
    // own waits time both (they are a few ms apart at the shot)
    { id: `call-mid${suffix}`, state: 'call', query: '&deferCall=1', size, clip: frame, proto: call, port: async (p, c) => { await p.evaluate(() => window.__callNow()); await c.wait(900); } },
    {
      id: `call-right${suffix}`, state: 'call', query: '&deferCall=1', size, clip: frame,
      // the layout page's `stage` does not apply the answer (a static state), so the port's dial does not take the posture here (tests/ui/practice/postureCall.test.ts pins it)
      proto: call,
      port: async (p, c) => { await p.evaluate(() => window.__callNow()); await c.wait(900); await c.proto.click('.pc[data-base="bowing"]'); await p.click('.alius-call-card[data-posture-choice="bowing"]'); await c.wait(700); },
    },
    {
      id: `call-slow${suffix}`, state: 'call', query: '&deferCall=1', size, clip: frame,
      proto: call,
      port: async (p, c) => { await p.evaluate(() => window.__callNow()); await c.wait(4100); },
    },
  ];
}

/** Sets the prototype's dial to `id` (her name for it `name`, or as the prototype has it when null) and redraws it. */
function setPose(page, id, name) {
  return page.evaluate(([id_, name_]) => {
    /* global NAMED, drawDial: top-level bindings of the prototype's classic script */
    if (name_ !== null) {
      const n = NAMED.find((x) => x[0] === id_);
      if (n) n[1] = name_;
      else NAMED.push([id_, name_]);
    }
    // the prototype's top-level `let pose` (a global binding of its classic script, reachable from here)
    // eslint-disable-next-line no-undef
    window.eval(`pose = ${JSON.stringify(id_)}`);
    drawDial();
  }, [id, name]);
}

/**
 * slap.html: the slap (Task 12). The port is the `slap` fixture (Ann, possessive: a 450 ms swing; her slap `ps1`, whose hashed side is her left
 * hand, from the screen's right), held back until `window.__slapNow()`; the prototype is set to the same (`possessive`, `side: right`). Both pages
 * run on Playwright's fake clock, paused: each slap starts at the same paused instant and the clock is run to the moment on both, so the
 * shots are of the same millisecond (CSS transitions, the flash's fade and her line's write-on, run in real time during the short settle).
 * Moments: her hand raised, a feint, the impact (taken), braced (Space 100 ms before), the turned face (a flick sideways), the cheek after.
 * The prototype sizes its `<img>` by its layout box, which for the fixture's viewBox-only SVG is not its natural size (the sprite would land off
 * screen): `rasterSprite` has the script draw the fixture as a PNG for it at run time; the port draws the fixture SVG.
 */
function slapMoments() {
  const IMPACT = 900 + 450; // leadMs + possessive's swing
  const FEINT = 450;
  const start = (feints) => ({
    proto: async (p) => {
      await p.click('#go');
      await p.waitForTimeout(150);
      await p.evaluate((f) => { Object.assign(window.__S, { style: 'possessive', side: 'right', feints: String(f), unann: false, onSend: false, random: false }); }, feints);
      await p.clock.install({ time: 0 });
      await p.clock.pauseAt(1000);
      await p.evaluate(() => window.__slap());
      await p.waitForTimeout(150);
    },
    port: async (p) => {
      await p.clock.install({ time: 0 });
      await p.clock.pauseAt(1000);
      await p.evaluate(() => window.__slapNow());
      await p.waitForTimeout(150);
    },
  });
  const flick = async (p, size) => {
    const y = Math.round(size[1] * 0.5);
    let x = Math.round(size[0] * 0.3);
    await p.mouse.move(x, y);
    for (let i = 0; i < 6; i++) { await p.clock.runFor(16); x += 80; await p.mouse.move(x, y); }
  };
  const moment = (id, feints, drive) => {
    const s = start(feints);
    return {
      id, query: `&deferSlap=1${feints ? `&feints=${feints}` : ''}`,
      proto: async (p, c) => { await s.proto(p); await drive(p, c); },
      port: async (p, c) => { await s.port(p); await drive(p, c); },
    };
  };
  return {
    state: 'slap',
    rasterSprite: true, // the prototype sizes its <img> by layout: the fixture's SVG is drawn as a PNG at run time (scripts/instrument-shots.mjs)
    hide: ['#panel', '#debug', '#summary'],
    settle: 60,
    moments: [
      moment('raised', 0, (p) => p.clock.runFor(600)),
      moment('feint', 1, (p) => p.clock.runFor(900 + Math.round(FEINT * 0.3))),
      moment('impact-none', 0, (p) => p.clock.runFor(IMPACT + 60)),
      moment('braced', 0, async (p) => { await p.clock.runFor(IMPACT - 100); await p.keyboard.press(' '); await p.clock.runFor(160); }),
      moment('turned', 0, async (p, c) => { await p.clock.runFor(1000); await flick(p, c.size); await p.clock.runFor(IMPACT + 60 - 1000 - 96); }),
      moment('cheek-after', 0, (p) => p.clock.runFor(IMPACT + 1500 + 650 + 800)),
      { ...moment('impact-none-1280', 0, (p) => p.clock.runFor(IMPACT + 60)), size: [1280, 800] },
      { ...moment('raised-1280', 0, (p) => p.clock.runFor(600)), size: [1280, 800] },
      { ...moment('turned-1280', 0, async (p, c) => { await p.clock.runFor(1000); await flick(p, c.size); await p.clock.runFor(IMPACT + 60 - 1000 - 96); }), size: [1280, 800] },
    ],
  };
}

/**
 * breath.html: breathing (Task 14). The port is the `breath` fixture (Ann sits on the commander's face: `under_her_seat`, her silhouette
 * from below, the commander's quarters, the ceiling `room_1`), its plan's openings cleared (`&quiet=1`) and her style from `&style=`; the
 * prototype is set to the same (`kind: 'seat'`, her style). Both pages run on Playwright's fake clock, paused: each moment begins the
 * instrument at the same paused instant on both (`begin`), the clock is run to the loop, and the windows are opened by the same hooks (the
 * prototype's globals `openWindow`, `scheduleWindow`, `exit`, `blackout`, `G`; the port's `window.__breath`), so the shots are of the same
 * millisecond. The prototype's backdrop is its own stand-in (`quarters_dark`); the port's is the scene's.
 * Moments: the entry, a count (ritual: "two…"), "now." (neutral), a false window (playful), low air (the tunnel), the exit, a blackout; the
 * entry, "now." and low air again at 1280x800.
 */
async function fakeClock(p, ready) {
  await p.clock.install({ time: 0 });
  await p.reload();
  await p.evaluate(ready);
  await p.waitForTimeout(1500); // the page's own start (the backdrop, the sprite) in real time, the fake clock flowing with it
  const now = await p.evaluate(() => Date.now());
  await p.clock.pauseAt(now + 200);
}
function breathMoments() {
  const LOOP = 1900; // the entry is 1800 ms: the loop has begun
  const start = (style) => ({
    // the clock is installed and the page loaded again, so every frame and timer is the fake clock's from the start (a frame the real clock
    // had queued would put the frame clock's `last` in the real clock's time); then it is paused a little ahead and both begin there
    proto: async (p) => {
      await fakeClock(p, () => document.fonts.ready);
      await p.addStyleTag({ content: '#panel, #debug, #summary, #start { visibility: hidden !important; }' }); // the reload dropped the script's own
      await p.evaluate((st) => { Object.assign(window.__S, { style: st, kind: 'seat', sound: false, reduced: false, cue: 'style' }); }, style);
      await p.evaluate(() => { document.querySelector('#start').style.display = 'none'; begin(); });
    },
    port: async (p) => {
      await fakeClock(p, async () => { while (document.body.dataset.ready !== 'true') await new Promise((r) => setTimeout(r, 50)); });
      await p.evaluate(() => { window.__breath.begin(); });
    },
  });
  /** On both: the prototype's own window of the loop is cancelled (the port's plan has none: `&quiet=1`), then `drive` runs on each. */
  const moment = (id, style, before, proto, port, after, size) => {
    const s = start(style);
    return {
      id, query: `&quiet=1&style=${style}`, ...(size ? { size } : {}),
      proto: async (p) => { await s.proto(p); await p.clock.runFor(before); await p.evaluate(proto); await p.clock.runFor(after); },
      port: async (p) => { await s.port(p); await p.clock.runFor(before); await p.evaluate(port); await p.clock.runFor(after); },
    };
  };
  const none = () => {};
  return {
    state: 'breath',
    rasterSprite: true, // the prototype sizes its <img> by layout: the fixture's SVG is drawn as a PNG at run time (scripts/instrument-shots.mjs)
    hide: ['#panel', '#debug', '#summary', '#start'],
    settle: 60,
    moments: [
      moment('entry', 'neutral', 900, none, none, 0),
      moment('count-ritual', 'ritual', LOOP, () => { cancelWindows(); scheduleWindow(G.clock + 1900); }, () => { const b = window.__breath; b.lines(); b.scheduleWindow(b.G.clock + 1900, { widthMs: 500 }); }, 800),
      moment('now-neutral', 'neutral', LOOP, () => { cancelWindows(); openWindow(false); }, () => window.__breath.open(false), 400),
      moment('false-playful', 'playful', LOOP, () => { cancelWindows(); openWindow(true); }, () => window.__breath.open(true), 250),
      moment('low-air', 'neutral', LOOP, () => { cancelWindows(); G.air = 18; }, () => { window.__breath.lines(); window.__breath.G.air = 18; }, 900),
      moment('exit', 'neutral', LOOP, () => { cancelWindows(); exit('released'); }, () => { window.__breath.lines(); window.__breath.exit('released'); }, 1000),
      moment('blackout', 'neutral', LOOP, () => { cancelWindows(); blackout(); }, () => window.__breath.blackout(), 2500),
      moment('entry-1280', 'neutral', 900, none, none, 0, [1280, 800]),
      moment('now-neutral-1280', 'neutral', LOOP, () => { cancelWindows(); openWindow(false); }, () => window.__breath.open(false), 400, [1280, 800]),
      moment('low-air-1280', 'neutral', LOOP, () => { cancelWindows(); G.air = 18; }, () => { window.__breath.lines(); window.__breath.G.air = 18; }, 900, [1280, 800]),
    ],
  };
}
