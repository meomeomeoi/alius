import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import { ripeSources, resetRipeSources } from '../../../src/engine/blocking/vocabulary';
import { habitEffect } from '../../../src/engine/development/habits';
import { countDeed } from '../../../src/engine/discipline/deeds';
import { reputationDayStep } from '../../../src/engine/discipline/reputation';
import type { EngineEvent } from '../../../src/engine/dispatch';
import { forgetDynamic } from '../../../src/engine/dynamic/forget';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { slipSeen } from '../../../src/engine/dynamic/knowledge';
import { nicknameTone, regardFall, regardOf } from '../../../src/engine/dynamic/regard';
import {
  answerQuestion, checkDisappointment, disappointedSince, noteQuestionAsked, questionEvents, questionRipe, ripeQuestions, squadRegardAverage,
} from '../../../src/engine/dynamic/shame';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { liveSources } from '../../../src/engine/moments/live';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => installDynamicHooks()); // a test that reset the ripe readers gives them back
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle, witness: 'dislikes' | 'indifferent' | 'drawn' = 'indifferent') => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds at `frame`; Bea and Cat hold nothing (Bea's Trust is 70, Cat's 70, both start at Regard 62); a scene with `present` is open when it is given. */
function world(over: { frame?: Frame; present?: string[]; beaStyle?: ProfileStyle } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = bond('cold');
  if (over.beaStyle !== undefined) unitOf(s, BEA).bond = bond(over.beaStyle);
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'play', hold: 50 };
  for (const id of [ANN, BEA, CAT]) { s.relations[id].trust = 70; s.relations[id].regard = 62; }
  if (over.present !== undefined) {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: over.present, origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  }
  return s;
}
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const fall = (s: CampaignState, id: string, n: number) => regardFall(s, reg, id, n, { witness: false });

describe('disappointment', () => {
  it('a woman who holds nothing, with Trust 60 or more, whose Regard falls a band: disappointed, a hidden fact, her line', () => {
    const s = world({ present: [ANN, BEA] });
    const events = fall(s, BEA, 3); // 62 - 4.5: respect -> neutral
    expect(ofType(events, 'disappointed')).toEqual([{ type: 'disappointed', unitId: BEA }]);
    expect(disappointedSince(s, BEA)).toBe(s.day);
    rememberEvents(s, events, reg);
    const fact = s.memory.facts.find((f) => f.tags.includes('disappointed'));
    expect(fact).toMatchObject({ about: [BEA], knownBy: [BEA], importance: 3, hiddenFromCommander: true });
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
    const line = dynamicDirectives(s, reg, [ANN, BEA]).find((d) => d.id === `dynamic:disappointed:${BEA}`);
    expect(line?.text).toContain('addresses Ann');
    expect(line?.text).toContain('does not lecture');
    expect(line?.text).not.toMatch(/\b(he|him|his)\b|\d/i);
  });

  it('her line needs a holder in the room, and it goes with the days', () => {
    const s = world({ present: [BEA, CAT] });
    fall(s, BEA, 3);
    expect(dynamicDirectives(s, reg, [BEA, CAT]).some((d) => d.id.startsWith('dynamic:disappointed:'))).toBe(false);
    expect(dynamicDirectives(s, reg, [ANN, BEA]).some((d) => d.id === `dynamic:disappointed:${BEA}`)).toBe(true);
    s.day += TUNING.regard.disappointment.days;
    expect(dynamicDirectives(s, reg, [ANN, BEA]).some((d) => d.id === `dynamic:disappointed:${BEA}`)).toBe(true);
    s.day += 1;
    expect(dynamicDirectives(s, reg, [ANN, BEA]).some((d) => d.id === `dynamic:disappointed:${BEA}`)).toBe(false);
  });

  it('her habits tagged respect lapse for 14 days (read by tag; the habit is not lost)', () => {
    const habit = { id: 'asks_advice', counter: { kind: 'activity', id: 'rest' }, threshold: 3, fallback: 'AUTHOR TO WRITE: {name} asks.', effect: { type: 'unit_stress', amount: -3, activityId: 'rest' }, tags: ['respect'], description: 'x' };
    const other = { ...habit, id: 'rests_well', tags: undefined };
    const r2 = { ...reg, habits: new Map<string, unknown>([['asks_advice', habit], ['rests_well', other]]) } as unknown as Registries;
    const s = world();
    s.settings.characterDevelopment = 'normal';
    unitOf(s, BEA).development = { drift: {}, acc: {}, anchors: [], counters: {}, pending: [], facts: [], moments: [], habits: ['asks_advice', 'rests_well'], nextId: 0 };
    expect(habitEffect(s, r2, BEA, 'rest')).toHaveLength(2);
    regardFall(s, r2, BEA, 3, { witness: false });
    expect(habitEffect(s, r2, BEA, 'rest')).toEqual([{ type: 'unit_stress', amount: -3 }]); // only the one that is not tagged respect still works
    s.day += 13;
    expect(habitEffect(s, r2, BEA, 'rest')).toHaveLength(1);
    s.day += 1;
    expect(habitEffect(s, r2, BEA, 'rest')).toHaveLength(2);
    expect(unitOf(s, BEA).development!.habits).toEqual(['asks_advice', 'rests_well']);
  });

  it('not for a holder, nor with Trust under 60, nor for a fall inside a band, and not while off', () => {
    const s = world();
    expect(types(fall(s, ANN, 4))).not.toContain('disappointed'); // she holds
    s.relations[BEA].trust = 59;
    expect(types(fall(s, BEA, 3))).not.toContain('disappointed');
    const small = world();
    expect(types(fall(small, CAT, 1))).not.toContain('disappointed'); // 62 -> 60.5, same band
    const off = world();
    off.dynamic = undefined;
    expect(checkDisappointment(off, ctxOf(off, reg), BEA, 62, 40)).toEqual([]);
  });

  it('one for each band she falls across, not for each fall inside one; the span starts again after it', () => {
    const s = world();
    expect(types(fall(s, BEA, 1))).not.toContain('disappointed'); // 62 -> 60.5: the same band
    expect(types(fall(s, BEA, 1))).toContain('disappointed'); // 59.0: respect -> neutral
    expect(types(fall(s, BEA, 1))).not.toContain('disappointed'); // 57.5: still neutral
    s.relations[BEA].regard = 41;
    expect(types(fall(s, BEA, 2))).toContain('disappointed'); // neutral -> low, a few days on
    expect(s.dynamic!.noted!.regardFell![BEA]).toBe(s.day);
    // a long way down in one go is one disappointment
    const deep = world();
    expect(ofType(fall(deep, BEA, 5), 'disappointed')).toHaveLength(1); // 62 -> 54.5 and no further
  });
});

describe('the question', () => {
  const asked = (s: CampaignState, id: string) => noteQuestionAsked(s, ctxOf(s, reg), [{ type: 'moment_fired', momentId: 'm1', sourceId: 'her_question', unitId: id }]);

  it('is ripe for a woman whose Regard is falling but above none, and for one who knows of a holder and dislikes it', () => {
    const s = world({ beaStyle: 'cold' });
    expect(questionRipe(s, reg, BEA)).toBe(false); // nothing has happened
    fall(s, BEA, 1);
    expect(questionRipe(s, reg, BEA)).toBe(true);
    expect(ripeQuestions(s, reg, BEA)).toEqual(['her_question']);
    s.relations[BEA].regard = 15; // none
    expect(questionRipe(s, reg, BEA)).toBe(false);
    const knows = world();
    unitOf(knows, CAT).bond = bond('cold', 'dislikes');
    knows.dynamic!.knowledge[CAT] = { [ANN]: { suspicion: 100, level: 'knows_dynamic' } };
    expect(questionRipe(knows, reg, CAT)).toBe(true);
    unitOf(knows, CAT).bond = bond('cold', 'drawn');
    expect(questionRipe(knows, reg, CAT)).toBe(false);
  });

  it('is never ripe for a holder, and nothing is ripe while off', () => {
    const s = world();
    fall(s, ANN, 2);
    expect(questionRipe(s, reg, ANN)).toBe(false);
    const off = world();
    fall(off, BEA, 1);
    off.dynamic = undefined;
    expect(questionRipe(off, reg, BEA)).toBe(false);
    expect(questionEvents(off, ctxOf(off, reg), [{ type: 'moment_fired', sourceId: 'her_question', unitId: BEA }])).toEqual([]);
    expect(JSON.stringify(off)).not.toContain('"question"');
  });

  it('14 days per woman and one a week overall', () => {
    const s = world();
    unitOf(s, CAT).bond = bond('cold', 'dislikes');
    s.dynamic!.knowledge[CAT] = { [ANN]: { suspicion: 100, level: 'knows_dynamic' } };
    fall(s, BEA, 1);
    expect(types(asked(s, BEA))).toEqual(['regard_question_asked']);
    expect(s.dynamic!.noted!.question).toEqual({ day: s.day, by: { [BEA]: s.day } });
    expect(questionRipe(s, reg, BEA)).toBe(false);
    expect(questionRipe(s, reg, CAT)).toBe(false); // one a week overall
    s.day += 6;
    expect(questionRipe(s, reg, CAT)).toBe(false);
    s.day += 1;
    expect(questionRipe(s, reg, CAT)).toBe(true);
    fall(s, BEA, 1);
    expect(questionRipe(s, reg, BEA)).toBe(false); // 7 days after her own, 14 are needed
    s.day += 7;
    fall(s, BEA, 1);
    expect(questionRipe(s, reg, BEA)).toBe(true);
  });

  it('is called ripe to the moments: a live source for her, and for nobody else', () => {
    const s = world({ present: [ANN, BEA], beaStyle: 'cold' });
    const live = (id: string) => liveSources(s, reg).some((x) => x.sourceId === 'her_question' && x.unitId === id);
    expect(live(BEA)).toBe(false);
    fall(s, BEA, 1);
    expect(live(BEA)).toBe(true);
    expect(live(ANN)).toBe(false);
    asked(s, BEA);
    expect(live(BEA)).toBe(false); // the cooldown
  });

  it('clinical values the honest answer (+2), affectionate the gentle one (+2), the others leave it, and no answer is scored', () => {
    for (const [style, key, rises] of [['clinical', '0', true], ['clinical', '1', false], ['clinical', '2', false], ['affectionate', '1', true], ['affectionate', '0', false], ['cold', '0', false], ['cold', '1', false]] as const) {
      const s = world({ beaStyle: style });
      const before = regardOf(s, reg, BEA);
      const events = answerQuestion(s, ctxOf(s, reg), BEA, key);
      expect(regardOf(s, reg, BEA) - before, `${style} ${key}`).toBe(rises ? TUNING.regard.question.gain : 0);
      expect(types(events), `${style} ${key}`).toEqual(rises ? ['regard_changed'] : []);
    }
    const s = world({ beaStyle: 'clinical' });
    const events = questionEvents(s, ctxOf(s, reg), [{ type: 'moment_answered', sourceId: 'her_question', unitId: BEA, key: '0' }, { type: 'moment_answered', sourceId: 'own_slip', unitId: BEA, key: '0' }]);
    expect(types(events)).toEqual(['regard_changed']); // only the question's own answer counts
  });

  it('ripeSources is unchanged with no registered source (and adds nothing a reader does not call ripe)', () => {
    const s = world({ present: [ANN, BEA] });
    resetRipeSources();
    const base = ripeSources(s, reg).map((e) => e.id);
    expect(base.length).toBeGreaterThan(0);
    expect(base).toEqual(ripeSources(s, reg).map((e) => e.id));
    installDynamicHooks();
    expect(ripeSources(s, reg).map((e) => e.id)).toEqual(base); // her_question is an extracted source already
    // a reader may name a source of its own for someone in the scene; it joins in registry order
    const quiet = [...reg.momentSources.values()].find((e) => !(Array.isArray(e.live) && (e.live as string[]).includes('extracted')))!;
    resetRipeSources();
    expect(ripeSources(s, reg).map((e) => e.id)).not.toContain(quiet.id);
  });
});

describe('the nickname', () => {
  const setAll = (s: CampaignState, n: number) => { for (const id of [ANN, BEA, CAT]) s.relations[id].regard = n; };
  const day = (s: CampaignState) => reputationDayStep(s, { registries: reg, rng: new Rng(s.rng) });
  const deeds = (s: CampaignState) => { countDeed(s, 'protocol_public', 2); countDeed(s, 'knelt_at_door', 1); return s; };

  it("the tone follows the squad's average Regard: 60 or more respectful, 30 to 59 pitying, under 30 mocking", () => {
    for (const [n, tone, id] of [[75, 'respectful', 'kept_standing'], [60, 'respectful', 'kept_standing'], [59, 'pitying', 'poor_thing'], [30, 'pitying', 'poor_thing'], [29, 'mocking', 'lapdog'], [5, 'mocking', 'lapdog']] as const) {
      const s = deeds(world());
      setAll(s, n);
      expect(squadRegardAverage(s, reg)).toBe(n);
      expect(nicknameTone(s, reg)).toBe(tone);
      expect(ofType(day(s), 'nickname_pending'), String(n)).toEqual([{ type: 'nickname_pending', id }]);
    }
  });

  it('nothing of the dynamic is queued below its minimum, nor while off; a toneless nickname is unaffected', () => {
    const s = world();
    countDeed(s, 'protocol_public', 2);
    expect(ofType(day(s), 'nickname_pending')).toEqual([]);
    const off = deeds(world());
    off.dynamic = undefined;
    expect(ofType(day(off), 'nickname_pending')).toEqual([]);
    expect(nicknameTone(off, reg)).toBeNull();
    const force = world();
    countDeed(force, 'leash_compel', 4);
    expect(ofType(day(force), 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'leash_holder' }]);
  });

  it('a pending nickname whose tone no longer fits is dropped from the queue', () => {
    const s = deeds(world());
    setAll(s, 70);
    day(s);
    expect(s.commander.reputation?.pending?.id).toBe('kept_standing');
    setAll(s, 10);
    const events = day(s);
    expect(ofType(events, 'nickname_pending')).toEqual([{ type: 'nickname_pending', id: 'lapdog' }]);
  });

  it('a protocol slip before others is a public one (a deed) and costs each witness a little Regard; alone it is neither', () => {
    const s = world({ present: [ANN, BEA, CAT] });
    slipSeen(s, ctxOf(s, reg), ANN);
    expect(s.commander.deeds?.protocol_public).toBe(1);
    expect(regardOf(s, reg, BEA)).toBeCloseTo(62 - TUNING.regard.acts.protocol * TUNING.regard.fall * TUNING.regard.witness, 4); // factor 1, speed normal
    expect(regardOf(s, reg, ANN)).toBe(62); // the one who holds is not a witness
    const alone = world({ present: [ANN] });
    slipSeen(alone, ctxOf(alone, reg), ANN);
    expect(alone.commander.deeds).toBeUndefined();
  });
});

describe('forgetting her', () => {
  it('drops what Regard kept of a woman who left', () => {
    const s = world();
    fall(s, BEA, 3);
    asked(s, BEA);
    forgetDynamic(s, BEA);
    expect(s.dynamic!.noted?.regardMark?.[BEA]).toBeUndefined();
    expect(s.dynamic!.noted?.regardFell?.[BEA]).toBeUndefined();
    expect(s.dynamic!.noted?.disappointed?.[BEA]).toBeUndefined();
    expect(s.dynamic!.noted?.question?.by[BEA]).toBeUndefined();
  });
  function asked(st: CampaignState, id: string) { return noteQuestionAsked(st, ctxOf(st, reg), [{ type: 'moment_fired', sourceId: 'her_question', unitId: id }]); }
});

describe('no pronoun, no number', () => {
  it('the disappointed line and the three nicknames carry no pronoun for the commander', () => {
    const texts = [...reg.reputations.values()].filter((e) => e.tone !== undefined).flatMap((e) => [String(e.name), String(e.description), String((e.effects as { directive?: string }).directive ?? '')]);
    expect(texts).toHaveLength(9);
    expect(texts.filter((t) => /\b(he|him|his|himself)\b/i.test(t))).toEqual([]);
    expect(dynamicOf(world(), ANN)).toBeDefined();
  });
});
