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
import type { InstrumentDef, InstrumentEnv, PhysicsEnd } from '../../../src/ui/scene/instruments/types';
import { say, unsay } from '../../../src/ui/scene/instruments/kit/hand';
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
beforeEach(() => {
  vi.useFakeTimers();
  _resetInstrumentDefs(); // the shipped instruments (breath, registered at import) are not this file's: each test registers its own
});
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
  r.state.settings.physicsRealtime = true; // the campaign's mirror of the real-time setting (the host needs both)
  return r.state;
}

/** Lets the host's end-of-run microtask run (it asks the staging for the outcome a microtask after the redraw). */
const flush = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

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
  const calls = { start: [] as string[], update: [] as string[], stop: 0, env: null as InstrumentEnv | null, finish: null as ((e: PhysicsEnd) => number) | null };
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
        finish: (e: PhysicsEnd) => (calls.finish ? calls.finish(e) : 0),
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

  it('real time mounts once per run: a redraw updates, a new run stops the old one, no run stops it', async () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    expect(calls.start).toEqual(['p1']);
    expect(t.q('.alius-physics')).toBeNull(); // no card while the instrument draws
    expect(t.q('.alius-layer-moment .test-instrument')).not.toBeNull();
    expect(t.q('.alius-instrument[data-instrument="test"]')).not.toBeNull();
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
    await flush();
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

  it('the whole stop-word chain: pill → physics/stop_word → refresh with the run gone → stop() at once (no end is played), then no input and no frame', async () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const dispatched: string[] = [];
    const real = createStaging({
      app: {
        dispatch: (a: Action) => {
          dispatched.push(a.type);
          if (a.type !== 'physics/stop_word') return [];
          delete s.scene!.physics;
          return [{ type: 'physics_outcome', runId: 'p1', physicsId: 'breath', result: 'stopped' }];
        },
        current: () => ({ state: s, load: { chatId: 'c' } }),
      } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => 0, toast: () => {},
    });
    const finish = vi.fn(() => 3000);
    calls.finish = finish;
    const t = draw(s, { staging: { stopWord: () => real.stopWord(), outcome: (id) => real.outcome(id) } });
    t.frames.frame();
    expect(t.input).toHaveBeenCalledTimes(1);
    t.q('.alius-stop-pill[data-stop-word]')!.click();
    expect(dispatched).toEqual(['physics/stop_word']);
    t.screen.refresh(); // the app redraws after the dispatch
    await flush();
    expect(finish).not.toHaveBeenCalled(); // the stop word plays no end
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

  it('a failed mount is forgotten on a chat switch: the same scene and run ids in the next chat start the instrument again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let tries = 0;
    const base = testDef();
    registerInstrument({ ...base.def, start(env, r) { tries += 1; if (tries === 1) throw new Error('boom'); return base.def.start(env, r); } });
    const s = hold();
    const t = draw(s);
    expect(t.q('.alius-instrument')).toBeNull(); // the first start threw: the card plays the run
    t.screen.refresh();
    expect(tries).toBe(1); // not retried within the scene
    resetSceneStage(); // a chat switch: scene ids and run ids repeat across campaigns
    t.screen.refresh();
    expect(tries).toBe(2);
    expect(t.q('.alius-instrument')).not.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a throwing matches does not abort the refresh: the next definition is asked, else the card is drawn (warned once)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerInstrument({ ...testDef().def, id: 'bad', matches: () => { throw new Error('matches'); } });
    const s = hold();
    const t = draw(s);
    expect(t.q('.alius-physics[data-run="p1"]')).not.toBeNull();
    expect(() => t.screen.refresh()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    const good = testDef({ id: 'good' });
    registerInstrument(good.def);
    t.screen.refresh();
    expect(good.calls.start).toEqual(['p1']);
    expect(instrumentFor(s.scene!.physics!, s, reg, DEFAULT_SETTINGS)).toBe(good.def);
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

  it('the host restores what instruments share: her lines go and the input line is plain again', async () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    const env = calls.env!;
    env.say(env.layers.effects, 'hold it.', { her: env.her(ANN) });
    env.gauge.narrow(0.5);
    env.gauge.tremble(2);
    expect(t.q('.alius-her-line')).not.toBeNull();
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
    expect(t.q('.alius-her-line')).toBeNull();
    const line = t.q('.alius-stage-input')!;
    expect(line.style.getPropertyValue('--alius-gauge-narrow')).toBe('');
    expect(line.dataset.tremble).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a remount after a long gap does not replay the heart: the host stops it with the instrument', async () => {
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
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    ctx.currentTime = 600;
    s.scene!.physics = hold().scene!.physics; // a new run, ten minutes later
    s.scene!.physics!.id = 'p2';
    t.screen.refresh();
    t.screen.refresh();
    expect(started).toBeLessThanOrEqual(6 + 2);
  });

  it('the end of a run: finish(outcome) keeps it drawing (staging dead) for the ms it asks, then the host unmounts', async () => {
    const { def, calls } = testDef();
    const ends: PhysicsEnd[] = [];
    calls.finish = (e) => { ends.push(e); return 2000; };
    registerInstrument(def);
    const s = hold();
    let outcome: PhysicsEnd | null = null;
    const t = draw(s, { staging: { outcome: () => outcome } });
    t.frames.frame();
    expect(t.input).toHaveBeenCalledTimes(1);
    delete s.scene!.physics;
    outcome = { runId: 'p1', physicsId: 'breath', result: 'blackout' }; // the staging hears of it a microtask after the redraw
    t.screen.refresh();
    await flush();
    expect(ends).toEqual([{ runId: 'p1', physicsId: 'breath', result: 'blackout' }]);
    expect(calls.stop).toBe(0);
    expect(t.q('.alius-instrument')).not.toBeNull();
    t.frames.frame(); // its frames still run (the exit plays) …
    expect(t.frames.pending()).toBe(1);
    expect(t.input).toHaveBeenCalledTimes(1); // … but nothing reaches the engine
    t.screen.refresh(); // a redraw meanwhile changes nothing
    vi.advanceTimersByTime(1999);
    expect(calls.stop).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls.stop).toBe(1);
    expect(t.q('.alius-instrument')).toBeNull();
    expect(t.frames.pending()).toBe(0);
  });

  it('no known outcome: the host unmounts at once; a new run, a reset or dispose cut an end short', async () => {
    const { def, calls } = testDef();
    calls.finish = () => 5000;
    registerInstrument(def);
    const s = hold();
    const run1 = s.scene!.physics!;
    let outcome: PhysicsEnd | null = null;
    const t = draw(s, { staging: { outcome: () => outcome } });
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
    expect(calls.stop).toBe(1); // nothing known: no end
    // a new run mid-end
    s.scene!.physics = { ...run1, id: 'p2' };
    t.screen.refresh();
    delete s.scene!.physics;
    outcome = { runId: 'p2', physicsId: 'breath', result: 'released' };
    t.screen.refresh();
    await flush();
    expect(calls.stop).toBe(1);
    s.scene!.physics = { ...run1, id: 'p3' };
    t.screen.refresh();
    expect(calls.stop).toBe(2);
    expect(calls.start).toEqual(['p1', 'p2', 'p3']);
    // a reset mid-end
    delete s.scene!.physics;
    outcome = { runId: 'p3', physicsId: 'breath', result: 'released' };
    t.screen.refresh();
    await flush();
    expect(calls.stop).toBe(2);
    resetSceneStage();
    expect(calls.stop).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the host undoes what stop() forgets: a loop, a source, a timer, a document listener, a blur and a mark on the layers', async () => {
    const loopStop = vi.fn();
    const sourceStop = vi.fn();
    const dull = vi.fn();
    const ctx = { currentTime: 0, createBufferSource: () => ({ stop: sourceStop, disconnect: () => {}, connect: () => {}, start: () => {} }) };
    const samples = {
      play: vi.fn(), loop: vi.fn(() => ({ setGain: () => {}, setRate: () => {}, stop: loopStop })), preload: async () => {}, buffer: () => null,
      ctx: () => ctx, bus: () => ({}), setWorldDull: dull, setNight: vi.fn(), setMuffle: vi.fn(), setSensory: vi.fn(), dispose: vi.fn(),
    };
    const late = vi.fn();
    const keyed = vi.fn();
    const { def } = testDef({
      start(env) {
        env.samples!.loop('assets/sounds/x.ogg');
        (env.samples!.ctx() as unknown as typeof ctx).createBufferSource();
        env.samples!.setWorldDull(0.8);
        env.samples!.dispose(); // never the app's
        env.timeout(late, 1000);
        env.listen(document, 'keydown', keyed);
        env.layers.backdrop.style.filter = 'blur(6px)';
        env.layers.effects.dataset.tunnel = '0.7';
        env.root.style.setProperty('--alius-tilt', '3deg');
        return { update: () => {}, stop: () => {} }; // forgets all of it
      },
    });
    registerInstrument(def);
    const s = hold();
    const t = draw(s, { samples: samples as never });
    const backdrop = t.q('.alius-layer-backdrop')!;
    expect(backdrop.style.filter).toBe('blur(6px)');
    t.q('.alius-scene')!.style.setProperty('--alius-pan', '0.3'); // the scene's own (looking around) is left alone
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
    expect(loopStop).toHaveBeenCalled();
    expect(sourceStop).toHaveBeenCalled();
    expect(dull).toHaveBeenLastCalledWith(0);
    expect(samples.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(late).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(keyed).not.toHaveBeenCalled();
    expect(backdrop.style.filter).toBe('');
    expect(t.q('.alius-layer-effects')!.dataset.tunnel).toBeUndefined();
    const root = t.q('.alius-scene')!;
    expect(root.style.getPropertyValue('--alius-tilt')).toBe('');
    expect(root.style.getPropertyValue('--alius-pan')).toBe('0.3');
    expect(root.dataset.stage).toBe('frame');
  });

  it('the play layers carry no [data-analyze] from the host (the mark is a plain flag)', () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const t = draw(hold());
    const mark = t.q('.alius-instrument')!;
    expect(mark.hasAttribute('data-analyze')).toBe(false);
    for (const el of [mark, ...Object.values(calls.env!.layers)]) expect(el.closest('[data-analyze]')).toBeNull();
  });

  it('real time needs the campaign mirror too; the mark follows reduced motion and readable mode on each redraw', () => {
    const { def } = testDef();
    registerInstrument(def);
    const s = hold();
    s.settings.physicsRealtime = false;
    expect(instrumentFor(s.scene!.physics!, s, reg, DEFAULT_SETTINGS)).toBeNull();
    s.settings.physicsRealtime = true;
    const settings: Partial<AliusSettings> = {};
    const t = draw(s, { settings });
    const mark = t.q('.alius-instrument')!;
    expect(mark.hasAttribute('data-reduced')).toBe(false);
    settings.reducedMotion = true;
    settings.readableMode = true;
    t.screen.refresh();
    expect(mark.hasAttribute('data-reduced')).toBe(true);
    expect(mark.hasAttribute('data-readable')).toBe(true);
  });

  it('the unmount clears only the lines this mount wrote through env.say (a line someone else writes in a layer stays)', async () => {
    const { def, calls } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    const env = calls.env!;
    env.say(env.layers.effects, 'mine.', { her: env.her(ANN) });
    say(env.layers.moment, 'the slap\'s line.', { her: env.her(ANN) }); // written by another surface (the slap overlay) straight with the kit
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
    expect(t.q('.alius-layer-effects .alius-her-line')).toBeNull();
    expect(t.q('.alius-layer-moment .alius-her-line')).not.toBeNull();
    unsay(t.q('.alius-layer-moment')!);
  });

  it('a source that ended is no longer kept (a long hold does not pile up nodes)', () => {
    const nodes: EventTarget[] = [];
    const ctx = {
      currentTime: 0,
      createOscillator: () => { const n = Object.assign(new EventTarget(), { stop: vi.fn(), disconnect: () => {}, connect: () => {}, start: () => {} }); nodes.push(n); return n; },
    };
    const samples = { play: vi.fn(), loop: vi.fn(), preload: async () => {}, buffer: () => null, ctx: () => ctx, bus: () => ({}), setWorldDull: vi.fn(), setNight: vi.fn(), setMuffle: vi.fn(), setSensory: vi.fn(), dispose: vi.fn() };
    let made: { stop: ReturnType<typeof vi.fn> }[] = [];
    const { def } = testDef({
      start(env) {
        const c = env.samples!.ctx() as unknown as typeof ctx;
        made = [c.createOscillator(), c.createOscillator()] as never;
        return { update: () => {}, stop: () => {} };
      },
    });
    registerInstrument(def);
    draw(hold(), { samples: samples as never });
    nodes[0].dispatchEvent(new Event('ended'));
    resetSceneStage();
    expect(made[0].stop).not.toHaveBeenCalled(); // it ended on its own: forgotten
    expect(made[1].stop).toHaveBeenCalled();
  });

  it('the input field\'s own style and data-* are put back too', async () => {
    const { def } = testDef({
      start(env) {
        env.input.style.letterSpacing = '0.4em';
        env.input.dataset.jaw = 'open';
        return { update: () => {}, stop: () => {} };
      },
    });
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    const input = t.q('input[name="cmd"]')!;
    expect(input.dataset.jaw).toBe('open');
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
    expect(input.style.letterSpacing).toBe('');
    expect(input.dataset.jaw).toBeUndefined();
  });

  it('the dial dims while one runs (R6), and stops dimming after', async () => {
    const { def } = testDef();
    registerInstrument(def);
    const s = hold();
    const t = draw(s);
    expect(t.q('.alius-stage-dial')!.dataset.instrument).toBe('test');
    delete s.scene!.physics;
    t.screen.refresh();
    await flush();
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

  it('outcome(runId): the physics_outcome it saw for the open scene; a reset forgets it', () => {
    const s = hold();
    const staging = createStaging({
      app: { dispatch: () => [], current: () => ({ state: s, load: { chatId: 'c' } }) } as never,
      registries: () => reg, settings: () => DEFAULT_SETTINGS, generations: { bind() {}, generate: async () => ({ kind: 'expired' }) } as never,
      scene: { replyPending: () => false, end: async () => {} }, now: () => 0, toast: () => {},
    });
    expect(staging.outcome('p1')).toBeNull();
    staging.onEvents([{ type: 'physics_outcome', runId: 'p1', physicsId: 'breath', result: 'released' }]);
    expect(staging.outcome('p1')).toEqual({ runId: 'p1', physicsId: 'breath', result: 'released' });
    staging.reset();
    expect(staging.outcome('p1')).toBeNull();
  });
});
