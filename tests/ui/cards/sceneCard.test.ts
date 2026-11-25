// @vitest-environment jsdom
/**
 * P10e-e Task 7: her cards in the scene's language and her voice (`docs/prototypes/cards.html`, `docs/content/card-voice.md`). With
 * `look: 'scene'` every draw function builds its card with `sceneCard`: her name in her hand, the kind, her words, the conditions as her own
 * lines with the engine's value in her stronger ink, plain pills for the commander's answers. Without it the DOM is today's.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { resetKnowledgeRules } from '../../../src/analysis/knowledge';
import type { Registries } from '../../../src/content/types';
import { book } from '../../../src/engine/personal/bookings';
import { blankPractices, type OpenPunishment, type Task } from '../../../src/engine/practice/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { drawClaimCards, drawMilestoneCards, drawReturnCards } from '../../../src/ui/dynamic/cards';
import { drawDemonstrationCards } from '../../../src/ui/practice/demonstrationCard';
import { drawPunishmentCards } from '../../../src/ui/practice/punishmentCard';
import { resetSignature } from '../../../src/ui/practice/signature';
import { drawTaskCards } from '../../../src/ui/practice/taskCard';
import { renderMomentCard } from '../../../src/ui/scene/momentCard';
import { voiceLine } from '../../../src/ui/scene/cards/voice';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { fireMoment } from '../../../src/engine/moments/fire';
import { setRelation } from '../../helpers/loyalty';
import { enable } from '../../helpers/bonds';
import { errors, loadCore, run } from '../../helpers/world';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { hiddenFixture } from '../../fixtures/analyze/hidden';
import { ANN, BEA, unitOf, withService, world } from '../../engine/practice/world';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/moments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  resetSignature();
  resetBlockingHooks();
  resetKnowledgeRules();
  registerCoreProviders();
});

type Style = 'cold' | 'cruel' | 'vindictive' | 'affectionate' | 'ritual' | 'possessive';
const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'slot_with_her', proof: 'none',
  text: 'Bring me the patrol roster before evening mess.', summary: 'bring the roster', status: 'offered', acceptForm: 'button_cost', day: 20,
  deadline: { day: 20, slot: 'evening' }, ...over,
});
const punishment = (over: Partial<OpenPunishment> = {}): OpenPunishment => ({
  id: 'pp1', holderId: ANN, entryId: 'no_messages', severity: 2, offence: { kind: 'task_broken', stakes: 'major', day: 20 }, text: 'You forgot the roster.', summary: 'a day without messages', status: 'offered', day: 20, ...over,
} as OpenPunishment);
function state(style: Style = 'possessive', practices: Partial<CampaignState['practices'] & object> = {}): CampaignState {
  const s = withService(world(reg, 'role'));
  unitOf(s, ANN).bond!.practice!.style.primary = style as never;
  s.practices = { ...blankPractices(), seq: 9, ...practices } as never;
  return s;
}
const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;
const noop = (): void => {};
const SCENE = { look: 'scene' } as const;
const host = (): HTMLElement => { const el = h('div'); document.body.append(el); return el; };
const pills = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLButtonElement>('button.alius-pill')].map((b) => b.textContent ?? '');
const conds = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('.alius-scard-cond')];
const values = (el: HTMLElement): string[] => [...el.querySelectorAll('.alius-scard-v')].map((v) => v.textContent ?? '');

function taskCard(s: CampaignState, handlers: Partial<Parameters<typeof drawTaskCards>[4]> = {}) {
  const el = host();
  const answer = vi.fn();
  const sign = vi.fn();
  const focusInput = vi.fn();
  drawTaskCards(el, s, reg, () => true, { answer, sign, focusInput, ...handlers }, SCENE);
  return { el, answer, sign, focusInput };
}

describe('her cards in her voice (look: scene)', () => {
  it('a task speaks in her voice: her name in her hand, her words, then when → cost → lapse, each value in her ink', () => {
    const s = state('possessive', { tasks: [task()] });
    book(s, { registries: reg }, { unitId: BEA, kindId: 'train_together', day: 20, slot: 'evening', source: 'roll' });
    const { el } = taskCard(s);
    const card = el.querySelector<HTMLElement>('article.alius-scard[data-scard-kind="task"]')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.alius-scard-who')!.textContent).toBe('Ann');
    expect(card.querySelector('.alius-scard-kind')!.textContent).toBe('task');
    expect(card.querySelector('.alius-scard-words')!.textContent).toBe('Bring me the patrol roster before evening mess.');
    const lines = conds(card);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => values(l)[0]!.toLowerCase())).toEqual(['this evening', 'one slot', 'training together']);
    // the lines are hers (possessive), filled with the engine's words
    const when = voiceLine(reg, 'when', 'possessive', 'pt1', { when: 'this evening' }).map((r) => r.text).join('');
    expect(lines[0]!.textContent).toBe(when);
    expect(card.style.getPropertyValue('--alius-her')).not.toBe('');
    expect(card.style.getPropertyValue('--alius-hand-scale')).not.toBe('');
    expect(card.getAttribute('data-task')).toBe('pt1');
    expect(card.getAttribute('data-analyze')).toBe('glossary:task_card');
    expect(card.getAttribute('data-gist')).toBe('bring the roster · <b>this evening</b>');
  });

  it('no brackets anywhere: every answer is a lower-case pill', () => {
    const s = state('possessive', { tasks: [task()], punishments: [punishment()] });
    const { el } = taskCard(s);
    drawPunishmentCards(el.appendChild(h('div')), s, reg, () => true, { answer: noop, takeInstead: noop, undo: noop }, SCENE);
    expect(el.textContent).not.toMatch(/\[\s*[A-Z]/);
    expect(pills(el)).toEqual(['accept', 'refuse', 'talk it over', 'accept', 'negotiate', 'refuse']);
  });

  it('a cruel holder still names the cost', () => {
    const { el } = taskCard(state('cruel', { tasks: [task()] }));
    const cost = conds(el).find((l) => values(l).includes('one slot'));
    expect(cost).toBeDefined();
    expect(voiceLine(reg, 'cost', 'cruel', 'pt1', { slots: 'one slot' }).map((r) => r.text).join('')).toBe(cost!.textContent);
  });

  it('the sealed envelope keeps its secret: no summary or text, a seal, the weight unless she is cruel or vindictive', () => {
    const sealed = (style: Style) => state(style, { tasks: [task({ sealed: true, acceptForm: 'sealed', text: 'SECRET_TEXT', summary: 'SECRET_SUMMARY', stakes: 'major' })] });
    for (const style of ['possessive', 'cold', 'affectionate'] as const) {
      const { el } = taskCard(sealed(style));
      expect(el.outerHTML).not.toMatch(/SECRET_TEXT|SECRET_SUMMARY/);
      expect(el.querySelector('.alius-scard-seal')).not.toBeNull();
      expect(el.querySelector('[data-scard-kind="sealed"]')!.getAttribute('data-gist')).toBe('✉');
      expect(values(el).map((v) => v.toLowerCase())).toContain('heavy');
      expect(pills(el)).toEqual(['accept', 'refuse']);
    }
    for (const style of ['cruel', 'vindictive'] as const) {
      const { el } = taskCard(sealed(style));
      expect(el.outerHTML).not.toMatch(/SECRET_TEXT|SECRET_SUMMARY/);
      expect(values(el).map((v) => v.toLowerCase())).not.toContain('heavy');
      expect(conds(el)).toHaveLength(0);
    }
  });

  it('readable mode shows the dry lines (each condition has one under it)', () => {
    const { el } = taskCard(state('cold', { tasks: [task()] }));
    const dry = [...el.querySelectorAll('.alius-scard-dry')].map((d) => d.textContent);
    expect(dry).toContain('Due: this evening.');
    expect(dry).toContain("Takes one slot of the commander's time.");
  });

  it('the moment is not hers: the kind only, the prose from her moment lines, the options as pills', () => {
    registerFrameReader(() => 'play');
    const base = withService(world(reg, 'play'));
    setRelation(base, ANN, { stateId: 'confidant' });
    enable(base, 'pet_play', 'restraint');
    const r = run(base, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    const s = r.state;
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'worn', value: 'paw_mitts' }, { at: 1, source: 'engine' });
    fireMoment(s, { registries: reg }, 'third_party', ANN);
    const open = s.scene!.moments!.open!;
    const el = host();
    const onStage = vi.fn();
    renderMomentCard(el, { state: s, registries: reg, chips: 'chips', onStage }, SCENE);
    const card = el.querySelector<HTMLElement>('[data-scard-kind="moment"]')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.alius-scard-who')).toBeNull();
    expect(card.classList.contains('alius-scard-neutral')).toBe(true);
    expect(card.querySelector('.alius-scard-kind')!.textContent).toBe('a moment');
    expect(card.querySelector('.alius-scard-prose')!.textContent).toBe(voiceLine(reg, 'moment', undefined, open.id, {}).map((x) => x.text).join(''));
    const options = [...card.querySelectorAll<HTMLButtonElement>('button.alius-pill[data-action="moment-answer"]')];
    expect(options.length).toBe(open.options.length);
    for (const o of options) expect(o.textContent).toBe(o.textContent!.toLowerCase());
    options[0]!.click();
    expect(onStage).toHaveBeenCalledWith({ type: 'moment/answer', payload: { momentId: open.id, key: open.options[0]!.key } });
  });

  it('the answers are the same actions with the same ids as today; sign is a hold of 1.2 s', () => {
    vi.useFakeTimers();
    const t = taskCard(state('cold', { tasks: [task({ acceptForm: 'button' })] }));
    for (const b of t.el.querySelectorAll<HTMLButtonElement>('button.alius-pill')) b.click();
    expect(t.answer.mock.calls).toEqual([['pt1', 'accept'], ['pt1', 'refuse'], ['pt1', 'talk']]);
    // a signed task, once said: sign is held
    const signed = taskCard(state('cold', { tasks: [task({ acceptForm: 'signed', said: true, stakes: 'severe' })] }));
    const sign = signed.el.querySelector<HTMLButtonElement>('button.alius-pill[data-task-sign]')!;
    expect(sign.textContent).toBe('sign');
    sign.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(1100);
    expect(signed.sign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(signed.sign).toHaveBeenCalledWith('pt1');
    // words: accept only focuses the input
    const words = taskCard(state('cold', { tasks: [task({ acceptForm: 'words', proof: 'witness', audienceIds: [BEA], stakes: 'major' })] }));
    words.el.querySelector<HTMLButtonElement>('[data-task-answer="accept"]')!.click();
    expect(words.focusInput).toHaveBeenCalledTimes(1);
    expect(words.answer).not.toHaveBeenCalled();
    // her discipline, her order about a soldier
    const s = state('cold', { punishments: [punishment(), punishment({ id: 'pp2', forUnitId: BEA, entryId: 'corner_time' })] });
    const el = host();
    const answer = vi.fn();
    const takeInstead = vi.fn();
    drawPunishmentCards(el, s, reg, () => true, { answer, takeInstead, undo: noop }, SCENE);
    expect([...pills(el)].sort()).toEqual(['accept', 'do it', 'negotiate', 'refuse', 'refuse', 'take it instead']);
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-punishment-answer]')) b.click();
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-take-answer]')) b.click();
    expect(answer.mock.calls).toEqual([['pp1', 'accept'], ['pp1', 'negotiate'], ['pp1', 'refuse']]);
    expect(takeInstead.mock.calls).toEqual([['pp2', 'do_it'], ['pp2', 'take_it'], ['pp2', 'refuse']]);
    expect(el.querySelector('[data-scard-kind="order"]')!.getAttribute('data-gist')).toMatch(/^Bea: /);
    // a demonstration: go (in her slot)
    const d = state('cold');
    d.slot = 'evening';
    d.practices!.demonstrations = [{ id: 'pd1', holderId: ANN, tags: [], summary: 'serving', text: 'Pour for me at mess.', audienceIds: [BEA], stage: 'mess_hall', slot: 'evening', day: 20, status: 'offered', stakes: 'minor' } as never];
    const dh = host();
    const dAnswer = vi.fn();
    drawDemonstrationCards(dh, d, reg, () => true, { answer: dAnswer }, SCENE);
    expect(pills(dh)).toEqual(['go', 'refuse']);
    dh.querySelector<HTMLButtonElement>('[data-demonstration-answer="go"]')!.click();
    expect(dAnswer).toHaveBeenCalledWith('pd1', 'go');
    // a claim: yield
    const c = state('cold');
    c.dynamic!.open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'device', day: 20 });
    const ch = host();
    const cAnswer = vi.fn();
    drawClaimCards(ch, c, reg, () => true, cAnswer, SCENE);
    expect(pills(ch)).toEqual(['yield', 'refuse', 'talk it over']);
    ch.querySelector<HTMLButtonElement>('[data-claim-answer="yield"]')!.click();
    expect(cAnswer).toHaveBeenCalledWith('dc1', 'yield');
  });

  it('the PDA thread is unchanged: without a look the task card is today\'s article.alius-voice', () => {
    const { el } = (() => {
      const el2 = host();
      drawTaskCards(el2, state('cold', { tasks: [task()] }), reg, () => true, { answer: noop, sign: noop, focusInput: noop });
      return { el: el2 };
    })();
    const card = el.querySelector<HTMLElement>('article')!;
    expect(card.classList.contains('alius-voice')).toBe(true);
    expect(card.classList.contains('alius-scard')).toBe(false);
    expect(el.querySelector('.alius-voice-from')!.textContent).toBe('Ann');
    expect(el.querySelector('.alius-task-due')!.textContent).toBe('Due: today, evening.');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['[ ACCEPT ]', '[ REFUSE ]', '[ TALK ]']);
    expect(el.querySelector('.alius-pill')).toBeNull();
  });

  it('analyze coverage: a dock with one card of each kind is marked, resolves and is reachable; no hidden value reaches it', () => {
    const s = state('ritual', {
      tasks: [task(), task({ id: 'pt2', sealed: true, acceptForm: 'sealed', stakes: 'major' }), task({ id: 'pt3', acceptForm: 'signed', said: true, handover: 'device', stakes: 'severe' })],
      punishments: [punishment(), punishment({ id: 'pp2', forUnitId: BEA, entryId: 'corner_time' }),
        punishment({ id: 'pp3', status: 'accepted', answeredDay: 20, entryId: 'corner_time', ceremony: { steps: ['fetch_implement', 'name_the_number', 'take_the_posture'], done: ['fetch_implement'] } } as never)],
      demonstrations: [{ id: 'pd1', holderId: ANN, tags: [], summary: 'serving', text: 'Pour for me at mess.', audienceIds: [BEA], narrated: ['x'], stage: 'mess_hall', slot: 'evening', day: 20, status: 'offered', stakes: 'minor' } as never],
    });
    s.dynamic!.open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: 'handover', day: 20, form: 'scene' });
    s.dynamic!.open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'device', day: 20 });
    const root = h('div', { id: 'alius-shell' });
    document.body.append(root);
    const part = (): HTMLElement => root.appendChild(h('div'));
    drawTaskCards(part(), s, reg, () => true, { answer: noop, sign: noop, focusInput: noop }, SCENE);
    drawPunishmentCards(part(), s, reg, () => true, { answer: noop, takeInstead: noop, undo: noop, ceremony: noop }, SCENE);
    drawDemonstrationCards(part(), s, reg, () => true, { answer: noop }, SCENE);
    drawMilestoneCards(part(), s, reg, () => true, noop, SCENE);
    drawClaimCards(part(), s, reg, () => true, noop, SCENE);
    const r = structuredClone(s);
    r.dynamic!.open.returnOffer = { id: 'dr0', unitId: ANN, terms: 'lower_band', day: 20 };
    drawReturnCards(part(), r, reg, () => true, noop, SCENE);
    const kinds = [...root.querySelectorAll('[data-scard-kind]')].map((c) => c.getAttribute('data-scard-kind'));
    expect(kinds).toEqual(expect.arrayContaining(['task', 'sealed', 'punishment', 'order', 'ceremony', 'demonstration', 'step', 'claim', 'return']));
    expect(markedWithout(root)).toEqual([]);
    expect(unresolved(root, env(s))).toEqual([]);
    expect(unreachable(root)).toEqual([]);
    for (const b of root.querySelectorAll('button.alius-pill')) expect(b.hasAttribute('data-analyze'), b.outerHTML.slice(0, 120)).toBe(true);
    // the hidden fixture's practices, drawn the scene's way, show none of its sentinels
    const f = hiddenFixture(reg);
    const hs: CampaignState = structuredClone(f.state);
    delete hs.relations[f.unitId].dynamic!.aftermath;
    const hidden = host();
    const pick = (c: { unitId: string }) => c.unitId === f.unitId;
    drawTaskCards(hidden.appendChild(h('div')), hs, reg, pick, { answer: noop, sign: noop, focusInput: noop }, SCENE);
    drawPunishmentCards(hidden.appendChild(h('div')), hs, reg, pick, { answer: noop, takeInstead: noop, undo: noop, ceremony: noop }, SCENE);
    expect(hidden.querySelectorAll('.alius-scard').length).toBeGreaterThan(1);
    for (const t of f.sentinels.texts) expect(hidden.outerHTML, t).not.toContain(t);
    expect(hidden.textContent).not.toMatch(/\b(26|34)\b/);
  });
});
