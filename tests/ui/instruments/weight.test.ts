// @vitest-environment jsdom
/**
 * P10e-e Task 16: the weight instrument (docs/prototypes/weight.html). It plays her shifts from the engine's plan (telegraphed by her style's
 * lead), reports per beat a `hold` when it was held and level and an `uneven` with the beat's mean extra drain factor, and the commander's
 * own shift at once; Space and Shift typed into the field never act, the mouse does (the right button shifts while typing); two views by the
 * contact; her lines follow the engine (her heavier lean, a caught shift); the still form; the unmount leaves nothing; the stop word ends
 * the hold mid-weight; the core mounts in another host (ruling B).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { floorOf } from '../../../src/engine/backdrops';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resolveEnvOf, resolveSegment } from '../../../src/engine/physics/segment';
import { registerHoldsUntil, registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import type { ArtSlots } from '../../../src/ui/scene/art';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import { _weight, startWeight, weightFrame, weightMatches } from '../../../src/ui/scene/instruments/weight/weight';
import type { InstrumentEnv } from '../../../src/ui/scene/instruments/types';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // the page has no canvas: the kit's stand-in context
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSceneStage();
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation', 'pain_rough', 'explicit_scenes'];
/** A plan of 20 beats (30 s) with her shifts where asked (the cost of each), her attention `busy` unless given. */
function planOf(shifts: Record<number, number>, attention: 'busy' | 'glancing' | 'watching' = 'busy'): SegmentPlan {
  return { beats: Array.from({ length: 20 }, (_, i) => (shifts[i] !== undefined ? { attention, shift: shifts[i]!, cue: 'shift' as const } : { attention })) };
}

/** Ann rests her weight on the commander (a weight contact), one segment running in real time, with a scripted plan. */
function hold(contact = 'human_chair', plan = planOf({ 5: 20, 9: 20 }), location = 'quarters_commander'): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: location, participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
  expect(r.state.scene!.physics!.physicsId).toBe('weight');
  r.state.scene!.physics!.segment.plan = plan;
  return r.state;
}

function frames(step = 16) {
  let next = 1;
  let t = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => t,
    raf: (fn: FrameRequestCallback) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id: number) => { queue.delete(id); },
    frame(ms = step) {
      t += ms;
      vi.advanceTimersByTime(ms);
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(t);
    },
    pending: () => queue.size,
  };
}

/** A fake audio context that records every source it made and whether it was stopped. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const sources: Array<{ stopped: boolean }> = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const source = () => {
    const n = Object.assign(new EventTarget(), node(), { buffer: null as unknown, loop: false, playbackRate: param(), frequency: param(), type: '', stopped: false, start() {}, stop() { n.stopped = true; } });
    sources.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0, sampleRate: 100, state: 'running', destination: node(), resume() {},
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len), duration: 1 }),
    createBufferSource: source,
    createOscillator: source,
  };
  const samples = { play: vi.fn(), loop: vi.fn(), preload: async () => {}, buffer: () => null, ctx: () => ctx, bus: () => node(), setWorldDull: vi.fn(), setNight: vi.fn(), setMuffle: vi.fn(), setSensory: vi.fn(), dispose: vi.fn() };
  return { samples, sources };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; samples?: unknown; art?: ArtSlots; step?: number } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const onTap = vi.fn();
  const f = frames(over.step);
  const noop = (): [] => [];
  const staging = {
    input, endSegment: noop, stopWord: vi.fn(() => []), skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap } as never,
    frames: f,
    assetUrl: (p: string) => `/x/${p}`,
    ...(over.samples ? { samples: over.samples as never } : {}),
    ...(over.art ? { art: over.art } : {}),
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const mouse = (type: 'mousedown' | 'mouseup', target: EventTarget = frame, button = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button });
    target.dispatchEvent(e);
    return e;
  };
  /** The balance: the mouse at `x` of the frame's width (0 left … 1 right). */
  const balance = (x: number) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x * window.innerWidth }));
  const key = (type: 'keydown' | 'keyup', k: string, target: EventTarget = document.body) => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { host, screen, input, onTap, frames: f, q, to, mouse, balance, key, staging };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
const BEAT = 1500;

describe('the weight instrument: the pure helpers', () => {
  it('the bubble never diverges on a 200 ms frame (both springs in pieces of at most 8 ms)', () => {
    const t = draw(hold(), { step: 200 });
    t.balance(1); // the balance pulled hard to one side
    t.mouse('mousedown');
    for (let i = 0; i < 60; i++) {
      t.frames.frame(200);
      expect(Number.isFinite(_weight.G.ctl)).toBe(true);
      expect(Math.abs(_weight.G.ctl)).toBeLessThan(1.6);
      expect(Math.abs(_weight.G.bubbleX)).toBeLessThan(1.6);
      expect(_weight.G.str).toBeGreaterThanOrEqual(0);
    }
    expect(_weight.G.ctl).toBeCloseTo(1.15, 1); // it settles where the mouse says
  });

  it('the telegraph leads the shift by the style\'s time (neutral 650–850, cruel none), and the shift lands on its planned beat', () => {
    for (const [style, lo, hi] of [['neutral', 650, 850], ['affectionate', 900, 1100], ['ritual', 750, 750], ['cruel', 0, 0]] as const) {
      resetPhysicsHooks();
      registerPhysicsStyle(() => ({ primary: style }));
      const t = draw(hold('human_chair', planOf({ 6: 20 })));
      t.mouse('mousedown');
      let tele: { at: number; land: number; lean: number } | null = null;
      while (t.frames.now() < 7 * BEAT + 200) {
        t.frames.frame();
        const sh = _weight.G.shift;
        if (sh && !tele) tele = { at: t.frames.now(), land: sh.landAt - sh.teleAt, lean: _weight.G.leanTarget };
      }
      expect(tele, style).not.toBeNull();
      const lead = tele!.land - 30;
      expect(lead, style).toBeGreaterThanOrEqual(lo);
      expect(lead, style).toBeLessThanOrEqual(hi);
      // her lean shows the telegraph (none without one), and the shift lands as its beat's end is judged (I2)
      if (hi > 0) expect(Math.abs(tele!.lean), style).toBeGreaterThan(0.5);
      else expect(tele!.lean, style).toBe(0);
      expect(tele!.at, style).toBeGreaterThanOrEqual(7 * BEAT - hi - 32);
      expect(tele!.at, style).toBeLessThanOrEqual(7 * BEAT - lo + 32);
      expect(_weight.G.shifts, style).toBe(1);
      t.screen.dispose();
    }
  });

  it('ritual names her shift as it comes: the word or the side it really goes', () => {
    registerPhysicsStyle(() => ({ primary: 'ritual' }));
    const t = draw(hold('human_chair', planOf({ 6: 20 })));
    t.mouse('mousedown');
    t.to(7 * BEAT);
    const said = t.q('.alius-weight-hand')!.textContent ?? '';
    const target = _weight.G.shift?.target ?? _weight.G.copTarget;
    expect(said).toMatch(target < _weight.G.cop ? /shifting\.|left\./ : /shifting\.|right\./);
  });
});

describe('the weight instrument on the scene', () => {
  it('matches a hold physics with a capacity gauge (alone, or with a second that needs no input), read by field', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(weightMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('weight');
    expect(weightMatches({ ...p, physicsId: 'breath' } as PhysicsRun, s, reg)).toBe(false);
    expect(weightMatches({ ...p, second: { physicsId: 'breath', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    expect(weightMatches({ ...p, second: { physicsId: 'her_activity', gauge: 0, capacity: 100, streak: 0 } }, s, reg)).toBe(true);
    // breath with a weight as its second (`between_thighs`): neither instrument takes it, the card draws the pair
    const pair = { ...p, physicsId: 'breath', second: { physicsId: 'weight', gauge: 100, capacity: 100, streak: 0 } } as PhysicsRun;
    expect(instrumentFor(pair, s, reg, DEFAULT_SETTINGS)).toBeNull();
    // real time off (the setting or the campaign's mirror): the card
    expect(instrumentFor(p, s, reg, { ...DEFAULT_SETTINGS, physicsRealtime: false })).toBeNull();
  });

  it('draws in the effects layer, no card, no [data-analyze] over the play surface; the stop word stays', () => {
    const t = draw(hold());
    const box = t.q('.alius-layer-effects > .alius-weight');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.closest('[data-analyze]')).toBeNull();
    expect(box!.querySelector('[data-analyze]')).toBeNull();
    expect(t.q('.alius-weight-vial svg')).not.toBeNull();
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull();
  });

  it('inputs: every held beat reports hold; a tilted one is marked tilted and costs as uneven (Ruling S); her own shift at once; a slip sends no hold', () => {
    const t = draw(hold('human_chair', planOf({})));
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(3 * BEAT + 100);
    // the entry's beats (0, 1) are judged as the loop begins, beat 2 at its end: held and level
    expect(reports(t).filter((i) => i.kind === 'hold').map((i) => i.beat)).toEqual([0, 1, 2]);
    expect(t.input.mock.calls[0]![1]).toEqual({ pointer: true }); // the mouse: exempt from the typing lapse (ruling O)
    const uneven2 = reports(t).find((i) => i.kind === 'uneven' && i.beat === 2)!;
    expect(uneven2.amount).toBeLessThan(0.05); // level: nearly no extra drain (her own wander only)
    // beat 3 tilted: the balance hard right
    t.balance(1);
    t.to(4 * BEAT + 100);
    expect(reports(t).some((i) => i.kind === 'hold' && i.beat === 3)).toBe(true); // held: a tilt is never a slip (Ruling S)
    const uneven3 = reports(t).find((i) => i.kind === 'uneven' && i.beat === 3)!;
    expect(uneven3.amount).toBeGreaterThan(0.5); // 1.2 × (|err| − tol/2), err about 1.15 once the balance has gone
    expect(uneven3.part).toBe('tilted');
    expect(uneven2.part).toBeUndefined();
    // beat 5: level again, then let go mid-beat: a slip (no hold for the beat)
    t.balance(0.5);
    t.to(5 * BEAT + 400);
    t.mouse('mouseup', document);
    t.frames.frame();
    expect(_weight.G.slipThisBeat).toBe(true);
    t.to(5 * BEAT + 600);
    t.mouse('mousedown');
    t.to(6 * BEAT + 100);
    expect(reports(t).some((i) => i.kind === 'hold' && i.beat === 5)).toBe(false);
    expect(reports(t).some((i) => i.kind === 'hold' && i.beat === 4)).toBe(true);
    // her own shift: the right button, reported at once on its beat, then 2.6 s of cooldown
    t.to(7 * BEAT + 200);
    t.mouse('mousedown', t.q('.alius-layer-frame')!, 2);
    expect(reports(t).filter((i) => i.kind === 'shift_weight')).toEqual([{ beat: 7, kind: 'shift_weight' }]);
    t.to(8 * BEAT);
    t.mouse('mousedown', t.q('.alius-layer-frame')!, 2);
    expect(reports(t).filter((i) => i.kind === 'shift_weight')).toHaveLength(1); // still cooling down
    t.to(9 * BEAT + 600);
    t.key('keydown', 'Shift');
    expect(reports(t).filter((i) => i.kind === 'shift_weight').map((i) => i.beat)).toEqual([7, 9]);
    // each beat once: no beat and kind is sent twice
    const keys = reports(t).map((i) => `${i.beat}|${i.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Ruling S: the instrument and the engine agree: a tilted held beat is no engine slip, and the slips are the same count', () => {
    const plan = planOf({});
    const s = hold('human_chair', plan);
    const t = draw(s);
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(3 * BEAT);
    t.balance(1); // held, tilted for a few beats
    t.to(7 * BEAT);
    t.balance(0.5);
    t.to(9 * BEAT + 300);
    t.mouse('mouseup', document); // two slips: beats 9 and 10
    t.to(10 * BEAT + 700);
    t.mouse('mousedown');
    t.to(30_000);
    const r = resolveSegment(s.scene!.physics!, plan, reports(t), resolveEnvOf(s, reg, s.scene!.physics!));
    expect(r.slips).toBe(_weight.G.slips);
    expect(r.slips).toBe(2);
    expect(reports(t).filter((i) => i.kind === 'uneven' && i.part === 'tilted').length).toBeGreaterThanOrEqual(3);
  });

  it('I2: a shift that lands clean on screen is not charged by the engine; one that lands hard is, and by the same rule', () => {
    const plan = planOf({ 4: 20 });
    const s = hold('human_chair', plan);
    const t = draw(s);
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(30_000);
    expect(_weight.G).toMatchObject({ shifts: 1, cleanShifts: 1, hardShifts: 0 });
    // resolved from a deep gauge, so a whole segment's drain never reaches the floor and hides the cost
    const deep = (x: CampaignState): PhysicsRun => ({ ...x.scene!.physics!, gauge: 1000, capacity: 1000 });
    const env = resolveEnvOf(s, reg, s.scene!.physics!);
    const withShift = resolveSegment(deep(s), plan, reports(t), env).gauge;
    const without = resolveSegment(deep(s), planOf({}), reports(t), env).gauge;
    expect(withShift).toBe(without); // no charge on beat 4
    // tilted at the end of the shift's beat: hard on screen, and the engine takes the cost
    const s2 = hold('human_chair', plan);
    const u = draw(s2);
    u.balance(0.5);
    u.mouse('mousedown');
    u.to(4 * BEAT + 200);
    u.balance(1);
    u.to(5 * BEAT + 600);
    u.balance(0.5);
    u.to(30_000);
    expect(_weight.G).toMatchObject({ shifts: 1, cleanShifts: 0, hardShifts: 1 });
    const env2 = resolveEnvOf(s2, reg, s2.scene!.physics!);
    expect(resolveSegment(deep(s2), plan, reports(u), env2).gauge).toBeCloseTo(resolveSegment(deep(s2), planOf({}), reports(u), env2).gauge - 20, 10);
  });

  it('a shift on the segment\'s last beat lands after its flush, by the same rule', () => {
    const t = draw(hold('human_chair', planOf({ 19: 20 })));
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(30_000 - 200);
    expect(_weight.G).toMatchObject({ shifts: 1, cleanShifts: 1 });
  });

  it('I3: the entry\'s grace: beats that end before the first loop beat is over are never charged, held or not', () => {
    const plan = planOf({});
    const s = hold('human_chair', plan);
    const t = draw(s);
    t.balance(0.5);
    t.to(1800); // not holding through the entry
    t.mouse('mousedown');
    t.to(30_000);
    expect(reports(t).filter((i) => i.kind === 'hold').map((i) => i.beat).slice(0, 3)).toEqual([0, 1, 2]);
    expect(_weight.G.slips).toBe(0);
    const r = resolveSegment(s.scene!.physics!, plan, reports(t), resolveEnvOf(s, reg, s.scene!.physics!));
    expect(r.slips).toBe(0);
  });

  it('the last beat of the segment is flushed before its end (300 ms ahead)', () => {
    const t = draw(hold('human_chair', planOf({})));
    t.mouse('mousedown');
    t.to(30_000 - 280);
    expect(reports(t).some((i) => i.kind === 'hold' && i.beat === 19)).toBe(true);
    expect(reports(t).some((i) => i.kind === 'uneven' && i.beat === 19)).toBe(true);
    t.to(30_100);
    expect(reports(t).every((i) => i.beat < 20)).toBe(true);
  });

  it('a shift lands with the plan\'s cost when the hold was uneven: a crack, a jolt; level and held it lands clean', () => {
    const t = draw(hold('human_chair', planOf({ 4: 20, 8: 20 })));
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(5 * BEAT + 200);
    expect(_weight.G).toMatchObject({ shifts: 1, cleanShifts: 1, hardShifts: 0 });
    t.balance(1); // tilted when the next one lands
    t.to(9 * BEAT + 200);
    expect(_weight.G).toMatchObject({ shifts: 2, cleanShifts: 1, hardShifts: 1 });
    expect(t.q('.alius-weight-cracks')!.children.length).toBeGreaterThan(0);
  });

  it('a playful holder\'s feints: her shadow leans and comes back, between her planned shifts; every planned shift still lands', () => {
    let feints = 0;
    for (let n = 1; n <= 12; n++) {
      resetPhysicsHooks();
      registerPhysicsStyle(() => ({ primary: 'playful' }));
      const t = draw(hold('human_chair', planOf({ 6: 20, 12: 20, 18: 20 })));
      t.to(1000);
      _weight.seed(n);
      t.mouse('mousedown');
      let seen = 0;
      let last: unknown = null;
      while (t.frames.now() < 19 * BEAT + 200) {
        t.frames.frame();
        const sh = _weight.G.shift;
        if (sh && sh !== last && sh.feint) seen++;
        last = sh;
      }
      feints += seen;
      expect(_weight.G.shifts, `seed ${n}`).toBe(3); // the plan's three landed
      t.screen.dispose();
    }
    expect(feints).toBeGreaterThan(0);
  });

  it('keys: Space or Shift typed into the input never act; only the mouse acts while the field has focus (the right button shifts), and it keeps it', () => {
    const t = draw(hold('human_chair', planOf({})));
    t.to(2500);
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.focus();
    t.key('keydown', ' ', field);
    t.key('keydown', 'Shift', field);
    expect(_weight.HOLD.on).toBe(false);
    expect(reports(t).some((i) => i.kind === 'shift_weight')).toBe(false);
    const e = t.mouse('mousedown');
    expect(e.defaultPrevented).toBe(true);
    expect(_weight.HOLD.on).toBe(true);
    expect(document.activeElement).toBe(field);
    t.key('keyup', ' ', field); // a space typed while the mouse bears her lets nothing go
    expect(_weight.HOLD.on).toBe(true);
    t.mouse('mouseup', document);
    expect(_weight.HOLD.on).toBe(false);
    t.mouse('mousedown', t.q('.alius-layer-frame')!, 2);
    expect(reports(t).filter((i) => i.kind === 'shift_weight')).toHaveLength(1);
    expect(document.activeElement).toBe(field);
    // a press on the scene's UI is not a hold
    t.mouse('mousedown', t.q('.alius-stage-dial .alius-stop-pill')!);
    expect(_weight.HOLD.on).toBe(false);
    // off the field, Space bears her and Shift shifts
    field.blur();
    t.to(6000);
    t.key('keydown', ' ');
    expect(_weight.HOLD.on).toBe(true);
    t.key('keyup', ' ');
    expect(_weight.HOLD.on).toBe(false);
    t.key('keydown', 'Shift');
    expect(reports(t).filter((i) => i.kind === 'shift_weight')).toHaveLength(2);
    t.key('keydown', 't');
    expect(t.onTap).toHaveBeenCalledTimes(1); // P15a's tap, as the card's TAP
  });

  it('her lines follow the engine: her heavier lean when her pressure rises (a model-worded press in its place), her caught line once the engine caught the shift', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const s = hold('human_chair', planOf({}));
    const t = draw(s, { staging: { voiced: (k: string) => (k === 'press' ? 'more of me now' : null) } });
    t.to(900);
    expect(t.q('.alius-weight-hand')!.textContent).toContain('hold still. I’m reading.'); // her first words, by the contact
    t.to(3000);
    s.scene!.physics!.pressure = 1.25;
    t.screen.refresh();
    expect(t.q('.alius-weight-hand')!.textContent).toContain('more of me now');
    // her own shift taken: nothing said until the engine decides (at the segment's end); then her line
    t.mouse('mousedown', t.q('.alius-layer-frame')!, 2);
    t.to(3500);
    expect(t.q('.alius-weight-hand')!.textContent).not.toContain('did I say you could move?');
    s.scene!.physics!.tally = { cheatsCaught: 1 };
    t.screen.refresh();
    expect(t.q('.alius-weight-hand')!.textContent).toContain('did I say you could move?');
    t.screen.refresh();
    expect((t.q('.alius-weight-hand')!.textContent!.match(/did I say/g) ?? []).length).toBe(1); // once per catch
    expect(t.q('.alius-weight-hand')!.textContent).not.toContain('her '); // the cue pool's narration is never in her hand
  });

  it('Ruling R: cold is silent on every kind, her first words too; a style with no rows of its own takes neutral\'s', () => {
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const t = draw(hold('human_chair', planOf({})));
    t.to(2000);
    expect(_weight.R.lines.entry).toEqual([]);
    for (const k of ['released', 'slip', 'caught', 'heavy', 'good', 'poor', 'fall', 'stop', 'longer', 'announce']) expect(_weight.R.lines[k], k).toEqual([]);
    t.to(3500);
    t.mouse('mouseup', document);
    t.to(5000);
    expect(_weight.G.slips).toBeGreaterThan(0);
    expect(t.q('.alius-weight-hand')!.textContent).toBe('');
    t.screen.dispose();
    resetPhysicsHooks();
    registerPhysicsStyle(() => ({ primary: 'possessive' }));
    draw(hold('human_chair', planOf({})));
    expect(_weight.R.lines.entry).toEqual(['hold still. I’m reading.']);
    expect(_weight.R.lines.slip).toEqual(['careful.']);
  });

  it('views by the contact: face down sees the floor (P10c, by the finish), with her legs for human_chair only; face up the ceiling and her sprite', () => {
    const s = hold('human_chair');
    expect(floorOf(s, reg, 'quarters_commander', ANN)[0]!.file).toMatch(/floor_wood\.webp$/);
    expect(floorOf(s, reg, 'nowhere', null)).toEqual([]);
    const t = draw(s);
    t.to(2500);
    expect(_weight.R).toMatchObject({ face: 'down', legs: true });
    expect(t.q('.alius-weight-floor')!.style.backgroundImage).toContain('/x/content/core/art/backdrops/floor_wood.webp');
    expect(Number(t.q('.alius-weight-floorView')!.style.opacity)).toBeGreaterThan(0.9);
    expect(Number(t.q('.alius-weight-upView')!.style.opacity)).toBe(0);
    t.screen.dispose();
    draw(hold('footrest'));
    expect(_weight.R).toMatchObject({ face: 'down', legs: false });
    resetSceneStage();
    const u = draw(hold('boot_on_chest'));
    u.to(2500);
    expect(_weight.R.face).toBe('up');
    expect(u.q('.alius-weight-ceiling')!.style.backgroundImage).toContain('ceiling_room_1.webp');
    expect(Number(u.q('.alius-weight-upView')!.style.opacity)).toBeGreaterThan(0.9);
    expect(u.q('.alius-weight-her')!.style.opacity).toBe('1');
  });

  it('fallback: no art slot → her sprite rises from the bottom edge; with `over` the picture is drawn with its fit; a floor that fails gives the room', async () => {
    const t = draw(hold('boot_on_chest'));
    expect((t.q('.alius-weight-over') as HTMLImageElement).style.display).toBe('none');
    t.screen.dispose();
    const art: ArtSlots = { get: (_u, slot) => (slot === 'over' ? { url: '/art/over.png', sidecar: { fit: { height: 1.2, x: 0.45, sink: 0.05 } } } : null), face: () => ({ x: 0.4, y: 0.2 }) };
    const o = draw(hold('boot_on_chest'), { art });
    const over = o.q('.alius-weight-over') as HTMLImageElement;
    expect(over.getAttribute('src')).toBe('/art/over.png');
    expect(over.style.display).toBe('');
    expect(_weight.S).toMatchObject({ overH: 1.2, overX: 0.45, overSink: 0.05, face: { x: 0.4, y: 0.2 } });
    over.dispatchEvent(new Event('error'));
    expect(over.style.display).toBe('none'); // a picture that fails: her sprite again
    o.screen.dispose();
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_v: string) { queueMicrotask(() => this.onerror?.()); } });
    const f = draw(hold('human_chair'));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.q('.alius-weight-floor')!.dataset.fallback).toBe('room');
  });

  it('reduced motion and readable mode: the still form (no tremble, no wander, no blur, cracks drawn at once)', () => {
    const t = draw(hold('human_chair', planOf({ 4: 20 })), { settings: { reducedMotion: true, readableMode: true } });
    t.balance(1);
    t.mouse('mousedown');
    t.to(5 * BEAT + 300); // a hard landing: a crack and a jolt
    const world = t.q('.alius-weight-world')!.style.transform;
    expect(world).toMatch(/^translate\(0\.0px, [0-9.-]+px\)/); // no tremble (the sag stays: it is the slip itself)
    for (const sel of ['.alius-weight-floor', '.alius-weight-world']) expect(t.q(sel)!.style.filter).not.toMatch(/blur\((?!0px)/);
    expect(t.q('.alius-weight')!.hasAttribute('data-reduced')).toBe(true);
    expect(t.q('.alius-weight')!.hasAttribute('data-readable')).toBe(true);
    const paths = [...t.q('.alius-weight-cracks')!.querySelectorAll('path')];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.style.strokeDashoffset === '0')).toBe(true);
    expect(_weight.S.reduced).toBe(true);
  });

  it.each([
    ['a stage reset', () => resetSceneStage()],
    ['dispose', (t: ReturnType<typeof draw>) => t.screen.dispose()],
    ['the stop word (the run gone, stopped)', (t: ReturnType<typeof draw>, s: CampaignState) => { delete s.scene!.physics; t.screen.refresh(); }],
  ])('unmount (%s): no frame, timer, audio source or listener stays; the frame and the input are put back; nothing is sent afterwards', async (_what, end) => {
    const audio = fakeAudio();
    const s = hold('human_chair', planOf({ 4: 20 }));
    const stopped = vi.fn(() => []);
    const t = draw(s, { samples: audio.samples, staging: { outcome: () => ({ runId: 'p1', physicsId: 'weight', result: 'stopped' }), stopWord: stopped } });
    const reply = t.q('.alius-reply-host, [role="log"]')!;
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    const before = reply.style.opacity;
    t.balance(1);
    t.mouse('mousedown');
    t.to(5 * BEAT + 300);
    expect(reply.style.opacity).toBe('0.4');
    expect(audio.sources.length).toBeGreaterThan(0);
    expect(field.dataset.weightLetters).toBe('');
    end(t, s);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-weight')).toBeNull();
    expect(t.q('.alius-weight-mirror')).toBeNull();
    expect(field.dataset.weightLetters).toBeUndefined();
    expect(reply.style.opacity).toBe(before);
    expect(audio.sources.every((n) => n.stopped)).toBe(true);
    expect(t.frames.pending()).toBe(0);
    expect(_weight.HOLD.on).toBe(false);
    const sent = t.input.mock.calls.length;
    t.mouse('mouseup', document);
    t.key('keydown', ' ');
    t.key('keydown', 'Shift');
    t.mouse('mousedown');
    t.mouse('mousedown', t.q('.alius-layer-frame') ?? document.body, 2);
    vi.advanceTimersByTime(20_000);
    t.frames.frame();
    expect(t.input.mock.calls.length).toBe(sent);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('the stop word mid-weight: the pill stays on top and ends the hold at once; the instrument is gone, its end never plays', async () => {
    const s = hold('human_chair', planOf({ 4: 20 }));
    const t = draw(s, {
      staging: {
        stopWord: vi.fn(() => { delete s.scene!.physics; t.screen.refresh(); return []; }),
        outcome: () => ({ runId: 'p1', physicsId: 'weight', result: 'stopped' }),
      },
    });
    t.mouse('mousedown');
    t.to(4 * BEAT + 100);
    expect(t.q('.alius-weight')).not.toBeNull();
    const pill = t.q('.alius-stage-dial [data-stop-word]')!;
    expect(pill.closest('.alius-layer-effects')).toBeNull();
    pill.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-weight')).toBeNull();
    expect(t.frames.pending()).toBe(0);
  });

  /** Ann lets go at the segment's end, or the hold ends mid-segment; `gauge` is the engine's at the segment's start (of 1000). */
  const ending = async (opts: { holds: 'signal' | 'limit'; gauge: number; at: number; result: string; tap?: boolean; tally?: Record<string, number> }) => {
    resetPhysicsHooks();
    registerHoldsUntil(() => opts.holds);
    const s = hold('human_chair', planOf({ 1: 20 })); // one shift, landing clean at 3.03 s (her verdict reads the share of clean landings)
    Object.assign(s.scene!.physics!, { gauge: opts.gauge, capacity: 1000 });
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'weight', result: opts.result, ...(opts.tally ? { tally: opts.tally } : {}) }) } });
    t.balance(0.5);
    t.mouse('mousedown');
    t.to(opts.at);
    if (opts.tap) t.key('keydown', 't');
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(_weight.G.phase).toBe('exit');
    t.to(opts.at + 1000);
    const line = t.q('.alius-weight-hand .her-line.big')?.textContent ?? '';
    t.to(opts.at + 2700);
    expect(t.q('.alius-weight')).toBeNull(); // the host unmounts after the exit
    t.screen.dispose();
    return line;
  };

  it('I5: her end line follows the engine: released at her limit by her holdsUntil on the engine\'s gauge, else her verdict; a buckle is her fall', async () => {
    // a segment of 20 beats drains 160 of 1000: from 300 the engine's share is 0.14, at a signal holder's 15 % (her release); a limit holder (5 %) goes on
    expect(await ending({ holds: 'signal', gauge: 300, at: 30_050, result: 'released' })).toBe('enough. you’re shaking.');
    // ended mid-segment with strength to spare (her contact taken away): her verdict, its slips the engine's tally
    expect(await ending({ holds: 'signal', gauge: 900, at: 3500, result: 'released' })).toBe('good. steady.');
    expect(await ending({ holds: 'signal', gauge: 900, at: 3500, result: 'released', tally: { slips: 3 } })).toBe('wobbly.');
    // the commander tapped and she let go (a signal holder): released
    expect(await ending({ holds: 'signal', gauge: 900, at: 3500, result: 'released', tap: true })).toBe('enough. you’re shaking.');
    expect(await ending({ holds: 'limit', gauge: 300, at: 3000, result: 'limit_broken' })).toBe('…really?');
  });
});

describe('ruling B: the core inside another instrument', () => {
  it('draws the level, her lines and the cracks into the host given, with no view of its own, and reports as the full mount', () => {
    const s = hold('human_chair', planOf({}));
    const t = draw(s, { settings: { physicsRealtime: false } }); // the card draws: the outer instrument stands in for it here
    expect(t.q('.alius-weight')).toBeNull();
    const outer = h('div', { class: 'outer' });
    t.q('.alius-layer-effects')!.append(outer);
    const env: InstrumentEnv = {
      root: t.q('.alius-scene')!, layers: {
        pose: t.q('.alius-layer-pose')!, effects: t.q('.alius-layer-effects')!, moment: t.q('.alius-layer-moment')!, frame: t.q('.alius-layer-frame')!,
        backdrop: t.q('.alius-layer-backdrop')!, sprites: t.q('.alius-layer-sprites')!,
      },
      input: t.q('input[name="cmd"]')!, reply: t.q('[role="log"]')!, gauge: { clear() {} } as never,
      spriteOf: () => null, setSprite() {}, faceOf: () => 'neutral', spriteUrl: async () => null, state: () => s, registries: reg, settings: () => DEFAULT_SETTINGS,
      staging: t.staging as never, samples: null, art: { get: () => null, face: () => null }, her: () => ({ unitId: ANN, name: 'Ann', accent: '#8cc8f0', hand: '', handScale: 1, style: 'neutral' }),
      say: () => h('div'), now: () => t.frames.now(), raf: (fn) => t.frames.raf(fn), cancelRaf: (id) => t.frames.cancelRaf(id),
      timeout: (fn, ms) => { const x = setTimeout(fn, ms); return () => clearTimeout(x); },
      listen: (target, type, fn, opts) => { target.addEventListener(type, fn, opts); return () => target.removeEventListener(type, fn, opts); },
      reduced: false, readable: false,
    };
    const core = startWeight(env, s.scene!.physics!, { host: outer, core: true });
    const box = outer.querySelector<HTMLElement>(':scope > .alius-weight[data-core]')!;
    expect(box).not.toBeNull();
    expect(box.querySelector('.alius-weight-vial svg')).not.toBeNull();
    t.mouse('mousedown');
    t.to(3 * BEAT + 100);
    expect(reports(t).filter((i) => i.kind === 'hold').map((i) => i.beat)).toEqual([0, 1, 2]);
    const fr = weightFrame();
    expect(fr.cam).toBe(1);
    expect(Number.isFinite(fr.tilt)).toBe(true);
    core.stop();
    expect(outer.querySelector('.alius-weight')).toBeNull();
    expect(t.q('.alius-weight-mirror')).toBeNull();
  });
});
