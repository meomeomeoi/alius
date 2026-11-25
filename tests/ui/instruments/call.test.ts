// @vitest-environment jsdom
/**
 * P10e-e Task 9: her posture call as a full-frame moment (`docs/prototypes/cards.html` `startCall`, `scheduleTaps`, `tap`, `choose`, `end`).
 * With `look: 'scene'` `drawPostureCall` draws into the moment layer: her word, her foot's dots, the fan of her named postures, her line after.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { postureWindowMs } from '../../../src/engine/practice/postures';
import { blankPractices } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { h } from '../../../src/ui/dom';
import { cancelPostureCalls, drawPostureCall, resetPostureCalls } from '../../../src/ui/practice/postureCall';
import { fanPlace, tapTimes } from '../../../src/ui/scene/instruments/call/call';
import { voiceLine } from '../../../src/ui/scene/cards/voice';
import { resetSceneStage } from '../../../src/ui/scene/stage';
import { loadCore } from '../../helpers/world';
import { ANN, unitOf, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cancelPostureCalls();
  resetPostureCalls();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Ann (a ritual holder) named three postures and called the first. */
function state(withCall = true): CampaignState {
  const s = withService(world(reg, 'role'));
  unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
  s.practices = {
    ...blankPractices(), seq: 3,
    postures: { [ANN]: [{ postureId: 'kneeling_upright', name: 'Down', day: 20 }, { postureId: 'standing_attention', name: 'Up', day: 20 }, { postureId: 'bowing', name: 'Low', day: 20 }] },
    ...(withCall ? { call: { id: 'pc1', holderId: ANN, postureId: 'kneeling_upright', sceneId: 'sc1', at: 3 } } : {}),
  };
  return s;
}

function draw(s: CampaignState, over: { timed?: boolean; reduced?: boolean } = {}) {
  const moment = h('div', { class: 'alius-layer-moment' });
  const effects = h('div', { class: 'alius-layer-effects' });
  const dial = h('div', { class: 'alius-stage-dial' });
  document.body.append(effects, moment, dial);
  const take = vi.fn();
  const handlers = { take, timed: over.timed ?? true, reduced: over.reduced ?? false, dim: effects, dial, samples: null };
  const redraw = (st: CampaignState): void => drawPostureCall(moment, st, reg, () => true, handlers, { look: 'scene' });
  redraw(s);
  return { moment, effects, dial, take, redraw };
}
const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button.alius-call-card')];

describe('the call\'s numbers (cards.html)', () => {
  it('tapTimes: from 380 ms, closing up, the last exactly at the window', () => {
    const t = tapTimes(5000);
    expect(t[0]).toBe(380);
    expect(t.at(-1)).toBe(5000);
    const gaps = t.slice(1, -1).map((x, i) => x - t[i]!);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!);
    expect(tapTimes(3000).at(-1)).toBe(3000);
  });
  it('fanPlace: the rightmost over the dial, 140 px apart, turned and lowered from the middle', () => {
    expect(fanPlace(3, 4)).toEqual({ x: 0, rot: 7.5, lift: 13.5 });
    expect(fanPlace(0, 4)).toEqual({ x: -420, rot: -7.5, lift: 13.5 });
  });
});

describe('the call as a full-frame moment (look: scene)', () => {
  it('draws her word, a card per named posture in her order, and no timer bar', () => {
    const { moment, effects, dial } = draw(state());
    const call = moment.querySelector<HTMLElement>('div.alius-call[data-call="pc1"][data-clock]')!;
    expect(call).not.toBeNull();
    expect(call.querySelector('.alius-call-word')!.textContent).toBe('Down');
    expect(call.querySelector('.alius-call-dots')).not.toBeNull();
    expect(call.querySelector('.alius-call-line')).not.toBeNull();
    expect(call.querySelector('.alius-posture-timer')).toBeNull();
    expect(cards(call).map((c) => c.getAttribute('data-posture-choice'))).toEqual(['kneeling_upright', 'standing_attention', 'bowing']);
    for (const c of cards(call)) {
      expect(c.getAttribute('data-analyze')).toBe('glossary:posture_call');
      expect(c.getAttribute('data-call')).toBe('pc1');
      expect(c.querySelector('svg.alius-mannequin')).not.toBeNull();
      expect(c.closest('[data-analyze]')).toBe(c); // no marked ancestor swallows the click (ruling K)
    }
    expect(cards(call)[2]!.querySelector('.alius-call-nm')!.textContent).toBe('Low');
    expect(cards(call)[2]!.querySelector('.alius-call-base')!.textContent).toBe('bowing');
    expect(effects.querySelector('.alius-call-dim')).not.toBeNull();
    expect(dial.dataset.called).toBe('true');
    expect(call.querySelector('.alius-call-w')!.classList.contains('is-writing')).toBe(true);
  });

  it('a click on the right card takes it in time; her right line; the expiry is cancelled', () => {
    const t = draw(state());
    cards(t.moment)[0]!.click();
    expect(t.take).toHaveBeenCalledTimes(1);
    expect(t.take).toHaveBeenCalledWith('pc1', 'kneeling_upright', false);
    const line = t.moment.querySelector('.alius-call-line')!.textContent!;
    expect(line).toBe(voiceLine(reg, 'call.right', 'ritual', 'pc1', { posture: 'Down' }).map((r) => r.text).join(''));
    // the call is gone from the state; a redraw keeps the moment playing and nothing else is taken
    t.redraw(state(false));
    vi.advanceTimersByTime(postureWindowMs(state(), reg, ANN) + 1000);
    expect(t.take).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(t.moment.querySelector('.alius-call')).toBeNull(); // all gone at 3.3 s
    expect(t.effects.querySelector('.alius-call-dim')).toBeNull();
    expect(t.dial.dataset.called).toBeUndefined();
  });

  it('a wrong card: it is taken; the right card is ringed; her wrong line names her word for it', () => {
    const t = draw(state());
    cards(t.moment)[1]!.click();
    expect(t.take).toHaveBeenCalledWith('pc1', 'standing_attention', false);
    expect(cards(t.moment)[0]!.classList.contains('is-right')).toBe(true);
    expect(cards(t.moment)[1]!.classList.contains('is-wrong')).toBe(true);
    expect(t.moment.querySelector('.alius-call-line')!.textContent).toContain('Down');
  });

  it('the last tap is too late: at the window the call is taken as late, once, whatever the redraws', () => {
    const t = draw(state());
    const win = postureWindowMs(state(), reg, ANN);
    vi.advanceTimersByTime(win - 1);
    t.redraw(state());
    t.redraw(state());
    expect(t.take).not.toHaveBeenCalled();
    expect(t.moment.querySelectorAll('.alius-call-dots i').length).toBe(tapTimes(win).length - 1);
    vi.advanceTimersByTime(1);
    expect(t.take).toHaveBeenCalledTimes(1);
    expect(t.take).toHaveBeenCalledWith('pc1', undefined, true);
    expect(t.moment.querySelector('.alius-call-dots i.last')).not.toBeNull();
    expect(t.moment.querySelector('.alius-call-line')!.textContent).toBe(voiceLine(reg, 'call.slow', 'ritual', 'pc1', { posture: 'Down' }).map((r) => r.text).join(''));
    t.redraw(state());
    vi.advanceTimersByTime(10_000);
    expect(t.take).toHaveBeenCalledTimes(1);
  });

  it('without the order interaction there are no dots and no expiry: only right or wrong', () => {
    const t = draw(state(), { timed: false });
    vi.advanceTimersByTime(20_000);
    expect(t.take).not.toHaveBeenCalled();
    expect(t.moment.querySelectorAll('.alius-call-dots i')).toHaveLength(0);
    cards(t.moment)[2]!.click();
    expect(t.take).toHaveBeenCalledWith('pc1', 'bowing', false);
  });

  it('reduced motion: no write-on and no rise (the fan is placed); the dots and the expiry stay', () => {
    const t = draw(state(), { reduced: true });
    expect(t.moment.querySelector('.is-writing')).toBeNull();
    for (const c of cards(t.moment)) {
      expect(c.style.opacity).toBe('1');
      expect(c.style.transform).not.toMatch(/translateY\(260px\)/);
    }
    vi.advanceTimersByTime(400);
    expect(t.moment.querySelectorAll('.alius-call-dots i')).toHaveLength(1);
    expect(t.moment.querySelector('.is-bob')).toBeNull();
    vi.advanceTimersByTime(postureWindowMs(state(), reg, ANN));
    expect(t.take).toHaveBeenCalledWith('pc1', undefined, true);
    expect(t.moment.querySelector('.is-writing')).toBeNull();
  });

  it('a void answer (right, but it cannot be taken now) shows her right line; the dial is not moved by the call (R9)', () => {
    const t = draw(state());
    t.take.mockImplementation(() => [{ type: 'posture_called', callId: 'pc1', void: true }]);
    cards(t.moment)[0]!.click();
    expect(t.moment.querySelector('.alius-call-line')!.textContent).toBe(voiceLine(reg, 'call.right', 'ritual', 'pc1', { posture: 'Down' }).map((r) => r.text).join(''));
    expect(t.dial.querySelector('*')).toBeNull(); // the call never draws the dial: it is drawn from the state
  });

  it('dispose and a chat switch cancel the call: nothing stays, nothing is taken afterwards', () => {
    const a = draw(state());
    cancelPostureCalls();
    expect(a.moment.querySelector('.alius-call')).toBeNull();
    expect(a.effects.querySelector('.alius-call-dim')).toBeNull();
    expect(a.dial.dataset.called).toBeUndefined();
    vi.advanceTimersByTime(20_000);
    expect(a.take).not.toHaveBeenCalled();
    const b = draw(state());
    resetSceneStage();
    expect(b.moment.querySelector('.alius-call')).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(b.take).not.toHaveBeenCalled();
    // the call gone from the state before an answer: the moment goes at once
    const c = draw(state());
    c.redraw(state(false));
    expect(c.moment.querySelector('.alius-call')).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(c.take).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
