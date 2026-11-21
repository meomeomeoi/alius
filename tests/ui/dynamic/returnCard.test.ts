// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderCommsTab, requestThread } from '../../../src/ui/comms/commsTab';
import { h } from '../../../src/ui/dom';
import { renderHub, type HubCtx } from '../../../src/ui/hub/hubScreen';
import { tonightItems } from '../../../src/ui/hub/model';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { FakeStAdapter } from '../../../src/st/fake';
import type { SceneController } from '../../../src/scene/sceneController';
import { campaign, loadCore, run } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

/** Ann was a holder and has left; her return offer is open. */
function world(): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), formerHolder: { endedDay: s.day - 20, frame: 'role', sworn: false } };
  s.dynamic.open.returnOffer = { id: 'dr0', unitId: ANN, terms: 'lower_band', day: s.day };
  return s;
}

describe('the return card is drawn where the claim and milestone cards are (review I10)', () => {
  it('the scene draws her return offer and answers it; the thread draws it under her messages only', () => {
    const s = run(world(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const onAnswerReturn = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onAnswerReturn });
    const cards = host.querySelector<HTMLElement>('.alius-return-cards')!;
    expect(cards.querySelector('[data-return="dr0"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('button[data-return-answer="accept"]')!.click();
    expect(onAnswerReturn).toHaveBeenCalledWith('accept');
    host.querySelector<HTMLButtonElement>('button[data-return-answer="refuse"]')!.click();
    expect(onAnswerReturn).toHaveBeenLastCalledWith('refuse');
    expect(markedWithout(cards)).toEqual([]);
    expect(unresolved(cards, env(s))).toEqual([]);
    expect(unreachable(cards)).toEqual([]);

    const comms = h('div');
    document.body.append(comms);
    const onAnswer = vi.fn();
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onAnswerReturn: onAnswer } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    comms.querySelector<HTMLButtonElement>('.alius-thread button[data-return-answer="accept"]')!.click();
    expect(onAnswer).toHaveBeenCalledWith('accept');
    expect(markedWithout(comms.querySelector('.alius-return-cards') as HTMLElement)).toEqual([]);
    expect(unresolved(comms.querySelector('.alius-return-cards') as HTMLElement, env(s))).toEqual([]);
    comms.querySelector<HTMLElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(comms.querySelector('.alius-thread [data-return]')).toBeNull();
  });

  it('nothing is drawn while the dynamic is off', () => {
    const s = world();
    s.content = { enabled: [] };
    const comms = h('div');
    document.body.append(comms);
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    expect(comms.querySelector('[data-return]')).toBeNull();
  });

  it('requestThread opens her thread on the next draw (once)', () => {
    const s = world();
    const comms = h('div');
    document.body.append(comms);
    requestThread(ANN);
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() } as never);
    expect(comms.querySelector('button[data-unit].is-open')!.getAttribute('data-unit')).toBe(ANN);
    expect(comms.querySelector('.alius-thread [data-return]')).not.toBeNull();
    const again = h('div');
    renderCommsTab(again, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() } as never);
    expect(again.querySelector('button[data-unit].is-open')).toBeNull();
  });
});

describe('the Tonight chip for a return offer opens it', () => {
  it('the item is about her aftermath, and its button opens her thread', () => {
    const s = world();
    const item = tonightItems(s, reg).find((i) => i.kind === 'dynamic')!;
    expect(item).toMatchObject({ unitId: ANN, analyze: 'glossary:aftermath' });
    const onOpenThread = vi.fn();
    const ctx: HubCtx = {
      getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }),
      ops: { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() },
      onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), onOpenThread, avatar: () => null,
    };
    const root = h('div', { id: 'alius-shell' });
    const host = h('div', { class: 'alius-hub-host' });
    root.append(host, h('div', { class: 'alius-device' }));
    document.body.append(root);
    renderHub(host, root.lastElementChild as HTMLElement, ctx);
    const open = host.querySelector<HTMLButtonElement>('.alius-tonight button[data-open-thread]')!;
    expect(open.getAttribute('data-open-thread')).toBe(ANN);
    expect(open.getAttribute('data-analyze')).toBe('glossary:aftermath');
    open.click();
    expect(onOpenThread).toHaveBeenCalledWith(ANN);
    const tonight = host.querySelector<HTMLElement>('.alius-tonight')!;
    expect(markedWithout(tonight)).toEqual([]);
    expect(unresolved(tonight, env(s))).toEqual([]);
    expect(unreachable(tonight)).toEqual([]);
  });

  it('a Tonight line with no thread to open (the other kinds) has no button', () => {
    const s = campaign(reg, 4);
    s.calendar.shortageStreak = 2;
    const ctx = { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, settings: () => ({ ...DEFAULT_SETTINGS }), ops: { getState: () => s, getLoad: () => ({ kind: 'ok', state: s, chatId: 'c' }), registries: reg, onDo: vi.fn(), onRequisition: vi.fn() }, onTalk: vi.fn(), onEndSlot: vi.fn(), onOpenPda: vi.fn(), onOpenThread: vi.fn(), avatar: () => null } as HubCtx;
    const root = h('div', { id: 'alius-shell' });
    const host = h('div', { class: 'alius-hub-host' });
    root.append(host, h('div', { class: 'alius-device' }));
    document.body.append(root);
    renderHub(host, root.lastElementChild as HTMLElement, ctx);
    expect(host.querySelector('.alius-tonight button[data-open-thread]')).toBeNull();
  });
});
