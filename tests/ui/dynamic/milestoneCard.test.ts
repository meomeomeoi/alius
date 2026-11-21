// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../../../src/engine/actions/dynamic';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { milestonesDue } from '../../../src/engine/dynamic/milestones';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderMilestoneCard } from '../../../src/ui/dynamic/cards';
import { h } from '../../../src/ui/dom';
import { tonightItems } from '../../../src/ui/hub/model';
import { VOICE_OF } from '../../../src/ui/voice/sources';
import { renderCommsTab } from '../../../src/ui/comms/commsTab';
import { renderSceneScreen } from '../../../src/ui/scene/sceneScreen';
import { FakeStAdapter } from '../../../src/st/fake';
import type { SceneController } from '../../../src/scene/sceneController';
import { campaign, ctxOf, loadCore, run } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` with `hold`; her milestone is open when one is due. */
function world(frame: Frame, hold: number): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold };
  milestonesDue(s, ctxOf(s, reg), ANN);
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

describe('the milestone card', () => {
  it('shows her text in her voice with ACCEPT / REFUSE, both with data-analyze', () => {
    const s = world('equal', 25);
    const milestone = s.dynamic!.open.milestones[0];
    const onAnswer = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderMilestoneCard(host, { state: s, reg, milestone, onAnswer });
    const card = host.querySelector<HTMLElement>('[data-milestone]')!;
    expect(card.getAttribute('data-milestone')).toBe(milestone.id);
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull(); // her voice
    expect(host.textContent).toContain('Ann');
    expect(host.textContent).toContain(String(reg.dynamicMilestones.get('first_yes')!.text));
    const accept = host.querySelector<HTMLButtonElement>('button[data-milestone-answer="accept"]')!;
    const refuse = host.querySelector<HTMLButtonElement>('button[data-milestone-answer="refuse"]')!;
    expect([accept.textContent, refuse.textContent]).toEqual(['[ ACCEPT ]', '[ REFUSE ]']);
    for (const el of [card, accept, refuse]) expect(el.getAttribute('data-analyze')).toBeTruthy();
    accept.click();
    refuse.click();
    expect(onAnswer.mock.calls).toEqual([['accept'], ['refuse']]);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('never shows a number, a frame name, or a pronoun for the commander', () => {
    const s = world('play', 45);
    const host = h('div');
    document.body.append(host);
    renderMilestoneCard(host, { state: s, reg, milestone: s.dynamic!.open.milestones[0], onAnswer: vi.fn() });
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.textContent).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('is drawn in the personal voice (VOICE_OF.dynamic)', () => {
    expect(VOICE_OF.dynamic).toBe('personal');
  });
});

describe('the Tonight list', () => {
  const rec = (id: string) => ({ id, siteId: 'scene.summary', key: id, reason: 'refused', detail: '', attempts: 1, day: 1, slot: 'morning', at: 1, budgetMult: 1, status: 'open' }) as NonNullable<CampaignState['generations']>['records'][number];

  it('shows one dynamic chip per waiting unit', () => {
    const s = world('equal', 25);
    const chips = tonightItems(s, reg).filter((i) => i.kind === 'dynamic');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ unitId: ANN, tone: 'warn', analyze: 'glossary:milestone' });
    expect(chips[0].text).toContain('Ann');
    expect(chips[0].text).not.toMatch(/\d/);
    // a second waiting unit: a second chip; a unit with an open claim and a milestone still has one
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond);
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'equal', hold: 25 };
    milestonesDue(s, ctxOf(s, reg), BEA);
    s.dynamic!.open.claims.push({ id: 'dc9', unitId: ANN, submit: true, day: s.day });
    expect(tonightItems(s, reg).filter((i) => i.kind === 'dynamic').map((i) => i.unitId)).toEqual([ANN, BEA]);
  });

  it('shows nothing while nothing waits, or while the dynamic is off', () => {
    expect(tonightItems(world('equal', 5), reg).some((i) => i.kind === 'dynamic')).toBe(false);
    const off = world('equal', 25);
    off.content = { enabled: [] };
    expect(tonightItems(off, reg).some((i) => i.kind === 'dynamic')).toBe(false);
  });

  it('comes after a booking and keeps the generation line last, within six', () => {
    const s = world('play', 45); // first_protocol: a booking is made for tonight
    s.generations = { seq: 2, records: [rec('g1'), rec('g2')] };
    for (const id of [ANN, BEA, 'unit_cat', 'unit_dee']) s.dms[id] = [{ id: `m_${id}`, from: id, text: 'hey', day: 1, slot: 'morning', read: false }];
    s.world.incomingUnits = 1;
    s.calendar.shortageStreak = 2;
    const items = tonightItems(s, reg);
    expect(items).toHaveLength(6);
    expect(items.at(-1)!.kind).toBe('generation');
    const free = world('play', 45);
    free.generations = { seq: 1, records: [rec('g1')] };
    const kinds = tonightItems(free, reg).map((i) => i.kind);
    expect(kinds.indexOf('booking')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('dynamic')).toBeGreaterThan(kinds.indexOf('booking'));
    expect(kinds.at(-1)).toBe('generation');
  });
});

describe('where the card is drawn', () => {
  it("the scene draws the open milestone of its participants, and the thread draws it under her messages only", () => {
    const s = run(world('equal', 25), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    const controller = { send: vi.fn(), propose: vi.fn(), answer: vi.fn(), end: vi.fn(async () => {}), edit: vi.fn(), stop: vi.fn(), onEdited: vi.fn(), transcript: () => [], onSwipe: vi.fn() } as unknown as SceneController;
    const onAnswerMilestone = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderSceneScreen(host, { controller, getState: () => s, registries: reg, st, settings: () => ({ ...DEFAULT_SETTINGS, typingSpeed: 0 }), onEnded: vi.fn(), onAnswerMilestone });
    const id = s.dynamic!.open.milestones[0].id;
    host.querySelector<HTMLButtonElement>('button[data-milestone-answer="accept"]')!.click();
    expect(onAnswerMilestone).toHaveBeenCalledWith(id, 'accept');
    expect(markedWithout(host.querySelector('.alius-milestone-cards') as HTMLElement)).toEqual([]);

    const comms = h('div');
    document.body.append(comms);
    const onAnswer = vi.fn();
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn(), onAnswerMilestone: onAnswer } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    comms.querySelector<HTMLButtonElement>('.alius-thread button[data-milestone-answer="refuse"]')!.click();
    expect(onAnswer).toHaveBeenCalledWith(id, 'refuse');
    comms.querySelector<HTMLElement>(`button[data-unit="${BEA}"]`)!.click();
    expect(comms.querySelector('.alius-thread [data-milestone]')).toBeNull();
  });

  it('nothing is drawn while the dynamic is off', () => {
    const s = world('equal', 25);
    s.content = { enabled: [] };
    const host = h('div');
    document.body.append(host);
    const comms = h('div');
    document.body.append(comms);
    renderCommsTab(comms, { getState: () => s, registries: reg, onSend: vi.fn(), onRead: vi.fn(), onAnswer: vi.fn() } as never);
    comms.querySelector<HTMLElement>(`button[data-unit="${ANN}"]`)!.click();
    expect(comms.querySelector('[data-milestone]')).toBeNull();
    expect(host.children).toHaveLength(0);
  });
});
