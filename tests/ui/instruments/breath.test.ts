// @vitest-environment jsdom
/**
 * P10e-e Task 14: the breath instrument (docs/prototypes/breath.html). It plays her openings from the engine's plan and reports, per opening,
 * the share of it held (`breathe`), per over-hold a `strain` (0.5 or 1) and a breath through the gap of a leaky seal; Space typed into the
 * field never breathes, the mouse does (and is exempt from the typing lapse, ruling O); the ceiling falls back to the room; the still form;
 * the unmount leaves nothing; the end plays through `finish`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaging } from '../../../src/blocking/controller';
import type { Registries } from '../../../src/content/types';
import { ceilingOf } from '../../../src/engine/backdrops';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import type { Action } from '../../../src/engine/dispatch';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { _breath, breathMatches } from '../../../src/ui/scene/instruments/breath/breath';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
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
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation', 'explicit_scenes'];
/** Breath and her own activity (passive): the instrument draws it. Breath with saturation (`smothered_armpit`) is the card's (review I2). */
const SEAT = 'under_her_seat';
/** A plan of 14 beats with her openings where asked (neutral width 600 unless given). */
function planOf(openings: Record<number, { widthMs?: number; false?: true; cue?: 'window_open' | 'window_false' | null }>): SegmentPlan {
  return {
    beats: Array.from({ length: 14 }, (_, i) => {
      const o = openings[i];
      if (!o) return { attention: 'watching' as const };
      const cue = o.cue === null ? {} : { cue: o.cue ?? (o.false ? 'window_false' as const : 'window_open' as const) };
      return { attention: 'watching' as const, opening: { widthMs: o.widthMs ?? 600, ...(o.false ? { false: true as const } : {}) }, ...cue };
    }),
  };
}

/** Ann holds the commander (a breathing contact), one segment running in real time, with a scripted plan. */
function hold(contact = SEAT, plan = planOf({ 3: {}, 6: {} }), location = 'quarters_commander'): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: location, participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
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
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len), duration: 1 }),
    createBufferSource: source,
    createOscillator: source,
  };
  const samples = { play: vi.fn(), loop: vi.fn(), preload: async () => {}, buffer: () => null, ctx: () => ctx, bus: () => node(), setWorldDull: vi.fn(), setNight: vi.fn(), setMuffle: vi.fn(), setSensory: vi.fn(), dispose: vi.fn() };
  return { samples, sources };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; samples?: unknown } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const onTap = vi.fn();
  const f = frames();
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
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  const mouse = (type: 'mousedown' | 'mouseup', target: EventTarget = frame) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
    target.dispatchEvent(e);
    return e;
  };
  const key = (type: 'keydown' | 'keyup', k: string, target: EventTarget = document.body) => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { host, screen, input, onTap, frames: f, q, to, mouse, key, staging };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
/** The loop starts after the entry (1800 ms); the segment started at 0: beat b of it is at b × 1500 ms on the frame clock. */
const BEAT = 1500;

describe('the breath instrument: the pure helpers', () => {
  it('windowOpenness at 0, 260, 260 + widthMs × 2 and + 320 ms: 0, 1, 1, 0', () => {
    const g = _breath.fresh();
    _breath.setG(g);
    _breath.setWidth(600);
    g.clock = 1000;
    _breath.openWindow(false, true);
    const at = (ms: number): number => { g.clock = 1000 + ms; return _breath.windowOpenness(); };
    expect(at(0)).toBe(0);
    expect(at(260)).toBe(1);
    expect(at(260 + 600 * 2)).toBe(1);
    expect(at(260 + 600 * 2 + 320)).toBeCloseTo(0, 10);
    expect(at(130)).toBeGreaterThan(0.8); // easeOut: most of the way at half the rise
    at(260 + 600 * 2 + 320);
    expect(_breath.windowDone()).toBe(false);
    g.clock += 1;
    expect(_breath.windowDone()).toBe(true);
  });

  it('a false window reached for snaps shut in 90 ms', () => {
    const g = _breath.fresh();
    _breath.setG(g);
    _breath.setWidth(450);
    _breath.openWindow(true, true);
    g.clock = 400;
    g.win!.snapAt = 400; g.win!.snapO = 1;
    g.clock = 445;
    expect(_breath.windowOpenness()).toBeCloseTo(0.5, 5);
    g.clock = 490;
    expect(_breath.windowOpenness()).toBe(0);
  });

  it('letters fade at the prototype\'s rate (0.42·((60 − air)/60)^1.4 a second); a line sent with lost letters sends dots', () => {
    draw(hold());
    const l = _breath.letters;
    l.chars = [...'hi there'].map((ch) => ({ ch, c: 1 }));
    l.tick(1000, 20);
    const k = 0.42 * Math.pow((60 - 20) / 60, 1.4);
    expect(l.chars[0]!.c).toBeCloseTo(1 - k, 10);
    l.tick(1000, 70); // above 60 nothing fades
    expect(l.chars[0]!.c).toBeCloseTo(1 - k, 10);
    l.chars[0]!.c = 0.1; l.chars[3]!.c = 0.1; l.chars[2]!.c = 0.1; // h, t and the space are lost
    expect(l.send()).toBe('·i ·here');
    l.chars = [];
    expect(l.send()).toBeNull();
  });
});

describe('the breath instrument on the scene', () => {
  it('matches a timing physics with a capacity gauge (alone, or with a second that needs no input), read by field', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(breathMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('breath');
    expect(breathMatches({ ...p, physicsId: 'gulp' } as PhysicsRun, s, reg)).toBe(false);
    expect(breathMatches({ ...p, physicsId: 'weight' } as PhysicsRun, s, reg)).toBe(false);
    expect(breathMatches({ ...p, second: { physicsId: 'weight', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    // a second that needs an input the instrument does not offer (saturation's mouth breath): the card draws the pair
    for (const contact of ['smothered_armpit', 'face_to_bottom']) {
      const t = hold(contact);
      const r = t.scene!.physics!;
      expect(r.second?.physicsId, contact).toBe('saturation');
      expect(breathMatches(r, t, reg), contact).toBe(false);
      expect(instrumentFor(r, t, reg, DEFAULT_SETTINGS), contact).toBeNull();
    }
    const drawn = draw(hold('smothered_armpit'));
    expect(drawn.q('.alius-breath')).toBeNull();
    expect(drawn.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(breathMatches({ ...p, second: { physicsId: 'her_activity', gauge: 0, capacity: 100, streak: 0 } }, s, reg)).toBe(true);
  });

  it('draws in the effects layer, no card, no [data-analyze] over the play surface; TAP and the gap carry their glossary entries', () => {
    const t = draw(hold());
    const box = t.q('.alius-layer-effects > .alius-breath');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.closest('[data-analyze]')).toBeNull();
    expect(t.q('.alius-breath-dark')!.closest('[data-analyze]')).toBeNull();
    expect(t.q('.alius-breath-tap')!.dataset.analyze).toBe('glossary:tap_signal');
    expect(t.q('.alius-breath-gap')!.dataset.analyze).toBe('glossary:gap_breath');
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull(); // the stop word stays
  });

  it('inputs: an opening held from its rise to its fall reports the whole share; an over-hold she noticed is a strain of 1 and moves her next opening a beat', () => {
    const t = draw(hold(SEAT, planOf({ 3: {}, 6: {} })));
    t.to(3 * BEAT - 50);
    expect(_breath.G.phase).toBe('loop');
    expect(_breath.G.win).toBeNull();
    t.mouse('mousedown');
    t.to(3 * BEAT + 260 + 1200 + 60); // from before its rise into its fall (held on to its very end would be an over-hold: the prototype's rule)
    t.mouse('mouseup', document);
    t.to(3 * BEAT + 260 + 1200 + 320 + 60);
    expect(reports(t)).toEqual([{ beat: 3, kind: 'breathe', amount: 1 }]);
    expect(t.input.mock.calls[0]![1]).toEqual({ pointer: true }); // the mouse: exempt from the typing lapse (ruling O)
    // beat 4, once her opening of beat 3 has closed: held with no opening, she notices at 450 ms (a strain of 1, at once)
    t.to(4 * BEAT + 400);
    t.mouse('mousedown');
    t.to(4 * BEAT + 400 + 480);
    expect(reports(t)[1]).toEqual({ beat: 4, kind: 'strain', amount: 1 });
    t.to(4 * BEAT + 1000);
    t.mouse('mouseup', document);
    // her opening of beat 6 now comes at beat 7 (neutral: one beat)
    t.to(6 * BEAT + 100);
    expect(_breath.G.win).toBeNull();
    t.to(7 * BEAT + 100);
    expect(_breath.G.win).not.toBeNull();
    expect(_breath.G.win!.beat).toBe(7);
  });

  it.each([0, 1])('an opening her rhythm puts on beat %i, inside the 1.8 s entry, plays as the loop begins and is reported on its own beat', (beat) => {
    const t = draw(hold(SEAT, planOf({ [beat]: {}, 4: {} })));
    t.to(1700);
    expect(_breath.G.phase).toBe('entry');
    expect(_breath.G.win).toBeNull();
    t.to(1900);
    expect(_breath.G.phase).toBe('loop');
    expect(_breath.G.win).not.toBeNull();
    expect(_breath.G.win!.beat).toBe(beat);
    t.mouse('mousedown');
    t.to(1900 + 260 + 1200);
    t.mouse('mouseup', document);
    t.to(1900 + 2000);
    expect(reports(t)[0]).toEqual({ beat, kind: 'breathe', amount: 1 });
  });

  it('inputs: a short over-hold (past 150 ms, let go before 450) is a strain of 0.5, sent when the press ends; a missed opening sends nothing', () => {
    const t = draw(hold(SEAT, planOf({ 3: {}, 9: {} })));
    t.to(5 * BEAT);
    t.key('keydown', ' ');
    t.to(5 * BEAT + 300);
    expect(reports(t)).toEqual([]); // nothing yet: it is sent when the press ends
    t.key('keyup', ' ');
    expect(reports(t)).toEqual([{ beat: 5, kind: 'strain', amount: 0.5 }]);
    expect(t.input.mock.calls[0]![1]).toEqual({ pointer: false }); // Space: the keyboard's path
    expect(reports(t).some((i) => i.beat === 3)).toBe(false); // the opening of beat 3 was missed: no breathe
  });

  it('a false window reached for is a breathe on its beat (the engine counts it as taken); her lines are §7\'s, never the cue pool\'s narration', () => {
    const t = draw(hold(SEAT, planOf({ 3: { false: true, widthMs: 450 } })));
    t.to(3 * BEAT + 200);
    expect(t.q('.alius-breath-hand')!.textContent).toContain('now.'); // the lie: her "now." on a false window
    t.mouse('mousedown');
    t.to(3 * BEAT + 300); // let go within 150 ms of the snap (held on, it would be an over-hold)
    t.mouse('mouseup', document);
    t.to(3 * BEAT + 700);
    expect(reports(t)).toEqual([{ beat: 3, kind: 'breathe' }]);
    expect(t.q('.alius-breath-hand')!.textContent).toMatch(/not yet\.|wait\./); // neutral has no `fake`: her `early` (the prototype's `fake ?? early`)
    expect(t.q('.alius-breath-hand')!.textContent).not.toContain('her '); // the cue pool's fallback narration is never in her hand
  });

  it('ruling Q: her lines by style (card-voice.md §7): the entry, the tap, a model-worded cue in place of her line, cold silent', () => {
    registerPhysicsStyle(() => ({ primary: 'ritual' }));
    const t = draw(hold(SEAT, planOf({ 3: {}, 6: {} })), { staging: { voiced: (k: string) => (k === 'window_open' ? 'breathe for me, now' : null) } });
    t.to(900);
    expect(t.q('.alius-breath-hand')!.textContent).toContain('on my count.');
    t.to(3 * BEAT + 300);
    expect(t.q('.alius-breath-hand')!.textContent).toContain('breathe for me, now'); // the model worded window_open: her own words
    expect(t.q('.alius-breath-hand')!.textContent).toMatch(/one…|two…/); // the count is hers (ritual)
    t.to(5 * BEAT);
    t.mouse('mousedown', t.q('.alius-breath-tap')!);
    expect(t.onTap).toHaveBeenCalledTimes(1);
    expect(t.q('.alius-breath-hand')!.textContent).toContain('noted.');
    t.screen.dispose();
    resetPhysicsHooks();
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const c = draw(hold(SEAT, planOf({ 3: {} })));
    c.to(3 * BEAT + 300);
    expect(_breath.G.win).not.toBeNull();
    expect(c.q('.alius-breath-hand')!.textContent).toBe(''); // cold is silent, even on her opening
  });

  describe('I5: playful\'s "again." (a count that ends with no window, ahead of a planned opening)', () => {
    /** Mounts her with a seed for the module's Math.random set during the entry (the tease is decided when the segment is scheduled). */
    const run = (style: string, plan: SegmentPlan, seedN: number) => {
      resetPhysicsHooks();
      registerPhysicsStyle(() => ({ primary: style as 'playful' }));
      const t = draw(hold(SEAT, plan));
      t.to(1000);
      _breath.seed(seedN);
      const seen: Array<{ at: number; text: string; win: boolean }> = [];
      let last = '';
      while (t.frames.now() < 8 * BEAT) {
        t.frames.frame();
        const text = t.q('.alius-breath-hand')!.textContent ?? '';
        if (text !== last) { seen.push({ at: t.frames.now(), text, win: _breath.G.win !== null }); last = text; }
      }
      const out = { seen, reports: reports(t), opened: _breath.G.windowsOpened };
      t.screen.dispose();
      return out;
    };
    it('plays for playful when the gap before her opening holds it: "three… two… again.", nothing opens, nothing is reported; her opening comes on its planned beat', () => {
      let teased = 0;
      for (let n = 1; n <= 40; n++) {
        const r = run('playful', planOf({ 5: { widthMs: 450 } }), n);
        const again = r.seen.find((x) => /again\./.test(x.text));
        if (!again) continue;
        teased++;
        expect(again.win).toBe(false); // nothing open at "again."
        expect(again.at).toBeLessThan(5 * BEAT - 200 - BEAT + 1);
        expect(r.reports).toEqual([]); // the tease is never an opening
        expect(r.opened).toBe(1); // only the planned one opened
      }
      expect(teased).toBeGreaterThan(0);
    });
    it('never when the gap is too short, and never for another style', () => {
      for (let n = 1; n <= 40; n++) {
        // the planned opening on beat 2: from the loop's start there is no room for a count and a beat before it
        expect(run('playful', planOf({ 2: { widthMs: 450 } }), n).seen.some((x) => /again\./.test(x.text)), `seed ${n}`).toBe(false);
        expect(run('ritual', planOf({ 5: {} }), n).seen.some((x) => /again\./.test(x.text)), `seed ${n}`).toBe(false);
      }
    });
  });

  it('a cruel holder\'s silent opening writes no line; a breath through the gap of a leaky seal is reported at once', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const s = hold(SEAT, planOf({ 3: { widthMs: 250, cue: null } }));
    s.scene!.physics!.seal = 'leaky';
    const t = draw(s);
    t.to(3 * BEAT + 100);
    expect(_breath.G.win).not.toBeNull();
    expect(t.q('.alius-breath-hand')!.textContent).not.toContain('window_open');
    t.mouse('mousedown', t.q('.alius-breath-gap')!);
    expect(reports(t)).toEqual([{ beat: 3, kind: 'gap_breath' }]);
  });

  it('keys: Space or Shift typed into the input never breathe; only the mouse acts while the field has focus, and the field keeps it', () => {
    const t = draw(hold());
    t.to(2000);
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.focus();
    t.key('keydown', ' ', field);
    t.key('keydown', 'Shift', field);
    t.to(2100);
    expect(_breath.G.breathing).toBe(false);
    const e = t.mouse('mousedown');
    expect(e.defaultPrevented).toBe(true);
    expect(_breath.G.breathing).toBe(true);
    expect(document.activeElement).toBe(field);
    t.mouse('mouseup', document);
    expect(_breath.G.breathing).toBe(false);
    // a press on the scene's UI is not a breath
    t.mouse('mousedown', t.q('.alius-stage-dial .alius-stop-pill')!);
    expect(_breath.G.breathing).toBe(false);
  });

  it('review M5: Space breathes during the entry too (as the prototype), and either device lets go', () => {
    const t = draw(hold());
    t.to(800);
    expect(_breath.G.phase).toBe('entry');
    t.key('keydown', ' ');
    expect(_breath.G.breathing).toBe(true);
    t.mouse('mouseup', document);
    expect(_breath.G.breathing).toBe(false);
    t.to(2500);
    t.key('keydown', 't');
    expect(t.onTap).toHaveBeenCalledTimes(1); // T is TAP's key (the ring lives in the effects layer, hidden from assistive tech)
  });

  it('review M6: a ceiling that fails falls to the next candidate (the day\'s two skies on the roof), then the room', async () => {
    const tried: string[] = [];
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(v: string) { if (!v.includes('ceiling')) return; tried.push(v); if (tried.length === 1) queueMicrotask(() => this.onerror?.()); } });
    const s = hold(SEAT, planOf({ 3: {} }));
    s.scene!.locationId = 'roof';
    s.slot = 'morning';
    const t = draw(s);
    await Promise.resolve(); await Promise.resolve();
    expect(tried).toHaveLength(2);
    expect(_breath.S.view).toBe('ceiling');
    expect(t.q('.alius-breath-ceiling')!.style.backgroundImage).toContain(tried[1]!.replace(/^\/x\//, ''));
  });

  it('the letters lie over the input; a line sent short of air carries its lost letters as dots', () => {
    const t = draw(hold());
    t.to(2000);
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.value = 'go on';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.q('.alius-input-line > .alius-breath-mirror')!.textContent).toBe('go on');
    expect(field.dataset.breathLetters).toBe('');
    for (const x of _breath.letters.chars.slice(0, 2)) x.c = 0;
    t.key('keydown', 'Enter', field);
    expect(field.value).toBe('·· on');
  });

  it('fallback: a ceiling that fails to load gives the room; no sprite is no error', async () => {
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_v: string) { queueMicrotask(() => this.onerror?.()); } });
    const t = draw(hold());
    expect(_breath.S.view).toBe('ceiling');
    await Promise.resolve();
    await Promise.resolve();
    expect(_breath.S.view).toBe('room');
    t.to(2500);
    expect(t.q('.alius-breath-ceiling')!.style.opacity).toBe('0');
  });

  it('the ceiling is the scene\'s (P10c surface: ceiling, by finish and slot); a slide sees the room, a hand over the mouth her face', () => {
    const s = hold();
    const c = ceilingOf(s, reg, 'quarters_commander', ANN);
    expect(c[0]!.file).toMatch(/ceiling_room_1\.webp$/);
    s.slot = 'night';
    expect(ceilingOf(s, reg, 'roof', null)[0]!.file).toMatch(/ceiling_sky_night\.webp$/);
    s.slot = 'morning';
    expect(ceilingOf(s, reg, 'roof', null)[0]!.file).toMatch(/ceiling_sky_day/);
    expect(ceilingOf(s, reg, 'nowhere', null)).toEqual([]);
    const t = draw(hold());
    expect(_breath.S.kind).toBe('seat');
    expect(t.q('.alius-breath-ceiling')!.style.backgroundImage).toContain('/x/content/core/art/backdrops/ceiling_room_1.webp');
    t.screen.dispose();
    draw(hold('smothered_breasts', planOf({ 3: {} })));
    expect(_breath.S.kind).toBe('slide');
    expect(_breath.S.view).toBe('room');
  });

  it('reduced motion and readable mode: the still form (no shake, no pulse of the frame, no blur)', () => {
    const t = draw(hold(), { settings: { reducedMotion: true, readableMode: true } });
    t.to(4 * BEAT);
    t.mouse('mousedown');
    t.to(4 * BEAT + 600); // an over-hold: she presses (the dark would shake)
    t.mouse('mouseup', document);
    expect(t.q('.alius-breath-dark')!.style.transform).toBe('');
    expect(t.q('.alius-breath-world')!.style.transform).toBe('');
    for (const sel of ['.alius-breath-world', '.alius-breath-backdrop', '.alius-breath-ceiling']) expect(t.q(sel)!.style.filter).not.toMatch(/blur\((?!0px)/);
    expect(t.q('.alius-breath')!.hasAttribute('data-reduced')).toBe(true);
    expect(t.q('.alius-breath')!.hasAttribute('data-readable')).toBe(true);
  });

  it.each([
    ['a stage reset', (t: ReturnType<typeof draw>) => resetSceneStage()],
    ['dispose', (t: ReturnType<typeof draw>) => t.screen.dispose()],
    ['the stop word (the run gone, stopped)', (t: ReturnType<typeof draw>, s: CampaignState) => { delete s.scene!.physics; t.screen.refresh(); }],
  ])('unmount (%s): no frame, timer, audio source or listener stays; the frame and the input are put back; nothing is sent afterwards', async (_what, end) => {
    const audio = fakeAudio();
    const s = hold();
    const stopped = vi.fn(() => []);
    const t = draw(s, { samples: audio.samples, staging: { outcome: () => ({ runId: 'p1', physicsId: 'breath', result: 'stopped' }), stopWord: stopped } });
    const reply = t.q('.alius-reply-host, [role="log"]')!;
    const line = t.q('.alius-input-line')!;
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    const before = { reply: reply.style.opacity, width: line.style.width };
    t.to(3 * BEAT + 100);
    t.mouse('mousedown');
    t.to(3 * BEAT + 300);
    expect(line.style.width).not.toBe(before.width);
    expect(reply.style.opacity).toBe('0.38');
    expect(audio.sources.length).toBeGreaterThan(0);
    end(t, s);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-breath')).toBeNull();
    expect(t.q('.alius-breath-mirror')).toBeNull();
    expect(field.dataset.breathLetters).toBeUndefined();
    expect(line.style.width).toBe(before.width);
    expect(reply.style.opacity).toBe(before.reply);
    expect(audio.sources.every((n) => n.stopped)).toBe(true);
    expect(t.frames.pending()).toBe(0);
    const sent = t.input.mock.calls.length;
    t.mouse('mouseup', document);
    t.key('keydown', ' ');
    t.mouse('mousedown');
    vi.advanceTimersByTime(20_000);
    t.frames.frame();
    expect(t.input.mock.calls.length).toBe(sent);
    expect(stopped).not.toHaveBeenCalled();
  });

  it('the end: on her release the exit plays through finish (her released line), then the host unmounts', async () => {
    const s = hold();
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'breath', result: 'released' }) } });
    t.to(3000);
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(_breath.G.phase).toBe('exit');
    t.to(3000 + 900);
    expect(t.q('.alius-breath-hand')!.textContent).toContain('breathe.');
    t.to(3000 + 2700);
    expect(t.q('.alius-breath')).toBeNull();
  });

  it('the end: a blackout goes black, the heart stops, the wake plays, then the host unmounts', async () => {
    const s = hold();
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'breath', result: 'blackout' }) } });
    t.to(3000);
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(_breath.G.phase).toBe('blackout');
    t.to(3000 + 2000);
    expect(Number(t.q('.alius-breath-black')!.style.opacity)).toBeGreaterThan(0.9);
    t.to(3000 + 5400);
    expect(_breath.G.phase).toBe('done');
    t.to(3000 + 6600);
    expect(t.q('.alius-breath')).toBeNull();
  });
});

describe('ruling O: the typing lapse', () => {
  it('drops a keyboard breath within 400 ms of a keystroke, never one the mouse made', () => {
    const s = hold();
    const dispatched: Action[] = [];
    let now = 1000;
    const staging = createStaging({
      app: { dispatch: (a: Action) => { dispatched.push(a); return []; }, current: () => ({ state: s, load: { chatId: 'c' } }) } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => now, toast: () => {},
    });
    staging.tick(now);
    staging.keystroke();
    now += 100;
    staging.input({ beat: 1, kind: 'breathe' });
    staging.input({ beat: 2, kind: 'breathe', amount: 0.5 }, { pointer: true });
    staging.input({ beat: 3, kind: 'strain', amount: 1 }, { pointer: true });
    now += 400;
    staging.input({ beat: 4, kind: 'breathe' });
    staging.endSegment();
    const end = dispatched.find((a) => a.type === 'physics/segment_end')!;
    expect((end.payload as { inputs: SegmentInput[] }).inputs).toEqual([
      { beat: 2, kind: 'breathe', amount: 0.5 }, { beat: 3, kind: 'strain', amount: 1 }, { beat: 4, kind: 'breathe' },
    ]);
  });
});
