// @vitest-environment jsdom
/**
 * P10e-e Task 30: the gulp instrument (docs/prototypes/gulp.html). It matches gulp by field (a timing physics on a fill gauge tagged
 * `watersports`) and the cleaning that follows it; her picture is the chain `over_explicit` (explicit content on) → `over` → her sprite;
 * a swallow takes .4 of a full mouth over 700 ms and .11 of the air; a breath with the mouth over .55 may be a cough, never under; from the
 * fourth swallow without a breath the reflex builds; every bit licked fills the mouth again (× .0016); the cleaning ends at 10 % left or after
 * 40 s; per beat it reports `swallow` / `spill`, in the cleaning `wipe`; her flow is the plan's; the tap's answer follows the engine's; her
 * lines are `cardVoice`; Space and Shift typed into the field never act; the still form; the unmount leaves nothing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { registerPhysicsStyle, registerHoldsUntil, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, PlannedBeat, SegmentInput } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import type { ArtPicture, ArtSlots } from '../../../src/ui/scene/art';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import { _gulp, AIR_GULP, GULP_TAKES, gulpMatches } from '../../../src/ui/scene/instruments/gulp/gulp';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/ui/scene/instruments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

function fakeCtx(): CanvasRenderingContext2D {
  const t: Record<string | symbol, unknown> = {
    getImageData: (_x: number, _y: number, w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4).fill(255) }),
    createImageData: (w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4) }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  return new Proxy(t, { get: (o, p) => (p in o ? o[p] : () => undefined), set: (o, p, v) => { o[p] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx() as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSceneStage();
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const BEAT = 1500;
const flowPlan = (n = 14, level = 0.2, extra: (b: number) => Partial<PlannedBeat> = () => ({})): { beats: PlannedBeat[] } =>
  ({ beats: Array.from({ length: n }, (_, b) => ({ attention: 'busy' as const, flow: { level }, ...extra(b) })) });

/** Ann stands over the commander: a gulp run in real time, its first segment running (no contact starts gulp: A3). */
function hold(plan = flowPlan(), content: string[] = ['bodily_fluids', 'watersports']): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...content);
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  st.scene!.physics = {
    id: 'p1', physicsId: 'gulp', sourceKind: 'contact', sourceId: 'kneeling_between_legs', holderId: ANN, gauge: 0, capacity: 100,
    segment: { n: 1, state: 'running', plan }, startedExchange: 0, taps: 0, streak: 0, extend: 0,
  };
  return st;
}

function artOf(slots: Partial<Record<string, Record<string, number> | null>> = {}): ArtSlots {
  return {
    get: (_u, slot, gate) => {
      if (slot === 'over_explicit' && gate?.explicit !== true) return null;
      const fit = slots[slot];
      return fit ? ({ url: `/art/${slot}.png`, sidecar: { fit } } as ArtPicture) : null;
    },
    face: () => null,
  };
}

function frames() {
  let next = 1;
  let t = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => t,
    raf: (fn: FrameRequestCallback) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id: number) => { queue.delete(id); },
    frame() {
      t += 16;
      vi.advanceTimersByTime(16);
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(t);
    },
    pending: () => queue.size,
  };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging> & Record<string, unknown>; art?: ArtSlots } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const endSegment = vi.fn(() => []);
  const onTap = vi.fn();
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input, endSegment, stopWord: vi.fn(() => []), skip: noop, act: noop, finishCounted: noop, stimulus: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: BEAT, now: f.now() }), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap } as never,
    frames: f, art: over.art ?? artOf(), assetUrl: (p: string) => `/x/${p}`,
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const field = q('input[name="cmd"]') as HTMLInputElement;
  const pointer = (type: 'pointerdown' | 'pointerup' | 'pointermove', target: EventTarget = frame, button = 0, x = 0, y = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y });
    target.dispatchEvent(e);
    return e;
  };
  const key = (k: string, target: EventTarget = document.body, type: 'keydown' | 'keyup' = 'keydown') => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { host, screen, input, endSegment, onTap, frames: f, q, to, pointer, key, field };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
const handText = (t: ReturnType<typeof draw>) => [...t.host.querySelectorAll('.alius-gulp-hand .her-line')].map((e) => e.textContent).join(' | ');
const senseText = (t: ReturnType<typeof draw>) => [...t.host.querySelectorAll('.alius-gulp-hand .sense')].map((e) => e.textContent).join(' | ');
/** In the loop, at the clock's `ms`: the entry's 1.4 s are over. */
const inLoop = (t: ReturnType<typeof draw>, ms = 1500) => { t.to(ms); expect(_gulp.G.phase).toBe('loop'); };

describe('the gulp instrument: matching and her picture', () => {
  it('matches gulp by field and the cleaning that follows it, alone; draws in the effects layer, no card, no [data-analyze] on the play surface', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(gulpMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('gulp');
    expect(gulpMatches({ ...p, second: { physicsId: 'weight', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    expect(gulpMatches({ ...p, physicsId: 'breath' }, s, reg)).toBe(false);
    // the floor after a gulp is its own; a tongue work of anything else is not
    expect(gulpMatches({ ...p, physicsId: 'tongue_work', gulp: { spilled: 0.4 } }, s, reg)).toBe(true);
    expect(gulpMatches({ ...p, physicsId: 'tongue_work' }, s, reg)).toBe(false);
    // real time off: the card
    expect(instrumentFor(p, s, reg, { ...DEFAULT_SETTINGS, physicsRealtime: false })).toBeNull();
    const t = draw(s);
    const box = t.q('.alius-layer-effects > .alius-gulp');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.querySelector('[data-analyze]')).toBeNull();
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull();
    t.to(100);
    expect(_gulp.G.phase).toBe('entry');
    inLoop(t);
    expect(handText(t)).toContain('open. drink.');
  });

  it('fallback: no art slot, her sprite from below; `over` when it is there; `over_explicit` only with explicit content on; a failing picture falls to the next', () => {
    const t = draw(hold());
    t.to(100);
    expect(_gulp.overImgs.over).toBeNull();
    expect(_gulp.overImgs.naked).toBeNull();
    expect(_gulp.S.explicit).toBe(false);
    resetSceneStage();
    document.body.innerHTML = '';
    // over (its fit), explicit content off: over_explicit is never asked for
    const art = artOf({ over: { height: 1.2, x: 0.45, sink: 0.05 }, over_explicit: { height: 0.9 } });
    const get = vi.spyOn(art, 'get');
    const u = draw(hold(), { art });
    u.to(100);
    expect(_gulp.S).toMatchObject({ explicit: false, overH: 1.2, overX: 0.45, overSink: 0.05 });
    expect(get.mock.calls.some((c) => c[1] === 'over_explicit')).toBe(false);
    resetSceneStage();
    document.body.innerHTML = '';
    // explicit content on: over_explicit and its fit
    const v = draw(hold(flowPlan(), ['bodily_fluids', 'watersports', 'explicit_scenes']), { art: artOf({ over: { height: 1.2 }, over_explicit: { height: 0.9 } }) });
    v.to(100);
    expect(_gulp.S).toMatchObject({ explicit: true, overH: 0.9 });
  });
});

describe('the gulp instrument: the prototype\'s body', () => {
  it('a swallow takes .4 of a full mouth over 700 ms and .11 of the air', () => {
    const t = draw(hold(flowPlan(14, 0)));
    inLoop(t);
    const G = _gulp.G;
    G.fill = 1; G.air = 1; G.flow = 0;
    _gulp.startGulp();
    expect(G.air).toBeCloseTo(1 - AIR_GULP, 10);
    expect(G.gulping).toBe(700);
    for (let i = 0; i < 14; i++) _gulp.update(50);
    expect(G.fill).toBeCloseTo(1 - GULP_TAKES, 6);
    expect(G.gulping).toBeLessThanOrEqual(0);
  });

  it('a breath with the mouth over .55 may be a cough, never under', () => {
    const t = draw(hold(flowPlan(14, 0)));
    inLoop(t);
    const G = _gulp.G;
    let coughs = 0;
    for (let i = 1; i <= 60; i++) {
      _gulp.seed(Math.imul(i, 2654435761) >>> 0);
      G.fill = 0.55; G.reflex = 0; G.breathing = 0; G.gulping = 0; G.air = 1;
      const before = G.stats.coughs;
      _gulp.startBreath();
      vi.advanceTimersByTime(300);
      coughs += G.stats.coughs - before;
    }
    expect(coughs).toBe(0);
    for (let i = 1; i <= 60; i++) {
      _gulp.seed(Math.imul(i, 2654435761) >>> 0);
      G.fill = 1; G.reflex = 0; G.breathing = 0; G.gulping = 0; G.air = 1;
      const before = G.stats.coughs;
      _gulp.startBreath();
      vi.advanceTimersByTime(300);
      coughs += G.stats.coughs - before;
    }
    expect(coughs).toBeGreaterThan(20); // 0.7 at a full mouth
    expect(coughs).toBeLessThan(60);
  });

  it('from the fourth swallow without a breath the reflex builds (+0.12 each more); a breath starts the count again', () => {
    const t = draw(hold(flowPlan(14, 0)));
    inLoop(t);
    const G = _gulp.G;
    G.reflex = 0;
    const gulp = () => { G.gulping = 0; G.breathing = 0; _gulp.startGulp(); };
    gulp(); gulp(); gulp();
    expect(G.reflex).toBe(0);
    gulp();
    expect(G.reflex).toBeCloseTo(0.12, 10);
    gulp();
    expect(G.reflex).toBeCloseTo(0.36, 10);
    G.gulping = 0;
    _gulp.seed(3);
    G.fill = 0;
    _gulp.startBreath();
    expect(G.gulpsInRow).toBe(0);
    G.reflex = 0;
    G.breathing = 0;
    gulp(); gulp(); gulp();
    expect(G.reflex).toBe(0);
  });

  it('every bit licked fills the mouth again (× .0016)', () => {
    const t = draw(hold());
    inLoop(t);
    const G = _gulp.G;
    G.spilled = 0.6;
    _gulp.startClean();
    expect(G.phase).toBe('clean');
    G.fill = 0;
    const r = _gulp.puddleRect();
    const sum = () => G.puddle.m.reduce((a: number, b: number) => a + b, 0);
    const before = sum();
    G.gest = { x: r.x + r.w * 0.5, y: r.y + r.h * 0.55 };
    _gulp.lick({ clientX: r.x + r.w * 0.55, clientY: r.y + r.h * 0.55 });
    const took = before - sum();
    expect(took).toBeGreaterThan(0);
    expect(G.fill).toBeCloseTo(took * 0.0016, 8);
  });

  it('the cleaning ends at 10 % left or after 40 s: her check is a band of light, then her verdict', () => {
    const t = draw(hold());
    inLoop(t);
    const G = _gulp.G;
    G.spilled = 0.6;
    _gulp.startClean();
    G.puddle.m.forEach((v: number, i: number) => { G.puddle.m[i] = v * 0.11; });
    _gulp.update(16);
    expect(G.light).toBe(-1);
    G.puddle.m.forEach((v: number, i: number) => { G.puddle.m[i] = (v / 0.11) * 0.1; });
    _gulp.update(16);
    expect(G.light).toBeGreaterThanOrEqual(0);
    expect(senseText(t)).toContain('She looks at the floor against the light.');
    for (let i = 0; i < 40; i++) _gulp.update(50);
    expect(G.stats.cleaned).toBeCloseTo(0.1, 2);
    expect(handText(t)).toContain('good.'); // not over 15 % left: neutral's `cleaned`
    // after 40 s, whatever is left
    G.phase = 'loop';
    _gulp.startClean();
    G.judged = false;
    G.cleanT = 39990;
    _gulp.update(5);
    expect(G.light).toBe(-1);
    _gulp.update(10);
    expect(G.light).toBeGreaterThanOrEqual(0);
  });
});

describe('the gulp instrument on the scene', () => {
  it('her flow is the plan\'s: the beat\'s level is the stream\'s target; nothing flows while the run is held', () => {
    const s = hold(flowPlan(14, 0.3));
    const t = draw(s);
    inLoop(t);
    t.to(1700);
    expect(_gulp.G.flowTarget).toBeCloseTo(0.3, 6);
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 1, state: 'held' } };
    t.screen.refresh();
    t.to(1800);
    expect(_gulp.G.flowTarget).toBe(0);
  });

  it('a warning beat raises the stream before its surge; ritual says her word (cardVoice `gulp.surge`, or the model\'s word for the cue)', () => {
    registerPhysicsStyle(() => ({ primary: 'ritual' }));
    const plan = flowPlan(14, 0.2, (b) => (b === 1 ? { flow: { level: 0.2, warn: true }, cue: 'surge' as const } : b === 2 ? { flow: { level: 0.3, surge: true } } : {}));
    const t = draw(hold(plan));
    inLoop(t, 1000 + 2 * BEAT - 900 + 20);
    expect(_gulp.G.surge).toMatchObject({ warn: 900, feint: false, plan: true });
    t.to(1000 + 2 * BEAT - 900 + 400);
    expect(handText(t)).toContain('now.');
    t.to(1000 + 2 * BEAT + 100);
    expect(_gulp.G.flowTarget).toBeCloseTo(0.3, 6); // the plan's level carries the surge: never multiplied again
  });

  it('inputs: per beat a `swallow` with the mouth its swallows took and a `spill` with the mouthfuls spilled; none for a quiet beat', () => {
    const t = draw(hold(flowPlan(14, 0)));
    inLoop(t);
    const G = _gulp.G;
    G.fill = 1;
    t.key(' ');
    t.key(' ', document.body, 'keyup');
    t.to(BEAT + 30); // beat 0 ends (the clock started at 0)
    expect(reports(t)).toEqual([]);
    t.to(2 * BEAT + 30);
    const sw = reports(t).filter((i) => i.kind === 'swallow');
    expect(sw).toHaveLength(1);
    expect(sw[0]!.beat).toBe(1);
    expect(sw[0]!.amount!).toBeCloseTo(GULP_TAKES, 2);
    G.fill = 0.8;
    _gulp.spill(0.3, true);
    t.to(3 * BEAT + 30);
    expect(reports(t).filter((i) => i.kind === 'spill')).toEqual([{ beat: 2, kind: 'spill', amount: 0.3 }]);
    t.to(5 * BEAT + 30);
    expect(reports(t)).toHaveLength(2);
  });

  it('Ruling AD: what is swallowed or spilled while the run is held reaches the next segment\'s first beat', () => {
    const s = hold(flowPlan(14, 0));
    let started = 0;
    const clock = { now: () => 0 };
    const t = draw(s, { staging: { clock: () => ({ startedAt: started, beatMs: BEAT, now: clock.now() }) } });
    clock.now = t.frames.now;
    inLoop(t);
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 1, state: 'held' } };
    t.screen.refresh();
    t.to(1600);
    _gulp.G.fill = 0.9;
    _gulp.spill(0.2, false);
    t.to(4 * BEAT);
    expect(reports(t)).toEqual([]);
    const now = t.frames.now();
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 2, state: 'running', plan: flowPlan(10, 0) } };
    started = now;
    t.screen.refresh();
    t.to(now + BEAT + 50);
    expect(reports(t)).toEqual([{ beat: 0, kind: 'spill', amount: 0.2 }]);
  });

  it('the segment cut short at her volume is ended when its beats are played', () => {
    const s = hold(flowPlan(3, 0));
    s.scene!.physics!.segment.n = 2;
    const t = draw(s);
    inLoop(t);
    expect(t.endSegment).not.toHaveBeenCalled();
    t.to(3 * BEAT + 40);
    expect(t.endSegment).toHaveBeenCalledTimes(1);
    t.to(5 * BEAT);
    expect(t.endSegment).toHaveBeenCalledTimes(1);
  });

  it('the chain to the cleaning: her done line, then her clean line, then the floor; the wipes reported × the cleaning\'s start', () => {
    const s = hold(flowPlan(14, 0));
    const t = draw(s);
    inLoop(t);
    _gulp.G.spilled = 0.5;
    s.scene!.physics = { ...s.scene!.physics!, physicsId: 'tongue_work', gauge: 50, capacity: 100, gulp: { spilled: 0.5 }, segment: { n: 3, state: 'held' } };
    t.screen.refresh();
    expect(t.q('.alius-gulp')).not.toBeNull(); // the same instrument draws the floor
    expect(_gulp.G.phase).toBe('after');
    expect(handText(t)).toContain('all of it. good.');
    t.to(t.frames.now() + 1300);
    expect(handText(t)).toContain('you spilled. clean it.');
    t.to(t.frames.now() + 1400);
    expect(_gulp.G.phase).toBe('clean');
    // the floor's segment runs: a lick is reported as the share of the puddle × the start (50)
    const now = t.frames.now();
    s.scene!.physics = { ...s.scene!.physics!, segment: { n: 4, state: 'running', plan: { beats: Array.from({ length: 27 }, () => ({ attention: 'busy' as const })) } } };
    const t0 = now;
    t.screen.refresh();
    const G = _gulp.G;
    const r = _gulp.puddleRect();
    const sum = () => G.puddle.m.reduce((a: number, b: number) => a + b, 0);
    const before = sum();
    G.gest = { x: r.x + r.w * 0.45, y: r.y + r.h * 0.55 };
    _gulp.lick({ clientX: r.x + r.w * 0.6, clientY: r.y + r.h * 0.55 });
    const took = before - sum();
    t.to(t0 + 2 * BEAT);
    const wipes = reports(t).filter((i) => i.kind === 'wipe');
    expect(wipes.length).toBeGreaterThanOrEqual(1);
    expect(wipes.reduce((a, w) => a + w.amount!, 0)).toBeCloseTo((took / G.puddle.total0) * 0.5, 4);
  });

  it('released at her flow\'s end (affectionate): her done line, her clean line and she wipes it up herself; a clean-style holder says no "clean it"', async () => {
    registerPhysicsStyle(() => ({ primary: 'affectionate' }));
    const s = hold(flowPlan(14, 0));
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'gulp', result: 'released' }) } });
    inLoop(t);
    _gulp.G.spilled = 0.5;
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    expect(handText(t)).toContain('good. so good.');
    t.to(t.frames.now() + 1300);
    expect(handText(t)).toContain('leave it, I’ll get it.');
    expect(senseText(t)).toContain('She wipes it up herself.');
    resetSceneStage();
    resetPhysicsHooks();
    document.body.innerHTML = '';
    const n = hold(flowPlan(14, 0));
    const u = draw(n, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'gulp', result: 'released' }) } });
    inLoop(u);
    _gulp.G.spilled = 0.5;
    delete n.scene!.physics;
    u.screen.refresh();
    await Promise.resolve();
    u.to(u.frames.now() + 3000);
    expect(handText(u)).not.toContain('clean it');
  });

  it('the tap: kept (a blackout holder), her answer after 0.4 s (neutral: slower); released (a signal holder), the engine\'s tap and no answer', () => {
    registerHoldsUntil(() => 'blackout');
    const t = draw(hold(flowPlan(14, 0.2)));
    inLoop(t);
    t.pointer('pointerdown', undefined, 2);
    expect(t.onTap).toHaveBeenCalledTimes(1);
    expect(_gulp.G.stats.taps).toBe(1);
    t.to(t.frames.now() + 450);
    expect(handText(t)).toContain('slower, then.');
    expect(_gulp.S._slow).toBeCloseTo(0.8, 10);
    // at most every 2.5 s
    t.key('t');
    expect(_gulp.G.stats.taps).toBe(1);
    resetSceneStage();
    resetPhysicsHooks();
    document.body.innerHTML = '';
    registerHoldsUntil(() => 'signal');
    const u = draw(hold(flowPlan(14, 0.2)));
    inLoop(u);
    u.key('T');
    expect(u.onTap).toHaveBeenCalledTimes(1);
    u.to(u.frames.now() + 600);
    expect(handText(u)).not.toContain('slower, then.');
    expect(_gulp.S._slow).toBe(1);
  });

  it('keys: Space and Shift typed into the field never act; Space elsewhere swallows (held: gulp after gulp), Shift breathes', () => {
    const t = draw(hold(flowPlan(14, 0)));
    inLoop(t);
    const G = _gulp.G;
    G.fill = 0.2;
    t.key(' ', t.field);
    t.key('Shift', t.field);
    t.key('t', t.field);
    expect(G.stats.gulps).toBe(0);
    expect(G.stats.breaths).toBe(0);
    expect(G.stats.taps).toBe(0);
    t.key(' ');
    expect(G.stats.gulps).toBe(1);
    t.to(t.frames.now() + 760);
    expect(G.stats.gulps).toBe(2); // held: the next follows
    t.key(' ', document.body, 'keyup');
    t.to(t.frames.now() + 760);
    expect(G.stats.gulps).toBe(2);
    t.key('Shift');
    expect(G.stats.breaths).toBe(1);
  });

  it('her lines are cardVoice by style: cold is silent where gulp.html has no line; a style it lacks reads neutral\'s', () => {
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const t = draw(hold());
    inLoop(t);
    expect(_gulp.LINES.cold).toMatchObject({ entry: ['drink.'], tapped: [], spill: [], cough: [], done: ['done.'] });
    resetSceneStage();
    resetPhysicsHooks();
    document.body.innerHTML = '';
    registerPhysicsStyle(() => ({ primary: 'regal' }));
    const u = draw(hold());
    inLoop(u);
    expect(_gulp.S.style).toBe('neutral');
    expect(handText(u)).toContain('open. drink.');
  });

  it('reduced motion and readable mode: the still form (no shake), the flags on the box', () => {
    const t = draw(hold(flowPlan(14, 0)), { settings: { reducedMotion: true, readableMode: true } });
    inLoop(t);
    const box = t.q('.alius-gulp')!;
    _gulp.G.shake = 1;
    t.frames.frame();
    expect(box.hasAttribute('data-reduced')).toBe(true);
    expect(box.hasAttribute('data-readable')).toBe(true);
    expect(t.q('.alius-gulp-world')!.style.transform).toBe('translate(0.0px, 0.0px)');
  });

  it('unmount: the stop word leaves no frame, timer or listener; restores the frame; dispatches nothing afterwards', () => {
    const s = hold(flowPlan(14, 0.2));
    const t = draw(s);
    inLoop(t);
    _gulp.G.fill = 1;
    t.key(' ');
    expect(t.frames.pending()).toBeGreaterThan(0);
    delete s.scene!.physics; // the stop word: the run is gone (stopped: no end is played)
    t.screen.refresh();
    resetSceneStage();
    expect(t.q('.alius-gulp')).toBeNull();
    const calls = t.input.mock.calls.length;
    t.key(' ');
    t.pointer('pointerdown', undefined, 2);
    for (let i = 0; i < 200; i++) t.frames.frame();
    vi.advanceTimersByTime(10000);
    expect(t.input.mock.calls.length).toBe(calls);
    expect(t.onTap).not.toHaveBeenCalled();
    expect(t.frames.pending()).toBe(0);
  });
});
