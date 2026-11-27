// @vitest-environment jsdom
/**
 * P16b Task 26 (gate G3): the craft's cards in the scene (docs/prototypes/cards.html "P16b additions"): the drill, the exam, the sentence, her note and the lesson, in her voice
 * (`cardVoice`, card-voice.md section 18), and `[ANTICIPATE]` in the chip row. Hidden values (the exam's pass mark and results, the echo before it has acted, a care not yet shown, the
 * lesson before her reply) never reach a card; every card, answer and chip carries `data-analyze`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { resetKnowledgeRules } from '../../../src/analysis/knowledge';
import type { Registries } from '../../../src/content/types';
import { blankDynamic } from '../../../src/engine/dynamic/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { anticipateAnswer, craftCardsOf, craftGist, drawAnticipateChips, drawCraftCards, LESSON_MS, resetCraftCards, type CraftCardHandlers } from '../../../src/ui/craft/craftCards';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { plainDraft } from '../../../src/content/draft';
import { echoOf } from '../../../src/engine/craft/programmes/vindictive';
import { hiddenFixture } from '../../fixtures/analyze/hidden';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from '../../engine/practice/world';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/craft';

const shown = vi.hoisted(() => ({ on: false }));
vi.mock('../../../src/engine/craft/anticipate', async (orig) => ({ ...(await orig<typeof import('../../../src/engine/craft/anticipate')>()), anticipateShown: () => shown.on }));

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
beforeEach(() => { vi.useFakeTimers(); shown.on = false; });
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  resetCraftCards();
  resetKnowledgeRules();
  registerCoreProviders();
});

const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

/** Ann holds (cold unless `style`), a scene with her (and Bea when asked) is open. */
function scene(o: { style?: string; both?: boolean } = {}): CampaignState {
  const w = world(reg, 'play');
  if (o.style !== undefined) unitOf(w, ANN).bond!.practice!.style = { primary: o.style as never };
  const r = run(w, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: o.both ? [ANN, BEA] : [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const handlers = (): CraftCardHandlers & { begin: ReturnType<typeof vi.fn>; askForTime: ReturnType<typeof vi.fn>; redraw: ReturnType<typeof vi.fn> } =>
  ({ begin: vi.fn(), askForTime: vi.fn(), anticipate: vi.fn(), redraw: vi.fn() });
const draw = (s: CampaignState, hs = handlers(), present = s.scene!.participants) => {
  const host = h('div');
  document.body.append(host);
  const go = (): void => drawCraftCards(host, s, reg, present, { ...hs, redraw: () => { hs.redraw(); go(); } }, () => Date.now());
  go();
  return { host, hs, go, q: (sel: string) => host.querySelector<HTMLElement>(sel), qa: (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)] };
};
const click = (el: HTMLElement | null): void => { expect(el).not.toBeNull(); el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const text = (el: HTMLElement | null): string => el?.textContent ?? '';

describe('the drill', () => {
  it('a drill with her: her words (drillWhat, drillCost), begin and not now; begin tells the woman whose drill waits', () => {
    const s = scene({ style: 'drill' });
    s.relations[ANN]!.craft = { drillPending: { key: 'endurance:weight', mult: 1.5, day: s.day } };
    const t = draw(s);
    const card = t.q('[data-scard-kind="drill"]')!;
    expect(card).not.toBeNull();
    expect(text(card)).toContain('Weight drill');
    expect(text(card)).toMatch(/one slot/i);
    expect(card.getAttribute('data-gist')).toBe('weight drill');
    expect(text(t.q('.alius-scard-who'))).toBe('Ann');
    click(t.q('[data-craft-answer="begin"]'));
    expect(t.hs.begin).toHaveBeenCalledWith(ANN);
    click(t.q('[data-craft-answer="not_now"]'));
    expect(t.hs.redraw).toHaveBeenCalled();
    expect(t.q('[data-scard-kind="drill"]')).toBeNull();
  });

  it('a drill with another woman is said by a holder (her voice only: drillOther names the other), the gist says with whom, and begin goes to the other', () => {
    const s = scene({ both: true });
    s.relations[BEA]!.craft = { drillPending: { key: 'endurance:breath', mult: 1.2, day: s.day } };
    const t = draw(s);
    const card = t.q('[data-scard-kind="drill"]')!;
    expect(text(card)).toContain('Breath drill');
    expect(text(card)).toContain('Bea');
    expect(card.getAttribute('data-gist')).toBe('breath drill · with Bea');
    expect(text(t.q('.alius-scard-who'))).toBe('Ann');
    click(t.q('[data-craft-answer="begin"]'));
    expect(t.hs.begin).toHaveBeenCalledWith(BEA);
  });

  it('no card while a hold runs, once the run began, or for a drill of another day', () => {
    const s = scene({ style: 'drill' });
    s.relations[ANN]!.craft = { drillPending: { key: 'endurance:weight', mult: 1.5, day: s.day - 1 } };
    expect(craftCardsOf(s, reg, [ANN])).toEqual([]);
    s.relations[ANN]!.craft = { drillPending: { key: 'endurance:weight', mult: 1.5, day: s.day, runId: 'p1' } };
    expect(craftCardsOf(s, reg, [ANN])).toEqual([]);
  });
});

describe('the exam', () => {
  const exam = (): CampaignState => {
    const s = scene({ style: 'drill' });
    s.relations[ANN]!.craft = {
      drill: { norms: { 'endurance:weight': 1200, 'endurance:breath': 40, posture: 900 }, examDay: s.day, passes: 2, exam: { day: s.day, keys: ['endurance:weight'], results: { 'endurance:weight': 1717 } } },
      drillPending: { key: 'endurance:weight', mult: 1, day: s.day, exam: true },
    };
    return s;
  };

  it('her words, when, "Show me:" and the norms in fiction time in her hand, what failing costs; begin and ask for time (which keeps the card)', () => {
    const s = exam();
    const t = draw(s);
    const card = t.q('[data-scard-kind="exam"]')!;
    expect(text(card)).toContain('Exam: today');
    expect(text(card)).toContain('Show me:');
    expect(t.qa('[data-craft-norm]').map(text)).toEqual(['Under my weight: 20 minutes', 'Without air: 40 seconds', 'Held for me: 15 minutes']);
    expect(text(card)).toMatch(/free slots/);
    expect(card.getAttribute('data-gist')).toBe('3 norms · <b>today</b>');
    click(t.q('[data-craft-focus]'));
    expect(t.hs.askForTime).toHaveBeenCalledTimes(1);
    expect(t.q('[data-scard-kind="exam"]')).not.toBeNull();
    click(t.q('[data-craft-answer="begin"]'));
    expect(t.hs.begin).toHaveBeenCalledWith(ANN);
  });

  it('the pass mark and the exam\'s results are never on a card', () => {
    const t = draw(exam());
    const all = t.host.innerHTML;
    expect(all).not.toMatch(/1717|passes|pass mark/);
  });
});

describe('the sentence', () => {
  const sentenced = (landed: boolean): CampaignState => {
    const s = scene({ style: 'vindictive' });
    unitOf(s, ANN).bond!.practice!.style = { primary: 'vindictive' } as never;
    s.relations[ANN]!.craft = { sentence: { crimeId: 'smuggling', start: s.day, until: s.day + 14, extended: 6, ...(landed ? { landed: true as const } : {}) } };
    return s;
  };

  it('the term large in her hand, why, what a slip adds; the echo only once it has acted; understood settles it', () => {
    const before = draw(sentenced(false));
    const card = before.q('[data-scard-kind="sentence"]')!;
    expect(text(before.q('[data-craft-term]'))).toMatch(/14 days/);
    expect(text(card)).toContain('data smuggling');
    expect(text(card)).toContain('three days');
    expect(text(card)).not.toContain('through my hands');
    expect(card.getAttribute('data-gist')).toBe('<b>14 days</b> left');
    document.body.innerHTML = '';
    const after = draw(sentenced(true));
    expect(text(after.q('[data-scard-kind="sentence"]'))).toContain('Every message, through my hands.');
    click(after.q('[data-craft-answer="understood"]'));
    expect(after.q('[data-scard-kind="sentence"]')).toBeNull();
  });

  it('what a slip added is never a number on the card (the term is the days left, the add a word)', () => {
    const t = draw(sentenced(true));
    expect(t.host.innerHTML).not.toMatch(/\bextended\b|\b20 days\b/);
  });
});

describe('her note', () => {
  const noted = (style: string, voiced = true): CampaignState => {
    const s = scene({ style });
    s.relations[ANN]!.craft = { cares: [{ day: s.day, careId: 'polishing_her_boots', noticed: true, ...(voiced ? { voiced: true as const, scene: s.scene!.id } : {}) }] };
    return s;
  };

  it('a paper card for a holder who notes what she saw: her words about the care, keep it settles it', () => {
    const t = draw(noted('ritual'));
    const card = t.q('[data-scard-kind="note"]')!;
    expect(card.classList.contains('alius-scard-paper')).toBe(true);
    expect(text(card)).toContain('It is noted.');
    expect(card.getAttribute('data-gist')).toBe(card.getAttribute('data-gist')!.toLowerCase());
    click(t.q('[data-craft-answer="keep"]'));
    expect(t.q('[data-scard-kind="note"]')).toBeNull();
  });

  it('no note for a holder with no way of her own, for a care that has not landed, or for another scene', () => {
    expect(craftCardsOf(noted('cold'), reg, [ANN])).toEqual([]);
    expect(craftCardsOf(noted('ritual', false), reg, [ANN])).toEqual([]);
    const s = noted('ritual');
    s.relations[ANN]!.craft!.cares![0]!.scene = 'another';
    expect(craftCardsOf(s, reg, [ANN])).toEqual([]);
  });
});

describe('the lesson', () => {
  const lesson = (passed: boolean): CampaignState => {
    const s = scene({ style: 'drill' });
    s.scene!.exchanges = 3;
    s.relations[ANN]!.craft = { lesson: { point: 'hands', words: 'hands', scene: s.scene!.id, exchange: passed ? 2 : 3 } };
    return s;
  };

  it('hidden until her reply has passed; then her word for the point, no answers, gone by itself after 7 s', () => {
    expect(craftCardsOf(lesson(false), reg, [ANN])).toEqual([]);
    const s = lesson(true);
    const t = draw(s);
    const card = t.q('[data-scard-kind="lesson"]')!;
    expect(text(card)).toMatch(/Hands/);
    expect(card.getAttribute('data-gist')).toBe('hands');
    expect(t.qa('.alius-pill')).toHaveLength(0);
    vi.advanceTimersByTime(LESSON_MS + 100);
    expect(t.q('[data-scard-kind="lesson"]')).toBeNull();
    expect(t.hs.redraw).toHaveBeenCalled();
  });

  it('a redraw resumes the fade where it was, it does not start over', () => {
    const t = draw(lesson(true));
    vi.advanceTimersByTime(3000);
    t.go();
    expect(t.q('[data-scard-kind="lesson"]')!.style.animationDelay).toBe('-3000ms');
  });
});

describe('what a card never holds, and its marks', () => {
  it('every card, pill, norm and chip carries data-analyze, is reachable and resolves in the panel', () => {
    const s = scene({ style: 'regal', both: true });
    s.relations[ANN]!.craft = {
      drill: { norms: { 'endurance:weight': 1200 }, examDay: s.day, passes: 1 }, drillPending: { key: 'endurance:weight', mult: 1, day: s.day, exam: true },
      sentence: { crimeId: 'smuggling', start: s.day, until: s.day + 9, extended: 0, landed: true },
      cares: [{ day: s.day, careId: 'polishing_her_boots', noticed: true, voiced: true, scene: s.scene!.id }],
      lesson: { point: 'hands', words: 'hands', scene: s.scene!.id, exchange: 0 },
    };
    s.scene!.exchanges = 2;
    s.relations[BEA]!.craft = { drillPending: { key: 'endurance:breath', mult: 1.2, day: s.day } };
    const t = draw(s);
    expect(t.qa('.alius-craft-card')).toHaveLength(5);
    expect(markedWithout(t.host)).toEqual([]);
    expect(unreachable(t.host)).toEqual([]);
    expect(unresolved(t.host, env(s))).toEqual([]);
  });

  it('no pronoun for the commander and no hidden sentinel on any card', () => {
    const { sentinels } = hiddenFixture(reg);
    const s = scene({ style: 'vindictive' });
    // the echo has not acted yet (no `landed`): its line is a sentinel; the crime is the commander's own and the card names it
    s.relations[ANN]!.craft = { sentence: { crimeId: 'strain_trade', start: s.day, until: s.day + 9, extended: 6 }, lesson: { point: 'SENTINEL-LESSON-POINT', words: 'SENTINEL-LESSON-WORDS', scene: s.scene!.id, exchange: 3 } };
    s.scene!.exchanges = 3; // her reply has not passed: the word is hidden
    const t = draw(s);
    const echo = plainDraft(String(echoOf(reg, 'strain_trade')!.line));
    expect(sentinels.texts).toContain(echo);
    for (const x of sentinels.texts) expect(t.host.innerHTML).not.toContain(x);
    expect(t.host.textContent).not.toMatch(/\b(he|him|his|himself)\b/i);
    // the control: once it has acted the same card shows the echo, so the check above can fail
    s.relations[ANN]!.craft!.sentence!.landed = true;
    expect(draw(s).host.innerHTML).toContain(echo);
  });
});

describe('[ANTICIPATE] in the chip row', () => {
  it('a round dashed chip, `anticipate her`, only while the engine shows it; a click hands her over; her answer is her voice by style', () => {
    const s = scene({ style: 'ritual' });
    const host = h('div');
    document.body.append(host);
    const click1 = vi.fn();
    drawAnticipateChips(host, s, reg, [ANN], click1);
    expect(host.children).toHaveLength(0);
    shown.on = true;
    drawAnticipateChips(host, s, reg, [ANN], click1);
    const chip = host.querySelector<HTMLElement>('[data-craft-anticipate]')!;
    expect(chip.textContent).toBe('anticipate her');
    expect(chip.classList.contains('alius-chip-anticipate')).toBe(true);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    chip.click();
    expect(click1).toHaveBeenCalledWith(ANN);
    expect(anticipateAnswer(reg, s, ANN)).toBe('Unasked. Noted.');
    expect(anticipateAnswer(reg, scene({ style: 'clinical' }), ANN)).toBe('Hm. Thank you.'); // a style with no line of its own reads neutral's
  });

  it('with more than one woman the chip names her', () => {
    const s = scene({ both: true });
    shown.on = true;
    const host = h('div');
    drawAnticipateChips(host, s, reg, [ANN, BEA], vi.fn());
    expect([...host.querySelectorAll('[data-craft-anticipate]')].map((c) => c.textContent)).toEqual(['anticipate Ann', 'anticipate Bea']);
  });
});

describe('the gist', () => {
  it('is the prototype\'s: the drill (with whom), the exam (norms and when), the sentence, the note, the lesson', () => {
    const c = (o: object) => craftGist({ kind: 'drill', key: 'k', unitId: ANN, ...o } as never);
    expect(c({ drill: 'Weight drill' })).toBe('weight drill');
    expect(c({ drill: 'Weight drill', other: 'Bea' })).toBe('weight drill · with Bea');
    expect(c({ kind: 'exam', norms: [['a', 'b'], ['c', 'd']], when: 'tomorrow' })).toBe('2 norms · <b>tomorrow</b>');
    expect(c({ kind: 'sentence', days: 19 })).toBe('<b>19 days</b> left');
    expect(c({ kind: 'note', what: 'The boots' })).toBe('the boots');
    expect(c({ kind: 'lesson', point: 'Hands' })).toBe('hands');
  });
});
