// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { postureWindowMs } from '../../../src/engine/practice/postures';
import { blankPractices } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { cancelPostureCalls, drawPostureCall, resetPostureCalls } from '../../../src/ui/practice/postureCall';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import type { SceneController } from '../../../src/scene/sceneController';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { errors, loadCore, run } from '../../helpers/world';
import { COMMANDER, setBlocking } from '../../../src/engine/blocking';
import { setRelation } from '../../helpers/loyalty';
import { enable } from '../../helpers/bonds';
import '../../../src/engine/actions/blocking';
import { ANN, unitOf, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; cancelPostureCalls(); });

/** Ann (a ritual holder at role) has two named postures and has called the first. */
function state(withCall = true): CampaignState {
  const s = withService(world(reg, 'role'));
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  s.practices = {
    ...blankPractices(), seq: 3,
    postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'Down', day: 20 }, { postureId: 'standing_attention', name: 'Up', day: 20 }] },
    ...(withCall ? { call: { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: 'sc1', at: 3 } } : {}),
  };
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

function draw(s: CampaignState, over: { timed?: boolean; reduced?: boolean; now?: () => number; pick?: (c: { unitId: string }) => boolean } = {}) {
  const host = h('div');
  document.body.append(host);
  const take = vi.fn();
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const cancelled: unknown[] = [];
  drawPostureCall(host, s, reg, over.pick ?? (() => true), {
    take, timed: over.timed ?? true, reduced: over.reduced ?? false, now: over.now ?? (() => 1000),
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; }, cancel: (handle) => { cancelled.push(handle); },
  });
  return { host, take, scheduled, cancelled };
}
const choices = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[data-posture-choice]')];

describe('the call card', () => {
  it('shows her name for the posture and every named posture as a choice, in her voice, with no number and no pronoun for the commander', () => {
    const { host } = draw(state());
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull();
    expect(host.querySelector('.alius-voice-from')!.textContent).toBe('Ann');
    expect(host.querySelector('[data-posture-call]')!.textContent).toContain('Down');
    expect(choices(host).map((b) => b.textContent)).toEqual(['Down', 'Up']);
    expect(choices(host).map((b) => b.getAttribute('data-posture-choice'))).toEqual(['kneeling_upright', 'standing_attention']);
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('the choices and the card carry data-analyze and resolve (P7a)', () => {
    const { host } = draw(state());
    expect(host.querySelector('.alius-posture-call')!.getAttribute('data-analyze')).toBe('glossary:posture_call');
    for (const b of choices(host)) expect(b.getAttribute('data-analyze'), b.textContent ?? '').toBe('glossary:posture_call');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state()))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('draws nothing without a call, for another soldier, or while she is not live', () => {
    expect(draw(state(false)).host.children).toHaveLength(0);
    expect(draw(state(), { pick: () => false }).host.children).toHaveLength(0);
    const frozen = state();
    frozen.relations[ANN].dynamic!.frame = 'equal';
    expect(draw(frozen).host.children).toHaveLength(0);
  });
});

/** P16b (Task 10): her set holds presets, and an old base name in it reads as that base's default preset. */
describe('the call with presets', () => {
  function presetState(ids = ['kneel_present', 'kneel_open'], called = 'kneel_open'): CampaignState {
    const s = state();
    s.practices!.postures = { [ANN]: ids.map((postureId, i) => ({ postureId, name: ['Offer', 'Open'][i] ?? postureId, day: 20 })) };
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: called, sceneId: 'sc1', at: 3 };
    return s;
  }

  it('shows her name for the called preset and every named preset as a choice, answering with the preset id', () => {
    const { host, take } = draw(presetState());
    expect(host.querySelector('[data-posture-call]')!.textContent).toContain('Open');
    expect(choices(host).map((b) => b.getAttribute('data-posture-choice'))).toEqual(['kneel_present', 'kneel_open']);
    choices(host)[0].click();
    expect(take).toHaveBeenCalledWith('pc1', 'kneel_present', false);
  });

  it('a mix of an old base name and a preset reads: the old name is called and answered', () => {
    const { host } = draw(presetState(['kneeling_upright', 'standing_attention'], 'kneeling_upright'));
    expect(host.querySelector('[data-posture-call]')!.textContent).toContain('Offer');
    expect(choices(host).map((b) => b.getAttribute('data-posture-choice'))).toEqual(['kneeling_upright', 'standing_attention']);
  });

  it('a preset whose category is off is no choice (the content gate reads its tags)', () => {
    const gated = { ...reg, servicePostures: new Map(reg.servicePostures) } as Registries;
    gated.servicePostures.set('kneel_present', { ...reg.servicePostures.get('kneel_present')!, tags: ['gated_category'] });
    const host = h('div');
    document.body.append(host);
    drawPostureCall(host, presetState(), gated, () => true, { take: vi.fn(), timed: false, reduced: false });
    expect(choices(host).map((b) => b.getAttribute('data-posture-choice'))).toEqual(['kneel_open']);
  });

  it('in the scene the fan draws each preset\'s own figure and its base under its name', () => {
    vi.useFakeTimers();
    const host = h('div');
    document.body.append(host);
    const take = vi.fn();
    drawPostureCall(host, presetState(), reg, () => true, { take, timed: false, reduced: false, schedule: (fn, ms) => setTimeout(fn, ms), cancel: (x) => clearTimeout(x as never) }, { look: 'scene' });
    const cards = [...host.querySelectorAll<HTMLElement>('.alius-call-card')];
    expect(cards.map((c) => c.getAttribute('data-posture-choice'))).toEqual(['kneel_present', 'kneel_open']);
    expect(cards.map((c) => c.querySelector('.alius-call-base')!.textContent)).toEqual(['kneeling upright', 'kneeling upright']);
    const figures = cards.map((c) => c.querySelector('svg')!.innerHTML);
    expect(figures[0]).not.toBe('');
    expect(figures[0]).not.toBe(figures[1]); // two presets of one base are two figures
    cards[1].click();
    expect(take).toHaveBeenCalledWith('pc1', 'kneel_open', false);
    cancelPostureCalls();
    vi.useRealTimers();
  });
});

describe('the timer', () => {
  it('runs only with the order interaction on: with it off there is no timer, no scheduled expiry and no late flag', () => {
    let clock = 1000;
    const off = draw(state(), { timed: false, now: () => clock });
    expect(off.host.querySelector('.alius-posture-timer')).toBeNull();
    expect(off.scheduled).toEqual([]);
    clock += 60_000;
    choices(off.host)[1].click();
    expect(off.take).toHaveBeenCalledWith('pc1', 'standing_attention', false);

    const on = draw(state(), { timed: true });
    expect(on.host.querySelector('.alius-posture-timer')).not.toBeNull();
    expect(on.scheduled).toHaveLength(1);
    expect(on.scheduled[0].ms).toBe(postureWindowMs(state(), reg, ANN));
  });

  it('the late flag is sent when the window passed (an injected clock)', () => {
    const window = postureWindowMs(state(), reg, ANN);
    let clock = 1000;
    const a = draw(state(), { now: () => clock });
    clock += window - 1;
    choices(a.host)[0].click();
    expect(a.take).toHaveBeenLastCalledWith('pc1', 'kneeling_upright', false);

    resetPostureCalls();
    clock = 1000;
    const b = draw(state(), { now: () => clock });
    clock += window + 1;
    choices(b.host)[0].click();
    expect(b.take).toHaveBeenLastCalledWith('pc1', 'kneeling_upright', true);
  });

  it('a call nobody answers is a late slip when the window runs out, once; a redraw does not start it again', () => {
    const first = draw(state());
    expect(first.scheduled).toHaveLength(1);
    const again = draw(state());
    expect(again.scheduled).toHaveLength(0); // the same call: the clock keeps running
    first.scheduled[0].fn();
    expect(first.take).toHaveBeenCalledWith('pc1', undefined, true);
    expect(first.take).toHaveBeenCalledTimes(1);
  });

  it('an answer cancels the expiry; so does the call going away', () => {
    const a = draw(state());
    choices(a.host)[0].click();
    expect(a.cancelled).toHaveLength(1);
    resetPostureCalls();
    const b = draw(state());
    const gone = h('div');
    drawPostureCall(gone, state(false), reg, () => true, { take: vi.fn(), timed: true, reduced: false, now: () => 1000, schedule: () => 1, cancel: (x) => b.cancelled.push(x) });
    expect(b.cancelled).toHaveLength(1);
  });

  it('the scene screen going away cancels every pending expiry', () => {
    const a = draw(state());
    const cancelled: unknown[] = [];
    cancelPostureCalls((handle) => cancelled.push(handle));
    expect(cancelled).toEqual([1]);
    expect(a.scheduled).toHaveLength(1);
    const b = draw(state()); // the clock starts again for a new draw
    expect(b.scheduled).toHaveLength(1);
  });

  it('the bar does not animate while motion is reduced, and the answer still counts', () => {
    const { host } = draw(state(), { reduced: true });
    expect(host.querySelector('.alius-posture-timer')!.classList.contains('alius-posture-timer-still')).toBe(true);
  });
});

describe('the scene screen', () => {
  function screen(over: Record<string, unknown> = {}) {
    vi.useFakeTimers();
    const base = state();
    setRelation(base, ANN, { stateId: 'confidant' }); // the blocking is live (the dial, the pill)
    enable(base, 'pet_play', 'restraint');
    const started = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const s = started.state;
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3 };
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const stage = vi.fn(() => []);
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(), stage } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    const stopWord = vi.fn(() => []);
    const noop = (): [] => [];
    const physics = { input: noop, endSegment: noop, stopWord, skip: noop, stimulus: noop, act: noop, finishCounted: noop, cue: () => null, beat: () => 0, clock: () => ({ startedAt: null, beatMs: 1500, now: 0 }), keystroke: vi.fn(), typed: vi.fn(), onTap: vi.fn() };
    if (over.held === true) setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
    const screen = renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over }), onEnded: vi.fn(), onStage: stage, physics } as never);
    return { host, stage, stopWord, screen, s };
  }

  it('draws her call in the scene and the answer is staged like a chip, with the late flag', () => {
    const { host, stage } = screen();
    expect(host.querySelectorAll('.alius-layer-moment .alius-call')).toHaveLength(1); // P10e-e Task 9: a full-frame moment, not a dock card
    host.querySelector<HTMLButtonElement>('[data-posture-choice="standing_attention"]')!.click();
    expect(stage).toHaveBeenCalledWith({ type: 'practice/take_posture', payload: { callId: 'pc1', postureId: 'standing_attention', late: false } });
    vi.useRealTimers();
  });

  it('with the order interaction off the card has no timer', () => {
    const { host } = screen({ physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, order: false } });
    expect(host.querySelectorAll('.alius-layer-moment .alius-call')).toHaveLength(1);
    expect(host.querySelector('.alius-posture-timer')).toBeNull();
    vi.advanceTimersByTime(800);
    expect(host.querySelectorAll('.alius-call-dots i')).toHaveLength(0); // no clock: no taps
    vi.useRealTimers();
  });

  it('the stop word stays reachable over her call: the pill is lifted above the fan, and clicking it sends the stop word (review I1)', () => {
    const { host, stopWord } = screen({ held: true });
    const pill = host.querySelector<HTMLButtonElement>('[data-stop-word]')!;
    expect(pill).not.toBeNull();
    expect(pill.closest('.alius-layer-moment .alius-stop-lift')).not.toBeNull(); // above the call's layer while it is drawn
    expect(host.querySelector('.alius-layer-moment .alius-call')).not.toBeNull();
    pill.click();
    expect(stopWord).toHaveBeenCalledTimes(1);
    // the call answered and gone: the pill is back in the dial's corner
    host.querySelector<HTMLButtonElement>('[data-posture-choice="kneeling_upright"]')!.click();
    expect(host.querySelector('.alius-call')!.getAttribute('data-outcome')).toBe('right');
    vi.advanceTimersByTime(3300);
    expect(host.querySelector('.alius-call')).toBeNull();
    expect(host.querySelector('[data-stop-word]')!.closest('.alius-stage-dial .alius-stop-host')).not.toBeNull();
    vi.useRealTimers();
  });

  it('the dial is redrawn 380 ms after a right answer, at once with reduced motion (cards.html `drawDial` at 380 ms; review M4)', () => {
    for (const reduced of [false, true]) {
      const { host, stage, s } = screen(reduced ? { reducedMotion: true } : {});
      stage.mockImplementation(((a: { type: string }) => { if (a.type === 'practice/take_posture') { delete s.practices!.call; setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' }, { at: 2, source: 'chip' }); } return []; }) as never);
      const label = () => host.querySelector('.alius-dial-name')?.textContent;
      const before = label();
      host.querySelector<HTMLButtonElement>('[data-posture-choice="kneeling_upright"]')!.click();
      if (reduced) expect(label()).toBe('DOWN');
      else {
        expect(label()).toBe(before);
        vi.advanceTimersByTime(379);
        expect(label()).toBe(before);
        vi.advanceTimersByTime(1);
        expect(label()).toBe('DOWN');
      }
      cancelPostureCalls();
      document.body.innerHTML = '';
    }
    vi.useRealTimers();
  });
});
