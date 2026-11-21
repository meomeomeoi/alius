import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { expectationsOf, lockedExpectation, validateExpectations, type ExpectationProfile } from '../../../src/engine/dynamic/expectations';
import { makeNamedUnit, validateUnitProfile } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const message = (events: ReturnType<typeof run>['events']) => errors(events).map((e) => (e as { message?: string }).message);

describe('validateExpectations', () => {
  it('unknown ids are dropped', () => {
    const r = validateExpectations({
      moments: { her_demand: { type: 'yielded', strength: 2 }, nonsense: { type: 'yielded', strength: 1 } },
      worship: { feet: { attitude: 'craves' }, nonsense: { attitude: 'craves' } },
      body: { feet: 'proud', nonsense: 'ashamed' },
      scent: { base: { feet: 3, nonsense: 2 } },
    }, reg, {});
    expect(Object.keys(r.expectations!.moments!)).toEqual(['her_demand']);
    expect(Object.keys(r.expectations!.worship!)).toEqual(['feet']);
    expect(Object.keys(r.expectations!.body!)).toEqual(['feet']);
    expect(Object.keys(r.expectations!.scent!.base!)).toEqual(['feet']);
    expect(r.dropped.sort()).toEqual(['expectations:body.nonsense', 'expectations:moments.nonsense', 'expectations:scent.nonsense', 'expectations:worship.nonsense']);
    expect(r.issues.filter((i) => /nonsense/.test(i))).toHaveLength(4);
  });

  it('a response type the moment does not offer, a bad strength and a bad attitude are dropped', () => {
    const r = validateExpectations({
      moments: { her_silence: { type: 'resisted', strength: 2 }, her_demand: { type: 'yielded', strength: 5 }, her_offer: { type: 'resisted', strength: 3 } },
      worship: { feet: { attitude: 'adores' }, toes: { attitude: 'enjoys', meaning: 'reward' }, soles: { attitude: 'enjoys', meaning: 'ceremony' } },
    }, reg, {});
    expect(r.expectations!.moments).toEqual({ her_offer: { type: 'resisted', strength: 3 } });
    expect(r.expectations!.worship).toEqual({ toes: { attitude: 'enjoys', meaning: 'reward' }, soles: { attitude: 'enjoys' } });
    expect(r.issues).toHaveLength(4);
  });

  it('a gated worship target is dropped with a state, and kept by the structural read', () => {
    const s = campaign(reg, 2);
    s.content = { enabled: ['worship'] };
    const raw = { worship: { feet: { attitude: 'craves' }, genitalia: { attitude: 'enjoys' } } };
    const gated = validateExpectations(raw, reg, { state: s, unitId: ANN });
    expect(Object.keys(gated.expectations!.worship!)).toEqual(['feet']);
    expect(gated.dropped).toEqual(['expectations:worship.genitalia']);
    expect(Object.keys(validateExpectations(raw, reg, {}).expectations!.worship!)).toEqual(['feet', 'genitalia']);
  });

  it('a gated worship target is dropped from expectationsOf', () => {
    const s = campaign(reg, 2);
    unitOf(s, ANN).expectations = { worship: { feet: { attitude: 'craves' }, genitalia: { attitude: 'enjoys' } }, body: { genitalia: 'proud' }, scent: { base: { genitalia: 4, feet: 2 } } };
    s.content = { enabled: ['worship'] };
    const closed = expectationsOf(s, reg, ANN);
    expect(Object.keys(closed.worship!)).toEqual(['feet']);
    expect(closed.body).toEqual({});
    expect(closed.scent!.base).toEqual({ feet: 2 });
    s.content = { enabled: ['worship', 'explicit_scenes'] };
    expect(Object.keys(expectationsOf(s, reg, ANN).worship!)).toEqual(['feet', 'genitalia']);
    // her own limits close it too
    unitOf(s, ANN).bond = { leadStyle: 'balanced', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: ['explicit_scenes'] }, publicity: 'known' };
    expect(Object.keys(expectationsOf(s, reg, ANN).worship!)).toEqual(['feet']);
    expect(expectationsOf(s, reg, BEA)).toEqual({}); // nothing stored
    expect(expectationsOf(s, reg, 'nobody')).toEqual({});
  });

  it('texts are cut and cleaned', () => {
    const r = validateExpectations({
      tells: { irritation: 'x'.repeat(200), pleasure: 'she goes\u0007 quiet\n and still' },
      traits: ['he blushes', 'patient'],
      worship: { feet: { attitude: 'craves', how: 'slow\u0000ly, with  care' } },
    }, reg, {});
    expect(r.expectations!.tells!.irritation).toHaveLength(80);
    expect(r.expectations!.tells!.pleasure).toBe('she goes quiet and still');
    expect(r.expectations!.traits).toEqual(['patient']);
    expect(r.expectations!.worship!.feet.how).toBe('slowly, with care');
    expect(r.issues.some((i) => /irritation.*cut/.test(i))).toBe(true);
    expect(r.issues.some((i) => /traits/.test(i))).toBe(true);
    const pron = validateExpectations({ tells: { irritation: 'he blushes and looks away', pleasure: 'warms to him' } }, reg, {});
    expect(pron.expectations?.tells).toBeUndefined();
    expect(pron.issues).toHaveLength(2);
    expect(validateExpectations({ worship: { feet: { attitude: 'craves', how: 'x'.repeat(100) } } }, reg, {}).expectations!.worship!.feet.how).toHaveLength(60);
  });

  it('offset is clamped to ±0.3; build weights clamp 0–1; traits are at most 6 of at most 40', () => {
    const r = validateExpectations({
      offset: { r: 0.9, f: -4 },
      build: { slim: 1.7, athletic: -0.2, curvy: 0.4 },
      hair: 'bob',
      traits: Array.from({ length: 9 }, (_, i) => `trait ${i} ${'y'.repeat(60)}`),
    }, reg, {});
    expect(r.expectations!.offset).toEqual({ r: 0.3, f: -0.3 });
    expect(r.expectations!.build).toEqual({ slim: 1, athletic: 0, curvy: 0.4 });
    expect(r.expectations!.hair).toBe('bob');
    expect(r.expectations!.traits).toHaveLength(6);
    for (const t of r.expectations!.traits!) expect(t.length).toBeLessThanOrEqual(40);
    expect(validateExpectations({ hair: 'bald', holdsUntil: 'never', offset: 'a lot', build: { slim: 'x' } }, reg, {}).expectations).toBeUndefined();
  });

  it('blackout is stored but acts as limit without breath_play', () => {
    // P15a `effectiveHoldsUntil` reads it once the P15 reader is installed (Task 13); here it is stored as given
    const r = validateExpectations({ holdsUntil: 'blackout', scent: { hygiene: 'lax' } }, reg, {});
    expect(r.expectations).toEqual({ holdsUntil: 'blackout', scent: { hygiene: 'lax' } });
    expect(r.issues).toEqual([]);
  });

  it('an empty or hostile input leaves nothing', () => {
    expect(validateExpectations(undefined, reg, {})).toEqual({ issues: [], dropped: [] });
    expect(validateExpectations({}, reg, {}).expectations).toBeUndefined();
    expect(validateExpectations('feet', reg, {}).issues).toHaveLength(1);
    expect(validateExpectations({ colour: 'red' }, reg, {}).issues).toHaveLength(1);
  });
});

describe('profile/set_expectation and profile/lock_expectation', () => {
  const set = (s: CampaignState, unitId: string, patch: unknown) => run(s, reg, { type: 'profile/set_expectation', payload: { unitId, patch } });
  const lock = (s: CampaignState, unitId: string, field: string, on: boolean) => run(s, reg, { type: 'profile/lock_expectation', payload: { unitId, field, on } });

  it('a set merges per field and per id', () => {
    const s = campaign(reg, 2);
    s.content = { enabled: ['worship'] };
    const a = set(s, ANN, { worship: { feet: { attitude: 'craves', meaning: 'reward' } }, holdsUntil: 'limit' });
    expect(errors(a.events)).toEqual([]);
    const b = set(a.state, ANN, { worship: { toes: { attitude: 'dislikes' } }, tells: { pleasure: 'a slow smile' } });
    expect(errors(b.events)).toEqual([]);
    expect(unitOf(b.state, ANN).expectations).toEqual({ holdsUntil: 'limit', worship: { feet: { attitude: 'craves', meaning: 'reward' }, toes: { attitude: 'dislikes' } }, tells: { pleasure: 'a slow smile' } });
    const c = set(b.state, ANN, { worship: { feet: null }, holdsUntil: null });
    expect(unitOf(c.state, ANN).expectations).toEqual({ worship: { toes: { attitude: 'dislikes' } }, tells: { pleasure: 'a slow smile' } });
  });

  it('a locked field cannot be patched', () => {
    const s = campaign(reg, 2);
    s.content = { enabled: ['worship'] };
    const withFeet = set(s, ANN, { worship: { feet: { attitude: 'craves' } } });
    const locked = lock(withFeet.state, ANN, 'worship.feet', true);
    expect(errors(locked.events)).toEqual([]);
    expect(unitOf(locked.state, ANN).expectationLocks).toEqual(['worship.feet']);
    expect(lockedExpectation(unitOf(locked.state, ANN), 'worship.feet')).toBe(true);
    expect(lockedExpectation(unitOf(locked.state, ANN), 'worship.toes')).toBe(false);
    const refused = set(locked.state, ANN, { worship: { feet: { attitude: 'dislikes' } } });
    expect(message(refused.events)).toEqual(['That field is locked.']);
    expect(refused.state).toEqual(locked.state);
    expect(errors(set(locked.state, ANN, { worship: { toes: { attitude: 'enjoys' } } }).events)).toEqual([]);
    // a whole-field lock covers every id under it
    const all = lock(withFeet.state, ANN, 'worship', true);
    expect(lockedExpectation(unitOf(all.state, ANN), 'worship.soles')).toBe(true);
    expect(message(set(all.state, ANN, { worship: { toes: { attitude: 'enjoys' } } }).events)).toEqual(['That field is locked.']);
    // unlocking the last lock deletes the key
    const open = lock(locked.state, ANN, 'worship.feet', false);
    expect('expectationLocks' in unitOf(open.state, ANN)).toBe(false);
  });

  it('a set refuses unknown ids, a closed target, a grunt and an empty patch; a lock names a real field', () => {
    const s = campaign(reg, 2);
    s.content = { enabled: ['worship'] };
    expect(errors(set(s, ANN, { worship: { nonsense: { attitude: 'craves' } } }).events)).toHaveLength(1);
    expect(errors(set(s, ANN, { worship: { genitalia: { attitude: 'craves' } } }).events)).toHaveLength(1); // explicit_scenes is off
    expect(errors(set(s, ANN, { colour: 'red' }).events)).toHaveLength(1);
    expect(errors(set(s, ANN, {}).events)).toHaveLength(1);
    expect(errors(set(s, 'nobody', { holdsUntil: 'limit' }).events)).toHaveLength(1);
    expect(errors(lock(s, ANN, 'nonsense', true).events)).toHaveLength(1);
    expect(errors(lock(s, ANN, 'worship.nonsense', true).events)).toHaveLength(1);
    expect(errors(lock(s, ANN, 'tells', 'yes' as unknown as boolean).events)).toHaveLength(1);
  });
});

describe('the setup carries the profile', () => {
  it('validateUnitProfile reports the problems and makeNamedUnit copies the profile and its locks', () => {
    const good = unitSetup('Ann', { expectations: { holdsUntil: 'limit', worship: { feet: { attitude: 'craves' } } }, expectationLocks: ['holdsUntil'], practiceLocks: ['style'] });
    expect(validateUnitProfile(good, 'Ann', reg, { desireBondDefects: false })).toEqual([]);
    const bad = unitSetup('Ann', { expectations: { holdsUntil: 'never', worship: { nonsense: { attitude: 'craves' } } } as unknown as ExpectationProfile, expectationLocks: ['nonsense'] });
    expect(validateUnitProfile(bad, 'Ann', reg, { desireBondDefects: false }).length).toBeGreaterThanOrEqual(3);
    const unit = makeNamedUnit(good, reg, new Set());
    expect(unit.expectations).toEqual(good.expectations);
    expect(unit.expectations).not.toBe(good.expectations);
    expect(unit.expectationLocks).toEqual(['holdsUntil']);
    expect(unit.practiceLocks).toEqual(['style']);
    expect(makeNamedUnit(unitSetup('Bea'), reg, new Set())).not.toHaveProperty('expectations');
  });
});
