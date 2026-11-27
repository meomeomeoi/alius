import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/development';
import { axisForbidden, axisKind } from '../../src/engine/development/axes';
import { mannerProposals } from '../../src/engine/development/mannerDrift';
import { momentDirective, stampMoments, wentUp } from '../../src/engine/development/moments';
import { applyReview, eligibleAxes, fallbackReview, unitDue, undoReview, validateReview, type ReviewValue } from '../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../src/engine/development/state';
import { drawnFavour, notePractised } from '../../src/engine/dynamic/drawn';
import { mannerDayStep } from '../../src/engine/dynamic/mannerDay';
import { feedForms, feedYield, mannerFeedLanded, notePlaySince } from '../../src/engine/dynamic/mannerFeed';
import { regardBandRank, regardOf } from '../../src/engine/dynamic/regard';
import { newLife } from '../../src/engine/life/state';
import { mannerOf } from '../../src/engine/dynamic/manner';
import { refusalCost } from '../../src/engine/dynamic/milestones';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { practiceSample } from '../../src/engine/practice/sample';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const unitOf = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const dynOf = (s: CampaignState, id = ANN) => s.relations[id].dynamic!;
const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const STEP = TUNING.development.stepThreshold;
const DAYS = TUNING.manner.drift.days;

/** Ann holds in a dynamic that has run for `since` days at `play`, with a manner at 0 (or as given); development on. */
function world(over: { manner?: Partial<typeof ZERO>; drawnBy?: Array<'pain' | 'power' | 'reaction' | 'discipline' | 'discovery'>; style?: string; since?: number; day?: number } = {}): CampaignState {
  const s = campaign(reg, 3);
  s.day = over.day ?? 100;
  s.settings.characterDevelopment = 'normal';
  for (const id of [ANN, BEA]) setRelation(s, id, { stateId: 'comrade' });
  unitOf(s).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: (over.style ?? 'affectionate') as 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      manner: { ...ZERO, ...over.manner }, drawnBy: over.drawnBy ?? ['reaction'],
    },
  };
  unitOf(s).values.mercy = 0;
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day - (over.since ?? 60)), frame: 'play', hold: 30, playSince: s.day - (over.since ?? 60) };
  return s;
}
const acc = (s: CampaignState, key: string): number | undefined => developmentOf(unitOf(s)).acc[key];
const setAcc = (s: CampaignState, a: Record<string, number>): void => { ensureDevelopment(unitOf(s)).acc = { ...a }; };
const names = (s: CampaignState): string[] => mannerProposals(s, reg, unitOf(s)).map((p) => p.axis);
const shift = (axis: string, direction: 'up' | 'down' = 'up', size: 'nudge' | 'step' = 'step'): ReviewValue['shifts'][number] => ({ axis, direction, size, reason: 'because' });

describe('the manner axis kind', () => {
  it('manner keys are an axis kind, worded by their rows, and the drawn_by kinds by one', () => {
    expect(axisKind('manner:intensity')).toBe('manner');
    expect(reg.developmentAxes.get('manner:warmth')?.kind).toBe('manner');
    for (const k of ['intensity', 'warmth', 'order', 'voice', 'tempo', 'curiosity', 'drawn_by', 'turn']) expect(reg.developmentAxes.has(`manner:${k}`), k).toBe(true);
    expect(axisForbidden(world(), reg, unitOf(world()), 'manner:drawn_by.pain')).toBeNull();
    expect(axisForbidden(world(), reg, unitOf(world()), 'manner:bogus')).toMatch(/not/);
  });
});

describe('the pushes (spec §7)', () => {
  it('accumulate only for a holder with a manner, with development on, and a dynamic', () => {
    const s = world();
    feedYield(s, ANN);
    expect(acc(s, 'manner:intensity')).toBe(0.5);
    expect(acc(s, 'manner:warmth')).toBe(-0.4);
    const none = world();
    delete unitOf(none).bond!.practice!.manner;
    feedYield(none, ANN);
    expect(unitOf(none).development).toBeUndefined();
    const off = world();
    delete off.settings.characterDevelopment;
    feedYield(off, ANN);
    expect(unitOf(off).development).toBeUndefined();
    const noDyn = world();
    delete noDyn.relations[ANN].dynamic;
    feedYield(noDyn, ANN);
    expect(unitOf(noDyn).development).toBeUndefined();
    const slow = world();
    slow.settings.characterDevelopment = 'slow';
    feedYield(slow, ANN);
    expect(acc(slow, 'manner:intensity')).toBe(0.25);
  });

  it('mercy at the block keeps the warmth push from yielding', () => {
    const s = world();
    unitOf(s).values.mercy = TUNING.manner.push.mercyBlock as 2;
    feedYield(s, ANN);
    expect(acc(s, 'manner:intensity')).toBe(0.5);
    expect(acc(s, 'manner:warmth')).toBeUndefined();
  });

  it('are clamped to the accumulator cap', () => {
    const s = world();
    for (let i = 0; i < 40; i++) feedYield(s, ANN);
    expect(acc(s, 'manner:intensity')).toBe(TUNING.development.accCap);
    expect(acc(s, 'manner:warmth')).toBe(-TUNING.development.accCap);
  });

  it('a locked manner or drawnBy takes no push', () => {
    const s = world();
    unitOf(s).practiceLocks = ['manner'];
    feedYield(s, ANN);
    drawnFavour(s, reg, ANN, 'power');
    expect(acc(s, 'manner:intensity')).toBeUndefined();
    expect(acc(s, 'manner:drawn_by.power')).toBe(TUNING.manner.push.drawn.power);
    unitOf(s).practiceLocks = ['manner', 'drawnBy'];
    drawnFavour(s, reg, ANN, 'pain');
    expect(acc(s, 'manner:drawn_by.pain')).toBeUndefined();
  });

  it('a held manner axis takes no push and no step (the player\'s HOLD)', () => {
    const s = world();
    ensureDevelopment(unitOf(s)).held = ['manner:warmth'];
    expect(axisForbidden(s, reg, unitOf(s), 'manner:warmth')).toMatch(/held/);
    feedYield(s, ANN);
    expect(acc(s, 'manner:warmth')).toBeUndefined();
    expect(acc(s, 'manner:intensity')).toBe(0.5);
    setAcc(s, { 'manner:warmth': STEP });
    expect(names(s)).not.toContain('manner:warmth');
    ensureDevelopment(unitOf(s)).held = ['manner:drawn_by'];
    drawnFavour(s, reg, ANN, 'power');
    expect(acc(s, 'manner:drawn_by.power')).toBeUndefined();
    expect(axisForbidden(s, reg, unitOf(s), 'manner:drawn_by.pain')).toMatch(/held/);
  });

  it('come from the dynamic: a yielded sample, care that landed, a first practice, a refusal she respects, a ceremony form', () => {
    const s = world();
    practiceSample(s, reg, ANN, 'yielded');
    expect(acc(s, 'manner:intensity')).toBe(0.5);
    mannerFeedLanded(s, reg, ANN, { type: 'comforted', actor: 'commander' });
    expect(acc(s, 'manner:warmth')).toBeCloseTo(-0.4 + 0.6, 6);
    mannerFeedLanded(s, reg, ANN, { type: 'comforted', actor: ANN });
    expect(acc(s, 'manner:warmth')).toBeCloseTo(0.2, 6); // not the commander's: nothing
    notePractised(s, reg, ANN, 'seed_a', ['restraint']);
    expect(acc(s, 'manner:curiosity')).toBe(1.2); // reaction draws her: no discovery bonus
    expect(acc(s, 'manner:drawn_by.discovery')).toBe(TUNING.manner.push.drawn.discovery);
    feedForms(s, ANN);
    expect(acc(s, 'manner:order')).toBe(0.5);
    // a refusal at `play` is minor (no cost noted): nothing; at `role` with her reading in a region she likes: order up
    refusalCost(s, { registries: reg }, ANN, 'demand');
    expect(acc(s, 'manner:order')).toBe(0.5);
    dynOf(s).frame = 'role';
    dynOf(s).readOf.region = 'devoted';
    refusalCost(s, { registries: reg }, ANN, 'demand');
    expect(acc(s, 'manner:order')).toBe(0.5); // not a region she likes
    dynOf(s).readOf.region = 'proud';
    refusalCost(s, { registries: reg }, ANN, 'demand');
    expect(acc(s, 'manner:order')).toBe(1.5);
  });

  it('a first practice with discovery drawing her pulls curiosity further, and a long run of one kind pulls it down', () => {
    const s = world({ drawnBy: ['discovery'] });
    notePractised(s, reg, ANN, 'seed_a', []);
    expect(acc(s, 'manner:curiosity')).toBeCloseTo(1.2 * TUNING.manner.push.discoveryMult, 6);
    const before = acc(s, 'manner:curiosity')!;
    for (let i = 0; i < TUNING.manner.push.repeatRun - 1; i++) notePractised(s, reg, ANN, 'seed_a', []);
    expect(acc(s, 'manner:curiosity')).toBeCloseTo(before - 0.5, 6); // the run reached repeatRun at its fourth
  });
});

describe('the steps the engine proposes (ruling 4)', () => {
  it('nothing before its threshold, and nothing for a woman with no manner', () => {
    const s = world();
    setAcc(s, { 'manner:intensity': STEP - 0.1 });
    expect(names(s)).toEqual([]);
    setAcc(s, { 'manner:intensity': STEP });
    expect(names(s)).toEqual(['manner:intensity']);
    delete unitOf(s).bond!.practice!.manner;
    expect(names(s)).toEqual([]);
  });

  it('not before DAYS since playSince, nor within DAYS of that axis\' last step', () => {
    const s = world({ since: DAYS - 1 });
    setAcc(s, { 'manner:intensity': STEP });
    expect(names(s)).toEqual([]);
    s.day += 1;
    expect(names(s)).toEqual(['manner:intensity']);
    dynOf(s).mannerStepped = { intensity: s.day - (DAYS - 1) };
    expect(names(s)).toEqual([]);
    dynOf(s).mannerStepped = { intensity: s.day - DAYS };
    expect(names(s)).toEqual(['manner:intensity']);
    dynOf(s).mannerStepped = { warmth: s.day }; // another axis' step does not hold this one
    expect(names(s)).toEqual(['manner:intensity']);
    delete dynOf(s).playSince; // no play yet: nothing
    expect(names(s)).toEqual([]);
  });

  it('is by the sign of the accumulator and stops at the end of the scale', () => {
    const s = world({ manner: { warmth: -2, intensity: 2 } });
    setAcc(s, { 'manner:warmth': -STEP, 'manner:intensity': STEP, 'manner:order': -STEP });
    expect(names(s)).toEqual(['manner:order']); // warmth at -2 and intensity at +2 cannot go further
    expect(mannerProposals(s, reg, unitOf(s))[0].direction).toBe('down');
  });

  it('the review lists the proposal as an axis and makes her due on the cadence with no experiences', () => {
    const s = world();
    setAcc(s, { 'manner:intensity': STEP });
    expect(eligibleAxes(s, reg, unitOf(s))).toContainEqual({ axis: 'manner:intensity', direction: 'up', support: 'strong', proposed: true });
    expect(developmentOf(unitOf(s)).pending).toEqual([]);
    expect(unitDue(s, ANN)).toBe(false); // no registry asked: the old rule
    expect(unitDue(s, ANN, reg)).toBe(true);
    ensureDevelopment(unitOf(s)).lastReview = s.day - 1;
    expect(unitDue(s, ANN, reg)).toBe(false);
  });

  it('validateReview takes a proposed step and drops an invented one, a nudge and a wrong direction', () => {
    const s = world();
    setAcc(s, { 'manner:intensity': STEP, 'manner:warmth': STEP - 1 });
    const ok = validateReview(s, reg, ANN, { shifts: [shift('manner:intensity'), shift('manner:warmth'), shift('manner:intensity', 'down')], facts: [] });
    expect(ok.shifts.map((x) => x.axis)).toEqual(['manner:intensity']);
    expect(ok.dropped.map((x) => x.why)).toEqual(['the engine proposed no such step', 'named twice']);
    expect(validateReview(s, reg, ANN, { shifts: [shift('manner:intensity', 'up', 'nudge')], facts: [] }).dropped[0].why).toMatch(/only steps/);
  });

  it('a failed review still applies the step (fallbackReview), consumes the support and writes the overlay', () => {
    const s = world({ manner: { intensity: 1 } });
    setAcc(s, { 'manner:intensity': STEP + 0.5 });
    const events = applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    expect(events.filter((e) => e.type === 'development_shift')).toHaveLength(1);
    expect(developmentOf(unitOf(s)).practice).toEqual({ manner: { intensity: 1 } });
    expect(mannerOf(s, reg, ANN)!.axes.intensity).toBe(2);
    expect(unitOf(s).bond!.practice!.manner!.intensity).toBe(1); // the import is untouched
    expect(acc(s, 'manner:intensity')).toBe(0.5);
    expect(dynOf(s).mannerStepped).toEqual({ intensity: s.day });
    expect(developmentOf(unitOf(s)).lastReview).toBe(s.day);
  });

  it('the step is a quiet development moment with its one-time line in the next scene', () => {
    const s = world();
    setAcc(s, { 'manner:intensity': STEP });
    const events = applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    const moment = developmentOf(unitOf(s)).moments.at(-1)!;
    expect(moment).toMatchObject({ axis: 'manner:intensity', from: '0', to: '1' });
    expect(wentUp(moment)).toBe(true);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['development_shift', 'development_moment', 'development_review']));
    expect(events.some((e) => e.type === 'toast' || e.type === 'cut_in')).toBe(false);
    s.scene = { id: 'sc1', participants: [ANN], locationId: 'x' } as unknown as CampaignState['scene'];
    stampMoments(s, [ANN], 'sc1');
    const d = momentDirective(s, reg, ANN)!;
    expect(d.id).toBe(`development:${ANN}`);
    expect(d.text).toContain('goes harder');
    expect(d.text).not.toMatch(/AUTHOR TO WRITE|\bhe\b|\bhim\b|\bhis\b/);
  });

  it('a locked manner never drifts, and UNDO reverts the overlay and the day of the step', () => {
    const locked = world();
    unitOf(locked).practiceLocks = ['manner'];
    setAcc(locked, { 'manner:intensity': STEP });
    expect(names(locked)).toEqual([]);
    expect(axisForbidden(locked, reg, unitOf(locked), 'manner:intensity')).toMatch(/locked/);

    const s = world();
    setAcc(s, { 'manner:intensity': STEP });
    developmentOf(unitOf(s)); // present
    applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    expect(dynOf(s).mannerStepped).toBeDefined();
    expect(undoReview(s, ANN)).toBe(true);
    expect(developmentOf(unitOf(s)).practice).toBeUndefined();
    expect(dynOf(s).mannerStepped).toBeUndefined();
    expect(acc(s, 'manner:intensity')).toBe(STEP);
    expect(mannerOf(s, reg, ANN)!.axes.intensity).toBe(0);
  });

  it('discreteCap does not stop a second step after another 28 days', () => {
    const s = world();
    const cap = TUNING.development.discreteCap;
    expect(cap).toBeLessThan(3);
    setAcc(s, { 'manner:intensity': STEP * 2 });
    applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    expect(mannerOf(s, reg, ANN)!.axes.intensity).toBe(1);
    expect(names(s)).toEqual([]); // the pace: not yet
    s.day += DAYS;
    expect(names(s)).toEqual(['manner:intensity']);
    applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback');
    expect(mannerOf(s, reg, ANN)!.axes.intensity).toBe(2);
    s.day += DAYS;
    setAcc(s, { 'manner:intensity': STEP });
    expect(names(s)).toEqual([]); // the end of the scale, not a cap
  });

  it('with the setting off nothing is proposed and nothing is due', () => {
    const s = world();
    setAcc(s, { 'manner:intensity': STEP });
    delete s.settings.characterDevelopment;
    expect(names(s)).toEqual([]);
    expect(unitDue(s, ANN, reg)).toBe(false);
  });
});

describe('the day end and playSince', () => {
  const withMood = (m: string): string => String([...reg.lifeEvents.values()].find((e) => (e as unknown as { mood?: string }).mood === m)!.id);
  function had(s: CampaignState, id: string): void {
    s.life ??= newLife(1);
    s.life.units[ANN] = { last: { [id]: s.day } };
  }

  it('her own days push warmth: a bad one down, a good one up', () => {
    const bad = world();
    had(bad, withMood('irritated'));
    mannerDayStep(bad, reg, [ANN]);
    expect(acc(bad, 'manner:warmth')).toBeCloseTo(-0.3 + regardPush(bad), 6);
    const good = world();
    had(good, withMood('good'));
    mannerDayStep(good, reg, [ANN]);
    expect(acc(good, 'manner:warmth')).toBeCloseTo(0.3 + regardPush(good), 6);
  });

  /** What the Regard band of the day adds to warmth, read the way the step reads it. */
  function regardPush(s: CampaignState): number {
    const rank = regardBandRank(reg, regardOf(s, reg, ANN));
    const bands = reg.regardBands.size;
    return rank === 0 ? TUNING.manner.push.regardHigh.warmth : rank >= bands - 2 ? TUNING.manner.push.regardLow.warmth : 0;
  }

  it('a day at the top or the bottom Regard band pushes warmth', () => {
    for (const [regard, sign] of [[95, 1], [5, -1], [50, 0]] as const) {
      const s = world();
      s.relations[ANN].regard = regard;
      mannerDayStep(s, reg, [ANN]);
      expect(acc(s, 'manner:warmth') ?? 0, String(regard)).toBeCloseTo(sign * 0.1, 6);
    }
  });

  it('writes nothing for a woman with no manner or with development off', () => {
    const a = world();
    delete unitOf(a).bond!.practice!.manner;
    a.relations[ANN].regard = 95;
    mannerDayStep(a, reg, [ANN]);
    expect(unitOf(a).development).toBeUndefined();
    const b = world();
    b.relations[ANN].regard = 95;
    delete b.settings.characterDevelopment;
    mannerDayStep(b, reg, [ANN]);
    expect(unitOf(b).development).toBeUndefined();
  });

  it('playSince is stamped when her frame first reaches play, once', () => {
    const s = world();
    delete dynOf(s).playSince;
    dynOf(s).frame = 'equal';
    notePlaySince(s, ANN);
    expect(dynOf(s).playSince).toBeUndefined();
    dynOf(s).frame = 'play';
    notePlaySince(s, ANN);
    expect(dynOf(s).playSince).toBe(s.day);
    s.day += 5;
    notePlaySince(s, ANN);
    expect(dynOf(s).playSince).toBe(s.day - 5);
    // the day step stamps it lazily too, and only for a holder with a manner
    const t = world();
    delete dynOf(t).playSince;
    mannerDayStep(t, reg, [ANN]);
    expect(dynOf(t).playSince).toBe(t.day);
    const none = world();
    delete none.relations[ANN].dynamic!.playSince;
    delete unitOf(none).bond!.practice!.manner;
    notePlaySince(none, ANN);
    expect(dynOf(none).playSince).toBeUndefined();
  });
});

describe('the review call carries the proposal', () => {
  it('marks a proposed step in the prompt and lets only a listed manner axis through', async () => {
    await import('../../src/llm/calls/all');
    const { getCallType } = await import('../../src/llm/callTypes');
    const { sanitizeReview } = await import('../../src/llm/calls/developmentReview');
    const s = world();
    setAcc(s, { 'manner:intensity': STEP });
    const axes = eligibleAxes(s, reg, unitOf(s));
    const input = { unitId: ANN, name: 'Ann', card: 'c', profile: { values: {}, likes: [], dislikes: [], tastes: [] }, anchors: [], axes, experiences: [], facts: [], categories: [] };
    const ct = getCallType('development_review')!;
    expect(ct.prompt(input)).toContain('- manner:intensity: up, strong, PROPOSED');
    expect(ct.system(input)).toMatch(/PROPOSED/);
    const out = sanitizeReview({ shifts: [{ axis: 'manner:intensity', direction: 'up', size: 'step', reason: 'she pushes harder' }, { axis: 'manner:warmth', direction: 'down', size: 'step', reason: 'x' }], facts: [] }, input)!;
    expect(out.shifts.map((x) => x.axis)).toEqual(['manner:intensity']);
  });
});
