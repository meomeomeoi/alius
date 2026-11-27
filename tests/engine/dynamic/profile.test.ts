import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { validateBond } from '../../../src/engine/bonds/profile';
import { keepLockedPractice, PRACTICE_DEFAULTS, practiceCategories, practiceOf, validatePractice } from '../../../src/engine/dynamic/profile';
import type { Practice } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

const GOOD: Practice = {
  categories: { restraint: { as: 'craves', witness: 'drawn' }, humiliation: { as: 'enjoys', witness: 'dislikes' } },
  style: { primary: 'cold', secondary: 'playful' },
  audience: 'select_few', inclination: 'eager', fairness: 'strict', hintStyle: 'hints', drive: 'high',
};
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
/** A campaign where Ann has the section and the categories are switched on. */
function withPractice(practice: Practice = GOOD, enabled = ['restraint', 'humiliation']): CampaignState {
  const s = campaign(reg, 2);
  unitOf(s, ANN).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: structuredClone(practice) };
  s.content = { enabled };
  return s;
}

describe('validatePractice', () => {
  it('hostile fields are sanitised', () => {
    const r = validatePractice({
      categories: { restraint: { as: 'loves', witness: 'drawn' }, nonsense: { as: 'craves', witness: 'drawn' }, humiliation: { as: 'enjoys', witness: 'dislikes' } },
      style: { primary: 'cold', secondary: 'cold' }, fairness: 7, audience: 'select_few',
    }, reg);
    expect(r.practice!.categories).toEqual({ restraint: { as: 'none', witness: 'drawn' }, humiliation: { as: 'enjoys', witness: 'dislikes' } });
    expect(r.practice!.style).toEqual({ primary: 'cold' });
    expect(r.practice!.fairness).toBe('fair');
    expect(r.practice!.audience).toBe('select_few');
    expect(r.practice!.inclination).toBe(PRACTICE_DEFAULTS.inclination);
    expect(r.practice!.hintStyle).toBe('offers');
    expect(r.practice!.drive).toBe('moderate');
    expect(r.dropped).toEqual(['practice:nonsense']);
    expect(r.issues.some((i) => /nonsense/.test(i))).toBe(true);
    expect(r.issues.some((i) => /restraint\.as/.test(i))).toBe(true);
    expect(r.issues.some((i) => /fairness/.test(i))).toBe(true);
    expect(r.issues.some((i) => /secondary/.test(i))).toBe(true);
  });

  it('a non-practice category such as worship is dropped', () => {
    const r = validatePractice({ style: { primary: 'cold' }, categories: { worship: { as: 'craves', witness: 'drawn' }, restraint: { as: 'enjoys', witness: 'drawn' } } }, reg);
    expect(r.practice!.categories).toEqual({ restraint: { as: 'enjoys', witness: 'drawn' } });
    expect(r.dropped).toEqual(['practice:worship']);
    expect(r.issues.some((i) => /worship/.test(i))).toBe(true);
    expect(reg.contentCategories.has('worship')).toBe(true); // a real content category, just not a practice one
    expect(validateBond({ leadStyle: 'dominant', practice: { style: { primary: 'cold' }, categories: { worship: { as: 'craves' } } } }, reg).bond.practice!.categories).toEqual({});
  });

  it('a missing or illegal style.primary leaves no section', () => {
    for (const raw of [{ categories: {} }, { style: {} }, { style: { primary: 'neutral' } }, { style: { primary: 'shouting' } }, 'cold', [], null]) {
      const r = validatePractice(raw, reg);
      expect(r.practice, JSON.stringify(raw)).toBeUndefined();
      expect(r.issues.length).toBeGreaterThan(0);
    }
    expect(validatePractice(undefined, reg)).toEqual({ issues: [], dropped: [] });
  });

  it('a clean section has no issue and is not the input object', () => {
    const r = validatePractice(GOOD, reg);
    expect(r.issues).toEqual([]);
    expect(r.practice).toEqual(GOOD);
    expect(r.practice).not.toBe(GOOD);
  });
});

describe('practiceOf', () => {
  it('limits and disabled categories read none', () => {
    const s = withPractice();
    expect(practiceOf(s, reg, ANN)!.categories.restraint).toEqual({ as: 'craves', witness: 'drawn' });
    unitOf(s, ANN).bond!.ownLimits.categories = ['restraint'];
    const limited = practiceOf(s, reg, ANN)!;
    expect(limited.categories.restraint).toEqual({ as: 'none', witness: 'indifferent' });
    expect(limited.categories.humiliation).toEqual({ as: 'enjoys', witness: 'dislikes' });
    expect(limited.allowed).toEqual(['humiliation']);
    unitOf(s, ANN).bond!.ownLimits.categories = [];
    s.content = { enabled: ['humiliation'] }; // restraint switched off
    expect(practiceOf(s, reg, ANN)!.categories.restraint).toEqual({ as: 'none', witness: 'indifferent' });
    s.content = { enabled: ['restraint', 'humiliation'] }; // switched back on: the stored value again
    expect(practiceOf(s, reg, ANN)!.categories.restraint).toEqual({ as: 'craves', witness: 'drawn' });
    expect(unitOf(s, ANN).bond!.practice!.categories.restraint).toEqual({ as: 'craves', witness: 'drawn' }); // nothing was rewritten
  });

  it('a grunt and an absent section give null', () => {
    const s = withPractice();
    expect(practiceOf(s, reg, BEA)).toBeNull(); // a named unit without a section
    expect(practiceOf(s, reg, 'nobody')).toBeNull();
    const grunt = { ...structuredClone(unitOf(s, ANN)), id: 'g1', kind: 'grunt' as const };
    s.squad.push(grunt);
    expect(practiceOf(s, reg, 'g1')).toBeNull();
    unitOf(s, ANN).status = 'dead';
    expect(practiceOf(s, reg, ANN)).toBeNull();
  });

  it('every practice category is present, none by default', () => {
    const view = practiceOf(withPractice(GOOD, []), reg, ANN)!;
    for (const c of practiceCategories(reg)) expect(view.categories[c], c).toEqual({ as: 'none', witness: 'indifferent' });
    expect(view.allowed).toEqual([]);
  });
});

it('practiceCategories lists the tracks\' categories once, in order', () => {
  expect(practiceCategories(reg)).toEqual(['service', 'humiliation', 'public_humiliation', 'degrading_language', 'pain_rough', 'restraint', 'physical_discipline_shown', 'denial', 'exposure_risk']);
});

describe('profile/set_practice and profile/lock_practice', () => {
  const set = (s: CampaignState, unitId: string, practice: unknown) => run(s, reg, { type: 'profile/set_practice', payload: { unitId, practice } });
  const lock = (s: CampaignState, unitId: string, field: string, on: boolean) => run(s, reg, { type: 'profile/lock_practice', payload: { unitId, field, on } });
  const message = (events: ReturnType<typeof run>['events']) => errors(events).map((e) => (e as { message?: string }).message);

  it('set_practice patches fields and keeps the rest', () => {
    const r = set(withPractice(), ANN, { drive: 'low', categories: { restraint: { witness: 'dislikes' } }, style: { secondary: null } });
    expect(errors(r.events)).toEqual([]);
    const p = unitOf(r.state, ANN).bond!.practice!;
    expect(p.drive).toBe('low');
    expect(p.categories.restraint).toEqual({ as: 'craves', witness: 'dislikes' });
    expect(p.categories.humiliation).toEqual({ as: 'enjoys', witness: 'dislikes' });
    expect(p.style).toEqual({ primary: 'cold' });
    expect(p.fairness).toBe('strict');
  });

  it('set_practice respects locks', () => {
    const locked = lock(withPractice(), ANN, 'style', true);
    expect(errors(locked.events)).toEqual([]);
    expect(unitOf(locked.state, ANN).practiceLocks).toEqual(['style']);
    const refused = set(locked.state, ANN, { style: { primary: 'cruel' } });
    expect(message(refused.events)).toEqual(['That field is locked.']);
    expect(refused.state).toEqual(locked.state);
    expect(message(set(locked.state, ANN, { drive: 'low', style: { primary: 'cruel' } }).events)).toEqual(['That field is locked.']); // one locked field refuses the whole set
    expect(errors(set(locked.state, ANN, { drive: 'low' }).events)).toEqual([]);
    // a category lock
    const cat = lock(withPractice(), ANN, 'categories.restraint', true);
    expect(message(set(cat.state, ANN, { categories: { restraint: { as: 'none' } } }).events)).toEqual(['That field is locked.']);
    expect(errors(set(cat.state, ANN, { categories: { humiliation: { as: 'none' } } }).events)).toEqual([]);
    // an empty lock list deletes practiceLocks
    const unlocked = lock(locked.state, ANN, 'style', false);
    expect(unitOf(unlocked.state, ANN).practiceLocks).toBeUndefined();
    expect('practiceLocks' in unitOf(unlocked.state, ANN)).toBe(false);
  });

  it('set_practice refuses an illegal result and a grunt, and creates a section from a style', () => {
    expect(errors(set(withPractice(), ANN, { drive: 'ferocious' }).events)).toHaveLength(1);
    expect(errors(set(withPractice(), ANN, { categories: { nonsense: { as: 'craves' } } }).events)).toHaveLength(1);
    expect(errors(set(withPractice(), ANN, { colour: 'red' }).events)).toHaveLength(1);
    expect(errors(set(withPractice(), ANN, {}).events)).toHaveLength(1);
    expect(errors(set(withPractice(), 'nobody', { drive: 'low' }).events)).toHaveLength(1);
    expect(errors(set(campaign(reg, 2), BEA, { drive: 'low' }).events)).toHaveLength(1); // no section and no style
    const made = set(campaign(reg, 2), BEA, { style: { primary: 'ritual' }, inclination: 'curious' });
    expect(errors(made.events)).toEqual([]);
    expect(unitOf(made.state, BEA).bond!.practice).toMatchObject({ style: { primary: 'ritual' }, inclination: 'curious', fairness: 'fair' });
  });

  it('lock_practice names a real field', () => {
    expect(errors(lock(withPractice(), ANN, 'nonsense', true).events)).toHaveLength(1);
    expect(errors(lock(withPractice(), ANN, 'categories.nonsense', true).events)).toHaveLength(1);
    expect(errors(lock(withPractice(), ANN, 'drive', 'yes' as unknown as boolean).events)).toHaveLength(1);
  });
});

describe('validateBond and the practice section', () => {
  it('validateBond keeps a valid practice and reports its issues', () => {
    const ok = validateBond({ leadStyle: 'dominant', practice: GOOD }, reg);
    expect(ok.bond.practice).toEqual(GOOD);
    expect(ok.issues).toEqual([]);
    expect(ok.valid).toContain('practice');
    const bad = validateBond({ leadStyle: 'dominant', practice: { style: { primary: 'cold' }, drive: 'ferocious', categories: { nonsense: { as: 'craves' } } } }, reg);
    expect(bad.bond.practice!.drive).toBe('moderate');
    expect(bad.issues.length).toBe(2);
    const none = validateBond({ practice: { style: {} } }, reg);
    expect(none.bond.practice).toBeUndefined();
    expect(none.valid).not.toContain('practice');
    expect(none.issues.length).toBeGreaterThan(0);
    expect(validateBond({ leadStyle: 'dominant' }, reg).bond.practice).toBeUndefined(); // absent stays absent: byte-identical for old profiles
  });
});

describe('P15b: the manner fields', () => {
  const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
  const NEW = {
    manner: { intensity: 2, warmth: -1, order: 0, voice: 1, tempo: -2, curiosity: 1 },
    drawnBy: ['discovery', 'power'],
    everyday: 'A bit of a loner, but always helps; kind and odd.',
    contrast: 'high',
    quirks: [{ when: 'switch', text: 'She takes off her glasses.' }, { when: 'after', text: 'She makes tea and does not speak.' }],
  };
  it('a valid block is kept', () => {
    const r = validatePractice({ ...GOOD, ...NEW }, reg);
    expect(r.issues).toEqual([]);
    expect(r.practice).toMatchObject(NEW);
  });
  it('a missing axis reads 0; an axis out of range is dropped alone', () => {
    const r = validatePractice({ ...GOOD, manner: { intensity: 3, warmth: 1.5, order: -2, colour: 1 } }, reg);
    expect(r.practice!.manner).toEqual({ ...ZERO, order: -2 });
    expect(r.issues.some((i) => /manner\.intensity/.test(i))).toBe(true);
    expect(r.issues.some((i) => /manner\.warmth/.test(i))).toBe(true);
    expect(r.issues.some((i) => /colour/.test(i))).toBe(true);
    expect(validatePractice({ ...GOOD, manner: 'hard' }, reg).practice!.manner).toBeUndefined();
  });
  it('drawnBy keeps the five, once each, two at most', () => {
    expect(validatePractice({ ...GOOD, drawnBy: ['pain', 'greed', 'pain'] }, reg).practice!.drawnBy).toEqual(['pain']);
    expect(validatePractice({ ...GOOD, drawnBy: ['pain', 'power', 'reaction'] }, reg).practice!.drawnBy).toEqual(['pain', 'power']);
    expect(validatePractice({ ...GOOD, drawnBy: ['greed'] }, reg).practice!.drawnBy).toBeUndefined();
    expect(validatePractice({ ...GOOD, drawnBy: 'pain' }, reg).issues.length).toBeGreaterThan(0);
  });
  it('everyday over 160 characters or with a pronoun for the commander is dropped whole', () => {
    const long = validatePractice({ ...GOOD, everyday: 'x'.repeat(161) }, reg);
    expect(long.practice!.everyday).toBeUndefined();
    expect(long.issues.length).toBe(1);
    expect(validatePractice({ ...GOOD, everyday: 'x'.repeat(160) }, reg).practice!.everyday).toHaveLength(160);
    const he = validatePractice({ ...GOOD, everyday: 'She waits until he looks away.' }, reg);
    expect(he.practice!.everyday).toBeUndefined();
    expect(he.issues.some((i) => /pronoun/.test(i))).toBe(true);
  });
  it('a quirk with a pronoun, an unknown when or a repeated text is dropped whole; three at most', () => {
    const r = validatePractice({ ...GOOD, quirks: [
      { when: 'switch', text: 'She locks the door.' },
      { when: 'during', text: 'She keeps a hand in his hair.' },
      { when: 'sometimes', text: 'She hums.' },
      { when: 'after', text: 'she locks the door.' },
      { when: 'after', text: 'A kiss on the forehead.' },
      { when: 'address', text: 'By rank, mockingly.' },
      { when: 'during', text: 'She counts in her own language.' },
    ] }, reg);
    expect(r.practice!.quirks).toEqual([
      { when: 'switch', text: 'She locks the door.' }, { when: 'after', text: 'A kiss on the forehead.' }, { when: 'address', text: 'By rank, mockingly.' },
    ]);
    expect(r.issues.some((i) => /pronoun/.test(i))).toBe(true);
  });
  it('a bad contrast is dropped; null reads as absent', () => {
    expect(validatePractice({ ...GOOD, contrast: 'huge' }, reg).practice!.contrast).toBeUndefined();
    const r = validatePractice({ ...GOOD, manner: null, drawnBy: null, everyday: null, contrast: null, quirks: null }, reg);
    expect(r.issues).toEqual([]);
    expect(Object.keys(r.practice!)).not.toContain('manner');
  });
  it('a locked manner is kept by keepLockedPractice, and a locked field she never had is not imported', () => {
    const old = { ...GOOD, manner: { ...ZERO, warmth: 2 } } as Practice;
    const next = validatePractice({ ...GOOD, ...NEW }, reg).practice!;
    const kept = keepLockedPractice(old, next, ['manner', 'quirks']);
    expect(kept.manner).toEqual({ ...ZERO, warmth: 2 });
    expect(kept.quirks).toBeUndefined();
    expect(kept.drawnBy).toEqual(NEW.drawnBy);
  });
  it('profile/set_practice merges manner per axis and honours its lock', () => {
    const s = withPractice({ ...GOOD, manner: { ...ZERO, warmth: 1 } } as Practice);
    const r = run(s, reg, { type: 'profile/set_practice', payload: { unitId: ANN, practice: { manner: { tempo: -2 }, everyday: 'Kind and odd.' } } });
    expect(errors(r.events)).toEqual([]);
    expect(unitOf(r.state, ANN).bond!.practice!.manner).toEqual({ ...ZERO, warmth: 1, tempo: -2 });
    expect(unitOf(r.state, ANN).bond!.practice!.everyday).toBe('Kind and odd.');
    const locked = run(s, reg, { type: 'profile/lock_practice', payload: { unitId: ANN, field: 'manner', on: true } });
    expect(errors(locked.events)).toEqual([]);
    const refused = run(locked.state, reg, { type: 'profile/set_practice', payload: { unitId: ANN, practice: { manner: { tempo: 1 } } } });
    expect(errors(refused.events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'profile/set_practice', payload: { unitId: ANN, practice: { everyday: 'Waits for him.' } } }).events)).toHaveLength(1);
  });
});
