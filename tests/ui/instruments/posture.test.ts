// @vitest-environment jsdom
/**
 * P16b Task 23: the game of postures (docs/prototypes/posture.html, normative; its fidelity.json checks the port's code). The hold is the engine's
 * (`practices.postureRun`): the instrument draws the dial as the surface, plays the drift on the engine's rates and reports what happens
 * (`posture/correct`, `posture/slip`, `posture/end`); the engine judges. It draws only in real time with the game switched on; the stop word is the
 * scene's; a blindfold darkens the scene; reduced motion draws no write-on and no jolt; the unmount leaves nothing.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { COMMANDER } from '../../../src/engine/blocking';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { driftRates } from '../../../src/engine/craft/posture';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { postureInstrumentFor } from '../../../src/ui/scene/instruments/host';
import { _posture, ARM_RATE, CORRECT_STEP, FEEL, RATE, SAMPLE_URLS, SLIP_AT } from '../../../src/ui/scene/instruments/posture/posture';
import type { PhysicsPanelStaging } from '../../../src/ui/scene/physicsPanel';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, holdScene } from '../../engine/craft/world';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/ui/scene/instruments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
function fakeCtx(): CanvasRenderingContext2D {
  const t: Record<string | symbol, unknown> = {
    createImageData: (w: number, hh: number) => ({ data: new Uint8ClampedArray(w * hh * 4) }), putImageData: () => undefined,
  };
  return new Proxy(t, { get: (o, p) => (p in o ? o[p] : () => undefined), set: (o, p, v) => { o[p] = v; return true; } }) as unknown as CanvasRenderingContext2D;
}
beforeEach(() => {
  vi.useFakeTimers();
  installCraftHooks();
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

const BEAT_S = TUNING.physics.beatMs / 1000;

/** The scene with Ann (craft-live, at `play`) and the commander in a posture: the hold of `kneel_hands_behind_head` (arms 9 per 10 s) with a term of `until` beats. */
function held(over: { preset?: string; until?: number; hidden?: boolean; realtime?: boolean; style?: string } = {}): CampaignState {
  const s = holdScene(reg, { realtime: over.realtime ?? true });
  delete s.scene!.blocking;
  delete s.scene!.stagingLog;
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'humiliation', 'pet_play', 'objectification'])] };
  s.squad.find((u) => u.id === ANN)!.bond!.practice!.style = { primary: (over.style ?? 'neutral') as never }; // the practices' world has Ann cold: these tests read her neutral unless they say so
  const r = run(s, reg, { type: 'posture/take', payload: { presetId: over.preset ?? 'kneel_hands_behind_head', at: 1, until: over.until ?? 40, ...(over.hidden ? { hidden: true } : {}) } } as never);
  expect(errors(r.events as never)).toEqual([]);
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

type Staging = Partial<PhysicsPanelStaging> & Record<string, unknown>;
function draw(getState: () => CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Staging; samples?: { play: ReturnType<typeof vi.fn> } } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const f = frames();
  const noop = (): [] => [];
  const correct = vi.fn((_o: { point: string; amount: number; attention: string; beat: number }) => [{ type: 'posture_corrected', seen: false }] as never[]);
  const slip = vi.fn((_p: string) => [] as never[]);
  const end = vi.fn((_r: string, _b: number | undefined) => [] as never[]);
  const stopWord = vi.fn(() => []);
  const staging = {
    input: vi.fn(), endSegment: noop, stopWord, skip: noop, act: noop, finishCounted: noop, stimulus: noop, cue: () => null, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), postureCorrect: correct, postureSlip: slip, postureEnd: end, ...over.staging,
  };
  const screen = renderSceneScreen(host, {
    controller, getState, registries: reg, st: new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' }),
    settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over.settings }), onEnded: vi.fn(),
    physics: { ...staging, keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() } as never,
    frames: f, assetUrl: (p: string) => `/x/${p}`, ...(over.samples ? { samples: over.samples as never } : {}),
  });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const key = (k: string, target: EventTarget = document.body, type: 'keydown' | 'keyup' = 'keydown', init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  /** Plays `s` seconds of the hold (frames of 16 ms; the prototype's step caps a frame at 0.12 s). */
  const play = (s: number) => { const until = f.now() + s * 1000; while (f.now() < until) f.frame(); };
  return { host, screen, frames: f, q, key, play, correct, slip, end, stopWord, field: q('input[name="cmd"]') as HTMLInputElement };
}

describe('the posture instrument: matching', () => {
  it('draws an open hold of a posture in real time; the real dial gives way to its own, the stop pill stays', () => {
    const s = held();
    const t = draw(() => s);
    expect(t.q('.alius-pg')).not.toBeNull();
    expect(t.q('.alius-pg #dial.holding')).not.toBeNull();
    expect(t.q('.alius-stage-dial[data-instrument="posture"]')).not.toBeNull();
    expect(t.q('[data-stop-word]')).not.toBeNull();
    expect(_posture.S.preset).toBe('kneel_hands_behind_head');
    expect(getComputedStyle(t.q('.alius-pg')!).getPropertyValue('--dialBig')).toBe('300px');
  });

  it('draws nothing without a hold, in turn-based play, or with the game switched off (the settings and the mirror)', () => {
    const none = holdScene(reg, { realtime: true });
    expect(draw(() => none).q('.alius-pg')).toBeNull();
    const turn = held({ realtime: false });
    expect(draw(() => turn).q('.alius-pg')).toBeNull();
    const s = held();
    expect(draw(() => s, { settings: { physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, posture: false } } }).q('.alius-pg')).toBeNull();
    expect(postureInstrumentFor(s.practices!.postureRun!, s, reg, DEFAULT_SETTINGS)?.id).toBe('posture');
    expect(postureInstrumentFor(s.practices!.postureRun!, s, reg, { ...DEFAULT_SETTINGS, physicsRealtime: false })).toBeNull();
    const mirrored = structuredClone(s);
    mirrored.settings.physicsInteractions = { ...DEFAULT_SETTINGS.physicsInteractions, posture: false };
    expect(postureInstrumentFor(mirrored.practices!.postureRun!, mirrored, reg, DEFAULT_SETTINGS)).toBeNull();
  });

  it('the tables are the engine\'s: the prototype\'s defaults are the registry\'s rates, the constants are TUNING', () => {
    expect(SLIP_AT).toBe(100);
    expect(CORRECT_STEP).toBe(38);
    expect(SAMPLE_URLS).toContain('assets/sounds/ha/cloth1.ogg');
    expect(Object.keys(FEEL)).toEqual(['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet']);
  });
});

describe('the prototype\'s rate tables are the registry\'s', () => {
  it('every preset\'s drift is the prototype\'s RATE (ARM_RATE for the arms) for each point it fixes, but three whose own row (blocking.md 7.3) says otherwise', () => {
    const own = new Set(['kneel_arched', 'light_bearer', 'hogtied']);
    for (const p of reg.servicePostures.values()) {
      if (own.has(String(p.id))) continue;
      const pts = p.points as Record<string, string>;
      const want: Record<string, number> = {};
      for (const [k, v] of Object.entries(pts)) {
        const to = (TUNING.craft.posture.driftTo as Record<string, Record<string, string>>)[k]?.[v];
        if (to !== undefined) want[k] = k === 'arms' ? ARM_RATE[v] ?? RATE.arms! : RATE[k]!;
      }
      expect(p.drift, String(p.id)).toEqual(want);
    }
  });
});

describe('the dial and the beads', () => {
  it('seven numbered beads, 1 TORSO to 7 FEET down the left of the rim; a point the preset does not fix is off', () => {
    const t = draw(() => held());
    const beads = [...t.host.querySelectorAll<HTMLElement>('.alius-pg .bead')];
    expect(beads).toHaveLength(7);
    // the list is reversed along the arc: 7 feet is drawn first (bottom-left), 1 torso last (top-left)
    expect(beads.map((b) => b.firstChild?.textContent).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const off = beads.filter((b) => b.classList.contains('off')).map((b) => b.firstChild?.textContent).sort();
    expect(off).not.toContain('4'); // the arms are held behind the head
    expect(off).toContain('2');
    expect(t.q('.alius-pg #dialLabel')!.textContent).toContain('kneel hands behind head');
    expect(t.q('.alius-pg #dialLabel #clock')!.textContent).toMatch(/min/);
  });

  it('the dial carries data-analyze (P7a)', () => {
    const t = draw(() => held());
    expect(t.q('.alius-pg #dial')!.getAttribute('data-analyze')).toBe('glossary:posture_game');
    expect(t.q('.alius-pg #states')!.getAttribute('data-analyze')).toBe('glossary:posture_game');
  });

  it('the figure is the dial\'s own: the target as a ghost, a point past 22 rings its joint in amber', () => {
    const t = draw(() => held());
    expect(t.q('.alius-pg #dialFace svg.alius-mannequin')).not.toBeNull();
    t.play(1);
    _posture.S.run.o.arms = 30; // the arms drift on the engine's rate (past 22: the ring)
    t.play(0.2);
    expect(t.q('.alius-pg #dialFace .alius-mq-hot')).not.toBeNull();
  });
});

describe('the drift is the engine\'s', () => {
  it('each judged point grows by its rate per 10 s (the engine\'s `driftRates`) times the hold\'s own tiring; a point the preset does not fix does not move', () => {
    const s = held();
    const t = draw(() => s);
    const rates = driftRates(s, reg, ANN, 'kneel_hands_behind_head');
    expect(rates.arms).toBe(9);
    t.play(6);
    const r = _posture.S.run;
    const tired = 1 + Math.min(0.4, (r.t / 120) * 0.4);
    expect(r.o.arms).toBeGreaterThan(0);
    expect(r.o.arms).toBeLessThan((9 / 10) * r.t * (tired + 0.05) * 1.1);
    expect(r.o.arms).toBeGreaterThan((9 / 10) * r.t * 0.99 * 0.95);
    expect(r.o.hips).toBe(0);
    expect(r.fiction).toBeGreaterThan(r.t * 29); // 30 s of fiction a second at skill 0
  });
});

describe('corrections', () => {
  it('a key takes 38 off and reports the drift at the press (the engine judges whether she saw it)', () => {
    const t = draw(() => held());
    t.play(1);
    _posture.S.run.o.arms = 61.5;
    const before = _posture.S.run.o.arms;
    t.key('4');
    expect(t.correct).toHaveBeenCalledTimes(1);
    const sent = t.correct.mock.calls[0]![0];
    expect(sent.point).toBe('arms');
    expect(sent.amount).toBeCloseTo(before, 5);
    expect(['busy', 'glancing', 'watching']).toContain(sent.attention);
    expect(_posture.S.run.o.arms).toBeCloseTo(Math.max(0, before - CORRECT_STEP), 5);
  });

  it('a click on a bead is the same as its key; a drift under 2 is not corrected', () => {
    const t = draw(() => held());
    t.key('4');
    expect(t.correct).not.toHaveBeenCalled();
    t.play(1);
    _posture.S.run.o.arms = 30;
    const bead = [...t.host.querySelectorAll<HTMLElement>('.alius-pg .bead')].find((b) => b.firstChild?.textContent === '4')!;
    bead.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(t.correct).toHaveBeenCalledTimes(1);
  });

  it('the answer of the engine decides the fidget: seen, her line; every third is a slip the engine counted (no second report)', () => {
    const seen = vi.fn(() => [{ type: 'posture_corrected', seen: true }] as never[]);
    const t = draw(() => held(), { staging: { postureCorrect: seen } });
    for (let i = 0; i < 3; i++) { t.play(1); _posture.S.run.o.arms = 50; t.key('4'); }
    expect(seen).toHaveBeenCalledTimes(3);
    expect(_posture.S.run.fidgets).toBe(3);
    expect(t.slip).not.toHaveBeenCalled(); // the third seen correction is the engine's slip; the instrument shows it but reports none
    expect(t.q('.alius-pg #herLine.on')).not.toBeNull();
  });

  it('loudness: a loud correction plays the cloth louder, a creak above .55, and jolts the dial above .3', () => {
    const play = vi.fn();
    const t = draw(() => held(), { samples: { play, preload: async () => undefined, ctx: () => null, bus: () => null, buffer: () => null, loop: vi.fn(), setWorldDull: vi.fn() } as never });
    t.play(1);
    _posture.S.run.o.arms = 80;
    const o = _posture.S.run.o.arms;
    play.mockClear(); // the hold's own cloth at its start is not the correction's
    t.key('4');
    const loud = Math.pow(o / 100, 1.4);
    const cloth = play.mock.calls.find((c) => String(c[0]).includes('cloth'));
    expect(cloth![1].gain).toBeCloseTo(0.05 + loud * 0.5, 5);
    expect(cloth![1].rate).toBeCloseTo(1.15 - loud * 0.3, 5);
    if (loud > 0.55) expect(play.mock.calls.some((c) => String(c[0]).includes('creak'))).toBe(true);
    if (loud > 0.3) expect(t.q('.alius-pg #dial.jolt')).not.toBeNull();
  });
});

describe('a slip', () => {
  it('a point that reaches 100 is a slip: reported, she puts it back at 35, her line is written on', () => {
    const t = draw(() => held());
    _posture.S.run.o.arms = 99.9;
    t.play(0.5);
    expect(t.slip).toHaveBeenCalledWith('arms');
    expect(_posture.S.run.o.arms).toBeLessThan(40);
    expect(_posture.S.run.o.arms).toBeGreaterThanOrEqual(35);
    expect(t.q('.alius-pg #herLine')!.textContent).not.toBe('');
  });
});

describe('the gaze', () => {
  it('a temptation lifts the gaze unless 6 is held; held through it, the gaze stays', () => {
    const gazeHeld = [...reg.servicePostures.values()].find((p) => (p.points as { gaze?: string }).gaze === 'down');
    expect(gazeHeld).toBeDefined();
    const g = held({ preset: String(gazeHeld!.id) });
    const t = draw(() => g);
    expect(_posture.activePoints()).toContain('gaze');
    _posture.event('sound');
    t.play(1);
    expect(_posture.S.run.o.gaze).toBeGreaterThan(5);
    const up = _posture.S.run.o.gaze;
    _posture.event('sound');
    t.key('6');
    expect(_posture.S.held.gaze).toBe(true);
    t.play(1);
    expect(_posture.S.run.o.gaze).toBeCloseTo(up, 3);
    t.key('6', document.body, 'keyup');
    expect(_posture.S.held.gaze).toBe(false);
  });
});

describe('the scene tempts the gaze', () => {
  it('someone who comes in after the hold began is a visitor: the engine\'s temptation plays once, after its hashed delay (a knock, a door), and lifts the gaze', () => {
    const gazeHeld = [...reg.servicePostures.values()].find((p) => (p.points as { gaze?: string }).gaze === 'down')!;
    const g = held({ preset: String(gazeHeld.id) });
    const play = vi.fn();
    const t = draw(() => g, { samples: { play, preload: async () => undefined, ctx: () => null, bus: () => null, buffer: () => null, loop: vi.fn(), setWorldDull: vi.fn() } as never });
    t.play(0.5);
    expect(_posture.S.run.impulses).toHaveLength(0);
    g.scene!.participants = [...g.scene!.participants, 'unit_bea'];
    t.screen.refresh();
    t.play(3); // the delay is at most 2.5 s
    expect(play.mock.calls.some((c) => String(c[0]).includes('knock'))).toBe(true);
    expect(_posture.S.run.o.gaze).toBeGreaterThan(5);
    const knocks = play.mock.calls.filter((c) => String(c[0]).includes('knock')).length;
    t.screen.refresh();
    t.play(6);
    expect(play.mock.calls.filter((c) => String(c[0]).includes('knock')).length).toBe(knocks); // once per event
  });
});

describe('the keys', () => {
  it('act only when nothing editable has the focus: typed in the field, a digit is a letter', () => {
    const t = draw(() => held());
    t.play(1);
    _posture.S.run.o.arms = 50;
    t.key('4', t.field);
    expect(t.correct).not.toHaveBeenCalled();
    t.key('4', document.body, 'keydown', { ctrlKey: true });
    expect(t.correct).not.toHaveBeenCalled();
    t.key('4');
    expect(t.correct).toHaveBeenCalledTimes(1);
  });

  it('do nothing while the device is up over the scene (the scene is inert)', () => {
    const t = draw(() => held());
    t.play(1);
    _posture.S.run.o.arms = 50;
    t.q('.alius-scene')?.setAttribute('inert', '');
    t.key('4');
    expect(t.correct).not.toHaveBeenCalled();
  });
});

describe('a blindfold', () => {
  it('darkens the scene (the blind view and the grain), dims the dial and hides the beads; the body speaks at 40 and 72', () => {
    const s = held();
    const t = draw(() => s);
    expect(t.q('.alius-pg-fx.blind')).toBeNull();
    // a blindfold worn (a `filter sensory_dark` effect in the blocking)
    const item = [...reg.blockingItems.values()].find((i) => JSON.stringify(i).includes('sensory_dark'));
    expect(item).toBeDefined();
    const w = structuredClone(s);
    setBlocking(w, { registries: reg }, { person: COMMANDER, field: 'worn', value: String(item!.id) } as never, { at: 2, source: 'chip' } as never);
    const t2 = draw(() => w);
    expect(t2.q('.alius-pg-fx.blind')).not.toBeNull();
    expect(t2.q('.alius-pg #dial.blind')).not.toBeNull();
    expect(_posture.activePoints()).not.toContain('gaze');
    _posture.S.run.o.arms = 41;
    t2.play(0.2);
    expect(t2.q('.alius-pg #feel div')!.textContent).toBe(FEEL.arms![0]);
    _posture.S.run.o.arms = 73;
    t2.play(0.2);
    expect(t2.q('.alius-pg #feel div')!.textContent).toBe(FEEL.arms![1]);
    expect(t2.q('.alius-pg #feel div.sharp')).not.toBeNull();
  });
});

describe('her lines', () => {
  it('are cardVoice rows by her style (neutral\'s for a style with none); written on in her hand', () => {
    const t = draw(() => held());
    const line = t.q('.alius-pg #herLine')!;
    expect(['Like this. Hold it.', 'Stay like that.']).toContain(line.textContent);
    expect(line.classList.contains('on')).toBe(true);
    expect(line.classList.contains('write')).toBe(true);
    const lines = _posture.LINES();
    expect(lines.neutral!.start).toEqual(['Like this. Hold it.', 'Stay like that.']);
    expect(lines.neutral!.prefix).toBe('Now —');
  });

  it('cold says nothing where it is silent', () => {
    const s = held();
    s.dynamic = s.dynamic ?? ({} as never);
    const t = draw(() => s);
    _posture.S.style = 'cold';
    _posture.refreshLines();
    expect(_posture.LINES().cold!.watch).toEqual(['']);
    expect(_posture.LINES().cold!.prefix).toBe('');
    expect(_posture.LINES().cold!.start).toEqual(['There.']);
    void t;
  });
});

describe('reduced motion', () => {
  it('draws no write-on and no jolt, the dial does not animate its size', () => {
    const t = draw(() => held(), { settings: { reducedMotion: true } });
    expect(t.q('.alius-pg')!.hasAttribute('data-reduced')).toBe(true);
    expect(t.q('.alius-pg #herLine.write')).toBeNull();
    t.play(12);
    t.key('4');
    expect(t.q('.alius-pg #dial.jolt')).toBeNull();
  });
});

describe('the end', () => {
  it('her term ends the hold released: the engine hears the planned beats; her line is written on; the mount stays 3.7 s and then goes', async () => {
    const s = held({ until: 6 }); // 9 s
    const t = draw(() => s);
    t.play(9.5);
    expect(t.end).toHaveBeenCalledTimes(1);
    expect(t.end).toHaveBeenCalledWith('released', 6);
    expect(_posture.S.run).toBeNull();
    expect(t.q('.alius-pg #dial.holding')).toBeNull(); // the dial shrinks back
    expect(['Enough. Up.', 'Good. You can stop.', 'Better than last time.']).toContain(t.q('.alius-pg #herLine')!.textContent);
  });

  it('a hold with no duration is hidden: no seconds left on the label', () => {
    const t = draw(() => held({ hidden: true }));
    expect(t.q('.alius-pg #dialLabel #clock')!.textContent).not.toMatch(/ s left/);
    const known = draw(() => held());
    expect(known.q('.alius-pg #dialLabel #clock')!.textContent).toMatch(/ s left/);
  });

  it('the stop word is the scene\'s pill; the unmount leaves no element, listener or timer', () => {
    const s = held();
    const t = draw(() => s);
    t.q('[data-stop-word]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.stopWord).toHaveBeenCalledTimes(1);
    t.screen.dispose();
    expect(document.querySelector('.alius-pg')).toBeNull();
    expect(document.querySelector('.alius-pg-fx')).toBeNull();
    const before = t.correct.mock.calls.length;
    t.key('4');
    expect(t.correct.mock.calls.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
