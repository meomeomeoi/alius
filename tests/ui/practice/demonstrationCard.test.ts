// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { blankPractices, type OpenDemonstration } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import type { GenerationUi } from '../../../src/ui/generation/surface';
import { renderCommsTab } from '../../../src/ui/comms/commsTab';
import { drawDemonstrationCards } from '../../../src/ui/practice/demonstrationCard';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import type { SceneController } from '../../../src/scene/sceneController';
import { FakeStAdapter } from '../../../src/st/fake';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, CAT, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const demo = (over: Partial<OpenDemonstration> = {}): OpenDemonstration => ({
  id: 'pd1', holderId: ANN, tags: ['service'], summary: 'service at the mess table', text: 'You will serve me at the mess table tonight.', audienceIds: [BEA, CAT], stage: 'mess_hall', slot: 'evening', day: 20, status: 'offered', requestId: 'pq1', ...over,
});
function state(over: Partial<OpenDemonstration> = {}): CampaignState {
  const s = withService(world(reg, 'play'));
  s.practices = { ...blankPractices(), seq: 3, demonstrations: [demo(over)] };
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
const draw = (s: CampaignState, generation?: GenerationUi, pick: (c: { unitId: string }) => boolean = () => true) => {
  const host = h('div');
  document.body.append(host);
  const answer = vi.fn();
  drawDemonstrationCards(host, s, reg, pick, { answer, generation });
  return { host, answer };
};
const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')].map((b) => b.textContent);

describe('the demonstration card', () => {
  it('speaks in her voice, names the audience on the card (names, never numbers), the place and the slot', () => {
    const { host } = draw(state());
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull();
    expect(host.querySelector('.alius-voice-from')!.textContent).toBe('Ann');
    expect(host.textContent).toContain('You will serve me at the mess table tonight.');
    expect(host.querySelector('[data-demonstration-audience]')!.textContent).toBe('Before: Bea and Cat.');
    expect(host.querySelector('[data-demonstration-place]')!.textContent).toBe('Mess hall, evening. It takes the slot.');
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('others who are only narrated are "others", never counted; her quarters are named by their location; a plain card hides the draft marker', () => {
    const { host } = draw(state({ audienceIds: [BEA], narrated: [CAT], stage: 'quarters_unit', slot: 'night', text: 'AUTHOR TO WRITE: serve me before the others.', plain: true }));
    expect(host.querySelector('[data-demonstration-audience]')!.textContent).toBe('Before: Bea and others.');
    expect(host.querySelector('[data-demonstration-place]')!.textContent).toBe('Her quarters, night. It takes the slot.');
    expect(host.textContent).not.toMatch(/AUTHOR TO WRITE/);
  });

  it('GO and REFUSE answer with the demonstration\'s id', () => {
    const { host, answer } = draw(state());
    expect(buttons(host)).toEqual(['[ GO ]', '[ REFUSE ]']);
    host.querySelector<HTMLButtonElement>('[data-demonstration-answer="go"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-demonstration-answer="refuse"]')!.click();
    expect(answer.mock.calls).toEqual([['pd1', 'go'], ['pd1', 'refuse']]);
  });

  it('a GO that did not get its scene may be pressed again, and says so; an answered card, a scene already on it, another unit\'s card and a holder who stopped holding draw nothing', () => {
    const open = draw(state({ status: 'open' }));
    expect(open.host.textContent).toContain('The scene did not open.');
    expect(buttons(open.host)).toEqual(['[ GO ]', '[ REFUSE ]']);
    for (const over of [{ status: 'done' as const }, { status: 'refused' as const }, { status: 'open' as const, sceneId: 's1' }]) expect(draw(state(over)).host.children).toHaveLength(0);
    expect(draw(state(), undefined, (c) => c.unitId === BEA).host.children).toHaveLength(0);
    const idle = state();
    idle.relations[ANN].dynamic!.frame = 'equal';
    expect(draw(idle).host.children).toHaveLength(0);
    const off = state();
    off.dynamic = undefined;
    expect(draw(off).host.children).toHaveLength(0);
  });

  it('draws [ REROLL ] while it is offered, as the controller says, and not once it waits for a scene', () => {
    const generations = { retry: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), reroll: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), rerollState: vi.fn(() => ({ enabled: true })), drop: vi.fn(), useFallback: vi.fn(async () => {}) };
    const ui: GenerationUi = { generations, modal: vi.fn(async () => null), settings: () => ({ ...DEFAULT_SETTINGS }), toast: vi.fn(), redraw: vi.fn() };
    const { host } = draw(state(), ui);
    const b = host.querySelector<HTMLButtonElement>('button[data-action="generation-reroll"]')!;
    expect(generations.rerollState).toHaveBeenCalledWith('practice.demonstration', 'pq1');
    b.click();
    expect(generations.reroll).toHaveBeenCalledWith('practice.demonstration', 'pq1');
    expect(draw(state({ status: 'open' }), ui).host.querySelector('button[data-action="generation-reroll"]')).toBeNull();
    expect(draw(state()).host.querySelector('button[data-action="generation-reroll"]')).toBeNull();
  });
});

describe('every element is addressed (P7a)', () => {
  it('marks every element, resolves every address and reaches every one by keyboard', () => {
    const { host } = draw(state());
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state()))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    expect(host.querySelectorAll('[data-analyze="glossary:demonstration"]').length).toBeGreaterThanOrEqual(5);
  });
});

describe('the surfaces', () => {
  it('her thread draws the card under the messages and GO goes to the handler with the id', () => {
    const s = state();
    const onAnswerDemonstration = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderCommsTab(host, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onAnswerDemonstration } as never);
    expect(host.querySelector('.alius-demonstration')).toBeNull(); // no thread open yet
    host.querySelector<HTMLButtonElement>(`button[data-unit="${ANN}"]`)!.click();
    expect(host.querySelectorAll('.alius-demonstration')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-demonstration-answer="go"]')!.click();
    expect(onAnswerDemonstration).toHaveBeenCalledWith('pd1', 'go');
    host.querySelector<HTMLButtonElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(host.querySelector('.alius-demonstration')).toBeNull(); // Bea's thread has none
  });

  it('the scene screen draws the card of a unit in the scene and GO goes to the handler; a unit who is not in it has none', () => {
    vi.useFakeTimers();
    const base = state();
    const started = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const s = started.state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(async () => {}), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn(), resume: vi.fn(), idle: vi.fn(), dispose: vi.fn(), start: vi.fn() } as unknown as SceneController;
    const onAnswerDemonstration = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onAnswerDemonstration } as never);
    expect(host.querySelectorAll('.alius-demonstration')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-demonstration-answer="refuse"]')!.click();
    expect(onAnswerDemonstration).toHaveBeenCalledWith('pd1', 'refuse');
    vi.useRealTimers();
  });
});
