// @vitest-environment jsdom
/**
 * P10e-e Task 20: the jaw instrument (docs/prototypes/jaw.html). The cost of the opening is the prototype's (0.35 resting on her toes or the
 * ring, rising to 1 over 0.25 more and by 1.4 per 0.4 beyond); speech through the opening is `speak` (a table run from the prototype's own
 * function); "wider." never asks past 0.9. On the scene: the input line is the mouth (its height is the jaw, her band beside it); per beat of a
 * running segment the mean cost is reported (`bite`), a touch of the teeth as a teeth `bite`, a rest asked as `ask_rest` (one a segment);
 * her moves are the plan's; the line sent is the heard line, and without the jaw the line goes out as typed; Space and Shift typed into the
 * field never act, the right button does; her sprite stands in for the foot art; the still form; the unmount leaves nothing; the stop word
 * stays reachable and ends the hold.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import { resolveEnvOf, resolveSegment } from '../../../src/engine/physics/segment';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { limitSentences, THROUGH_THE_RING } from '../../../src/blocking/directives';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import { _jaw, jawContactOf, jawMatches, RELAXED, WIDE_MAX } from '../../../src/ui/scene/instruments/jaw/jaw';
import { speakWord } from '../../../src/ui/scene/instruments/jaw/speech';
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // the page has no canvas: a context that draws nothing
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
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation', 'explicit_scenes'];
const BEAT = 1500;
const quietPlan = (n = 20): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention: 'watching' as const })) });

/** Ann's toes in the commander's mouth (`toes`), or the commander ring-gagged in her presence (`ring`), one segment running in real time. */
function hold(source: 'toes' | 'ring' = 'toes', plan = quietPlan()): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  if (source === 'toes') setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'sole_to_mouth', with: COMMANDER }, { at: 3, source: 'chip' });
  else setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, { at: 3, source: 'engine' });
  expect(st.scene!.physics?.physicsId).toBe('jaw');
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: st.scene!.physics!.id } });
  expect(errors(r.events)).toEqual([]);
  r.state.scene!.physics!.segment.plan = plan;
  return r.state;
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

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; samples?: unknown } = {}) {
  const send = vi.fn((_t: string) => new Promise<boolean>(() => {}));
  const controller = {
    send, propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input, endSegment: noop, stopWord: vi.fn(() => []), skip: noop, act: noop, finishCounted: noop, stimulus: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: BEAT, now: f.now() }), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() } as never,
    frames: f,
    assetUrl: (p: string) => `/x/${p}`,
    ...(over.samples ? { samples: over.samples as never } : {}),
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const field = q('input[name="cmd"]') as HTMLInputElement;
  const pointer = (type: 'pointerdown' | 'pointerup' | 'pointermove', target: EventTarget = frame, button = 0, clientY = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientY });
    target.dispatchEvent(e);
    return e;
  };
  const key = (type: 'keydown' | 'keyup', k: string, target: EventTarget = document.body) => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  const type = (text: string) => { for (const ch of text) key('keydown', ch, field); };
  return { host, screen, input, send, frames: f, q, to, pointer, key, type, field, staging };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
const handText = (t: ReturnType<typeof draw>) => t.q('.alius-jaw-hand')!.textContent;

describe('the jaw instrument: the pure helpers', () => {
  it('the cost of the opening: resting on her toes is the prototype\'s RELAXED (0.35, the plan\'s "⅓"), wide open the most (1.945)', () => {
    draw(hold(), { settings: { reducedMotion: true } }).to(32);
    const at = (jaw: number) => { const G = _jaw.G; G.jaw = jaw; G.v = 0; G.target = jaw; G.resting = 0; _jaw.update(0); return G.cost!; };
    expect(RELAXED).toBe(0.35);
    expect(at(0.42)).toBeCloseTo(0.35, 10); // on her toes (0.42 + push 0), within the resting zone
    expect(at(0.42 + 0.06 + 0.125)).toBeCloseTo(0.35 + 0.65 * 0.5, 10); // half way up the costly zone
    expect(at(1)).toBeCloseTo(0.35 + 0.65 + 1.4 * (1 - 0.42 - 0.06 - 0.25) / 0.4, 10); // wide open: the maximum
    for (const j of [0, 0.3, 0.5, 0.7, 0.9]) expect(at(j)).toBeLessThan(at(1));
    // the ring: the ring is the resting floor
    resetSceneStage();
    draw(hold('ring'), { settings: { reducedMotion: true } }).to(32);
    expect(at(0.55)).toBeCloseTo(0.35, 10);
  });

  it('speech: "please" through the ring at .9, at .55 and at .4 comes out as the prototype\'s own function gives it', () => {
    // run from jaw.html's `__speak` (fatigue 0: no doubling)
    expect(speakWord('please', 0.9)).toBe('haaaha');
    expect(speakWord('please', 0.55)).toBe('haeahe');
    expect(speakWord('please', 0.4)).toBe('hlease');
    expect(speakWord('Please', 0.9)).toBe('Haaaha');
    expect(speakWord('kiss', 0.9)).toBe('ghahh');
    expect(speakWord('mine', 0.55)).toBe('hinge');
  });

  it('"wider." never asks past 0.9, however deep her toes are pushed', () => {
    draw(hold()).to(32);
    const G = _jaw.G;
    G.order = 'wide';
    for (const push of [-0.1, 0, 0.1, 0.2, 0.28, 0.35]) {
      G.push = push;
      const [lo, hi] = _jaw.bandNow()!;
      expect(hi!, `push ${push}`).toBeLessThanOrEqual(WIDE_MAX);
      expect(lo!, `push ${push}`).toBeLessThan(hi!);
    }
    resetSceneStage();
    draw(hold('ring')).to(32);
    _jaw.G.order = 'wide';
    expect(_jaw.bandNow()).toEqual([0.76, 0.9]);
    _jaw.G.order = null;
    expect(_jaw.bandNow()).toBeNull();
  });
});

describe('the jaw instrument on the scene', () => {
  it('matches the jaw held open by her toes or by an item worn in the mouth (read by field); another jaw or a pair with an active second is the card\'s', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(jawMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('jaw');
    const ring = hold('ring').scene!.physics!;
    expect(ring).toMatchObject({ sourceKind: 'item', sourceId: 'ring_gag' });
    expect(jawContactOf(ring, reg)).toBe('ring_gag');
    expect(jawMatches(ring, s, reg)).toBe(true);
    expect(jawContactOf({ sourceKind: 'contact', sourceId: 'oral_service' }, reg)).toBeNull(); // not here (P17b's)
    expect(jawMatches({ ...p, sourceId: 'oral_service' } as PhysicsRun, s, reg)).toBe(false);
    expect(jawMatches({ ...p, second: { physicsId: 'breath', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    expect(jawMatches({ ...p, second: { physicsId: 'her_activity', gauge: 0, capacity: 100, streak: 0 } }, s, reg)).toBe(true);
    expect(jawMatches({ ...p, physicsId: 'saturation' } as PhysicsRun, s, reg)).toBe(false);
  });

  it('draws in the effects layer, no card, no [data-analyze] on the play surface; the mouth is the input line; the stop word stays', () => {
    const t = draw(hold());
    const box = t.q('.alius-layer-effects > .alius-jaw');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.closest('[data-analyze]')).toBeNull();
    expect(box!.querySelector('[data-analyze]')).toBeNull();
    expect(t.q('.alius-input-line > .alius-jaw-mirror')).not.toBeNull();
    expect(t.q('.alius-input-line > .alius-jaw-clip > .alius-jaw-hinge.l')).not.toBeNull();
    expect(t.q('.alius-stage-input > .alius-jaw-band')).not.toBeNull();
    t.to(200);
    const line = t.q('.alius-input-line')!;
    _jaw.G.jaw = 1; t.to(232);
    expect(parseFloat(line.style.height)).toBeGreaterThan(100); // the mouth opens with the jaw
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull();
  });

  it('her first words are hers by what holds the mouth open; ruling R: cold is silent', () => {
    const t = draw(hold());
    t.to(100);
    expect(handText(t)).toBe('open.');
    resetSceneStage();
    const r = draw(hold('ring'));
    r.to(100);
    expect(handText(r)).toBe('there. keep it open.');
    resetSceneStage();
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const c = draw(hold());
    c.to(5000);
    _jaw.move({ order: 'suck', orderMs: 5000 });
    c.to(5600);
    expect(handText(c)).toBe('');
    expect(_jaw.G.order).toBe('suck'); // her order still comes
  });

  it('inputs: per beat the mean cost of the opening (bite, the mouse: pointer); the teeth on her as a teeth bite', () => {
    const t = draw(hold());
    // the jaw held resting on her toes: every beat costs RELAXED
    _jaw.aim(0.42 + 0.04 + 0.03); // the spring settles just above her floor (the fatigue's pull is 0.04 at rest)
    t.to(3 * BEAT + 20);
    const bites = reports(t).filter((i) => i.kind === 'bite' && i.part === undefined);
    expect(bites.map((i) => i.beat)).toEqual([0, 1, 2]);
    expect(bites[2]!.amount).toBeGreaterThan(0.3);
    expect(bites[2]!.amount).toBeLessThan(0.5);
    expect(t.input.mock.calls.find((c) => (c[0] as SegmentInput).kind === 'bite')![1]).toEqual({ pointer: true });
    // wide open costs more
    _jaw.aim(1.3);
    t.to(6 * BEAT + 20);
    const wide = reports(t).filter((i) => i.kind === 'bite' && i.beat === 5)[0]!;
    expect(wide.amount!).toBeGreaterThan(1.2);
    // the jaw drops under her band: the teeth touch her once a dip (a slip), and her word
    _jaw.aim(0);
    t.to(7 * BEAT);
    const teeth = reports(t).filter((i) => i.part === 'teeth');
    expect(teeth).toHaveLength(1);
    expect(_jaw.G.stats.teeth).toBe(1);
    expect(handText(t)).toMatch(/teeth\.|careful\./);
    // the last beats are flushed 300 ms before the segment's end (30 s)
    _jaw.aim(0.5);
    t.to(30_000 - 290);
    expect(reports(t).filter((i) => i.kind === 'bite' && i.part === undefined).map((i) => i.beat)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('her moves are the plan\'s: an order on its beat (her line, or the model\'s words for that beat), held for its length', () => {
    const plan = quietPlan();
    plan.beats[2] = { attention: 'watching', order: 'suck', orderMs: 5000, cue: 'suck' };
    plan.beats[8] = { attention: 'watching', order: 'wider', orderMs: 3000, cue: 'wider' };
    const t = draw(hold('toes', plan), { staging: { voiced: (k: string, b: number) => (k === 'wider' && b === 8 ? 'open up for me.' : null) } as never });
    t.to(2 * BEAT + 50);
    expect(_jaw.G.order).toBe('suck');
    expect(handText(t)).toContain('suck.');
    t.to(2 * BEAT + 5100);
    expect(_jaw.G.order).toBeNull();
    t.to(8 * BEAT + 50);
    expect(_jaw.G.order).toBe('wide');
    expect(handText(t)).toContain('open up for me.');
  });

  it('the rest: the right button held 550 ms asks (pointer); one reaches the engine a segment, her answer the engine\'s (cruel: no)', () => {
    const t = draw(hold());
    t.to(1000);
    t.pointer('pointerdown', undefined, 2);
    t.to(1700);
    t.pointer('pointerup', document, 2);
    const asks = () => reports(t).filter((i) => i.kind === 'ask_rest');
    expect(asks()).toHaveLength(1);
    expect(t.input.mock.calls.find((c) => (c[0] as SegmentInput).kind === 'ask_rest')![1]).toEqual({ pointer: true });
    t.to(2300);
    expect(_jaw.G.resting).toBeGreaterThan(0);
    expect(handText(t)).toContain('fine. rest.');
    // Ruling V: a second rest in the same segment is dropped at once with a visible cue (the ring flashes `dropped`), never asked later
    t.to(7000);
    t.pointer('pointerdown', undefined, 2);
    t.to(7700);
    expect(t.q('.alius-jaw-rest')!.classList.contains('dropped')).toBe(true);
    t.pointer('pointerup', document, 2);
    expect(asks()).toHaveLength(1);
    expect(_jaw.G.resting).toBeLessThanOrEqual(0);
    t.to(8600);
    expect(t.q('.alius-jaw-rest')!.classList.contains('dropped')).toBe(false);
    _jaw.R.seg!.startedAt = -1; // a new segment begins (its clock moved): the dropped rest is not asked unbidden
    t.to(9000);
    expect(asks()).toHaveLength(1);
    // cruel: refused
    resetSceneStage();
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const c = draw(hold());
    c.to(1000);
    c.pointer('pointerdown', undefined, 2);
    c.to(2300);
    expect(reports(c).filter((i) => i.kind === 'ask_rest')).toHaveLength(1);
    expect(_jaw.G.resting).toBe(0);
    expect(handText(c)).toMatch(/no\.|earn it\./);
  });

  it('Ruling V: after a granted rest the fatigue on screen and the engine\'s gauge agree at the segment\'s end (no jump at the next)', () => {
    const s = hold();
    const t = draw(s);
    _jaw.aim(0.5); // resting on her toes: the gauge stays well under the capacity (neither side clamps)
    t.to(4000);
    t.pointer('pointerdown', undefined, 2);
    t.to(4700);
    t.pointer('pointerup', document, 2);
    t.to(30_000 - 290); // the last beats flushed
    const p = s.scene!.physics!;
    const gauge = resolveSegment(p, p.segment.plan!, reports(t), resolveEnvOf(s, reg, p)).gauge;
        expect(_jaw.G.stats.restsGranted).toBe(1);
    expect(Math.abs((100 * gauge) / p.capacity - _jaw.G.f)).toBeLessThan(1.5);
  });

  it('M1: text already in the field at the mount, and an input method\'s text, come out of the mouth too', async () => {
    const s = hold('ring');
    const t = draw(s, { settings: { reducedMotion: true } });
    t.to(300);
    // an input method writes into the field (no key of its own reaches onType)
    _jaw.G.jaw = 0.9; _jaw.G.target = 0.94; _jaw.G.v = 0;
    t.field.value = 'please';
    t.field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.field.value).toBe('');
    expect(t.q('.alius-jaw-mirror')!.textContent).toBe('haaaha');
    t.key('keydown', 'Enter', t.field);
    expect(t.send).toHaveBeenCalledWith('haaaha');
    // a line left in the field before the jaw: spoken through the opening as the jaw mounts
    const held = s.scene!.physics!;
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-jaw')).toBeNull();
    t.field.value = 'please';
    s.scene!.physics = held;
    t.screen.refresh();
    expect(t.q('.alius-jaw')).not.toBeNull();
    expect(t.field.value).toBe('');
    expect(t.q('.alius-jaw-mirror')!.textContent).toHaveLength(6);
  });

  it('keys: Space and Shift typed into the field never act (a space and a capital); only the right button asks while it has the focus', () => {
    const t = draw(hold('ring'));
    t.to(500);
    t.field.focus();
    t.key('keydown', 'Shift', t.field);
    t.key('keydown', ' ', t.field);
    t.to(1400);
    expect(_jaw.G.restKey).toBeFalsy();
    expect(reports(t).filter((i) => i.kind === 'ask_rest')).toHaveLength(0);
    t.key('keyup', 'Shift', t.field);
    const e = t.pointer('pointerdown', undefined, 2);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(t.field);
    t.to(2100);
    expect(reports(t).filter((i) => i.kind === 'ask_rest')).toHaveLength(1);
    t.pointer('pointerup', document, 2);
    // the keyboard asks when the field does not have the focus
    t.field.blur();
    t.to(9000);
    t.key('keydown', 'Shift');
    expect(_jaw.G.restKey).toBe(true);
    t.key('keyup', 'Shift');
    expect(_jaw.G.restKey).toBe(false);
  });

  it('the line sent is the heard line: each letter through the opening it was typed at; the clear share stays in the summary', () => {
    const t = draw(hold('ring'), { settings: { reducedMotion: true } });
    t.to(500);
    _jaw.G.jaw = 0.9; _jaw.G.target = 0.9 + 0.04; _jaw.G.v = 0;
    t.field.focus();
    t.type('please');
    expect(t.q('.alius-jaw-mirror')!.textContent).toBe('haaaha');
    expect(t.field.value).toBe(''); // the letters are the mouth's, not the field's
    t.key('keydown', 'Enter', t.field);
    expect(t.send).toHaveBeenCalledWith('haaaha');
    expect(_jaw.G.stats.said).toBe(1);
    expect(_jaw.R.kept).toHaveLength(1);
    expect(_jaw.R.kept[0]).toBeCloseTo(4 / 6, 10); // p, l, a, s came out as the ring allows; both e went flat past it (UI only)
    // a backspace takes the last letter back
    t.type('ab');
    t.key('keydown', 'Backspace', t.field);
    expect(t.q('.alius-jaw-mirror')!.textContent).toHaveLength(1);
  });

  it('M5: with the ring in a real-time jaw the scene directive says what comes out clearly is understood (her fair listening), not "cannot be understood"', () => {
    const s = hold('ring');
    const text = limitSentences(s, reg).join(' ');
    expect(text).toContain(THROUGH_THE_RING);
    expect(text).not.toContain('cannot be understood');
    s.settings.physicsRealtime = false; // turn-based: the item's own limit
    expect(limitSentences(s, reg).join(' ')).toContain('cannot be understood');
  });

  it('without the jaw the scene sends the line as it was typed', () => {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    const t = draw(st);
    expect(t.q('.alius-jaw')).toBeNull();
    t.field.value = 'please';
    t.key('keydown', 'Enter', t.field);
    expect(t.send).toHaveBeenCalledWith('please');
  });

  it('her toes: no speech, every key a muffled sound; her slack line after it', () => {
    const t = draw(hold());
    t.to(3000);
    t.field.focus();
    t.type('yes');
    expect(t.q('.alius-jaw-mirror')!.textContent).toMatch(/^[mh]{3}$/);
    t.key('keydown', 'Enter', t.field);
    expect(t.send.mock.calls[0]![0]).toMatch(/^[mh]{3}$/);
    t.to(3700);
    expect(handText(t)).toContain('don’t let it close.');
  });

  it('fallback: no foot art, her sprite from below (the scene\'s picture); the foot stays hidden', () => {
    const t = draw(hold());
    t.to(200);
    expect(t.q('.alius-jaw-foot')!.style.display).toBe('none');
    const her = t.q('.alius-jaw-her') as HTMLImageElement;
    const scene = t.q('.alius-sprites img');
    if (scene?.getAttribute('src')) expect(her.getAttribute('src')).toBe(scene.getAttribute('src'));
    expect(t.q('.alius-jaw')).not.toBeNull();
  });

  it('reduced motion and readable mode: the still form (no tremble, no jolt sideways, no blur)', () => {
    const t = draw(hold(), { settings: { reducedMotion: true, readableMode: true } });
    _jaw.G.f = 90;
    t.to(600);
    expect(t.q('.alius-input-line')!.style.transform).toBe('translate(0.0px, 0.0px)'); // no tremble (and no lift: jsdom lays nothing out)
    expect(t.q('.alius-jaw-world')!.style.transform).toMatch(/^translate\(0\.0px,/);
    expect(t.q('.alius-jaw-backdrop')!.style.filter).not.toMatch(/blur\((?!0px)/);
    expect(t.q('.alius-jaw-mirror')!.style.filter).not.toMatch(/blur\((?!0px)/);
    expect(t.q('.alius-jaw')!.hasAttribute('data-reduced')).toBe(true);
    expect(t.q('.alius-jaw')!.hasAttribute('data-readable')).toBe(true);
  });

  it.each([
    ['a stage reset', (_t: ReturnType<typeof draw>) => resetSceneStage()],
    ['dispose', (t: ReturnType<typeof draw>) => t.screen.dispose()],
    ['the stop word (the run gone, stopped)', (t: ReturnType<typeof draw>, s: CampaignState) => { delete s.scene!.physics; t.screen.refresh(); }],
  ])('unmount (%s): no frame, timer, audio source or listener stays; the mouth and the field are put back; nothing is sent afterwards', async (_what, end) => {
    const audio = fakeAudio();
    const s = hold('ring');
    const stopped = vi.fn(() => []);
    const t = draw(s, { samples: audio.samples, staging: { outcome: () => ({ runId: 'p1', physicsId: 'jaw', result: 'stopped' }), stopWord: stopped } as never });
    const line = t.q('.alius-input-line')!;
    const frame = t.q('.alius-layer-frame')!;
    const before = { line: line.getAttribute('style') ?? '', cursor: frame.style.cursor };
    t.to(1000);
    _jaw.G.f = 60;
    t.pointer('pointerdown', undefined, 2);
    t.to(1300);
    expect(line.style.height).not.toBe('');
    expect(frame.style.cursor).toBe('ns-resize');
    expect(audio.sources.length).toBeGreaterThan(0);
    end(t, s);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-jaw')).toBeNull();
    expect(t.q('.alius-jaw-mirror, .alius-jaw-clip, .alius-jaw-rest, .alius-jaw-band')).toBeNull();
    expect(t.field.hasAttribute('data-jaw-letters')).toBe(false);
    expect(line.getAttribute('style') ?? '').toBe(before.line);
    expect(frame.style.cursor).toBe(before.cursor);
    expect(audio.sources.every((n) => n.stopped)).toBe(true);
    expect(t.frames.pending()).toBe(0);
    const sent = t.input.mock.calls.length;
    t.pointer('pointerup', document, 2);
    t.key('keydown', 'Shift');
    t.pointer('pointerdown', undefined, 2);
    vi.advanceTimersByTime(40_000);
    t.frames.frame();
    expect(t.input.mock.calls.length).toBe(sent);
    expect(stopped).not.toHaveBeenCalled();
    // the field speaks plainly again
    t.field.value = 'please';
    t.key('keydown', 'Enter', t.field);
    expect(t.send).toHaveBeenLastCalledWith('please');
  });

  it('the stop word stays reachable over the instrument and ends the hold (jawhold)', () => {
    const s = hold('ring');
    const stopped = vi.fn(() => []);
    const t = draw(s, { staging: { stopWord: stopped } });
    t.to(2500);
    _jaw.move({ order: 'wider', orderMs: 4000 }); // her band is up
    t.to(2600);
    const pill = t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')!;
    expect(pill).not.toBeNull();
    expect(t.q('.alius-jaw')!.contains(pill)).toBe(false);
    pill.click();
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('the end: on her release her end line plays through finish, then the host unmounts', async () => {
    const s = hold();
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'jaw', result: 'released' }) } as never });
    t.to(3000);
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(_jaw.G.phase).toBe('done');
    expect(handText(t)).toContain('that’s enough.');
    expect(_jaw.digest()).toMatchObject({ ended: 'released' });
    t.to(3000 + 2700);
    expect(t.q('.alius-jaw')).toBeNull();
  });
});
