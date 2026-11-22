// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import { book } from '../../../src/engine/personal/bookings';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { renderCmdrCard } from '../../../src/ui/commander/cmdrCard';
import { h } from '../../../src/ui/dom';
import type { GenerationUi } from '../../../src/ui/generation/surface';
import { drawTaskCards, renderTaskCard } from '../../../src/ui/practice/taskCard';
import { registerSignature, resetSignature, renderSignature } from '../../../src/ui/practice/signature';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, withService, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  resetSignature();
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 'Bring the roster to my quarters before drill.', summary: 'bring the roster before drill',
  status: 'offered', acceptForm: 'button_cost', day: 20, ...over,
});
function state(over: Partial<Task> = {}, style: 'cold' | 'cruel' | 'affectionate' | 'ritual' = 'cold'): CampaignState {
  const s = withService(world(reg, 'role'));
  s.squad.find((u) => u.id === ANN)!.bond!.practice!.style.primary = style;
  s.practices = { ...blankPractices(), seq: 2, tasks: [task(over)] };
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
function draw(s: CampaignState) {
  const host = h('div');
  document.body.append(host);
  const handlers = { onAnswer: vi.fn(), onSign: vi.fn(), focusInput: vi.fn() };
  renderTaskCard(host, { state: s, reg, task: s.practices!.tasks[0], onAnswer: handlers.onAnswer, onSign: handlers.onSign, focusInput: handlers.focusInput });
  return { host, ...handlers };
}
const buttons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')].map((b) => b.textContent);

describe('the card speaks in her voice', () => {
  it('her name, her accent, her words; a plain task shows the fallback line without the draft marker', () => {
    const { host } = draw(state());
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull();
    expect(host.querySelector('.alius-voice-from')!.textContent).toBe('Ann');
    expect(host.textContent).toContain('Bring the roster to my quarters before drill.');
    const plain = draw(state({ text: 'AUTHOR TO WRITE: forms of address in public.', summary: 'forms of address in public', plain: true }));
    expect(plain.host.textContent).toContain('forms of address in public.');
    expect(plain.host.textContent).not.toMatch(/AUTHOR TO WRITE/);
    expect(plain.host.querySelector('[data-task]')!.getAttribute('data-task')).toBe('pt1');
  });

  it('a button task has ACCEPT, REFUSE and TALK, each answering as asked', () => {
    const s = state({ stakes: 'trivial', acceptForm: 'button' });
    const { host, onAnswer } = draw(s);
    expect(buttons(host)).toEqual(['[ ACCEPT ]', '[ REFUSE ]', '[ TALK ]']);
    for (const b of host.querySelectorAll<HTMLButtonElement>('button')) b.click();
    expect(onAnswer.mock.calls).toEqual([['accept'], ['refuse'], ['talk']]);
  });

  it('never shows a pronoun for the commander', () => {
    for (const form of [{ stakes: 'trivial', acceptForm: 'button' }, { stakes: 'major', acceptForm: 'words' }, { stakes: 'severe', acceptForm: 'signed' }] as Array<Partial<Task>>) {
      expect(draw(state(form)).host.textContent).not.toMatch(/\b(he|him|his)\b/i);
    }
  });
});

describe('the consent ladder on the card', () => {
  it('the cost comes before the accept on a minor task, in bands: the slots, and what lapses', () => {
    const s = state({ check: 'slot_with_her', deadline: { day: 20, slot: 'evening' } });
    book(s, { registries: reg }, { unitId: BEA, kindId: 'evening_with_me', day: 20, slot: 'evening', source: 'roll' });
    const { host } = draw(s);
    const cost = host.querySelector('.alius-task-cost')!;
    const answers = host.querySelector('.alius-task-answers')!;
    expect(cost).not.toBeNull();
    expect(cost.compareDocumentPosition(answers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cost.textContent).toContain('Evening together');
    expect(cost.textContent).toMatch(/1 slot/);
    expect(host.textContent!.replace(/1 slot/, '')).not.toMatch(/\d/);
  });

  it('a minor task that costs nothing says so', () => {
    expect(draw(state()).host.querySelector('.alius-task-cost')!.textContent).toMatch(/nothing/i);
  });

  it('words: ACCEPT only focuses the input and dispatches nothing; it says who will know', () => {
    const s = state({ stakes: 'major', acceptForm: 'words', proof: 'witness', audienceIds: [BEA] });
    const { host, onAnswer, focusInput } = draw(s);
    const accept = host.querySelector<HTMLButtonElement>('button[data-task-answer="accept"]')!;
    accept.click();
    expect(focusInput).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(host.querySelector('.alius-task-know')!.textContent).toContain('Bea');
    expect(host.querySelector('.alius-task-know')!.textContent).toMatch(/witness/i);
    host.querySelector<HTMLButtonElement>('button[data-task-answer="refuse"]')!.click();
    expect(onAnswer).toHaveBeenCalledWith('refuse');
  });

  it('signed: the closes line is there, SIGN only after the words were said', () => {
    const s = state({ stakes: 'severe', acceptForm: 'signed' });
    const before = draw(s);
    expect(before.host.querySelector('.alius-task-closes')!.textContent).toContain('bring the roster before drill');
    expect(before.host.querySelector('[data-task-sign]')).toBeNull();
    expect(before.host.querySelector('button[data-task-answer="accept"]')).not.toBeNull();
    const said = state({ stakes: 'severe', acceptForm: 'signed', said: true });
    const after = draw(said);
    expect(after.host.querySelector('[data-task-sign]')).not.toBeNull();
    expect(after.host.querySelector('button[data-task-answer="accept"]')).toBeNull();
    expect(after.host.querySelector('.alius-task-closes')).not.toBeNull();
  });

  it('a handover task says what it hands over', () => {
    const s = state({ stakes: 'severe', acceptForm: 'signed', handover: 'key' });
    expect(draw(s).host.querySelector('.alius-task-closes')!.textContent).toMatch(/key/i);
  });
});

describe('a sealed card', () => {
  const sealed = (style: 'cold' | 'cruel' | 'affectionate') => state({ stakes: 'major', acceptForm: 'sealed', sealed: true }, style);

  it('hides the text and the summary: neither string is anywhere in the card', () => {
    for (const style of ['cold', 'cruel', 'affectionate'] as const) {
      const { host } = draw(sealed(style));
      expect(host.textContent, style).not.toContain('Bring the roster');
      expect(host.textContent, style).not.toContain('bring the roster before drill');
      expect(host.innerHTML, style).not.toContain('roster');
      expect(buttons(host), style).toEqual(['[ ACCEPT ]', '[ REFUSE ]']);
    }
  });

  it('cruel shows the envelope alone; others the weight; affectionate adds the track', () => {
    const cruel = draw(sealed('cruel')).host.querySelector('.alius-task-envelope')!.textContent!;
    const cold = draw(sealed('cold')).host.querySelector('.alius-task-envelope')!.textContent!;
    const kind = draw(sealed('affectionate')).host.querySelector('.alius-task-envelope')!.textContent!;
    expect(cruel).toMatch(/envelope/i);
    expect(cruel).not.toMatch(/heavy|light|grave|slight/i);
    expect(cold).toMatch(/heavy/i);
    expect(cold).not.toContain(String(reg.dynamicTracks.get('service')!.label));
    expect(kind).toMatch(/heavy/i);
    expect(kind).toContain(String(reg.dynamicTracks.get('service')!.label));
  });
});

describe('drawTaskCards', () => {
  it('draws only the offered tasks of the units the pick chooses, replacing what the host held', () => {
    const s = state();
    s.practices!.tasks.push(task({ id: 'pt2', status: 'open' }), task({ id: 'pt3', holderId: BEA }));
    const host = h('div', {}, h('p', {}, 'old'));
    drawTaskCards(host, s, reg, (c) => c.unitId === ANN, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn() });
    expect([...host.querySelectorAll('article[data-task]')].map((e) => e.getAttribute('data-task'))).toEqual(['pt1']);
    expect(host.textContent).not.toContain('old');
  });

  it('draws nothing while she is not holding, or nothing is offered, and passes the task id to the handlers', () => {
    const s = state();
    s.relations[ANN].dynamic!.frame = 'equal';
    const host = h('div');
    drawTaskCards(host, s, reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn() });
    expect(host.children).toHaveLength(0);
    const answer = vi.fn();
    const sign = vi.fn();
    const live = state({ stakes: 'severe', acceptForm: 'signed', said: true });
    drawTaskCards(host, live, reg, () => true, { answer, sign, focusInput: vi.fn() });
    host.querySelector<HTMLButtonElement>('button[data-task-answer="refuse"]')!.click();
    expect(answer).toHaveBeenCalledWith('pt1', 'refuse');
  });
});

describe('the signature', () => {
  it('is a press and hold: it signs after the hold, not before', () => {
    vi.useFakeTimers();
    const onSign = vi.fn();
    const host = h('div');
    document.body.append(host);
    host.append(renderSignature({ onSign, analyze: 'glossary:accept_signed' }));
    const btn = host.querySelector<HTMLElement>('[data-task-sign]')!;
    expect(btn.textContent).toContain('SIGN');
    btn.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(300);
    btn.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(5000);
    expect(onSign).not.toHaveBeenCalled();
    btn.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(5000);
    expect(onSign).toHaveBeenCalledTimes(1);
  });

  it('can be held from the keyboard', () => {
    vi.useFakeTimers();
    const onSign = vi.fn();
    const btn = renderSignature({ onSign, analyze: 'glossary:accept_signed' });
    document.body.append(btn);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    vi.advanceTimersByTime(5000);
    expect(onSign).toHaveBeenCalledTimes(1);
  });

  it('registerSignature replaces the default (P17e): the card draws the replacement', () => {
    registerSignature(({ onSign }) => h('button', { type: 'button', 'data-custom-sign': '', onclick: onSign }, 'DRAW'));
    const s = state({ stakes: 'severe', acceptForm: 'signed', said: true });
    const { host, onSign } = draw(s);
    host.querySelector<HTMLButtonElement>('[data-custom-sign]')!.click();
    expect(onSign).toHaveBeenCalledTimes(1);
  });
});

describe('the record lines are on the CMDR card', () => {
  it('the newest five, each with data-analyze glossary:practice_record, under her Held by line', () => {
    const s = state();
    s.practices!.records = Array.from({ length: 7 }, (_, i) => ({ day: 10 + i, holderId: ANN, line: `Thing number ${i}. Day ${10 + i}.` }));
    const host = h('div');
    document.body.append(host);
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    const lines = [...host.querySelectorAll<HTMLElement>('[data-practice-record]')];
    expect(lines).toHaveLength(5);
    expect(lines[0].textContent).toContain('Day 16'); // newest first
    expect(lines.at(-1)!.textContent).toContain('Day 12');
    for (const l of lines) expect(l.getAttribute('data-analyze')).toBe('glossary:practice_record');
    const held = host.querySelector('[data-held-by]')!;
    expect(held.compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).toContain('Ann');
  });

  it('a sealed line is signed blank with no draft marker; no records, no block', () => {
    const s = state();
    s.practices!.records = [{ day: 12, holderId: ANN, line: 'AUTHOR TO WRITE: Signed blank. Day 12.' }];
    const host = h('div');
    renderCmdrCard(host, { state: s, registries: reg, raw: false });
    expect(host.querySelector('[data-practice-record]')!.textContent).toContain('Signed blank. Day 12.');
    expect(host.textContent).not.toMatch(/AUTHOR TO WRITE/);
    const none = h('div');
    renderCmdrCard(none, { state: state(), registries: reg, raw: false });
    expect(none.querySelector('[data-practice-record]')).toBeNull();
  });
});

describe('analysis', () => {
  it('every marked element on every form of the card resolves, is reachable and carries data-analyze', () => {
    const forms: Array<Partial<Task>> = [
      { stakes: 'trivial', acceptForm: 'button' }, { stakes: 'minor', acceptForm: 'button_cost' }, { stakes: 'major', acceptForm: 'words', proof: 'witness', audienceIds: [BEA] },
      { stakes: 'severe', acceptForm: 'signed' }, { stakes: 'severe', acceptForm: 'signed', said: true, handover: 'device' }, { stakes: 'major', acceptForm: 'sealed', sealed: true },
    ];
    for (const form of forms) {
      const s = state(form);
      const { host } = draw(s);
      const records = h('div');
      document.body.append(records);
      s.practices!.records = [{ day: 12, holderId: ANN, line: 'Something. Day 12.' }];
      renderCmdrCard(records, { state: s, registries: reg, raw: false });
      for (const el of [host, records]) {
        expect(markedWithout(el), JSON.stringify(form)).toEqual([]);
        expect(unresolved(el, env(s)), JSON.stringify(form)).toEqual([]);
        expect(unreachable(el), JSON.stringify(form)).toEqual([]);
      }
      expect(host.querySelectorAll('[data-analyze]').length).toBeGreaterThan(2);
    }
  });
});

/** A stand-in for the surface's generation ui (every call a spy; the reroll state is whatever the test says). */
function fakeGeneration(reroll: { enabled: boolean; reason?: string } = { enabled: true }) {
  const generations = { retry: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), reroll: vi.fn(async () => ({ kind: 'applied', value: 1 }) as never), rerollState: vi.fn(() => reroll), drop: vi.fn(), useFallback: vi.fn(async () => {}) };
  const ui: GenerationUi = { generations, modal: vi.fn(async () => null), settings: () => ({ ...DEFAULT_SETTINGS }), toast: vi.fn(), redraw: vi.fn() };
  return { ui, generations };
}

describe('when it is due (M9)', () => {
  const due = (host: HTMLElement) => host.querySelector('.alius-task-due')?.textContent ?? null;

  it('says the day in words, and the slot when she named one, never a number', () => {
    const today = 20; // the world's day
    expect(due(draw(state({ deadline: { day: today } })).host)).toBe('Due: today.');
    expect(due(draw(state({ deadline: { day: today + 1 } })).host)).toBe('Due: tomorrow.');
    expect(due(draw(state({ deadline: { day: today + 1, slot: 'evening' } })).host)).toBe('Due: tomorrow evening.');
    expect(due(draw(state({ deadline: { day: today + 2, slot: 'morning' } })).host)).toBe('Due: in two days, in the morning.');
    expect(due(draw(state({ deadline: { day: today + 7 } })).host)).toBe('Due: in seven days.');
    expect(due(draw(state({ deadline: { day: today - 1 } })).host)).toBe('Due: today.'); // already late: today is all that is left
    expect(due(draw(state({ deadline: { day: today + 3, slot: 'evening' } })).host)).not.toMatch(/\d/);
  });

  it('says nothing when the duration is hidden, the card is sealed, or it has no deadline', () => {
    expect(due(draw(state({ deadline: { day: 22 }, noDuration: true })).host)).toBeNull();
    expect(due(draw(state({ deadline: { day: 22 }, sealed: true, acceptForm: 'sealed' })).host)).toBeNull();
    expect(due(draw(state({})).host)).toBeNull();
  });

  it('with no duration it says so, in her words, with no day and no number, and the line is addressed by the glossary; a card with a deadline says nothing of it', () => {
    const { host } = draw(state({ deadline: { day: 22 }, noDuration: true }));
    const line = host.querySelector('.alius-task-open-ended')!;
    expect(line.textContent).toBe('She has not said how long.');
    expect(line.getAttribute('data-analyze')).toBe('glossary:no_duration');
    expect(host.textContent).not.toMatch(/\d/);
    expect(host.querySelector('.alius-task-open-ended')).not.toBeNull();
    expect(draw(state({ deadline: { day: 22 } })).host.querySelector('.alius-task-open-ended')).toBeNull();
    expect(draw(state({ deadline: { day: 22 }, noDuration: true, sealed: true, acceptForm: 'sealed' })).host.querySelector('.alius-task-open-ended')).toBeNull(); // the envelope shows nothing of it
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(state()))).toEqual([]);
  });

  it('is addressed by the glossary', () => {
    const host = draw(state({ deadline: { day: 21 } })).host;
    expect(markedWithout(host)).toEqual([]);
    expect(host.querySelector('.alius-task-due')!.getAttribute('data-analyze')).toBeTruthy();
  });
});

describe('REROLL of her words and the chips of a call that failed (I8, R24)', () => {
  const rerollOf = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('button[data-action="generation-reroll"]');
  const withRequest = (over: Partial<Task> = {}) => state({ requestId: 'pq5', ...over });

  it('with no generation ui the card draws no reroll', () => {
    expect(rerollOf(draw(withRequest()).host)).toBeNull();
  });

  it('with one, an offered card has [ REROLL ] for its site and request, which asks the envelope again', () => {
    const s = withRequest();
    const { ui, generations } = fakeGeneration();
    const host = h('div');
    document.body.append(host);
    drawTaskCards(host, s, reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn(), generation: ui });
    const b = rerollOf(host)!;
    expect(b).not.toBeNull();
    expect(generations.rerollState).toHaveBeenCalledWith('practice.task', 'pq5');
    b.click();
    expect(generations.reroll).toHaveBeenCalledWith('practice.task', 'pq5');
    expect(markedWithout(host)).toEqual([]);
  });

  it('a card that is locked says why, and a card with no request has none', () => {
    const s = withRequest();
    const { ui } = fakeGeneration({ enabled: false, reason: 'It was answered.' });
    const host = h('div');
    document.body.append(host);
    drawTaskCards(host, s, reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn(), generation: ui });
    expect(rerollOf(host)!.getAttribute('aria-disabled')).toBe('true');
    expect(rerollOf(host)!.title).toBe('It was answered.');
    const bare = h('div');
    drawTaskCards(bare, state(), reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn(), generation: ui });
    expect(rerollOf(bare)).toBeNull();
  });

  it('a practice whose words failed shows its chip where its holder is picked, and only there', () => {
    const s = state();
    s.practices!.tasks = [];
    s.practices!.requests = [{ id: 'pq6', holderId: ANN, kind: 'task', day: 20, seedIds: [] }];
    s.generations = { seq: 1, records: [{ id: 'g1', siteId: 'practice.task', key: 'pq6', reason: 'refused', detail: '', attempts: 1, day: 20, slot: 'morning', at: 1, budgetMult: 1, status: 'open' }] };
    const { ui } = fakeGeneration();
    const mine = h('div');
    document.body.append(mine);
    drawTaskCards(mine, s, reg, (c) => c.unitId === ANN, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn(), generation: ui });
    expect(mine.querySelectorAll('.alius-genfail')).toHaveLength(1);
    const other = h('div');
    drawTaskCards(other, s, reg, (c) => c.unitId === BEA, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn(), generation: ui });
    expect(other.querySelectorAll('.alius-genfail')).toHaveLength(0);
    const none = h('div');
    drawTaskCards(none, s, reg, () => true, { answer: vi.fn(), sign: vi.fn(), focusInput: vi.fn() });
    expect(none.querySelectorAll('.alius-genfail')).toHaveLength(0);
  });
});
