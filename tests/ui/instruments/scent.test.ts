// @vitest-environment jsdom
/**
 * P10e-e Task 18: the scent instrument (docs/prototypes/saturation.html). Her scent at the face is her nearest place by a Gaussian of 0.13
 * frame heights over the contact's base; a breath leaves words in the head, whose capacity is the tolerance (`6 + tolerance/12`), and an
 * overflow is "lost in her"; the mouth blows a word out every 420 ms; her question is judged by her style's rule. It reports, per beat of a
 * running segment, the words the head gained (`inhale`) and the words the mouth blew out (`mouth_breath`), and her question's answer
 * (`physics/answer`); Space and Shift typed into the field never act, the mouse does; the ceiling falls back to the room; the still form;
 * the unmount leaves nothing; the stop word stays reachable and ends the hold.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { headCapacity, scentToleranceOf } from '../../../src/engine/physics/stimuli';
import { resolveEnvOf, resolveSegment } from '../../../src/engine/physics/segment';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { instrumentFor } from '../../../src/ui/scene/instruments/host';
import { judge, type Pill } from '../../../src/ui/scene/instruments/scent/question';
import { _scent, scentMatches } from '../../../src/ui/scene/instruments/scent/scent';
import { BASE_I } from '../../../src/ui/scene/instruments/scent/words';
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
const BEAT = 1500;
const quietPlan = (n = 20, attention: 'watching' | 'glancing' | 'busy' = 'busy'): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention })) });

/** Ann's feet on the commander's face, one segment running in real time, with a scripted plan. */
function hold(contact = 'feet_on_face', plan = quietPlan()): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
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
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, setValueCurveAtTime() {} });
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
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len), duration: 1, copyToChannel() {} }),
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
  const answer = vi.fn(() => []);
  const stimulus = vi.fn(() => []);
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input, answer, stimulus, endSegment: noop, stopWord: vi.fn(() => []), skip: noop, act: noop, finishCounted: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
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
  const mouse = (type: 'mousedown' | 'mouseup', target: EventTarget = frame, button = 0) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button });
    target.dispatchEvent(e);
    return e;
  };
  const key = (type: 'keydown' | 'keyup', k: string, target: EventTarget = document.body) => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
  };
  return { host, screen, input, answer, stimulus, frames: f, q, to, mouse, key, staging };
}
const reports = (t: ReturnType<typeof draw>): SegmentInput[] => t.input.mock.calls.map((c) => c[0] as SegmentInput);
/** Fills the head with n words (the prototype's `addWord`). */
const fill = (n: number) => { for (let i = 0; i < n; i++) _scent.addWord(`w${i}`, 'scent'); };

describe('the scent instrument: the pure helpers', () => {
  it('intensityAt: at her strongest place base + 0.9 (feet: 0.2 + 0.9), far from her the base alone (the Gaussian of 0.13 frame heights)', () => {
    draw(hold()).to(32); // a frame: the instrument knows the scene's size
    const G = _scent.G;
    G.zones = [{ id: 'toes', p: [0.5, 0.3], w: 1 }, { id: 'heel', p: [0.5, 0.8], w: 0.65 }];
    expect(_scent.intensityAt([0.5, 0.3])).toEqual({ I: BASE_I.feet_on_face! + 1 * (1.1 - BASE_I.feet_on_face!), zone: G.zones[0] });
    expect(_scent.intensityAt([0.02, 0.02]).I).toBeCloseTo(BASE_I.feet_on_face!, 3);
    // 0.13 H below the toes: one standard deviation, e^(-1/2)
    const one = _scent.intensityAt([0.5, 0.43]);
    expect(one.I).toBeCloseTo(0.2 + Math.exp(-0.5) * 0.9, 6);
    expect(one.zone!.id).toBe('toes');
  });

  it('the head holds 6 + tolerance/12 words (the engine\'s headCapacity), and one more is "lost in her"', () => {
    const t = draw(hold());
    t.to(2000);
    expect(_scent.S.tol).toBe(20);
    expect(_scent.capacity()).toBe(8);
    expect(headCapacity(_scent.S.tol)).toBe(_scent.capacity());
    fill(8);
    _scent.updateLoop(16);
    expect(_scent.G.lost).toBe(0);
    fill(1);
    _scent.updateLoop(16);
    expect(_scent.G.lost).toBeGreaterThan(3000);
    expect(_scent.G.counts.lost).toBe(1);
    expect(t.q('.alius-scent-hand')!.textContent).toMatch(/too much\?|good\. stay there\./);
  });

  it('a breath of depth .3 leaves 1 word, a deep one near her strongest place 3', () => {
    const t = draw(hold());
    t.to(2000);
    const G = _scent.G;
    G.head = [];
    G.zoneNow = null; G.I = 0.4;
    _scent.breathWords(0.3);
    vi.advanceTimersByTime(600);
    expect(G.head).toHaveLength(1);
    G.head = [];
    G.zoneNow = { id: 'toes', p: [0.5, 0.3], w: 1 }; G.I = 0.9;
    _scent.breathWords(0.8);
    vi.advanceTimersByTime(600);
    expect(G.head).toHaveLength(3);
    expect(G.head[0]!.cat).toBe('place:toes'); // where, first
    G.head = [];
    _scent.breathWords(0.29);
    vi.advanceTimersByTime(600);
    expect(G.head).toHaveLength(0);
  });

  it('the mouth word interval is 420 ms', () => {
    const t = draw(hold());
    t.to(2000);
    fill(6);
    const G = _scent.G;
    G.mouth = true;
    G.mouthTick = 0;
    for (let ms = 0; ms < 1000; ms += 10) _scent.updateLoop(10);
    expect(G.counts.mouthWords).toBe(3); // at 0, 420 and 840 ms
    expect(G.head).toHaveLength(3);
  });

  describe('judge per rule on a fixed head', () => {
    const p = (w: string, cat: string, lie?: true): Pill => ({ w, cat, ...(lie ? { lie } : {}) });
    const as = (style: string, band = 'strong', stage = 'enduring') => { draw(hold()); _scent.S.style = style; _scent.S.band = band; _scent.S.stage = stage; };
    it('any (affectionate): any word', () => {
      as('affectionate');
      expect(judge([p('salt', 'scent')], 'toes').ok).toBe(true);
      expect(judge([p('… nothing', 'none')], 'toes').ok).toBe(false);
    });
    it('warm (neutral): the place she named, or a stage from accustomed up', () => {
      as('neutral');
      expect(judge([p('her toes', 'place:toes'), p('salt', 'scent')], 'toes').ok).toBe(true);
      expect(judge([p('familiar', 'stage:accustomed'), p('salt', 'scent')], 'toes').ok).toBe(true);
      expect(judge([p('heavy', 'stage:enduring'), p('salt', 'scent')], 'toes')).toEqual({ ok: false, miss: 'you didn’t say where. or how it is now.' });
    });
    it('admit (playful): that it is strong', () => {
      as('playful');
      expect(judge([p('strong', 'band:strong'), p('salt', 'scent')], 'toes').ok).toBe(true);
      expect(judge([p('rank', 'stage:aversion'), p('salt', 'scent')], 'toes').ok).toBe(true);
      expect(judge([p('a trace', 'band:faint'), p('salt', 'scent')], 'toes')).toEqual({ ok: false, miss: 'liar~ it’s strong. say it.' });
    });
    it('bad_and_want (cruel): that it is bad, and that it is wanted', () => {
      as('cruel');
      expect(judge([p('rank', 'stage:aversion'), p('more', 'stage:craving')], 'toes').ok).toBe(true);
      expect(judge([p('salt', 'scent'), p('more', 'stage:craving')], 'toes')).toEqual({ ok: false, miss: 'say how bad it is.' });
      expect(judge([p('strong', 'band:strong'), p('salt', 'scent')], 'toes')).toEqual({ ok: false, miss: 'and you want it. say it.' });
    });
    it('place_and_band (ritual): the place she asked and her true band', () => {
      as('ritual', 'strong');
      expect(judge([p('her toes', 'place:toes'), p('strong', 'band:strong')], 'toes').ok).toBe(true);
      expect(judge([p('her heel', 'place:heel'), p('strong', 'band:strong')], 'toes')).toEqual({ ok: false, miss: 'where? the place.' });
      expect(judge([p('her toes', 'place:toes'), p('salt', 'scent')], 'toes')).toEqual({ ok: false, miss: 'how strong? say it.' });
      expect(judge([p('her toes', 'place:toes'), p('a trace', 'band:faint')], 'toes')).toEqual({ ok: false, miss: 'that’s not how strong it is.' });
    });
    it('band_and_honest (clinical): her true band and the commander\'s own stage', () => {
      as('clinical', 'noticeable', 'craving');
      expect(judge([p('clear', 'band:noticeable'), p('warm', 'stage:craving')], 'toes').ok).toBe(true);
      expect(judge([p('strong', 'band:strong'), p('warm', 'stage:craving')], 'toes')).toEqual({ ok: false, miss: 'intensity: wrong.' });
      expect(judge([p('salt', 'scent'), p('warm', 'stage:craving')], 'toes')).toEqual({ ok: false, miss: 'intensity: missing.' });
      expect(judge([p('clear', 'band:noticeable'), p('heavy', 'stage:enduring')], 'toes')).toEqual({ ok: false, miss: 'and what you feel. honestly.' });
    });
  });
});

describe('the scent instrument on the scene', () => {
  it('matches a decision physics with a fill gauge under a shape the prototype draws (feet on the face); a pair with breath as its main is the card\'s', () => {
    const s = hold();
    const p = s.scene!.physics!;
    expect(p.physicsId).toBe('saturation');
    expect(p.second?.physicsId).toBe('her_activity'); // passive
    expect(scentMatches(p, s, reg)).toBe(true);
    expect(instrumentFor(p, s, reg, DEFAULT_SETTINGS)?.id).toBe('scent');
    expect(scentMatches({ ...p, physicsId: 'jaw' } as PhysicsRun, s, reg)).toBe(false); // a fill, but a gesture
    expect(scentMatches({ ...p, second: { physicsId: 'breath', gauge: 100, capacity: 100, streak: 0 } }, s, reg)).toBe(false);
    expect(scentMatches({ ...p, sourceKind: 'item', sourceId: 'scent_gag' } as PhysicsRun, s, reg)).toBe(false); // no shape of hers to breathe under
    for (const contact of ['smothered_armpit', 'face_to_bottom']) {
      const t = hold(contact);
      const r = t.scene!.physics!;
      expect(r.physicsId, contact).toBe('breath');
      expect(instrumentFor(r, t, reg, DEFAULT_SETTINGS), contact).toBeNull();
    }
  });

  it('draws in the effects layer, no card, no [data-analyze] on the play surface; the pills carry her question\'s glossary entry; the stop word stays', () => {
    const t = draw(hold());
    const box = t.q('.alius-layer-effects > .alius-scent');
    expect(box).not.toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).toBeNull();
    expect(box!.closest('[data-analyze]')).toBeNull();
    expect(box!.querySelector('[data-analyze]')).toBeNull();
    t.to(2000);
    fill(3);
    _scent.ask();
    const pills = [...box!.querySelectorAll<HTMLElement>('.pw.pick')];
    expect(pills.length).toBeGreaterThan(0);
    for (const el of pills) expect(el.dataset.analyze).toBe('glossary:scent_answer');
    expect(t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')).not.toBeNull();
  });

  it('binds the run: her contact\'s shape (gap), her band (strong soles), her name, her style\'s lines; her first words are hers', () => {
    const t = draw(hold());
    expect(_scent.S.contact).toBe('feet_on_face');
    expect(_scent.S.band).toBe('strong');
    expect(_scent.S.stage).toBe('aversion');
    expect(_scent.LINES.here.feet_on_face).toEqual([['between my toes.', 'toes'], ['the arch.', 'arch'], ['the heel.', 'heel'], ['under my toes.', 'ball']]);
    t.to(900);
    expect(t.q('.alius-scent-hand')!.textContent).toBe('breathe me in.');
  });

  it('ruling R: cold is silent, her first words, her orders and her question included', () => {
    registerPhysicsStyle(() => ({ primary: 'cold' }));
    const t = draw(hold());
    t.to(2000);
    _scent.here(0);
    _scent.ask();
    expect(t.q('.alius-scent-hand')!.textContent).toBe('');
    expect(_scent.G.order?.k).toBe('ask'); // her mark and her question still come
  });

  it('inputs: per beat the words the head gained (inhale) and the words the mouth blew out (mouth_breath, the right button: pointer)', () => {
    const t = draw(hold());
    t.to(2000); // the loop begins; beat 0 and the first of beat 1 passed in the entry
    expect(reports(t)).toEqual([{ beat: 0, kind: 'inhale', amount: 0 }]);
    fill(3);
    t.to(2 * BEAT + 10);
    expect(reports(t)[1]).toEqual({ beat: 1, kind: 'inhale', amount: 3 });
    t.mouse('mousedown', undefined, 2);
    t.to(2 * BEAT + 500);
    t.mouse('mouseup', document, 2);
    t.to(3 * BEAT + 10);
    const beat2 = reports(t).filter((i) => i.beat === 2);
    expect(beat2).toEqual([{ beat: 2, kind: 'mouth_breath', amount: 2 }, { beat: 2, kind: 'inhale', amount: 0 }]);
    expect(t.input.mock.calls.find((c) => (c[0] as SegmentInput).kind === 'mouth_breath')![1]).toEqual({ pointer: true });
    fill(2); // the head is 3 again: the engine holds 1, so 2 are gained
    t.to(4 * BEAT + 10);
    expect(reports(t).filter((i) => i.beat === 3)).toEqual([{ beat: 3, kind: 'inhale', amount: 2 }]);
    // the last beats are flushed 300 ms before the segment's end (30 s)
    t.to(30_000 - 290);
    expect(reports(t).filter((i) => i.kind === 'inhale').map((i) => i.beat)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('her mouth line follows the engine\'s catch (run.tally.cheatsCaught), never a roll of its own', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const s = hold();
    const t = draw(s);
    t.to(2000);
    fill(5);
    t.mouse('mousedown', undefined, 2);
    t.to(4000);
    t.mouse('mouseup', document, 2);
    expect(t.q('.alius-scent-hand')!.textContent).not.toContain('did I say you could?');
    s.scene!.physics!.tally = { cheatsCaught: 1 };
    t.screen.refresh();
    expect(t.q('.alius-scent-hand')!.textContent).toContain('did I say you could?');
    expect(_scent.G.order?.k).toBe('still'); // cruel: still, after a punished mouth breath
  });

  it('her question: an honest answer is sent at once; a lie waits for the body: a cough within two breaths sends it caught ("liar."), else kept', () => {
    const t = draw(hold());
    t.to(2000);
    _scent.addWord('her toes', 'place:toes');
    _scent.addWord('salt', 'scent');
    _scent.ask();
    const pick = (w: string) => { const el = [...t.host.querySelectorAll<HTMLElement>('.pw.pick')].find((x) => x.textContent!.endsWith(w))!; el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })); };
    pick('her toes');
    pick('salt');
    expect(t.answer).toHaveBeenCalledWith(true, false, false); // neutral: the place she named is right
    expect(t.q('.alius-scent-hand')!.textContent).toContain('good answer.');
    // a lie: her dashed "say it" word
    _scent.G.nextAskAt = 0; _scent.G.order = null;
    _scent.addWord('salt', 'scent');
    _scent.ask();
    const lie = [...t.host.querySelectorAll<HTMLElement>('.pw.pick.lie')][0]!;
    lie.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    [...t.host.querySelectorAll<HTMLElement>('.pw.pick:not(.lie)')][0]!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(t.answer).toHaveBeenCalledTimes(1);
    expect(_scent.G.lie).toBe(2);
    _scent.G.inhaling = true; _scent.G.depth = 1;
    _scent.reflex();
    expect(t.answer).toHaveBeenLastCalledWith(true, true, true);
    expect(t.q('.alius-scent-hand')!.textContent).toContain('liar.');
    expect(t.stimulus).toHaveBeenCalledWith('inhale', expect.any(String), expect.any(Number)); // the cough is the engine's reflex too
  });

  it('a kept lie (two breaths with no cough) is sent as not caught', () => {
    const t = draw(hold());
    t.to(2000);
    _scent.addWord('salt', 'scent');
    _scent.ask();
    [...t.host.querySelectorAll<HTMLElement>('.pw.pick.lie')][0]!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    [...t.host.querySelectorAll<HTMLElement>('.pw.pick:not(.lie)')][0]!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(t.answer).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) { _scent.G.inhaling = true; _scent.G.depth = 0.2; _scent.inhaleEnd(); }
    expect(t.answer).toHaveBeenCalledWith(expect.any(Boolean), true, false);
  });

  it('a deep breath is P15a\'s deep inhale, its depth inside the engine\'s zone (no reflex there unless the body coughed)', () => {
    const t = draw(hold());
    t.to(2000);
    _scent.G.inhaling = true; _scent.G.depth = 0.95;
    _scent.inhaleEnd();
    const [way, kind, depth] = t.stimulus.mock.calls[0] as unknown as [string, string, number];
    expect(way).toBe('inhale');
    expect(kind).toMatch(/^(scent|sweat)_/);
    // strong (index 2), tolerance 20: the zone is [40, 54]
    expect(depth).toBeGreaterThanOrEqual(40);
    expect(depth).toBeLessThanOrEqual(54);
    _scent.G.inhaling = true; _scent.G.depth = 0.5;
    _scent.inhaleEnd();
    expect(t.stimulus).toHaveBeenCalledTimes(1); // a shallow breath is no deep inhale
  });

  it('keys: Space or Shift typed into the input never act; only the mouse acts while the field has focus, and the field keeps it', () => {
    const t = draw(hold());
    t.to(2000);
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.focus();
    t.key('keydown', ' ', field);
    t.key('keydown', 'Shift', field);
    t.to(2100);
    expect(_scent.G.inhaling).toBe(false);
    expect(_scent.G.mouth).toBe(false);
    const e = t.mouse('mousedown');
    expect(e.defaultPrevented).toBe(true);
    expect(_scent.G.inhaling).toBe(true);
    expect(document.activeElement).toBe(field);
    t.mouse('mouseup', document);
    expect(_scent.G.inhaling).toBe(false);
    t.mouse('mousedown', undefined, 2);
    expect(_scent.G.mouth).toBe(true);
    t.mouse('mouseup', document, 2);
    expect(_scent.G.mouth).toBe(false);
    // a press on the scene's UI is not a breath
    t.mouse('mousedown', t.q('.alius-stage-dial .alius-stop-pill')!);
    expect(_scent.G.inhaling).toBe(false);
    // the keyboard breathes when the field does not have the focus
    field.blur();
    t.key('keydown', ' ');
    expect(_scent.G.inhaling).toBe(true);
    t.key('keyup', ' ');
    expect(_scent.G.inhaling).toBe(false);
  });

  it('the input takes her in: its letters lie over the field', () => {
    const t = draw(hold());
    t.to(2000);
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    field.value = 'go on';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.q('.alius-input-line > .alius-scent-mirror')!.textContent).toBe('go on');
    expect(field.dataset.scentLetters).toBe('');
  });

  it('fallback: a ceiling that fails to load leaves the room (the scene\'s backdrop), no error', async () => {
    vi.stubGlobal('Image', class { onerror: (() => void) | null = null; set src(_v: string) { queueMicrotask(() => this.onerror?.()); } });
    const t = draw(hold());
    expect(t.q('.alius-scent-ceiling')!.style.backgroundImage).toContain('ceiling_room_1.webp');
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-scent-ceiling')!.dataset.fallback).toBe('room');
    expect(t.q('.alius-scent-ceiling')!.style.backgroundImage).toBe('');
    t.to(2500);
    expect(t.q('.alius-scent')).not.toBeNull();
  });

  it('reduced motion and readable mode: the still form (no shake, no breathing of the frame, no blur)', () => {
    const t = draw(hold(), { settings: { reducedMotion: true, readableMode: true } });
    t.to(2000);
    fill(8);
    _scent.G.shake = 1;
    t.to(2200);
    expect(t.q('.alius-scent-dark')!.style.transform).toBe('');
    expect(t.q('.alius-scent-inner')!.style.transform).toBe('');
    expect(t.q('.alius-scent-inner')!.style.filter).not.toMatch(/blur\((?!0px)/);
    expect(t.q('.alius-scent')!.hasAttribute('data-reduced')).toBe(true);
    expect(t.q('.alius-scent')!.hasAttribute('data-readable')).toBe(true);
  });

  it.each([
    ['a stage reset', (_t: ReturnType<typeof draw>) => resetSceneStage()],
    ['dispose', (t: ReturnType<typeof draw>) => t.screen.dispose()],
    ['the stop word (the run gone, stopped)', (t: ReturnType<typeof draw>, s: CampaignState) => { delete s.scene!.physics; t.screen.refresh(); }],
  ])('unmount (%s): no frame, timer, audio source or listener stays; the frame and the input are put back; nothing is sent afterwards', async (_what, end) => {
    const audio = fakeAudio();
    const s = hold();
    const stopped = vi.fn(() => []);
    const t = draw(s, { samples: audio.samples, staging: { outcome: () => ({ runId: 'p1', physicsId: 'saturation', result: 'stopped' }), stopWord: stopped } });
    const reply = t.q('.alius-reply-host, [role="log"]')!;
    const frame = t.q('.alius-layer-frame')!;
    const field = t.q('input[name="cmd"]') as HTMLInputElement;
    const before = { reply: reply.style.opacity, cursor: frame.style.cursor };
    t.to(2000);
    t.mouse('mousedown');
    t.to(2300);
    expect(reply.style.opacity).toBe('0.4');
    expect(frame.style.cursor).toBe('none');
    expect(audio.sources.length).toBeGreaterThan(0);
    end(t, s);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.q('.alius-scent')).toBeNull();
    expect(t.q('.alius-scent-mirror')).toBeNull();
    expect(field.dataset.scentLetters).toBeUndefined();
    expect(reply.style.opacity).toBe(before.reply);
    expect(frame.style.cursor).toBe(before.cursor);
    expect(audio.sources.every((n) => n.stopped)).toBe(true);
    expect(t.frames.pending()).toBe(0);
    const sent = t.input.mock.calls.length;
    t.mouse('mouseup', document);
    t.key('keydown', ' ');
    t.mouse('mousedown');
    vi.advanceTimersByTime(40_000);
    t.frames.frame();
    expect(t.input.mock.calls.length).toBe(sent);
    expect(t.answer).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });

  it('the stop word stays reachable over the instrument and ends the hold (scenthold)', () => {
    const s = hold();
    const stopped = vi.fn(() => []);
    const t = draw(s, { staging: { stopWord: stopped } });
    t.to(2500);
    fill(4);
    _scent.ask(); // her question's pills are up
    const pill = t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]')!;
    expect(pill).not.toBeNull();
    expect(t.q('.alius-scent')!.contains(pill)).toBe(false);
    pill.click();
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('the end: on her release the exit plays through finish (her end line), then the host unmounts', async () => {
    const s = hold();
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId: 'saturation', result: 'released' }) } });
    t.to(3000);
    delete s.scene!.physics;
    t.screen.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(_scent.G.phase).toBe('exit');
    t.to(3000 + 1000);
    expect(t.q('.alius-scent-hand')!.textContent).toContain('enough. for now.');
    t.to(3000 + 2700);
    expect(t.q('.alius-scent')).toBeNull();
  });
});

describe('fix round 1', () => {
  const lostOf = (t: ReturnType<typeof draw>, beat: number) => reports(t).filter((i) => i.beat === beat && i.kind === 'scatter').reduce((n, i) => n + (i.amount ?? 0), 0);

  it('Ruling U: a cough, the overflow\'s recovery and an answer each report the words lost (scatter), so the engine\'s fill follows the head down', () => {
    const t = draw(hold());
    t.to(2000);
    fill(5);
    t.to(2 * BEAT + 10); // beat 1 ends: +5
    _scent.G.inhaling = true; _scent.G.depth = 1;
    _scent.reflex(); // a cough throws 2 words out
    t.to(3 * BEAT + 10);
    expect(lostOf(t, 2)).toBe(2);
    // an answer: the two words said leave the head (and a right one scatters 2 more)
    _scent.addWord('her toes', 'place:toes');
    t.to(4 * BEAT + 10);
    _scent.ask();
    for (const w of ['her toes']) [...t.host.querySelectorAll<HTMLElement>('.pw.pick')].find((x) => x.textContent!.endsWith(w))!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    [...t.host.querySelectorAll<HTMLElement>('.pw.pick:not(.lie):not(.chosen)')][0]!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const before = _scent.G.head.length;
    t.to(5 * BEAT + 10);
    expect(lostOf(t, 4)).toBe(4 - before); // 4 in the head before her question; what is left is in the engine
    // the overflow: lost in her, then half the head scatters
    fill(_scent.capacity() + 1 - _scent.G.head.length);
    t.to(5 * BEAT + 100);
    expect(_scent.G.lost).toBeGreaterThan(0);
    t.to(8 * BEAT + 10);
    expect(reports(t).filter((i) => i.kind === 'scatter' && i.beat >= 5).length).toBeGreaterThan(0);
  });

  it('Ruling U: the engine\'s fill and the visible head agree at the segment\'s end, within one word', () => {
    const s = hold();
    const t = draw(s);
    t.to(2000);
    fill(4);
    t.to(3 * BEAT);
    _scent.G.inhaling = true; _scent.G.depth = 1; _scent.reflex();
    t.to(6 * BEAT);
    fill(_scent.capacity() + 1 - _scent.G.head.length); // lost in her
    t.to(12 * BEAT);
    t.mouse('mousedown', undefined, 2);
    t.to(13 * BEAT);
    t.mouse('mouseup', document, 2);
    t.to(30_000 - 290); // the last beats flushed
    const p = s.scene!.physics!;
    const env = resolveEnvOf(s, reg, p);
    const gauge = resolveSegment(p, p.segment.plan!, reports(t), env).gauge;
    const words = gauge / (p.capacity / env.head!);
    expect(Math.abs(words - Math.min(_scent.capacity(), _scent.G.head.length))).toBeLessThanOrEqual(1);
  });

  it('I2: the body\'s own breaths (the need to breathe, the overflow) are not the commander\'s deep inhale: no physics/stimulus, the stage stays', () => {
    const s = hold();
    const t = draw(s);
    const before = JSON.stringify(s.commander.stimuli ?? null);
    t.to(2000);
    // the need to breathe: 7 s without a breath, the body breathes deep by itself
    t.to(2000 + 7200 + 1600);
    expect(_scent.G.counts.breaths! + _scent.G.counts.coughs!).toBeGreaterThan(0); // breathed by itself (or coughed on it)
    // the overflow: lost in her, a forced deep breath 900 ms later
    fill(_scent.capacity() + 1);
    t.to(2000 + 7200 + 1600 + 3000);
    expect(_scent.G.counts.lost).toBe(1);
    expect(t.stimulus).not.toHaveBeenCalled();
    expect(JSON.stringify(s.commander.stimuli ?? null)).toBe(before);
    // a breath the commander takes is
    _scent.G.inhaling = true; _scent.G.depth = 0.9; _scent.G.forcedDeep = false;
    _scent.inhaleEnd();
    expect(t.stimulus).toHaveBeenCalledTimes(1);
  });

  it('I3: with bodily fluids off her stand-in scent is not sweat (the prototype\'s leather for her feet); on, it is sweat', () => {
    const off = hold();
    const t = draw(off);
    t.to(2000);
    expect(_scent.S.color).toBe('leather');
    _scent.G.zoneNow = null; _scent.G.I = 0.4;
    _scent.breathWords(0.5);
    vi.advanceTimersByTime(600);
    for (const h of _scent.G.head) expect(['salt', 'sweat', 'skin', 'damp heat', 'musk', 'a sharp tang', 'dried salt', 'her run', 'brine', 'body heat', 'warm damp', 'her effort']).not.toContain(h.w);
    t.screen.dispose();
    const on = hold();
    enable(on, 'bodily_fluids');
    draw(on).to(2000);
    expect(_scent.S.color).toBe('sweat');
  });

  it('M3: the head\'s capacity is the engine\'s (headCapacity of scentToleranceOf)', () => {
    const s = hold();
    draw(s).to(2000);
    expect(_scent.capacity()).toBe(headCapacity(scentToleranceOf(s, reg, ANN)));
  });

  it('fix round 2, N1: a cough on the body\'s own breath clears it, so the next deep breath the commander chooses is reported', () => {
    const t = draw(hold());
    t.to(2000);
    // the overflow's forced breath, coughed on
    _scent.G.inhaling = true; _scent.G.depth = 0.6; _scent.G.forcedDeep = true;
    _scent.reflex();
    expect(t.stimulus).not.toHaveBeenCalled();
    expect(_scent.G.forcedDeep).toBe(false);
    // the commander's own deep breath after it
    _scent.G.reflexCd = 0;
    _scent.G.inhaling = true; _scent.G.depth = 0.9;
    _scent.inhaleEnd();
    expect(t.stimulus).toHaveBeenCalledTimes(1);
  });
});
