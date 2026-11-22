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
import { ANN, unitOf, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; resetPostureCalls(); });

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
    const started = run(state(), reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const s = started.state;
    s.practices!.call = { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: s.scene!.id, at: 3 };
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const stage = vi.fn(() => []);
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn(), stage } as unknown as SceneController;
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0, ...over }), onEnded: vi.fn(), onStage: stage } as never);
    return { host, stage };
  }

  it('draws her call in the scene and the answer is staged like a chip, with the late flag', () => {
    const { host, stage } = screen();
    expect(host.querySelectorAll('.alius-posture-call')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-posture-choice="standing_attention"]')!.click();
    expect(stage).toHaveBeenCalledWith({ type: 'practice/take_posture', payload: { callId: 'pc1', postureId: 'standing_attention', late: false } });
    vi.useRealTimers();
  });

  it('with the order interaction off the card has no timer', () => {
    const { host } = screen({ physicsInteractions: { ...DEFAULT_SETTINGS.physicsInteractions, order: false } });
    expect(host.querySelectorAll('.alius-posture-call')).toHaveLength(1);
    expect(host.querySelector('.alius-posture-timer')).toBeNull();
    vi.useRealTimers();
  });
});
