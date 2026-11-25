// @vitest-environment jsdom
/**
 * P10e-e Task 12: the slap instrument (docs/prototypes/slap.html) replaces P16's overlay. The camera snaps, her hand is up, she may feint, the
 * swing lands; a press 42–224 ms before the impact braces, one try a slap; a flick sideways turns the face away. The answer goes once, at the
 * impact. Her face changes inside the snap and after; the cheek stays for the scene. Reduced motion or the timing toggle off: `none` at once.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { blankPractices, type PracticeState, type SlapResult } from '../../../src/engine/practice/state';
import { slapSide } from '../../../src/engine/practice/slap';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { clearSlapOverlay, renderSlapOverlay } from '../../../src/ui/practice/slapOverlay';
import { currentSlap, isFlick, resultOf, slapTimeline, tensionAt } from '../../../src/ui/scene/instruments/slap/slap';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { _resetInstrumentDefs, registerInstrument, syncInstruments, unmountInstruments } from '../../../src/ui/scene/instruments/host';
import type { PhysicsRun } from '../../../src/engine/physics/state';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { errors, loadCore, run } from '../../helpers/world';
import { setDecodeMs, slapEnv } from '../../helpers/slapEnv';
import { ANN, unitOf, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetSceneStage();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

type Slap = NonNullable<PracticeState['slap']>;
const L = TUNING.practice.slap.leadMs;
const F = TUNING.practice.slap.feintMs;
const FACES = TUNING.practice.slap.faces;

/** Ann holds at role in `style`, a scene with her is open and her slap `over` is open in it. */
function holding(style: string, over: Partial<Slap> = {}): CampaignState {
  const w = world(reg, 'role');
  w.content = { enabled: [...(w.content?.enabled ?? []), 'physical_discipline_shown'] };
  unitOf(w, ANN).bond!.practice!.style = { primary: style as 'cold' };
  const started = run(w, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  const s = started.state;
  s.practices = { ...blankPractices(), seq: 3, slap: { id: 'ps1', holderId: ANN, sceneId: s.scene!.id, windowMs: 500, feints: 0, ...over } };
  return s;
}

/** The slap drawn into a test frame. */
async function slapping(over: { style?: string; slap?: Partial<Slap>; settings?: Partial<AliusSettings>; reduced?: boolean; face?: string; lookupMs?: number; sprite?: boolean; art?: boolean; audio?: boolean } = {}) {
  let state = holding(over.style ?? 'possessive', over.slap);
  const f = slapEnv({ state: () => state, reg, ...(over.settings ? { settings: over.settings } : {}), ...(over.reduced ? { reduced: true } : {}), ...(over.face ? { face: over.face } : {}), ...(over.lookupMs ? { lookupMs: over.lookupMs } : {}), ...(over.sprite ? { sprite: true } : {}), ...(over.audio ? { audio: true } : {}), ...(over.art ? { art: { get: () => ({ url: '/art/face_close.webp', sidecar: {} }) } } : {}) });
  const host = h('div', { class: 'alius-slap-host' });
  f.layers.moment.append(host);
  const results: SlapResult[] = [];
  const settings = { ...DEFAULT_SETTINGS, ...over.settings } as AliusSettings;
  const draw = (): void => renderSlapOverlay(host, { state, reg, ...(state.practices?.slap ? { slap: state.practices.slap } : {}), settings, env: f.env, onResult: (r) => { results.push(r); } });
  draw();
  await f.settle();
  const t0 = f.now();
  return {
    ...f, host, results, draw,
    set: (s: CampaignState) => { state = s; },
    get state() { return state; },
    /** Runs frames until `ms` after the slap's start. */
    to: (ms: number) => f.tick(Math.max(0, t0 + ms - f.now())),
    space: (target: EventTarget = document.body) => { target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); target.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); },
  };
}

describe('the pure rules', () => {
  it('slapTimeline: her hand up for leadMs, each feint feintMs, then the swing; unannounced swings after the snap; again raises it for 420 ms', () => {
    expect(slapTimeline({ windowMs: 500, feints: 1 })).toEqual({ snap: 170, impactAt: 900 + 450 + 500, feintsAt: [900] });
    // slap.html: `lead = unann ? SNAP : …` and no feints: the swing starts right after the snap (the plan's "impactAt = 500" leaves out the snap; the prototype wins)
    expect(slapTimeline({ windowMs: 500, feints: 1, unannounced: true })).toEqual({ snap: 170, impactAt: 170 + 500, feintsAt: [] });
    expect(slapTimeline({ windowMs: 300, feints: 0, again: true }).impactAt).toBe(420 + 300);
  });

  it('resultOf: a press 42–224 ms before the impact braces; too early, too late or after is none; a turned face is flinched whatever the press', () => {
    expect(resultOf(1000 - 100, 1000, false)).toBe('braced');
    expect(resultOf(1000 - 300, 1000, false)).toBe('none');
    expect(resultOf(1000 - 20, 1000, false)).toBe('none');
    expect(resultOf(1010, 1000, false)).toBe('none');
    expect(resultOf(null, 1000, false)).toBe('none');
    for (const p of [null, 900, 500]) expect(resultOf(p, 1000, true)).toBe('flinched');
    // the band is the prototype's tension: rise 100, peak 80, fall 220, braced at 0.8 (land reads tensionAt)
    for (let before = 0; before <= 400; before++) expect(resultOf(1000 - before, 1000, false), `${before} ms`).toBe(tensionAt(before) >= 0.8 ? 'braced' : 'none');
    // the live clock is fractional: the edge is land's (about 41.52 ms), and the whole-ms band of TUNING is that band
    expect(resultOf(1000 - 41.6, 1000, false)).toBe('braced');
    expect(resultOf(1000 - 41.4, 1000, false)).toBe('none');
    expect(resultOf(1000 - 224.4, 1000, false)).toBe('none');
    const [a, b] = TUNING.practice.slap.braceBand;
    expect([resultOf(1000 - a, 1000, false), resultOf(1000 - (a - 1), 1000, false), resultOf(1000 - b, 1000, false), resultOf(1000 - (b + 1), 1000, false)]).toEqual(['braced', 'none', 'braced', 'none']);
  });

  it('isFlick: at least 2400 px/s over the last 70 ms and 6 % of the width', () => {
    const run = (vx: number, ms: number) => Array.from({ length: Math.floor(ms / 10) + 1 }, (_, i) => ({ t: i * 10, x: (vx * i * 10) / 1000 }));
    expect(isFlick(run(3000, 70), 2000)).toBe(true); // 210 px, 10.5 % of 2000
    expect(isFlick(run(3000, 20), 2000)).toBe(false); // 60 px: 3 %
    expect(isFlick(run(1500, 70), 1000)).toBe(false);
    expect(isFlick(run(-3000, 70), 2000)).toBe(true);
  });
});

describe('the swing and the one try', () => {
  it('nothing at all is none, sent once, at the impact', async () => {
    const o = await slapping();
    o.to(L + 500 - 20);
    expect(o.results).toEqual([]);
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['none']);
    o.draw();
    o.to(4000);
    expect(o.results).toEqual(['none']);
  });

  it('a press 100 ms before the impact braces; a second press does nothing', async () => {
    const o = await slapping();
    o.to(L + 500 - 100);
    o.space();
    o.to(L + 500 - 60);
    o.space(); // the body has already let go: one try
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['braced']);
  });

  it('a press on a feint burns the try: the impact gives none', async () => {
    const o = await slapping({ slap: { feints: 1 } });
    o.to(L + 100); // her hand twitches
    o.space();
    o.to(L + F + 500 - 100);
    o.space();
    o.to(L + F + 500 + 40);
    expect(o.results).toEqual(['none']);
  });

  it('the left button on the scene is the same press; a button of the UI (the stop word) is not', async () => {
    const o = await slapping();
    o.to(L + 500 - 100);
    o.stop.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['none']);
    const p = await slapping({ slap: { id: 'ps2' } });
    p.to(L + 500 - 100);
    p.layers.frame.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    p.to(L + 500 + 40);
    expect(p.results).toEqual(['braced']);
  });

  it('a sharp flick sideways turns the face away: flinched, whatever the press', async () => {
    const o = await slapping();
    Object.defineProperty(o.root, 'clientWidth', { value: 1600, configurable: true });
    o.to(L + 200);
    o.space();
    for (let i = 0; i <= 5; i++) { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + i * 60, bubbles: true })); o.frame(); } // 60 px every 16 ms: 3750 px/s, 300 px
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['flinched']);
    expect(isFlick(Array.from({ length: 6 }, (_, i) => ({ t: i * 16, x: 100 + i * 60 })), 1600)).toBe(true); // the same moves, by the pure rule
    expect(isFlick(Array.from({ length: 11 }, (_, i) => ({ t: i * 16, x: 100 + i * 5 })), 1600)).toBe(false);
    // ordinary moves do nothing
    const p = await slapping({ slap: { id: 'ps9' } });
    for (let i = 0; i <= 10; i++) { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + i * 5, bubbles: true })); p.frame(); }
    p.to(L + 500 + 40);
    expect(p.results).toEqual(['none']);
  });

  it('with the history curtain open no press and no flick is read: the slap is taken (review M3)', async () => {
    const o = await slapping();
    Object.defineProperty(o.root, 'clientWidth', { value: 1600, configurable: true });
    o.root.dataset.curtain = 'open';
    o.to(L + 200);
    for (let i = 0; i <= 5; i++) { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + i * 60, bubbles: true })); o.frame(); }
    o.to(L + 500 - 100);
    o.space();
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['none']);
  });

  it('the input loses its focus when the slap starts; Space typed into the field before it is not counted', async () => {
    const state = holding('possessive');
    const f = slapEnv({ state: () => state, reg });
    f.input.focus();
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); // before the slap: typed, not counted
    const host = h('div');
    f.layers.moment.append(host);
    const results: SlapResult[] = [];
    renderSlapOverlay(host, { state, reg, slap: state.practices!.slap!, settings: DEFAULT_SETTINGS, env: f.env, onResult: (r) => results.push(r) });
    await f.settle();
    expect(document.activeElement).not.toBe(f.input);
    f.tick(L + 500 - 100);
    f.input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); // into a field: the text's, never the body's
    f.tick(200);
    expect(results).toEqual(['none']);
    f.tick(2500);
    expect(document.activeElement).toBe(f.input); // the input gets its focus back once the camera goes back
  });
});

describe('her face and her lines', () => {
  it('her before face is set inside the snap unless her face now is in keep; after the result, the after face', async () => {
    const o = await slapping({ style: 'cruel', face: 'neutral' });
    o.to(40);
    expect(o.setSprite).not.toHaveBeenCalled();
    o.to(120);
    expect(o.setSprite).toHaveBeenCalledWith(ANN, FACES.cruel.before, `/sprites/${FACES.cruel.before}.png`);
    o.to(L + 500 + 20);
    expect(o.results).toEqual(['none']);
    o.to(L + 500 + 450);
    expect(o.setSprite).toHaveBeenLastCalledWith(ANN, FACES.cruel.after.none, `/sprites/${FACES.cruel.after.none}.png`);
    // a face that already fits her style is kept
    const kept = await slapping({ style: 'cruel', face: 'anger', slap: { id: 'ps5' } });
    kept.to(160);
    expect(kept.setSprite).not.toHaveBeenCalled();
  });

  it('her face now is read for each slap: a second slap keeps the face the first one left, or reads the face her reply gave her since (review I1)', async () => {
    const P = FACES.possessive;
    for (const reply of [null, 'joy'] as const) {
      const o = await slapping({ style: 'possessive', face: 'neutral' });
      o.to(L + 450 + 1500 + 650 + 200); // the first slap: taken, her after face, the camera home
      expect(o.setSprite).toHaveBeenLastCalledWith(ANN, P.after.none, `/sprites/${P.after.none}.png`);
      if (reply) o.setFace(reply); // her next reply was read as joy
      o.setSprite.mockClear();
      const next = structuredClone(o.state);
      next.practices!.slap = { ...next.practices!.slap!, id: 'ps2' };
      o.set(next);
      o.draw();
      await o.settle();
      o.tick(160);
      if (reply === null) expect(o.setSprite, 'desire is in keep: kept').not.toHaveBeenCalled();
      else expect(o.setSprite).toHaveBeenCalledWith(ANN, P.before, `/sprites/${P.before}.png`);
      resetSceneStage();
    }
  });

  it('a slow lookup and a slow decode delay her before face; they never lose it (review I3)', async () => {
    setDecodeMs(400);
    try {
      const o = await slapping({ style: 'cruel', face: 'neutral', lookupMs: 500 });
      o.to(300);
      await o.settle();
      expect(o.setSprite).not.toHaveBeenCalled(); // the scene has not answered yet
      o.to(600);
      await o.settle();
      expect(o.setSprite).toHaveBeenCalledWith(ANN, FACES.cruel.before, `/sprites/${FACES.cruel.before}.png`);
    } finally {
      setDecodeMs(0);
    }
  });

  it('her lines are cardVoice rows of her style: ritual says its before line; cold is silent', async () => {
    const o = await slapping({ style: 'ritual' });
    o.to(SNAP_PLUS);
    expect(o.layers.effects.textContent).toContain('still.');
    o.to(L + 500 + 450);
    expect(o.layers.effects.textContent).toContain('one.');
    const c = await slapping({ style: 'cold', slap: { id: 'ps6' } });
    c.to(L + 500 + 450);
    expect(c.results).toEqual(['none']);
    expect(c.layers.effects.querySelector('.alius-her-line')).toBeNull();
  });
});
const SNAP_PLUS = 170 + 60 + 20;

describe('the still form', () => {
  for (const [name, over] of [['reduced motion', { reduced: true }], ['the timing toggle off', { settings: { physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, timing: false } } }]] as const) {
    it(`${name}: none at once; only the flash, the ringing and the cheek (no camera)`, async () => {
      const o = await slapping(over as never);
      expect(o.results).toEqual(['none']);
      o.frame();
      expect(o.layers.sprites.style.transform).toBe('');
      expect(o.layers.backdrop.style.filter).toBe('');
      expect(Number(o.layers.effects.querySelector<HTMLElement>('.alius-slap-cheek')!.style.opacity)).toBeGreaterThan(0);
    });
  }
});

describe('the camera and the frame', () => {
  it('the slap draws under the scene\'s UI (the stop word is never covered) and carries no data-analyze', async () => {
    const o = await slapping();
    o.to(L + 200);
    expect(o.layers.effects.querySelector('.alius-slap')).not.toBeNull();
    expect(o.layers.moment.querySelector('.alius-slap')).toBeNull();
    expect(o.root.querySelector('.alius-layer-ui .alius-slap')).toBeNull();
    expect(o.layers.effects.querySelector('.alius-slap [data-analyze]')).toBeNull();
    expect(o.layers.effects.querySelector('.alius-slap')!.closest('[data-analyze]')).toBeNull();
    expect(o.root.querySelector('.alius-stage-dial')!.getAttribute('data-instrument')).toBe('slap'); // R6: the dial dims
    expect(o.layers.backdrop.style.filter).toMatch(/blur/);
    expect(o.reply.style.opacity).not.toBe('');
  });

  it('the camera zooms her sprite to her face and the impact blurs her, the backdrop and the face art in the frame\'s pixels (review I2, M1)', async () => {
    const o = await slapping({ sprite: true, art: true });
    Object.defineProperty(o.root, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(o.root, 'clientHeight', { value: 1080, configurable: true });
    const art = o.layers.effects.querySelector<HTMLImageElement>('.alius-slap-face')!;
    expect(art.getAttribute('src')).toBe('/art/face_close.webp');
    art.dispatchEvent(new Event('load'));
    o.to(L + 300); // k = 1: her face close
    expect(o.layers.sprites.style.transform).toMatch(/scale\(2\.6000\)$/);
    expect(Number(art.style.opacity)).toBe(1);
    expect(o.layers.backdrop.style.filter).toMatch(/blur\(10\.9px\)/); // 14 px on screen: 14 / 1.28 in the grown layer
    o.to(L + 500 + 30); // 30 ms after the impact: the whip's blur, about 13.8 px
    const dev = (id: string): number => Number(o.layers.effects.querySelector(`#${id} feGaussianBlur`)!.getAttribute('stdDeviation')!.split(' ')[0]);
    const hb = dev('alius-slap-hblur');
    expect(hb).toBeGreaterThan(10);
    expect(o.layers.sprites.style.filter).toContain('url(#alius-slap-hblur-s)');
    expect(dev('alius-slap-hblur-s')).toBeCloseTo(hb / 2.6, 1);
    expect(o.layers.backdrop.style.filter).toContain('url(#alius-slap-hblur-b)');
    expect(dev('alius-slap-hblur-b')).toBeCloseTo(hb / 1.28, 1);
    expect(art.style.filter).toBe('url(#alius-slap-hblur)');
  });

  it('the camera puts the frame back when it is home: the layers, the reply and the input line as they were', async () => {
    const o = await slapping();
    o.layers.backdrop.style.setProperty('opacity', '0.9');
    o.to(L + 300);
    expect(o.layers.backdrop.style.transform).not.toBe('');
    o.to(L + 500 + 1500 + 650 + 100);
    expect(o.layers.backdrop.style.transform).toBe('');
    expect(o.layers.backdrop.style.filter).toBe('');
    expect(o.layers.backdrop.style.opacity).toBe('0.9');
    expect(o.layers.sprites.style.transform).toBe('');
    expect(o.reply.style.opacity).toBe('');
    expect(o.root.querySelector('.alius-input-line')!.getAttribute('style') ?? '').toBe('');
    expect(o.root.querySelector('.alius-stage-dial')!.hasAttribute('data-instrument')).toBe(false);
  });
});

describe('the slap and an instrument share the frame (review M4)', () => {
  /** A test instrument that moves the sprites layer and dims the backdrop on every frame while it runs. */
  function withInstrument(): void {
    registerInstrument({
      id: 'test',
      matches: () => true,
      start(env) {
        // as an instrument does: its styles are written on every frame
        const draw = (): void => { env.layers.sprites.style.transform = 'translateX(5px)'; env.layers.backdrop.style.opacity = '0.5'; env.raf(draw); };
        draw();
        return { update() {}, stop() {} };
      },
    });
  }
  const run = { id: 'p1', physicsId: 'none' } as unknown as PhysicsRun;
  afterEach(() => _resetInstrumentDefs());

  it('an instrument mounted during the slap and gone after it: the layers and the dial end as they were before both', async () => {
    withInstrument();
    const o = await slapping();
    o.state.settings.physicsRealtime = true;
    o.layers.backdrop.style.setProperty('opacity', '0.9');
    o.to(L + 200);
    expect(syncInstruments(o.env, run)).toBe(true);
    o.to(L + 500 + 1500 + 650 + 100); // the slap's camera is home: the instrument's values are back
    expect(o.layers.sprites.style.transform).toBe('translateX(5px)');
    expect(o.layers.backdrop.style.opacity).toBe('0.5');
    expect(o.root.querySelector('.alius-stage-dial')!.getAttribute('data-instrument')).toBe('test');
    unmountInstruments();
    expect(o.layers.sprites.style.transform).toBe('');
    expect(o.layers.backdrop.style.opacity).toBe('0.9');
    expect(o.root.querySelector('.alius-stage-dial')!.hasAttribute('data-instrument')).toBe(false);
  });

  it('an instrument running before the slap and gone during it: the slap puts back what was there before the instrument', async () => {
    withInstrument();
    const o = await slapping({ slap: { id: 'ps8' } });
    o.state.settings.physicsRealtime = true;
    // the slap starts at once; mount first with the camera still home by stopping and restarting the slap
    resetSceneStage();
    o.layers.backdrop.style.setProperty('opacity', '0.9');
    expect(syncInstruments(o.env, run)).toBe(true);
    o.draw();
    await o.settle();
    o.to(L + 200);
    expect(o.root.querySelector('.alius-stage-dial')!.getAttribute('data-instrument')).toBe('slap');
    unmountInstruments();
    o.to(L + 500 + 1500 + 650 + 100);
    expect(o.layers.sprites.style.transform).toBe('');
    expect(o.layers.backdrop.style.opacity).toBe('0.9');
    expect(o.root.querySelector('.alius-stage-dial')!.hasAttribute('data-instrument')).toBe(false);
  });
});

describe('the cheek', () => {
  it('stays for the scene (a redraw without a slap draws it on) and is gone on a new scene or a chat switch', async () => {
    const o = await slapping();
    const cheek = () => o.layers.effects.querySelector<HTMLElement>('.alius-slap-cheek');
    o.to(L + 500 + 40);
    const side = slapSide('ps1');
    expect(cheek()!.style.background).toContain(side > 0 ? '0%' : '100%');
    // the engine closed the slap: the redraw has none, the cheek goes on fading
    const s = structuredClone(o.state);
    delete s.practices!.slap;
    o.set(s);
    o.draw();
    o.tick(5000);
    expect(Number(cheek()!.style.opacity)).toBeGreaterThan(0.2);
    // a new scene: gone
    const next = structuredClone(s);
    next.scene!.id = `${s.scene!.id}_next`;
    o.set(next);
    o.draw();
    o.frame();
    expect(cheek()?.style.opacity ?? '0').toBe('0');
    // a chat switch: gone
    const p = await slapping({ slap: { id: 'ps7' } });
    p.to(L + 500 + 40);
    resetSceneStage();
    expect(p.layers.effects.querySelector('.alius-slap')).toBeNull();
  });
});

describe('going away', () => {
  it('clearing it (dispose) leaves no timer, no frame, no listener, no sound; no answer comes after; the frame is put back', async () => {
    const o = await slapping({ audio: true });
    o.to(L + 200);
    const remove = vi.spyOn(document, 'removeEventListener');
    clearSlapOverlay(o.host);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['keydown', 'pointermove']));
    remove.mockRestore();
    expect(vi.getTimerCount()).toBe(0);
    expect(o.pendingFrames()).toBe(0);
    expect(o.audio.sources.length).toBeGreaterThan(0);
    expect(o.audio.sources.filter((x) => x.started && !x.stopped)).toEqual([]);
    o.space();
    o.tick(2000);
    expect(o.results).toEqual([]);
    expect(o.layers.effects.querySelector('.alius-slap')).toBeNull();
    expect(o.layers.sprites.style.transform).toBe('');
    expect(o.layers.backdrop.getAttribute('style') ?? '').toBe('');
    expect(currentSlap()).toBeNull();
  });

  it('a slap gone from the state before it landed (its scene ended) stops at once and sends nothing; its sounds stop, the input gets its focus back (review M7)', async () => {
    const o = await slapping({ audio: true });
    o.to(L + 100);
    expect(o.audio.sources.some((x) => x.started)).toBe(true); // her heartbeat, her clothes, the swish timed to the impact
    const s = structuredClone(o.state);
    delete s.practices!.slap;
    o.set(s);
    o.draw();
    expect(o.audio.sources.filter((x) => x.started && !x.stopped)).toEqual([]);
    o.tick(3000);
    expect(o.results).toEqual([]);
    expect(o.layers.sprites.style.transform).toBe('');
  });
});

describe('cruel slaps again after a turned face', () => {
  it('the second slap waits for the first one\'s camera and raises her hand for 420 ms; its answer goes to it', async () => {
    const o = await slapping({ style: 'cruel' });
    Object.defineProperty(o.root, 'clientWidth', { value: 1600, configurable: true });
    o.to(L + 100);
    for (let i = 0; i <= 5; i++) { document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + i * 60, bubbles: true })); o.frame(); }
    o.to(L + 500 + 40);
    expect(o.results).toEqual(['flinched']);
    // the engine opens the second one at once (cruel); the scene redraws with it while the first one's camera still holds
    const again = structuredClone(o.state);
    again.practices!.slap = { ...again.practices!.slap!, id: 'ps2', again: true };
    o.set(again);
    o.draw();
    await o.settle();
    expect(currentSlap()).toEqual({ id: 'ps1', landed: true });
    o.tick(700 + 120 + 40);
    await o.settle();
    expect(currentSlap()).toEqual({ id: 'ps2', landed: false });
    o.tick(420 + 500 + 60);
    expect(o.results).toEqual(['flinched', 'none']);
  });
});

describe('the scene screen', () => {
  function screen(over: Partial<AliusSettings> = {}) {
    const s = holding('cold');
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn() } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    const onSlap = vi.fn();
    const screen = renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over }), onEnded: vi.fn(), onSlap } as never);
    return { host, onSlap, screen, s };
  }

  it('draws the slap in the effects layer; the slap host stays in the moment layer and takes no room', () => {
    const { host } = screen();
    expect(host.querySelector('.alius-layer-moment .alius-slap-host')).not.toBeNull();
    expect(host.querySelector('.alius-layer-effects .alius-slap')).not.toBeNull();
    expect(host.querySelector('.alius-layer-moment .alius-slap')).toBeNull();
  });

  it('with reduced motion the answer is none, sent after the draw', async () => {
    const { onSlap } = screen({ reducedMotion: true });
    expect(onSlap).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(onSlap).toHaveBeenCalledWith('ps1', 'none');
    expect(onSlap).toHaveBeenCalledTimes(1);
  });

  it('dispose ends the keys and the slap', () => {
    const o = screen();
    const remove = vi.spyOn(document, 'removeEventListener');
    (o.screen as { dispose?: () => void }).dispose?.();
    expect(remove.mock.calls.some((c) => c[0] === 'keydown')).toBe(true);
    remove.mockRestore();
    expect(o.host.querySelector('.alius-slap')).toBeNull();
  });
});
