import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import { anchorKey, axisEntry, axisForbidden, axisKind, discreteAxis } from '../../../src/engine/development/axes';
import { changedAxes } from '../../../src/engine/development/words';
import { wentUp } from '../../../src/engine/development/moments';
import { applyReview, eligibleAxes, undoReview, validateReview, type ReviewValue } from '../../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import { expectationsOf } from '../../../src/engine/dynamic/expectations';
import { practiceOf, validatePractice } from '../../../src/engine/dynamic/profile';
import type { Appraisal, CampaignState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { developmentAxisKeys } from '../../../src/setup/profile';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const ap = (i: number): Appraisal => ({
  id: `ap${i}`, day: 1, kind: 'praised', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate',
  subject: ANN, pushes: [], summary: 'subject · praised · Ann · wanted yes, harm none, outcome good',
});
const STEP = TUNING.development.stepThreshold;

/** Ann has a practice and a profile, the categories are on, development is on and the accumulators are given. */
function world(acc: Record<string, number> = {}, enabled = ['restraint', 'humiliation', 'worship']): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  s.day = 8;
  s.content = { enabled };
  const u = unitOf(s);
  u.bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: validatePractice({ style: { primary: 'cold', secondary: 'playful' }, drive: 'high', fairness: 'strict', categories: { restraint: { as: 'enjoys', witness: 'drawn' }, humiliation: { as: 'tolerates', witness: 'dislikes' } } }, reg).practice!,
  };
  u.expectations = { holdsUntil: 'limit', worship: { feet: { attitude: 'craves', how: 'slowly' } } };
  const dev = ensureDevelopment(u);
  dev.acc = { ...acc };
  dev.pending = [ap(0), ap(1), ap(2)];
  dev.nextId = 3;
  return s;
}
const shift = (axis: string, direction: 'up' | 'down' = 'up', size: 'nudge' | 'step' = 'step'): ReviewValue['shifts'][number] => ({ axis, direction, size, reason: 'because' });
const review = (...shifts: ReviewValue['shifts']): ReviewValue => ({ shifts, facts: [] });

describe('the axes of the dynamic', () => {
  it('are read by kind: practice and expect keys resolve to their registry entries', () => {
    expect(axisKind('practice:restraint.as')).toBe('practice');
    expect(axisKind('expect:holds_until')).toBe('expect');
    expect(axisEntry(reg, 'practice:restraint.as')?.id).toBe('practice:.any.as');
    expect(axisEntry(reg, 'practice:humiliation.witness')?.id).toBe('practice:.any.witness');
    expect(axisEntry(reg, 'practice:style.secondary')?.id).toBe('practice:style.secondary');
    expect(axisEntry(reg, 'expect:holds_until')?.id).toBe('expect:holds_until');
    expect(axisEntry(reg, 'expect:worship.feet')?.id).toBe('expect:worship.any');
    for (const bad of ['practice:fairness', 'practice:restraint', 'practice:restraint.drive', 'expect:worship', 'expect:nothing', 'practice:']) expect(axisEntry(reg, bad), bad).toBeNull();
    for (const k of ['practice', 'expect']) expect([...reg.developmentAxes.values()].filter((e) => e.kind === k).length).toBeGreaterThan(0);
  });

  it('anchors may name them, the import is told them, and a wildcard is never a key', () => {
    expect(anchorKey(reg, 'practice:restraint.as')).toBe('practice:restraint.as');
    expect(anchorKey(reg, 'expect:holds_until')).toBe('expect:holds_until');
    expect(anchorKey(reg, 'expect:worship.feet')).toBe('expect:worship.feet');
    for (const bad of ['practice:fairness', 'practice:nonsense.as', 'expect:worship.nonsense', 'practice:.any.as', 'expect:worship.any']) expect(anchorKey(reg, bad), bad).toBeNull();
    expect(developmentAxisKeys(reg).filter((k) => /^(practice|expect):/.test(k))).toEqual([]); // no practice category on: the list is the old one
    expect(developmentAxisKeys(reg, ['explicit_scenes']).filter((k) => /^(practice|expect):/.test(k))).toEqual([]);
    const keys = developmentAxisKeys(reg, ['restraint', 'worship']);
    expect(keys).toContain('practice:restraint.as');
    expect(keys).not.toContain('practice:service.as'); // only the categories that are on
    expect(keys).toContain('expect:worship.feet');
    expect(keys).not.toContain('expect:worship.genitalia'); // explicit_scenes is off
    expect(keys).toContain('practice:restraint.witness');
    expect(keys).toContain('practice:style.secondary');
    expect(keys).toContain('expect:holds_until');
    expect(keys.filter((k) => k.includes('.any'))).toEqual([]);
  });
});

describe('a shift of the practice (P14b axes)', () => {
  it('a shift of practice:restraint.as moves one step and practiceOf reads it', () => {
    const s = world({ 'practice:restraint.as': STEP });
    expect(practiceOf(s, reg, ANN)!.categories.restraint.as).toBe('enjoys');
    const events = applyReview(s, reg, ANN, review(shift('practice:restraint.as')), 'model');
    expect(events.some((e) => e.type === 'development_shift')).toBe(true);
    expect(practiceOf(s, reg, ANN)!.categories.restraint).toEqual({ as: 'craves', witness: 'drawn' });
    expect(unitOf(s).bond!.practice!.categories.restraint.as).toBe('enjoys'); // the import is untouched
    expect(developmentOf(unitOf(s)).practice).toEqual({ categories: { restraint: { as: 'craves' } } });
    const moment = developmentOf(unitOf(s)).moments.at(-1)!;
    expect(moment).toMatchObject({ axis: 'practice:restraint.as', from: 'enjoys', to: 'craves' });
    expect(wentUp(moment)).toBe(true);
    // the support was taken, and a step back to the import leaves no entry
    expect(developmentOf(unitOf(s)).acc['practice:restraint.as']).toBeUndefined();
    ensureDevelopment(unitOf(s)).acc['practice:restraint.as'] = -STEP;
    ensureDevelopment(unitOf(s)).pending = [ap(5), ap(6), ap(7)];
    applyReview(s, reg, ANN, review(shift('practice:restraint.as', 'down')), 'model');
    expect(developmentOf(unitOf(s)).practice).toBeUndefined();
    expect(practiceOf(s, reg, ANN)!.categories.restraint.as).toBe('enjoys');
  });

  it('the witness and the cap, and a retired secondary line', () => {
    const s = world({ 'practice:restraint.witness': -STEP, 'practice:style.secondary': STEP, 'practice:humiliation.as': -STEP });
    applyReview(s, reg, ANN, review(shift('practice:restraint.witness', 'down'), shift('practice:style.secondary'), shift('practice:humiliation.as', 'down')), 'model');
    const p = practiceOf(s, reg, ANN)!;
    expect(p.categories.restraint.witness).toBe('indifferent');
    expect(p.style).toEqual({ primary: 'cold', secondary: 'playful' }); // the secondary's line drift is retired (P15b, ruling 11): the model naming it moves nothing
    expect(p.categories.humiliation.as).toBe('none');
    // past the cap (discreteCap steps from the import) the way is closed
    const cap = world({ 'practice:humiliation.as': STEP });
    ensureDevelopment(unitOf(cap)).practice = { categories: { humiliation: { as: 'craves' } } };
    expect(validateReview(cap, reg, ANN, review(shift('practice:humiliation.as'))).dropped).toHaveLength(1);
    expect(TUNING.development.discreteCap).toBe(2);
  });

  it('a locked category never shifts', () => {
    const s = world({ 'practice:restraint.as': STEP, 'practice:style.secondary': STEP, 'practice:humiliation.as': STEP });
    unitOf(s).practiceLocks = ['categories.restraint', 'style'];
    expect(axisForbidden(s, reg, unitOf(s), 'practice:restraint.as')).toMatch(/locked/);
    expect(axisForbidden(s, reg, unitOf(s), 'practice:restraint.witness')).toMatch(/locked/);
    expect(axisForbidden(s, reg, unitOf(s), 'practice:style.secondary')).toMatch(/locked/);
    expect(axisForbidden(s, reg, unitOf(s), 'practice:humiliation.as')).toBeNull();
    const ok = validateReview(s, reg, ANN, review(shift('practice:restraint.as'), shift('practice:style.secondary'), shift('practice:humiliation.as')));
    expect(ok.shifts.map((x) => x.axis)).toEqual(['practice:humiliation.as']);
    expect(eligibleAxes(s, reg, unitOf(s)).map((a) => a.axis)).toEqual(['practice:humiliation.as']);
  });

  it('fairness, hint style and drive never drift', () => {
    const s = world();
    for (const key of ['practice:fairness', 'practice:hint_style', 'practice:drive']) {
      expect(axisForbidden(s, reg, unitOf(s), key), key).toMatch(/never drift/);
      expect(axisEntry(reg, key)).toBeNull();
    }
  });

  it('a disabled or limited category is forbidden, and so is a section she does not have', () => {
    const off = world({ 'practice:restraint.as': STEP }, ['humiliation']);
    expect(axisForbidden(off, reg, unitOf(off), 'practice:restraint.as')).toMatch(/disabled or limited/);
    expect(axisForbidden(off, reg, unitOf(off), 'practice:humiliation.as')).toBeNull();
    const limited = world();
    unitOf(limited).bond!.ownLimits.categories = ['restraint'];
    expect(axisForbidden(limited, reg, unitOf(limited), 'practice:restraint.witness')).toMatch(/disabled or limited/);
    const none = world();
    delete unitOf(none).bond!.practice;
    expect(axisForbidden(none, reg, unitOf(none), 'practice:restraint.as')).toMatch(/practice/);
    expect(axisForbidden(none, reg, unitOf(none), 'practice:style.secondary')).toMatch(/practice/);
    const noSecond = world();
    delete unitOf(noSecond).bond!.practice!.style.secondary;
    expect(axisForbidden(noSecond, reg, unitOf(noSecond), 'practice:style.secondary')).toMatch(/secondary/);
    const grunt = world();
    expect(axisForbidden(grunt, reg, { ...unitOf(grunt), kind: 'grunt' }, 'practice:restraint.as')).toMatch(/grunt/);
    unitOf(grunt).development!.held = ['practice:restraint.as'];
    expect(axisForbidden(grunt, reg, unitOf(grunt), 'practice:restraint.as')).toMatch(/held/);
  });

  it('undoReview restores the stored value', () => {
    const s = world({ 'practice:restraint.as': STEP, 'expect:holds_until': STEP });
    const before = structuredClone(developmentOf(unitOf(s)));
    applyReview(s, reg, ANN, review(shift('practice:restraint.as'), shift('expect:holds_until')), 'model');
    expect(practiceOf(s, reg, ANN)!.categories.restraint.as).toBe('craves');
    expect(expectationsOf(s, reg, ANN).holdsUntil).toBe('blackout');
    expect(undoReview(s, ANN)).toBe(true);
    expect(practiceOf(s, reg, ANN)!.categories.restraint.as).toBe('enjoys');
    expect(expectationsOf(s, reg, ANN).holdsUntil).toBe('limit');
    expect(developmentOf(unitOf(s)).practice).toBeUndefined();
    expect(developmentOf(unitOf(s)).expect).toBeUndefined();
    expect(developmentOf(unitOf(s)).acc).toEqual(before.acc);
  });
});

describe('a shift of the expectations (P14b axes)', () => {
  it('holds_until and a worship attitude step along their scales and expectationsOf reads them', () => {
    const s = world({ 'expect:holds_until': STEP, 'expect:worship.feet': -STEP });
    applyReview(s, reg, ANN, review(shift('expect:holds_until'), shift('expect:worship.feet', 'down')), 'model');
    const e = expectationsOf(s, reg, ANN);
    expect(e.holdsUntil).toBe('blackout');
    expect(e.worship!.feet).toEqual({ attitude: 'enjoys', how: 'slowly' }); // the attitude drifts, her words stay
    expect(unitOf(s).expectations!.holdsUntil).toBe('limit'); // the import is untouched
    expect(unitOf(s).expectations!.worship!.feet.attitude).toBe('craves');
    expect(developmentOf(unitOf(s)).expect).toEqual({ holdsUntil: 'blackout', worship: { feet: 'enjoys' } });
    expect(wentUp({ axis: 'expect:worship.feet', from: 'craves', to: 'enjoys' })).toBe(false);
    expect(wentUp({ axis: 'expect:holds_until', from: 'limit', to: 'blackout' })).toBe(true);
    expect(discreteAxis(unitOf(s), 'expect:holds_until')).toMatchObject({ imported: 'limit', now: 'blackout' });
  });

  it('a locked field, a closed target, a target she has no word on and a unit with no profile are forbidden', () => {
    const s = world();
    unitOf(s).expectationLocks = ['holdsUntil', 'worship.feet'];
    expect(axisForbidden(s, reg, unitOf(s), 'expect:holds_until')).toMatch(/locked/);
    expect(axisForbidden(s, reg, unitOf(s), 'expect:worship.feet')).toMatch(/locked/);
    unitOf(s).expectationLocks = ['worship'];
    expect(axisForbidden(s, reg, unitOf(s), 'expect:worship.feet')).toMatch(/locked/); // a lock on the whole field covers the entry
    unitOf(s).expectationLocks = [];
    expect(axisForbidden(s, reg, unitOf(s), 'expect:worship.feet')).toBeNull();
    expect(axisForbidden(s, reg, unitOf(s), 'expect:worship.toes')).toMatch(/no word/);
    s.content = { enabled: ['restraint'] }; // worship is off
    expect(axisForbidden(s, reg, unitOf(s), 'expect:worship.feet')).toMatch(/closed/);
    const bare = world();
    delete unitOf(bare).expectations;
    expect(axisForbidden(bare, reg, unitOf(bare), 'expect:holds_until')).toMatch(/profile/);
  });

  it('what she has become in the practice and the profile is told by the since-joining list (P15b ruling 11), for the content that is on', () => {
    const s = world({ 'practice:restraint.as': STEP });
    applyReview(s, reg, ANN, review(shift('practice:restraint.as')), 'model');
    expect(changedAxes(unitOf(s), reg)).toEqual([]); // no word on which content is on: a category is not named
    expect(changedAxes(unitOf(s), reg, []).map((a) => a.axis)).toEqual([]);
    const told = changedAxes(unitOf(s), reg, ['restraint']);
    expect(told.map((a) => [a.axis, a.up])).toEqual([['practice:restraint.as', true]]);
  });
});

describe('development off', () => {
  it('a unit with no drift reads its stored practice and profile as they are', () => {
    const s = campaign(reg, 2);
    s.content = { enabled: ['restraint'] };
    const u = unitOf(s);
    u.bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: validatePractice({ style: { primary: 'ritual' }, categories: { restraint: { as: 'enjoys', witness: 'drawn' } } }, reg).practice! };
    u.expectations = { holdsUntil: 'signal' };
    expect(u.development).toBeUndefined();
    expect(practiceOf(s, reg, ANN)).toMatchObject({ style: { primary: 'ritual' }, categories: { restraint: { as: 'enjoys', witness: 'drawn' } } });
    expect(expectationsOf(s, reg, ANN)).toEqual({ holdsUntil: 'signal' });
    expect(u.development).toBeUndefined(); // reading writes nothing
  });
});
