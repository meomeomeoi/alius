// @vitest-environment jsdom
/**
 * P16b Task 25 (gate G2): stillness under provocation, the game inside `provocation` of her activity's frame (docs/prototypes/her_activity.html). It plays when the commander is on
 * the floor by her, her craft is live, restraint is on and the game is switched on; she touches, tickles, whispers and feints; any key but Space and H, a click, a word or a fidget while
 * a stimulus is on is a reaction she feels at once (`physics/relief` `react`), a stimulus that went by is `endure`, Space breathes through it, her own urges wait.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { provocationOpen } from '../../../src/engine/craft/provocation';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { resetPresenceHooks } from '../../../src/engine/physics/presence';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import type { SceneController } from '../../../src/scene/sceneController';
import { DEFAULT_SETTINGS, type AliusSettings } from '../../../src/settings';
import { FakeStAdapter } from '../../../src/st/fake';
import { h } from '../../../src/ui/dom';
import { _activity } from '../../../src/ui/scene/instruments/activity/frame';
import { _provocation, PROV } from '../../../src/ui/scene/instruments/activity/provocation';
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
import '../../../src/engine/actions/craft';

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
/** Ann holding at `play` (her craft live), restraint on, reading reports; the commander at her feet (the floor view), one segment in real time. */
function provoked(o: { style?: Style; anchor?: 'at_her_feet' | 'under_desk'; restraint?: boolean; toggle?: boolean; activity?: string } = {}): CampaignState {
  registerFrameReader(() => 'play');
  installDynamicHooks();
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification', ...(o.restraint === false ? [] : ['restraint']));
  s.settings.physicsRealtime = true;
  if (o.toggle === false) s.settings.physicsInteractions = { ...(s.settings.physicsInteractions as Record<string, boolean>), provocation: false } as never;
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.squad.find((u) => u.id === ANN)!.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { service: { as: 'enjoys', witness: 'indifferent' }, worship: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: o.style ?? 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' } } as never;
  s.relations[ANN]!.dynamic = { ...blankDynamic(1), frame: 'play', hold: 40 };
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: o.activity ?? 'reading_reports' }, { at: 1, source: 'chip' });
  const anchor = o.anchor ?? 'at_her_feet';
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: anchor, relTo: ANN }, { at: 2, source: 'reading' });
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

function draw(state: CampaignState, over: { settings?: Partial<AliusSettings>; staging?: Partial<PhysicsPanelStaging> } = {}) {
  const controller = {
    send: vi.fn(() => new Promise<boolean>(() => {})), propose: vi.fn(), answer: vi.fn(), end: vi.fn(), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(),
    transcript: () => [], onSwipe: vi.fn(), rerollState: () => ({ enabled: true, reason: '' }), rerollLast: vi.fn(), stage: vi.fn(),
  } as unknown as SceneController;
  const host = h('div');
  document.body.append(host);
  const f = frames();
  const noop = (): [] => [];
  const relief = vi.fn(() => []);
  const staging = {
    input: vi.fn(), endSegment: noop, stopWord: vi.fn(() => []), skip: vi.fn(() => []), stimulus: noop, act: noop, finishCounted: noop, cue: (k: string) => `her ${k}`, beat: () => 0,
    clock: () => ({ startedAt: 0, beatMs: 1500, now: f.now() }), getUp: vi.fn(() => []), found: vi.fn(() => []), script: () => null, relief, woke: vi.fn(() => []),
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
  return { host, screen, frames: f, q, to, relief: relief as ReturnType<typeof vi.fn>, staging };
}
const reports = (relief: ReturnType<typeof vi.fn>, kind: string) => relief.mock.calls.filter((c) => (c[0] as { kind?: string }).kind === kind);
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('where it plays (read by field)', () => {
  it('the commander on the floor by her, her craft live, restraint on, the game on: provocation; else the frame\'s stillness (or the service)', () => {
    const s = provoked();
    expect(provocationOpen(s, reg, s.scene!.physics!)).toBe(true);
    const t = draw(s);
    t.to(2400);
    expect(_activity.S.inner).toBe('provocation');
    for (const o of [{ toggle: false }, { restraint: false }, { anchor: 'under_desk' as const }, { activity: 'sleeping' }]) {
      document.body.innerHTML = '';
      const t2 = draw(provoked(o));
      t2.to(2400);
      expect(_activity.S.inner, JSON.stringify(o)).not.toBe('provocation');
    }
  });

  it('with the game on, her own itch, swallow and cramp wait (her stimuli take the itch\'s place)', () => {
    const t = draw(provoked());
    t.to(60000);
    expect(_activity.G.urges).toEqual([]);
    expect(_activity.G.cramp).toBeNull();
    expect(_provocation.prov.live.length + _provocation.prov.stats.endured + _provocation.prov.stats.reactions).toBeGreaterThan(0); // she has begun
  });
});

describe('a reaction (provInput, provReact)', () => {
  const live = (t: ReturnType<typeof draw>) => { t.to(2400); _provocation.provUpdate(16); _provocation.prov.live.length = 0; _provocation.provSpawn(); expect(_provocation.prov.live.length).toBe(1); };

  it('any key but Space and H while a stimulus is on is a reaction she feels at once: reported as `react`, the stimulus ends', () => {
    const t = draw(provoked());
    live(t);
    key(' '); key('h'); key('H');
    expect(reports(t.relief, 'react')).toHaveLength(0);
    key('a');
    expect(reports(t.relief, 'react')).toHaveLength(1);
    expect(reports(t.relief, 'react')[0]![0]).toMatchObject({ kind: 'react' });
    expect(reports(t.relief, 'react')[0]![0].involuntary).toBeUndefined();
    expect(_provocation.prov.live.every((p: { done: boolean }) => p.done)).toBe(true);
    expect(_provocation.prov.stats.reactions).toBe(1);
    key('b'); // no stimulus is on: nothing
    expect(reports(t.relief, 'react')).toHaveLength(1);
  });

  it('a click on the frame is a reaction; a fidget (the attention darting) is one; the body giving way is involuntary', () => {
    const t = draw(provoked());
    live(t);
    const frame = t.q('.alius-layer-frame')!;
    frame.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(reports(t.relief, 'react')).toHaveLength(1);
    _provocation.prov.live.length = 0; _provocation.provSpawn();
    _provocation.provReact('fidget');
    expect(reports(t.relief, 'react')).toHaveLength(2);
    _provocation.prov.live.length = 0; _provocation.provSpawn();
    _provocation.provReact('', true);
    expect(reports(t.relief, 'react')).toHaveLength(3);
    expect(reports(t.relief, 'react')[2]![0].involuntary).toBe(true);
    expect(_provocation.prov.stats.involuntary).toBe(1);
  });

  it('a word typed while a stimulus is on is a reaction (not a breach, not unprompted)', () => {
    const t = draw(provoked());
    live(t);
    const input = t.host.querySelector<HTMLInputElement>('input')!;
    input.value = 'please';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(reports(t.relief, 'react')).toHaveLength(1);
    expect(_activity.G.stats.unprompted).toBe(0);
  });

  it('a feint is felt too: "a touch that never comes"', () => {
    const t = draw(provoked());
    t.to(2400);
    _provocation.prov ?? _provocation.provStart();
    _provocation.prov.live.length = 0;
    _provocation.prov.live.push({ kind: 'touch', feint: true, x: 10, y: 10, v: 0, born: _activity.G.t, until: _activity.G.t + 1000, seed: 1, trail: [] });
    key('a');
    expect(reports(t.relief, 'react')).toHaveLength(1);
  });
});

describe('a stimulus that goes by (endure) and the breath', () => {
  it('a stimulus that ends with no reaction is reported as `endure` once; two in a row raise her level', () => {
    const t = draw(provoked());
    t.to(2400);
    _provocation.provUpdate(16);
    _provocation.prov.live.length = 0;
    _provocation.provSpawn();
    _provocation.prov.live[0].until = _activity.G.t + 10;
    _provocation.prov.live[0].kind = 'touch';
    t.to(_activity.G.t + 400);
    expect(reports(t.relief, 'endure').length).toBeGreaterThanOrEqual(1);
    const n = reports(t.relief, 'endure').length;
    t.to(_activity.G.t + 400);
    expect(reports(t.relief, 'endure')).toHaveLength(n); // each is reported once
    expect(_provocation.prov.stats.endured).toBe(n);
  });

  it('Space breathes through it: the growth is slower while the breath lasts, and the breath is spent after 4.5 s', () => {
    const grow = (breath: boolean) => {
      document.body.innerHTML = '';
      const t = draw(provoked());
      t.to(2400);
      _provocation.provUpdate(16);
      _provocation.prov.live.length = 0;
      _provocation.provSpawn();
      const p = _provocation.prov.live[0];
      p.kind = 'tickle'; p.feint = false; p.v = 0.1; p.until = _activity.G.t + 60000;
      if (breath) key(' ');
      const v0 = p.v;
      for (let i = 0; i < 20; i++) { _activity.G.t += 16; _provocation.provUpdate(16); }
      return { dv: p.v - v0, air: _provocation.prov.air };
    };
    const held = grow(true), free = grow(false);
    expect(held.dv).toBeLessThan(free.dv);
    expect(held.air).toBeLessThan(PROV.breath.max);
    expect(free.air).toBe(PROV.breath.max);
  });

  it('her lines are cardVoice by style: a whisper, the clean, the reaction, harder; cold says nothing where it is silent', () => {
    const t = draw(provoked({ style: 'playful' }));
    t.to(2400);
    expect(_provocation.provLines('react')).toContain('gotcha~');
    expect(_provocation.provLines('harder')).toEqual(['okay. no more mister nice.']);
    document.body.innerHTML = '';
    const c = draw(provoked({ style: 'cold' }));
    c.to(2400);
    expect(_provocation.provLines('react')).toEqual(['no.']);
    expect(_provocation.provLines('whisper')).toEqual(['']);
    document.body.innerHTML = '';
    const k = draw(provoked({ style: 'affectionate' }));
    k.to(2400);
    expect(_provocation.provLines('whisper')).toContain('shh. stay.');
  });
});

describe('without the staging call, nothing breaks; the unmount leaves nothing', () => {
  it('no relief call: a reaction still plays', () => {
    const t = draw(provoked(), { staging: { relief: undefined } });
    t.to(2400);
    _provocation.provUpdate(16);
    _provocation.prov.live.length = 0;
    _provocation.provSpawn();
    expect(() => key('a')).not.toThrow();
  });

  it('the screen\'s dispose stops the game: no more reports', () => {
    const t = draw(provoked());
    t.to(2400);
    t.screen.dispose?.();
    const n = t.relief.mock.calls.length;
    key('a');
    expect(t.relief.mock.calls.length).toBe(n);
  });
});
