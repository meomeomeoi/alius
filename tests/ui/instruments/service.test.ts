// @vitest-environment jsdom
/**
 * P10e-e Task 26: foot service under the desk (docs/prototypes/her_activity.html, the game inside `service`). It plays inside her frame when
 * the commander is under her desk with her foot within reach (read by field) and her practices are live; the gesture classifier and its
 * thresholds, the zones (a stroke outside every zone counts as nowhere), the dirt (against her grain less is wiped), her patience, the close-up's
 * picture and its stand-ins, the still form, her verdict at the session's end (`physics/service`, never after the stop word), the sounds of
 * the craft told to the engine only while a third party could hear them, and the unmount.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { resetPresenceHooks } from '../../../src/engine/physics/presence';
import { servicePaceOf, verdictOf } from '../../../src/engine/physics/service';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { _activity } from '../../../src/ui/scene/instruments/activity/frame';
import { _service, serviceMatches } from '../../../src/ui/scene/instruments/activity/service';
import '../../../src/ui/scene/instruments';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/practice';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSceneStage();
  document.body.innerHTML = '';
  resetBlockingHooks();
  resetPhysicsHooks();
  resetPresenceHooks();
});

const ANN = 'unit_ann';
type Style = 'cold' | 'cruel' | 'playful' | 'affectionate';
/** Ann holding at `play` (her practices live: service and worship), reading reports; the commander under her desk, one segment in real time. */
function served(o: { style?: Style; anchor?: 'under_desk' | 'beside_her'; activity?: string; live?: boolean } = {}): CampaignState {
  registerFrameReader(() => 'play');
  installDynamicHooks();
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification');
  s.settings.physicsRealtime = true;
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  if (o.live !== false) {
    s.squad.find((u) => u.id === ANN)!.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
      practice: { categories: { service: { as: 'enjoys', witness: 'indifferent' }, worship: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: o.style ?? 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' } } as never;
    s.relations[ANN]!.dynamic = { ...blankDynamic(1), frame: 'play', hold: 40 };
  }
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: o.activity ?? 'reading_reports' }, { at: 1, source: 'chip' });
  const anchor = o.anchor ?? 'under_desk';
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: anchor, ...(anchor === 'beside_her' ? { relTo: ANN } : {}) }, { at: 2, source: 'reading' });
  expect(st.scene!.physics?.sourceKind).toBe('activity');
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
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

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; sprite?: string } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const f = frames();
  const noop = (): [] => [];
  const staging = {
    input: vi.fn(), endSegment: noop, stopWord: vi.fn(() => []), skip: vi.fn(() => []), stimulus: noop, act: noop, finishCounted: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), getUp: vi.fn(() => []), found: vi.fn(() => []), script: () => null, relief: vi.fn(() => []), woke: vi.fn(() => []),
    service: vi.fn(() => []), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() } as never,
    frames: f, assetUrl: (p: string) => `/x/${p}`,
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  const frame = q('.alius-layer-frame')!;
  return { host, screen, frames: f, q, to, frame, staging };
}
/** The close-up's picture has a size (jsdom loads none): 400 × 800, so `soleRect` places it. */
function sized(t: ReturnType<typeof draw>): HTMLImageElement {
  const img = t.q('.alius-act-soleArt') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 800, configurable: true });
  return img;
}
/** A session at its signal of `meaning`, the camera in (the foot acts) or under the desk. */
function signalled(t: ReturnType<typeof draw>, meaning: string): void {
  const SV = _service.SV;
  SV.sig = { motion: 'sole', meaning }; SV.phase = 'signal'; SV.act = meaning; SV.closeK = 1; SV.closeTarget = 1; SV.deadline = _activity.G.t + 4000;
  void t;
}
/** The centre of a zone of the close-up, in the scene's pixels. */
function centreOf(zone: string): [number, number] {
  const r = _service.soleRect()!;
  const p = { toes: [0.5, 0.14], ball: [0.5, 0.33], arch: [0.47, 0.56], heel: [0.5, 0.84], edge: [0.28, 0.55] }[zone]!;
  return [r.x + p[0]! * r.w, r.y + p[1]! * r.h];
}
const at = (ms: number) => { _activity.G.t = ms; };

describe('where the service plays (read by field)', () => {
  it('under her desk with her foot within reach and her practices live: the frame plays the service; else stillness', () => {
    const s = served();
    const p = s.scene!.physics!;
    expect(serviceMatches(s, reg, p, 'legs')).toBe(true);
    expect(serviceMatches(s, reg, p, 'her')).toBe(false);
    expect(serviceMatches(served({ live: false }), reg, p, 'legs')).toBe(false);
    const asleep = served({ activity: 'sleeping' });
    expect(serviceMatches(asleep, reg, asleep.scene!.physics!, 'legs')).toBe(false);
    const t = draw(s);
    t.to(2400);
    expect(_activity.S.inner).toBe('service');
    expect(_service.SV).not.toBeNull();
    expect(t.q('.alius-act-close')).not.toBeNull();
  });
});

describe('her foot language reaches the engine (P16b Task 14)', () => {
  const draw2 = (): { t: ReturnType<typeof draw>; signal: ReturnType<typeof vi.fn> } => {
    const signal = vi.fn(() => []);
    const t = draw(served(), { staging: { signal } as never });
    t.to(2400);
    return { t, signal };
  };

  it('an answered bout is reported as answered with its motion, the run and nothing else', () => {
    const { t, signal } = draw2();
    signalled(t, 'kiss');
    _service.svAnswer('kiss'); // the foot act: she lets the commander work
    _service.svEndBout(true);
    expect(signal).toHaveBeenCalledTimes(1);
    expect(signal).toHaveBeenCalledWith(expect.stringMatching(/^p\d+$/), 'sole', true);
  });

  it('a misread signal and a signal left unanswered are reported as missed', () => {
    const { t, signal } = draw2();
    signalled(t, 'kiss');
    _service.svAnswer('clean'); // a misread
    expect(signal).toHaveBeenLastCalledWith(expect.any(String), 'sole', false);
    signalled(t, 'kiss');
    _service.svEndBout(false); // the deadline passed
    expect(signal).toHaveBeenCalledTimes(2);
    expect(signal).toHaveBeenLastCalledWith(expect.any(String), 'sole', false);
  });

  it('a desk bout answered (closer / still / enough) is answered; without the staging call nothing is reported and nothing breaks', () => {
    const { t, signal } = draw2();
    signalled(t, 'still');
    _service.svAnswer('still');
    expect(signal).toHaveBeenLastCalledWith(expect.any(String), 'sole', true);
    const bare = draw(served(), {});
    bare.to(2400);
    signalled(bare, 'kiss');
    expect(() => _service.svEndBout(false)).not.toThrow();
  });
});

describe('the gestures (svDown / svMove / svUp, the prototype\'s thresholds)', () => {
  it('the classifier reads a press held ≥ .3 s under 12 px as a kiss, a back-and-forth as cleaning, a steady turn one way as a rub', () => {
    const t = draw(served());
    t.to(2400);
    sized(t);
    const [x, y] = centreOf('ball');
    // a press held .35 s, a few px of tremble: a kiss
    signalled(t, 'kiss'); at(10000);
    expect(_service.svDown(x, y)).toBe(true);
    at(10200); _service.svMove(x + 3, y + 2);
    at(10350); _service.svUp();
    expect(_service.SV.phase).toBe('craft');
    expect(_service.SV.stats.right).toBe(1);
    // too short a press answers nothing
    signalled(t, 'kiss'); at(20000); _service.svDown(x, y); at(20200); _service.svUp();
    expect(_service.SV.phase).toBe('signal');
    // back and forth: cleaning
    signalled(t, 'clean'); at(30000); _service.svDown(x, y);
    for (let i = 1; i <= 8; i++) { at(30000 + i * 30); _service.svMove(x + (i % 2 ? 40 : 0), y); }
    expect(_service.SV.phase).toBe('craft');
    expect(_service.SV.act).toBe('clean');
    _service.svUp();
    // a steady circle one way: a rub
    _service.SV.stats.right = 0;
    signalled(t, 'rub'); at(40000); _service.svDown(x + 30, y);
    for (let i = 1; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; at(40000 + i * 20); _service.svMove(x + 30 * Math.cos(a), y + 30 * Math.sin(a)); }
    expect(_service.SV.stats.right).toBe(1);
    expect(_service.SV.act).toBe('rub');
    _service.svUp();
    // the wrong gesture is a misread: a rub for a kiss
    const wrong = _service.SV.stats.wrong;
    signalled(t, 'kiss'); at(50000); _service.svDown(x + 30, y);
    for (let i = 1; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; at(50000 + i * 20); _service.svMove(x + 30 * Math.cos(a), y + 30 * Math.sin(a)); }
    expect(_service.SV.stats.wrong).toBe(wrong + 1);
    expect(_service.SV.phase).toBe('wait');
  });

  it('a stroke outside every zone counts as nowhere (neither where she wants it nor elsewhere)', () => {
    const t = draw(served());
    t.to(2400);
    sized(t);
    const r = _service.soleRect()!;
    expect(_service.zoneAt(r.x + 2, r.y + 2)).toBeNull(); // a corner of the picture: no zone
    expect(_service.zoneAt(...centreOf('heel'))).toBe('heel');
    const SV = _service.SV;
    SV.phase = 'craft'; SV.act = 'clean'; SV.want = 'heel'; SV.closeK = 1; SV.goodLen = 0; SV.badLen = 0;
    at(10000); expect(_service.svDown(r.x + 4, r.y + 4)).toBe(true);
    SV.gest.kind = 'clean';
    for (let i = 1; i <= 6; i++) { at(10000 + i * 30); _service.svMove(r.x + 4 + (i % 2 ? 8 : 0), r.y + 4 + i); }
    expect(SV.goodLen ?? 0).toBe(0);
    expect(SV.badLen ?? 0).toBe(0);
  });

  it('scrubbing against her grain wipes less (0.45 of a stroke with it)', () => {
    const t = draw(served());
    t.to(2400);
    sized(t);
    const r = _service.soleRect()!;
    const mask = () => ({ w: 140, h: 280, m: new Float32Array(140 * 280).fill(1), c: document.createElement('canvas'), total0: 140 * 280 });
    const SV = _service.SV;
    const [x, y0] = [r.x + r.w / 2, r.y + r.h * 0.3];
    SV.dirt = mask(); SV.dry = 0;
    const down = _service.wipe(x, y0, x, y0 + 60);
    SV.dirt = mask();
    const up = _service.wipe(x, y0 + 60, x, y0);
    const [withG, against] = down > up ? [down, up] : [up, down];
    expect(against / withG).toBeGreaterThan(0.4); // 0.45 a step: the mask thins as a stroke goes, so a little more than 0.45 overall
    expect(against / withG).toBeLessThan(0.5);
    // a dry mouth wipes less again
    SV.dirt = mask(); SV.dry = 1;
    const dry = Math.max(_service.wipe(x, y0, x, y0 + 60), _service.wipe(x, y0 + 60, x, y0));
    expect(dry).toBeLessThan(withG);
  });

  it('her patience is 3–5 s, cruel shorter: an unanswered signal is missed at her patience', () => {
    for (const style of ['cold', 'playful', 'affectionate'] as const) {
      const p = servicePaceOf(served({ style }), reg, ANN).patience;
      expect(p).toBeGreaterThanOrEqual(3); expect(p).toBeLessThanOrEqual(5);
    }
    expect(servicePaceOf(served({ style: 'cruel' }), reg, ANN).patience).toBeLessThan(3);
    const t = draw(served({ style: 'cruel' }));
    t.to(2400);
    const SV = _service.SV;
    SV.next = _activity.G.t; // her first bout now
    t.to(t.frames.now() + 64);
    expect(SV.phase).toBe('signal');
    t.to(t.frames.now() + 700); // her foot rises (650 ms): the deadline is her patience
    expect(SV.deadline).toBeGreaterThan(0);
    expect(SV.deadline - SV.sigAt).toBeLessThanOrEqual(650 + 2500 + 16); // cruel's 2.5 s from the moment she waits
    t.to(t.frames.now() + 3000);
    expect(SV.stats.missed + SV.stats.right + SV.stats.wrong).toBeGreaterThanOrEqual(1);
  });
});

describe('the keys, the picture, the still form', () => {
  it('Space or Shift typed into the field never answer her; only the mouse acts while it has the focus', () => {
    const t = draw(served());
    t.to(2400);
    sized(t);
    signalled(t, 'kiss');
    const field = t.q('input[name="cmd"]')!;
    field.focus();
    for (const key of [' ', 'Shift']) field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(_service.SV.phase).toBe('signal');
    const [x, y] = centreOf('toes');
    const rect = t.host.querySelector<HTMLElement>('.alius-scene')!.getBoundingClientRect();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: x + rect.left, clientY: y + rect.top });
    t.frame.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true); // the field keeps the focus
    expect(_service.SV.gest).not.toBeNull();
    t.to(t.frames.now() + 400);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    expect(_service.SV.phase).toBe('craft');
  });

  it('without sole_close the close-up shows her raised foot, else her sprite; without a sidecar the automatic zones', () => {
    const t = draw(served());
    t.to(2400);
    const img = t.q('.alius-act-soleArt') as HTMLImageElement;
    expect(img.dataset.stand).toBe('her'); // no art slot in the tests: her sprite
    expect(_activity.S.zones).toBeNull();
    sized(t);
    const r = _service.soleRect()!;
    expect(_service.zoneAt(r.x + 0.5 * r.w, r.y + 0.84 * r.h)).toBe('heel'); // DEFAULT_ZONES
  });

  it('reduced motion and readable mode: the camera steps at once, her foot keeps still, no blur', () => {
    const t = draw(served(), { settings: { reducedMotion: true, readableMode: true } as never });
    t.to(2400);
    sized(t);
    const SV = _service.SV;
    SV.closeTarget = 1; SV.anim = { kind: 'push', t0: _activity.G.t };
    t.to(t.frames.now() + 32);
    expect(SV.closeK).toBe(1);
    expect(SV.fx).toEqual({ dx: 0, dy: 0, s: 1, r: 0 });
    expect(t.q('.alius-act-world')!.style.filter).toContain('blur(0.0px)');
  });
});

describe('what it reports', () => {
  it('her verdict at the session\'s end (physics/service, the bouts\' mean by the prototype\'s threshold); the stop word gives none', () => {
    const t = draw(served());
    t.to(2400);
    const SV = _service.SV;
    SV.stats.bouts = 2; SV.sessionQ = 1.5; SV.sessionN = 2; // a good bout and a half-done one: .75
    _activity.finish('done');
    expect(t.staging.service).toHaveBeenCalledWith('p1', verdictOf(0.75));
    expect(verdictOf(0.75)).toBe('pleased');
    _activity.finish('done');
    expect(t.staging.service).toHaveBeenCalledTimes(1);

    const t2 = draw(served());
    t2.to(2400);
    _service.SV.stats.bouts = 1; _service.SV.sessionQ = 0; _service.SV.sessionN = 1;
    _activity.finish('stop');
    expect(t2.staging.service).not.toHaveBeenCalled();
  });

  it('review I2: the verdict is the crafts\' quality only: three still bouts and one poor kiss do not please her', () => {
    const t = draw(served());
    t.to(2400);
    const SV = _service.SV;
    for (let i = 0; i < 3; i++) { SV.phase = 'signal'; SV.sig = { motion: 'nudge', meaning: 'still' }; SV.act = 'still'; _service.svAnswer('still'); } // desk bouts read right
    expect(SV.stats.right).toBe(3);
    expect(SV.sessionN ?? 0).toBe(0); // no craft judged yet
    Object.assign(SV, { phase: 'craft', act: 'kiss', acts: 3, quality: 0.5 }); // a poor kiss (q ≈ .17)
    _service.svEndBout(true);
    _activity.finish('done');
    expect(t.staging.service).toHaveBeenCalledTimes(1);
    const verdict = (t.staging.service as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(verdict).not.toBe('pleased');
    expect(verdict).toBe(verdictOf(0.5 / 3));
    // misread and unanswered signals do not enter it either; no craft at all: no verdict
    const t2 = draw(served());
    t2.to(2400);
    const S2 = _service.SV;
    S2.phase = 'signal'; S2.sig = { motion: 'sole', meaning: 'kiss' }; _service.svAnswer('rub');
    _activity.finish('done');
    expect(t2.staging.service).not.toHaveBeenCalled();
  });

  it('Ruling AB: the sounds of the craft matter only to a third party (the prototype\'s thirdPartyNoise): nothing of them reaches the engine', () => {
    const t = draw(served());
    t.to(2400);
    sized(t);
    const relief = t.staging.relief as ReturnType<typeof vi.fn>;
    const before = relief.mock.calls.length;
    const SV = _service.SV;
    const [x, y] = centreOf('ball');
    SV.phase = 'craft'; SV.act = 'kiss'; SV.want = 'ball'; SV.closeK = 1;
    _activity.G.call = { heard: false }; _activity.G.herSpeakingUntil = 0;
    for (let i = 0; i < 12; i++) { at(10000 + i * 2000); _service.svDown(x, y); at(11000 + i * 2000); _service.svUp(); } // kisses on the line
    expect(relief.mock.calls.length).toBe(before);
    expect(_activity.G.call.heard).toBe(true); // the line heard one (0.12 > 0.06, a third of the time on the frame's xorshift)
  });

  it.each([
    ['the stop word (the run gone, stopped)', (t: ReturnType<typeof draw>, s: CampaignState) => { delete s.scene!.physics; t.screen.refresh(); }],
    ['a new run', (t: ReturnType<typeof draw>, s: CampaignState) => { s.scene!.physics = { ...s.scene!.physics!, id: 'p2' }; t.screen.refresh(); }],
    ['a stage reset', () => resetSceneStage()],
  ])('review M3: unmount (%s): the lick stops, the close-up goes, no verdict and no relief is sent afterwards', async (_what, end) => {
    const s = served();
    const physicsId = s.scene!.physics!.physicsId;
    const t = draw(s, { staging: { outcome: () => ({ runId: 'p1', physicsId, result: 'stopped' }) } as never });
    t.to(2400);
    sized(t);
    const stop = vi.fn();
    const old = _service.SV;
    old.lick = { src: { stop }, f: {}, g: {} };
    Object.assign(old, { phase: 'craft', act: 'kiss', acts: 1, quality: 1, closeK: 1, closeTarget: 1 });
    const reliefs = (t.staging.relief as ReturnType<typeof vi.fn>).mock.calls.length;
    end(t, s);
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalled();
    expect(_service.SV).not.toBe(old);
    if (_what !== 'a new run') expect(t.host.querySelector('.alius-act-close')).toBeNull();
    t.to(t.frames.now() + 60000);
    expect(t.staging.service).not.toHaveBeenCalled();
    if (_what !== 'a new run') expect((t.staging.relief as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reliefs); // a new run is a new session of its own
  });

  it('stop() leaves no service behind: the lick stops, nothing is dispatched afterwards', () => {
    const t = draw(served());
    t.to(2400);
    const stop = vi.fn();
    _service.SV.lick = { src: { stop }, f: {}, g: {} };
    _service.SV.stats.bouts = 1;
    t.screen.dispose();
    expect(stop).toHaveBeenCalled();
    expect(_service.SV).toBeNull();
    expect(t.host.querySelector('.alius-act-close')).toBeNull();
    t.to(t.frames.now() + 10000);
    expect(t.staging.service).not.toHaveBeenCalled();
  });
});
