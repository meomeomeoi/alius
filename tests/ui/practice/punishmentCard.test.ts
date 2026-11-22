// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/discipline';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { blankPractices, type OpenPunishment } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import type { GenerationUi } from '../../../src/ui/generation/surface';
import { drawPunishmentCards, renderPunishmentCard, renderTakeInsteadCard } from '../../../src/ui/practice/punishmentCard';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore, run } from '../../helpers/world';
import { ANN, BEA, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => { document.body.innerHTML = ''; });

const pun = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId: 'kept_in_quarters', severity: 3, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'major', day: 20 }, text: 'You will stay where I can see you.', summary: 'kept in her quarters', status: 'offered', day: 20, ...over,
});
function state(over: Partial<OpenPunishment> = {}): CampaignState {
  const s = withService(world(reg, 'role'));
  s.content = { enabled: [...(s.content?.enabled ?? [])] };
  dynamicOf(s, ANN)!.hold = 60;
  s.practices = { ...blankPractices(), seq: 3, punishments: [pun(over)] };
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
const handlers = () => ({ answer: vi.fn(), takeInstead: vi.fn(), undo: vi.fn() });
const all = (s: CampaignState, hs = handlers(), pick: (c: { unitId: string }) => boolean = () => true) => {
  const host = h('div');
  document.body.append(host);
  drawPunishmentCards(host, s, reg, pick, hs);
  return { host, hs };
};
const labels = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')].map((b) => b.textContent);

describe('the punishment card', () => {
  it('shows the label and her words and a word for the weight, never the severity number', () => {
    for (const [severity, word] of [[1, 'light'], [2, 'light'], [3, 'heavy'], [4, 'harsh'], [5, 'harsh']] as const) {
      const { host } = all(state({ severity }));
      expect(host.querySelector('.alius-voice-from')!.textContent).toBe('Ann');
      expect(host.textContent).toContain('You will stay where I can see you.');
      expect(host.textContent).toContain('Kept in her quarters.');
      expect(host.textContent).toContain(`Weight: ${word}.`);
      expect(host.textContent).not.toMatch(/\d/);
      document.body.innerHTML = '';
    }
  });

  it('[ ACCEPT ] [ NEGOTIATE ] [ REFUSE ] each carry data-analyze and answer as asked', () => {
    const { host, hs } = all(state());
    expect(labels(host)).toEqual(['[ ACCEPT ]', '[ NEGOTIATE ]', '[ REFUSE ]']);
    for (const b of host.querySelectorAll<HTMLButtonElement>('button')) expect(b.getAttribute('data-analyze'), b.textContent!).toMatch(/^glossary:/);
    host.querySelector<HTMLButtonElement>('[data-punishment-answer="negotiate"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-punishment-answer="refuse"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-punishment-answer="accept"]')!.click();
    expect(hs.answer.mock.calls).toEqual([['pp1', 'negotiate'], ['pp1', 'refuse'], ['pp1', 'accept']]);
  });

  it('a plain card shows the fallback line without the draft marker; a negotiating one says it is being talked over; no pronoun for the commander', () => {
    const { host } = all(state({ text: 'AUTHOR TO WRITE: a day without messages.', summary: 'a day without messages', plain: true, status: 'negotiating', entryId: 'no_messages', severity: 2 }));
    expect(host.textContent).toContain('a day without messages.');
    expect(host.textContent).not.toMatch(/AUTHOR TO WRITE/);
    expect(host.textContent).toContain('talked over');
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('draws only the punishments of the units the pick chooses, nothing while she is not holding, and replaces what the host held', () => {
    const s = state();
    expect(all(s, handlers(), (c) => c.unitId === BEA).host.children).toHaveLength(0);
    const frozen = state();
    dynamicOf(frozen, ANN)!.frame = 'equal';
    expect(all(frozen).host.children).toHaveLength(0);
    const host = h('div', {}, 'old');
    drawPunishmentCards(host, s, reg, () => true, handlers());
    expect(host.textContent).not.toContain('old');
    renderPunishmentCard(host, { state: s, reg, punishment: s.practices!.punishments[0], onAnswer: vi.fn() });
    expect(host.querySelectorAll('.alius-punishment')).toHaveLength(2);
  });

  it('immersive mode keeps the cards: nothing here reads the setting that hides the bands', () => {
    const s = state();
    const settings = { ...DEFAULT_SETTINGS, dynamicHidden: true };
    expect(settings.dynamicHidden).toBe(true);
    const { host } = all(s);
    expect(host.querySelectorAll('.alius-punishment')).toHaveLength(1);
    expect(labels(host)).toHaveLength(3);
  });
});

describe('UNDO', () => {
  function answered(): CampaignState {
    const s = state({ entryId: 'no_messages', severity: 2 });
    dynamicOf(s, ANN)!.hold = 45; // no milestone is due after the repair (one would refuse the undo)
    return run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } }).state;
  }

  it('appears beside the answer only while canUndoPractice is null, and asks for the undo', () => {
    const s = answered();
    const { host, hs } = all(s);
    const undo = host.querySelector<HTMLButtonElement>('[data-undo-practice="pp1"]');
    expect(undo).not.toBeNull();
    expect(host.textContent).toContain('ACCEPTED');
    expect(undo!.getAttribute('data-analyze')).toMatch(/^glossary:/);
    undo!.click();
    expect(hs.undo).toHaveBeenCalledWith('pp1');
    const later = structuredClone(s);
    later.day += 1;
    expect(all(later).host.querySelector('[data-undo-practice]')).toBeNull();
    const slot = structuredClone(s);
    slot.slot = slot.slot === 'morning' ? 'afternoon' : 'morning';
    expect(all(slot).host.querySelector('[data-undo-practice]')).toBeNull();
  });
});

describe('TAKE IT INSTEAD', () => {
  function ordered(): CampaignState {
    const s = withService(world(reg, 'rule'));
    dynamicOf(s, ANN)!.hold = 75;
    s.practices = { ...blankPractices(), seq: 3, punishments: [pun({ entryId: 'verbal', severity: 1, forUnitId: BEA, text: 'Bea earned a talking-to.', summary: 'a talking-to for Bea', plain: true })] };
    return s;
  }

  it('names the soldier and has the three buttons', () => {
    const s = ordered();
    const hs = handlers();
    const { host } = all(s, hs);
    expect(host.querySelector('.alius-take-instead')).not.toBeNull();
    expect(host.textContent).toContain('For Bea:');
    expect(labels(host)).toEqual(['[ DO IT ]', '[ TAKE IT INSTEAD ]', '[ REFUSE ]']);
    for (const b of host.querySelectorAll<HTMLButtonElement>('button')) expect(b.getAttribute('data-analyze'), b.textContent!).toBe('glossary:take_it_instead');
    host.querySelector<HTMLButtonElement>('[data-take-answer="take_it"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-take-answer="do_it"]')!.click();
    expect(hs.takeInstead.mock.calls).toEqual([['pp1', 'take_it'], ['pp1', 'do_it']]);
    expect(hs.answer).not.toHaveBeenCalled();
    const card = h('div');
    renderTakeInsteadCard(card, { state: s, reg, punishment: { ...s.practices!.punishments[0], forUnitId: undefined } as never, onAnswer: vi.fn() });
    expect(card.children).toHaveLength(0); // not an order: nothing
  });
});

describe('analysis', () => {
  it('every marked element of both cards and the UNDO chip resolves, is reachable and carries data-analyze', () => {
    const s = state();
    s.practices!.punishments.push(pun({ id: 'pp2', entryId: 'verbal', severity: 1, forUnitId: BEA, summary: 'a talking-to for Bea', text: 'Bea earned one.', plain: true }));
    dynamicOf(s, ANN)!.hold = 45;
    const done = run(structuredClone(s), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } }).state;
    done.practices!.punishments.push(pun({ id: 'pp3', status: 'offered', entryId: 'no_messages', severity: 2 }));
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    const host = h('div');
    root.append(host);
    drawPunishmentCards(host, done, reg, () => true, handlers());
    expect(host.querySelector('[data-undo-practice]')).not.toBeNull();
    expect(host.querySelector('.alius-take-instead')).not.toBeNull();
    expect(markedWithout(root)).toEqual([]);
    expect(unresolved(root, env(done))).toEqual([]);
    expect(unreachable(root)).toEqual([]);
  });
});

/** A stand-in for the surface's generation ui (every call a spy; the reroll state is whatever the test says). */
function fakeGeneration(reroll: { enabled: boolean; reason?: string } = { enabled: true }) {
  const generations = { retry: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), reroll: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), rerollState: vi.fn(() => reroll), drop: vi.fn(), useFallback: vi.fn(async () => {}) };
  const ui: GenerationUi = { generations, modal: vi.fn(async () => null), settings: () => ({ ...DEFAULT_SETTINGS }), toast: vi.fn(), redraw: vi.fn() };
  return { ui, generations };
}

describe('REROLL of her words (I8, R24)', () => {
  const rerollOf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-action="generation-reroll"]');

  it('with no generation ui, or for an order about a soldier, none; with one, an offered punishment asks the envelope again', () => {
    expect(rerollOf(all(state({ requestId: 'pq5' })).host)).toBeNull();
    const { ui, generations } = fakeGeneration();
    const host = h('div');
    document.body.append(host);
    drawPunishmentCards(host, state({ requestId: 'pq5' }), reg, () => true, { ...handlers(), generation: ui });
    const b = rerollOf(host)!;
    expect(b).not.toBeNull();
    expect(generations.rerollState).toHaveBeenCalledWith('practice.punishment', 'pq5');
    b.click();
    expect(generations.reroll).toHaveBeenCalledWith('practice.punishment', 'pq5');
    expect(markedWithout(host)).toEqual([]);
    const order = h('div');
    drawPunishmentCards(order, state({ forUnitId: BEA }), reg, () => true, { ...handlers(), generation: ui });
    expect(rerollOf(order)).toBeNull();
    const talked = h('div');
    drawPunishmentCards(talked, state({ requestId: 'pq5', status: 'negotiating' }), reg, () => true, { ...handlers(), generation: ui });
    expect(rerollOf(talked)).toBeNull(); // being talked over: her words are the talk's
  });
});

describe('the ceremony card (R21)', () => {
  const STEP_LABELS = ['Fetch the implement', 'Ask for it formally', 'Name the number', 'Take the posture', 'The execution', 'Corner time', 'The thanks', 'The reconciliation'];
  const STEPS = ['fetch_implement', 'ask_formally', 'name_the_number', 'take_the_posture', 'the_execution', 'corner_time', 'the_thanks', 'the_reconciliation'];

  /** Ann (a ritual holder) is carrying a punishment out as a ceremony; `done` steps are behind. */
  function ceremonial(done: string[] = [], over: Partial<OpenPunishment> = {}): CampaignState {
    const s = state({ status: 'accepted', answeredDay: 20, ceremony: { steps: STEPS, done }, ...over });
    s.squad.find((u) => u.id === ANN)!.bond!.practice!.style.primary = 'ritual';
    return s;
  }
  const ceremonyHandlers = () => ({ ...handlers(), ceremony: vi.fn() });
  const draw = (s: CampaignState, hs = ceremonyHandlers()) => {
    const host = h('div');
    document.body.append(host);
    drawPunishmentCards(host, s, reg, () => true, hs);
    return { host, hs };
  };

  it('lists the steps in order with their labels and marks the ones done and the next', () => {
    const { host } = draw(ceremonial(['fetch_implement']));
    const rows = [...host.querySelectorAll('[data-ceremony-step]')];
    expect(rows.map((r) => r.querySelector('.alius-ceremony-label')!.textContent)).toEqual(STEP_LABELS);
    expect(rows.map((r) => r.getAttribute('data-ceremony-state'))).toEqual(['done', 'next', ...Array(6).fill('later')]);
    expect(host.querySelectorAll('.alius-ceremony')).toHaveLength(1);
    expect(host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('a chip step is a button that sends the step; only the next step has one', () => {
    const { host, hs } = draw(ceremonial());
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-ceremony-do]')];
    expect(buttons.map((b) => b.textContent)).toEqual(['[ FETCH THE IMPLEMENT ]']);
    buttons[0].click();
    expect(hs.ceremony).toHaveBeenCalledWith('pp1', 'fetch_implement', undefined);
    const later = draw(ceremonial(['fetch_implement', 'ask_formally', 'name_the_number', 'take_the_posture']));
    expect([...later.host.querySelectorAll('[data-ceremony-do]')].map((b) => b.textContent)).toEqual(['[ THE EXECUTION ]']);
  });

  it('a words step says to say it in her own words and has no button; a posture step names the posture and has none either', () => {
    const words = draw(ceremonial(['fetch_implement'])).host;
    expect(words.querySelector('[data-ceremony-do]')).toBeNull();
    expect(words.textContent).toContain('Say it in your own words.');
    const posture = draw(ceremonial(['fetch_implement', 'ask_formally', 'name_the_number'])).host;
    expect(posture.querySelector('[data-ceremony-do]')).toBeNull();
    expect(posture.querySelector('.alius-ceremony-hint')!.textContent).toMatch(/posture/i);
  });

  it('a number step has a field for 1 to 50 and a button that sends the number; a number out of range or none sends nothing', () => {
    const { host, hs } = draw(ceremonial(['fetch_implement', 'ask_formally']));
    const input = host.querySelector<HTMLInputElement>('input[data-ceremony-number]')!;
    expect(input.min).toBe('1');
    expect(input.max).toBe('50');
    const button = host.querySelector<HTMLButtonElement>('[data-ceremony-do]')!;
    expect(button.textContent).toBe('[ NAME IT ]');
    for (const bad of ['', '0', '51', '2.5', '-1']) {
      input.value = bad;
      button.click();
    }
    expect(hs.ceremony).not.toHaveBeenCalled();
    input.value = '8';
    button.click();
    expect(hs.ceremony).toHaveBeenCalledWith('pp1', 'name_the_number', 8);
  });

  it('shows no number the player did not type: a hidden or doubled count never reaches the card', () => {
    const s = ceremonial(['fetch_implement', 'ask_formally', 'name_the_number'], { hiddenCount: true, count: 16, ceremony: { steps: STEPS, done: ['fetch_implement', 'ask_formally', 'name_the_number'], number: 8 } });
    const { host } = draw(s);
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.innerHTML).not.toContain('16');
  });

  it('draws nothing of a ceremony that is finished, not accepted or hers while she is not holding; the plain accepted punishment keeps its UNDO chip', () => {
    expect(draw(ceremonial(STEPS)).host.querySelector('.alius-ceremony')).toBeNull();
    expect(draw(state()).host.querySelector('.alius-ceremony')).toBeNull();
    const frozen = ceremonial();
    dynamicOf(frozen, ANN)!.frame = 'equal';
    expect(draw(frozen).host.children).toHaveLength(0);
  });

  it('a ceremony that has only been started can still be undone; once a step was done the chip is gone', () => {
    const started = run(state({ severity: 3 }), reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } }).state;
    expect(started.practices!.punishments[0].ceremony).toBeUndefined(); // cold holder: no ceremony here
    const s = ceremonial();
    s.practices!.punishments[0].inverse = { practice: { punishmentId: 'pp1', status: 'offered', hold: 60, favour: 0, tracks: {}, refusals: [], contest: [], restrictionsAdded: [], domains: [], lastPracticeDay: 20, stamp: { day: 20, slot: s.slot, frame: 'role', milestones: [], claims: [], injuredUntil: 0, expedition: null, lastExpedition: null } } } as never;
    expect(draw(s).host.querySelector('[data-undo-practice="pp1"]')).not.toBeNull();
    const stepped = ceremonial(['fetch_implement']);
    stepped.practices!.punishments[0].inverse = s.practices!.punishments[0].inverse;
    expect(draw(stepped).host.querySelector('[data-undo-practice]')).toBeNull();
  });

  it('every element carries data-analyze, resolves and is reachable', () => {
    const s = ceremonial(['fetch_implement', 'ask_formally']);
    const { host } = draw(s);
    expect(host.querySelector('.alius-ceremony')!.getAttribute('data-analyze')).toBe('glossary:ceremony');
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
    for (const b of host.querySelectorAll('button, input')) expect(b.getAttribute('data-analyze'), b.outerHTML.slice(0, 60)).toBe('glossary:ceremony');
  });
});
