// @vitest-environment jsdom
/**
 * P10e-e Task 5: the instrument host. An instrument draws a run in real time instead of the physics card; the stop pill stays; a new run,
 * no run, a stage reset and dispose stop it, and nothing it scheduled runs or dispatches afterwards; the dial dims while it runs (R6).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaging } from '../../../src/blocking/controller';
import type { Registries } from '../../../src/content/types';
import type { Action } from '../../../src/engine/dispatch';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import type { PhysicsRun } from '../../../src/engine/physics/state';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { _resetInstrumentDefs, instrumentFor, registerInstrument } from '../../../src/ui/scene/instruments/host';
import type { InstrumentDef, InstrumentEnv } from '../../../src/ui/scene/instruments/types';
import { say } from '../../../src/ui/scene/instruments/kit/hand';
import { heartTick } from '../../../src/ui/scene/instruments/kit/heart';
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
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetSceneStage();
  _resetInstrumentDefs();
  document.body.innerHTML = '';
  resetBlockingHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];

/** Ann holds the commander under her arm (breath, a timing interaction); the first segment runs. */
function hold(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

/** A fake frame clock: `raf` queues, `frame()` runs what is queued. */
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
      const due = [...queue.entries()];
      queue.clear();
      for (const [, fn] of due) fn(t);
    },
    pending: () => queue.size,
  };
}

/** A test instrument: it draws a mark, presses `hold` on every frame, and (on purpose) forgets to cancel its frame when stopped. */
function testDef(over: Partial<InstrumentDef> = {}) {
  const calls = { start: [] as string[], update: [] as string[], stop: 0, env: null as InstrumentEnv | null };
  const def: InstrumentDef = {
    id: 'test',
    matches: () => true,
    start(env, r) {
      calls.start.push(r.id);
      calls.env = env;
      const mark = h('div', { class: 'test-instrument' });
      env.layers.moment.append(mark);
      const loop = (): void => {
        env.staging.input({ beat: env.staging.beat(), kind: 'breathe' });
        env.raf(loop);
      };
      env.raf(loop);
      return {
        update: (next: PhysicsRun) => { calls.update.push(next.id); },
        stop: () => { calls.stop += 1; mark.remove(); },
      };
    },
    ...over,
  };
  return { def, calls };
}

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging>; samples?: never } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const input = vi.fn();
  const stopWord = vi.fn(() => []);
  const noop = (): [] => [];
  const f = frames();
  const staging = {
    input, endSegment: noop, stopWord, skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => null, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: 0 }), ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState: () => state, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() },
    frames: f,
    ...(over.samples ? { samples: over.samples } : {}),
  });
  return { host, screen, input, stopWord, frames: f, q: (sel: string) => host.querySelector<HTMLElement>(sel) };
}

describe('the instrument host', () => {
  it('no instrument, the card as today', () => {
    const t = draw(hold());
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(t.q('.alius-stage-dial[data-instrument]')).toBeNull();
  });

  it('turn-based draws the card: real time off, or the run\'s interaction toggled off', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const off = draw(s, { settings: { physicsRealtime: false } });
    expect(off.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    off.screen.dispose();
    const interaction = String(reg.contactPhysics.get(s.scene!.physics!.physicsId)!.interaction);
    const toggled = draw(s, { settings: { physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, [interaction]: false } } });
    expect(toggled.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(calls.start).toEqual([]);
    expect(instrumentFor(s.scene!.physics!, s, reg, { ...DEFAULT_SETTINGS, physicsRealtime: false })).toBeNull();
    expect(instrumentFor(s.scene!.physics!, s, reg, DEFAULT_SETTINGS)).toBe(def);
  });

  it('the first definition that matches wins, in the order of registration', () => {
    const a = testDef({ id: 'a', matches: () => false });
    const b = testDef({ id: 'b' });
    const c = testDef({ id: 'c' });
    registerInstrument(a.def);
    registerInstrument(b.def);
    registerInstrument(c.def);
    const s = hold();
    expect(instrumentFor(s.scene!.physics!, s, reg, DEFAULT_SETTINGS)?.id).toBe('b');
  });

  it('real time mounts once per run: a redraw updates, a new run stops the old one, no run stops it', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    expect(calls.start).toEqual(['p1']);
    expect(t.q('.alius-physics')).toBeNull(); // no card while the instrument draws
    expect(t.q('.alius-layer-moment .test-instrument')).not.toBeNull();
    expect(t.q('.alius-instrument[data-analyze="glossary:instrument"]')).not.toBeNull();
    t.screen.refresh();
    t.screen.refresh();
    expect(calls.start).toEqual(['p1']);
    expect(calls.update).toEqual(['p1', 'p1']);
    s.scene!.physics!.id = 'p2';
    t.screen.refresh();
    expect(calls.stop).toBe(1);
    expect(calls.start).toEqual(['p1', 'p2']);
    delete s.scene!.physics;
    t.screen.refresh();
    expect(calls.stop).toBe(2);
    expect(t.q('.test-instrument')).toBeNull();
    expect(t.q('.alius-instrument')).toBeNull();
  });

  it('the env: her look, the layers, the input field and the staging', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const t = draw(hold());
    const env = calls.env!;
    const her = env.her(ANN);
    expect(her.unitId).toBe(ANN);
    expect(her.name).not.toBe('');
    expect(her.accent).toMatch(/^#|^rgb|^var|^color/);
    expect(her.hand).not.toBe('');
    expect(her.handScale).toBeGreaterThan(0);
    expect(typeof her.style).toBe('string');
    expect(env.input).toBe(t.q('input[name="cmd"]'));
    expect(env.layers.moment.classList.contains('alius-layer-moment')).toBe(true);
    expect(env.layers.pose.classList.contains('alius-layer-pose')).toBe(true);
    expect(env.layers.effects.classList.contains('alius-layer-effects')).toBe(true);
    expect(env.staging.clock().beatMs).toBe(1500);
    expect(env.samples).toBeNull();
    expect(env.art.get(ANN, 'over')).toBeNull();
    expect(env.reduced).toBe(false);
    expect(env.readable).toBe(false);
  });

  it('the stop pill stays while the instrument runs, and its click dispatches physics/stop_word', () => {
    const { def } = testDef();
    registerInstrument(def);
    const s = hold();
    const dispatched: string[] = [];
    const real = createStaging({
      app: { dispatch: (a: Action) => { dispatched.push(a.type); return []; }, current: () => ({ state: s, load: { chatId: 'c' } }) } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => 0, toast: () => {},
    });
    const t = draw(s, { staging: { stopWord: () => real.stopWord() } });
    const pill = t.q('.alius-stage-dial .alius-stop-pill[data-stop-word]');
    expect(pill).not.toBeNull();
    pill!.click();
    expect(dispatched).toEqual(['physics/stop_word']);
  });

  it.each([
    ['a stage reset', (t: ReturnType<typeof draw>) => resetSceneStage()],
    ['dispose', (t: ReturnType<typeof draw>) => t.screen.dispose()],
  ])('%s stops it: no frame runs and no input is staged afterwards', (_what, end) => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const t = draw(hold());
    t.frames.frame();
    t.frames.frame();
    expect(t.input).toHaveBeenCalledTimes(2);
    end(t);
    expect(calls.stop).toBe(1);
    expect(t.frames.pending()).toBe(0);
    t.frames.frame();
    vi.advanceTimersByTime(5000);
    expect(t.input).toHaveBeenCalledTimes(2);
    // a late call through the env it was given goes nowhere
    calls.env!.staging.input({ beat: 0, kind: 'breathe' });
    calls.env!.staging.stopWord();
    expect(t.input).toHaveBeenCalledTimes(2);
    expect(t.stopWord).not.toHaveBeenCalled();
  });

  it('the whole stop-word chain: pill → physics/stop_word → refresh with the run gone → stop(), then no input and no frame', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const dispatched: string[] = [];
    const real = createStaging({
      app: {
        dispatch: (a: Action) => { dispatched.push(a.type); if (a.type === 'physics/stop_word') delete s.scene!.physics; return []; },
        current: () => ({ state: s, load: { chatId: 'c' } }),
      } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => 0, toast: () => {},
    });
    const t = draw(s, { staging: { stopWord: () => real.stopWord() } });
    t.frames.frame();
    expect(t.input).toHaveBeenCalledTimes(1);
    t.q('.alius-stop-pill[data-stop-word]')!.click();
    expect(dispatched).toEqual(['physics/stop_word']);
    t.screen.refresh(); // the app redraws after the dispatch
    expect(calls.stop).toBe(1);
    expect(t.q('.alius-instrument')).toBeNull();
    expect(t.frames.pending()).toBe(0);
    t.frames.frame();
    vi.advanceTimersByTime(5000);
    expect(t.input).toHaveBeenCalledTimes(1);
  });

  it('an instrument whose start throws: the card is drawn, the pill is there, the refresh completes (warned once)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { def, calls } = testDef({ start: () => { throw new Error('boom'); } });
    registerInstrument(def);
    const t = draw(hold());
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(t.q('.alius-stop-pill[data-stop-word]')).not.toBeNull();
    expect(t.q('.alius-instrument')).toBeNull();
    expect(t.q('.alius-stage-dial')!.hasAttribute('data-instrument')).toBe(false);
    t.screen.refresh();
    t.screen.refresh();
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(calls.stop).toBe(0);
  });

  it('a throwing update or stop does not break the refresh (the card takes over after a failed update)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = testDef();
    let n = 0;
    registerInstrument({
      ...base.def,
      start(env, r) {
        const inner = base.def.start(env, r);
        return { update: () => { n += 1; throw new Error('update'); }, stop: () => { inner.stop(); throw new Error('stop'); } };
      },
    });
    const s = hold();
    const t = draw(s);
    expect(t.q('.alius-instrument')).not.toBeNull();
    expect(() => t.screen.refresh()).not.toThrow();
    expect(n).toBe(1);
    expect(base.calls.stop).toBe(1); // its stop ran (and threw), the host cleaned up anyway
    expect(t.q('.alius-instrument')).toBeNull();
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(t.frames.pending()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2); // update and stop, once each
  });

  it('the host restores what instruments share: her lines go and the input line is plain again', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    const env = calls.env!;
    say(env.layers.effects, 'hold it.', { her: env.her(ANN) });
    env.gauge.narrow(0.5);
    env.gauge.tremble(2);
    expect(t.q('.alius-her-line')).not.toBeNull();
    delete s.scene!.physics;
    t.screen.refresh();
    expect(t.q('.alius-her-line')).toBeNull();
    const line = t.q('.alius-stage-input')!;
    expect(line.style.getPropertyValue('--alius-gauge-narrow')).toBe('');
    expect(line.dataset.tremble).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a remount after a long gap does not replay the heart: the host stops it with the instrument', () => {
    let started = 0;
    const param = () => ({ value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} });
    const ctx = {
      currentTime: 0,
      createOscillator: () => ({ type: '', frequency: param(), connect: () => {}, start: () => { started += 1; }, stop: () => {} }),
      createGain: () => ({ gain: param(), connect: () => {} }),
    };
    const samples = { ctx: () => ctx, bus: () => ({}) } as never;
    const { def } = testDef({ start: (env) => { heartTick(env.samples!, 60); return { update: () => heartTick(env.samples!, 60), stop: () => {} }; } });
    registerInstrument(def);
    const s = hold();
    const t = draw(s, { samples });
    ctx.currentTime = 2.5;
    t.screen.refresh(); // update: three beats due
    expect(started).toBe(6);
    delete s.scene!.physics;
    t.screen.refresh(); // the instrument stops
    expect(vi.getTimerCount()).toBe(0);
    ctx.currentTime = 600;
    s.scene!.physics = hold().scene!.physics; // a new run, ten minutes later
    s.scene!.physics!.id = 'p2';
    t.screen.refresh();
    t.screen.refresh();
    expect(started).toBeLessThanOrEqual(6 + 2);
  });

  it('the dial dims while one runs (R6), and stops dimming after', () => {
    const { def } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    expect(t.q('.alius-stage-dial')!.dataset.instrument).toBe('test');
    delete s.scene!.physics;
    t.screen.refresh();
    expect(t.q('.alius-stage-dial')!.hasAttribute('data-instrument')).toBe(false);
  });
});

describe('the staging clock (R5)', () => {
  it('returns startedAt, beatMs 1500 and now from the controller\'s clock', () => {
    const s = hold();
    s.settings.physicsRealtime = true;
    const clock = { now: 10_000 };
    const staging = createStaging({
      app: { dispatch: () => [], current: () => ({ state: s, load: { chatId: 'c' } }) } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => clock.now, toast: () => {},
    });
    expect(staging.clock()).toEqual({ startedAt: null, beatMs: 1500, now: 10_000 });
    staging.tick(10_500); // the running segment starts its clock
    clock.now = 12_000;
    expect(staging.clock()).toEqual({ startedAt: 10_500, beatMs: 1500, now: 12_000 });
  });
});
