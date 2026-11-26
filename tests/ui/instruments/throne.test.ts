// @vitest-environment jsdom
/**
 * P10e-e Task 24b: the throne (throne.html `THE THRONE`): the weight inside her frame. Her mug (tolerance 0.12, her shifts at 0.35, 0.5 s out of
 * level spills), the flinch (steadied within 0.8 s: held; else a `jerk` noise), the pen's skid (160 ms above 140 px/s), the landing (out of
 * level: 18 × weight), her legs' picture placed by the screen with the world's inset compensated (left / right mirrored; a pair of files, no
 * mirror), her thanks at the end.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resetPresenceHooks } from '../../../src/engine/physics/presence';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import type { ArtSlots } from '../../../src/ui/scene/art';
import { _activity } from '../../../src/ui/scene/instruments/activity/frame';
import { T_MOUSE, throneArt, throneCup, throneFlinch, throneRise, throneSign, throneUpdate, wCueShift } from '../../../src/ui/scene/instruments/activity/throne';
import { weightCore } from '../../../src/ui/scene/instruments/weight/weight';
import '../../../src/ui/scene/instruments';
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
/** Ann reading reports, sitting on the commander's back (human_chair: the weight inside her frame), one segment running in real time. */
function throne(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification', 'humiliation', 'restraint');
  s.settings.physicsRealtime = true;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'human_chair', with: COMMANDER }, { at: 2, source: 'chip' });
  expect(st.scene!.physics).toMatchObject({ sourceKind: 'activity', second: { physicsId: 'weight' } });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
function frames() {
  let next = 1, t = 0;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    now: () => t,
    raf: (fn: FrameRequestCallback) => { const id = next++; queue.set(id, fn); return id; },
    cancelRaf: (id: number) => { queue.delete(id); },
    frame(ms = 16) { t += ms; vi.advanceTimersByTime(ms); const due = [...queue.values()]; queue.clear(); for (const fn of due) fn(t); },
  };
}
function draw(state: CampaignState, art?: ArtSlots) {
  const controller = { send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn() } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const f = frames();
  const noop = (): [] => [];
  const relief = vi.fn(() => []);
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(),
    physics: { input, endSegment: noop, stopWord: vi.fn(() => []), skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => null, beat: () => 0, clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn(), decide: vi.fn(() => []), relief } as never,
    frames: f, assetUrl: (p: string) => `/x/${p}`, ...(art ? { art } : {}),
  });
  const to = (ms: number) => { while (f.now() < ms) f.frame(); };
  return { host, screen, input, relief, frames: f, to };
}
const W = () => weightCore.G as unknown as Record<string, number & Record<string, unknown>>;

describe('the throne (24b)', () => {
  it('mounts the weight core inside her frame (the footrest view) and the throne layer', () => {
    const t = draw(throne());
    t.to(2600);
    expect(_activity.S.inner).toBe('weight');
    expect(_activity.S.contact).toBe('human_chair');
    expect(t.host.querySelector('.alius-act-footrestView .alius-weight')).not.toBeNull();
  });

  it('with her mug the tolerance is 0.12 and her shifts are 0.35 of their size; 0.5 s out of level spills', () => {
    const t = draw(throne());
    t.to(2600);
    throneCup();
    expect(weightCore.tol).toBe(0.12);
    expect(_activity.G.cup).not.toBeNull();
    // a cue shift while careful: magnitude × 0.35 (the body cue's own) — her shifts through the core's planShift read the same factor
    W().copTarget = 0 as never;
    wCueShift(1, 1 * 0.35, 600);
    expect((W().shift as unknown as { target: number }).target).toBeCloseTo(0.35 * weightCore.shift(), 6);
    // out of level past its grace for more than 0.5 s: it spills (a felt fault), and the tolerance comes back
    _activity.G.cup.grace = 0;
    W().cop = 0.9 as never; W().ctl = 0 as never;
    throneUpdate(300);
    expect(_activity.G.cup).not.toBeNull();
    throneUpdate(260);
    expect(_activity.G.cup).toBeNull();
    expect(_activity.G.stats.spills).toBe(1);
    expect(weightCore.tol).toBe(0.18);
  });

  it('a flinch steadied within 0.8 s is held, otherwise a jerk noise (reported)', () => {
    const t = draw(throne());
    t.to(2600);
    weightCore.HOLD.on = true;
    throneFlinch();
    W().cop = 0 as never; W().ctl = 0 as never;
    _activity.G.t += 900;
    throneUpdate(16);
    expect(_activity.G.stats.flinchesHeld).toBe(1);
    throneFlinch();
    weightCore.HOLD.on = false; // not holding: the flinch shows
    throneUpdate(16);
    _activity.G.t += 900;
    throneUpdate(16);
    expect(_activity.G.stats.flinches).toBe(1);
    expect((t.relief.mock.calls as unknown as Array<[{ amount: number; involuntary?: boolean }]>).some(([i]) => i.amount === 0.4 && i.involuntary === true)).toBe(true); // a flinch is the body, not a cheat (Ruling X)
  });

  it('a skid needs 160 ms above 140 px/s', () => {
    const t = draw(throne());
    t.to(2600);
    throneSign();
    T_MOUSE.speed = 300; T_MOUSE.t = t.frames.now();
    throneUpdate(150);
    expect(_activity.G.stats.skids ?? 0).toBe(0);
    T_MOUSE.t = t.frames.now();
    throneUpdate(20);
    expect(_activity.G.stats.skids).toBe(1);
  });

  it('a landing out of level costs 18 × weight', () => {
    const t = draw(throne());
    t.to(2600);
    throneRise();
    expect(_activity.G.risen).not.toBeNull();
    weightCore.HOLD.on = false;
    const before = W().str as unknown as number;
    t.to(t.frames.now() + 6500);
    expect(_activity.G.stats.hardLandings).toBe(1);
    expect(before - (W().str as unknown as number)).toBeGreaterThanOrEqual(18 * weightCore.weight() - 0.001);
  });

  it('throneArt places her left leg at x from the left and its mirror at x from the right (the world\'s inset compensated); a pair uses two files, no mirror', () => {
    const art: ArtSlots = { get: (_u, slot) => (slot === 'legs_astride' ? { url: '/leg.png', sidecar: { fit: { height: 1, x: 0.1, top: 0, tilt: 0 }, shown: 'left' } } : null), face: () => null };
    const t = draw(throne(), art);
    t.to(2600);
    const L = t.host.querySelector<HTMLImageElement>('.alius-act-astrideL')!, R = t.host.querySelector<HTMLImageElement>('.alius-act-astrideR')!;
    for (const img of [L, R]) { Object.defineProperty(img, 'naturalWidth', { value: 200 }); Object.defineProperty(img, 'naturalHeight', { value: 400 }); }
    const view = t.host.querySelector<HTMLElement>('.alius-act-footrestView')!;
    Object.defineProperty(view, 'clientWidth', { value: 1000 + 120 }); Object.defineProperty(view, 'clientHeight', { value: 800 + 96 });
    _activity.G.att = 'watching';
    W().lean = 0 as never; W().cop = 0 as never; W().jolt = 0 as never;
    _activity.S.reduced = true;
    throneArt(0);
    const xOf = (el: HTMLElement) => Number(/translate\(([-\d.]+)px/.exec(el.style.transform)![1]);
    // the screen is the frame's size (jsdom: the window's, 1024); the view is larger by the world's inset ((1120 − 1024) / 2 = 48 px a side), so
    // the picture's centre lands at x of the screen from the left (0.1 × 1024) and from the right, offset into the view
    const vw = window.innerWidth, ox = (1120 - vw) / 2;
    expect(xOf(L) + Number.parseFloat(L.style.width) / 2).toBeCloseTo(ox + 0.1 * vw, 1);
    expect(xOf(R) + Number.parseFloat(R.style.width) / 2).toBeCloseTo(ox + vw - 0.1 * vw, 1);
    expect(L.style.transform).not.toContain('scaleX(-1)');
    expect(R.style.transform).toContain('scaleX(-1)');
    _activity.S.legsFeet = 'pair';
    throneArt(0);
    expect(R.style.transform).not.toContain('scaleX(-1)');
  });
});
