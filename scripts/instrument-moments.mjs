// P10e chunk (e): the named moments of each instrument for the side-by-side shots (`npm run shots -- <name>`, scripts/instrument-shots.mjs).
// Each instrument task adds its entry: the moments its brief names, how to drive the prototype there and how to drive the port there.
//
// An entry:
//   state    the layout fixture the port is drawn from (tests/layout/mkstate.ts; `--state <fixture>` overrides it for every moment)
//   size     [width, height] (default 1920x1080)
//   clip     optional { x, y, width, height } (negative x / y count from the right / bottom edge): both shots are cropped to it
//   hide     selectors of the prototype hidden in its shots (its panel, its log: prototype only)
//   moments  [{ id, state?, query?, clip?, proto(page, ctx), port(page, ctx) }]
//            `proto` runs in the built prototype page (.superpowers/prototypes/<name>.html): drive it through its hooks (`window.__S`, `window.__G()`,
//            `window.__forceO`, `window.__begin()`, …), its globals (a top-level `let` / `function` of its script is reachable from
//            `page.evaluate`), its panel's buttons or the mouse and keys. `port` runs in the layout page (`/page.html?fixture=<state><query>`):
//            drive it through the DOM, the mouse and keys. Both end at the moment to shoot; the script waits `settle` ms (default 400) after each.
//            ctx: { size, wait(ms) }.
// Shots are deviceScaleFactor 1 (for looking at, not for print).

/** cards.html: the dial's label (Task 6). The circle stays put, the label hangs under it; her name over the base name. */
const dialCorner = { x: -560, y: -440, width: 560, height: 440 };

export const MOMENTS = {
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
    ],
  },
};

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
