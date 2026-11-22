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
