import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { canHold, dynamicOn, ensureDynamic, holderCap, holdersAtPlay, mayHoldOf } from '../../../src/engine/dynamic/gate';
import { blankDynamic, dynamicHash, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Practice } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

const PRACTICE: Practice = {
  categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
  style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
};
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
/** Ann has a profile (dominant lead by default), a practice category is on and the dynamic is set up with `holders`. */
function world(over: { practice?: Partial<Practice>; lead?: 'yielding' | 'balanced' | 'assertive' | 'dominant'; holders?: 0 | 1 | 2 | 3 | 'any'; enabled?: string[] } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: over.lead ?? 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { ...structuredClone(PRACTICE), ...over.practice },
  };
  s.content = { enabled: over.enabled ?? ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: over.holders ?? 1, pace: 'normal', frequency: 'normal', units: {} });
  return s;
}
/** Sets Ann's Impunity to exactly `target` through the stored term. */
function impunity(s: CampaignState, id: string, target: number): void {
  s.relations[id].impunityRecord = 0;
  s.relations[id].impunityRecord = target - impunityOf(s, reg, id)!.value;
  expect(impunityOf(s, reg, id)!.value).toBe(target);
}

describe('dynamicOn', () => {
  it('off without state.dynamic, with holders 0, or with no practice category on', () => {
    const s = world();
    expect(dynamicOn(s, reg)).toBe(true);
    const none = structuredClone(s);
    delete none.dynamic;
    expect(dynamicOn(none, reg)).toBe(false);
    const zero = structuredClone(s);
    zero.dynamic!.setup.holders = 0;
    expect(dynamicOn(zero, reg)).toBe(false);
    const noCategory = structuredClone(s);
    noCategory.content = { enabled: ['worship'] }; // a category no track names
    expect(dynamicOn(noCategory, reg)).toBe(false);
    delete noCategory.content;
    expect(dynamicOn(noCategory, reg)).toBe(false);
  });
});

describe('canHold', () => {
  it('reasons: no profile, mayHold no, no inclination, no category', () => {
    const s = world();
    expect(canHold(s, reg, ANN)).toBeNull();
    expect(canHold(s, reg, BEA)).toMatch(/profile/); // a named unit without a practice section
    expect(canHold(s, reg, 'nobody')).toMatch(/profile/);
    s.dynamic!.setup.units[ANN] = { mayHold: 'no' };
    expect(canHold(s, reg, ANN)).toMatch(/may not hold/);
    s.dynamic!.setup.units[ANN] = { mayHold: 'yes' };
    expect(canHold(s, reg, ANN)).toBeNull();
    delete s.dynamic!.setup.units[ANN];

    const noInclination = world({ practice: { inclination: 'none' } });
    expect(canHold(noInclination, reg, ANN)).toMatch(/inclination/);
    noInclination.dynamic!.setup.units[ANN] = { seeded: true }; // seeded: the inclination is not asked
    expect(canHold(noInclination, reg, ANN)).toBeNull();

    const noCategory = world({ practice: { categories: { restraint: { as: 'none', witness: 'indifferent' } } } });
    expect(canHold(noCategory, reg, ANN)).toMatch(/practice/);
    const off = world();
    off.content = { enabled: [] };
    expect(canHold(off, reg, ANN)).toMatch(/off/);
  });

  it('tolerates passes with a dominant lead only', () => {
    const tolerates = { categories: { restraint: { as: 'tolerates', witness: 'indifferent' } } } as const;
    expect(canHold(world({ practice: tolerates, lead: 'dominant' }), reg, ANN)).toBeNull();
    expect(canHold(world({ practice: tolerates, lead: 'assertive' }), reg, ANN)).toMatch(/practice/);
  });

  it('a balanced lead needs Impunity 40', () => {
    const s = world({ lead: 'balanced' });
    impunity(s, ANN, 39);
    expect(canHold(s, reg, ANN)).toMatch(/Impunity|lead/);
    impunity(s, ANN, 40);
    expect(canHold(s, reg, ANN)).toBeNull();
    const assertive = world({ lead: 'assertive' });
    impunity(assertive, ANN, 10);
    expect(canHold(assertive, reg, ANN)).toBeNull();
  });

  it('the cap counts units at play or beyond, not her, and any never caps', () => {
    const s = world({ holders: 1 });
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond);
    s.relations[BEA].dynamic = { ...blankDynamic(1), frame: 'play', hold: 25 };
    expect(holdersAtPlay(s)).toEqual([BEA]);
    expect(canHold(s, reg, ANN)).toMatch(/cap/);
    expect(canHold(s, reg, ANN, { ignoreCap: true })).toBeNull();
    expect(canHold(s, reg, BEA)).toBeNull(); // her own place is not counted against her
    s.relations[BEA].dynamic!.frame = 'equal'; // equal is not counted
    expect(canHold(s, reg, ANN)).toBeNull();
    s.relations[BEA].dynamic!.frame = 'rule';
    s.dynamic!.setup.holders = 'any';
    expect(canHold(s, reg, ANN)).toBeNull();
    expect(holderCap(s)).toBe(Infinity);
    s.dynamic!.setup.holders = 2;
    expect(holderCap(s)).toBe(2);
    delete s.dynamic;
    expect(holderCap(s)).toBe(0);
  });

  it('a unit that left the squad is no holder at play', () => {
    const s = world();
    s.relations[BEA].dynamic = { ...blankDynamic(1), frame: 'role' };
    unitOf(s, BEA).status = 'deserted';
    expect(holdersAtPlay(s)).toEqual([]);
  });

  it('mayHoldOf reads the setup, auto by default', () => {
    const s = world();
    expect(mayHoldOf(s, ANN)).toBe('auto');
    s.dynamic!.setup.units[ANN] = { mayHold: 'no' };
    expect(mayHoldOf(s, ANN)).toBe('no');
    expect(mayHoldOf({ ...s, dynamic: undefined }, ANN)).toBe('auto');
  });
});

describe('dynamic/set_setup and dynamic/set_unit', () => {
  it('set_setup creates the state only while a practice category is on', () => {
    const none = campaign(reg, 2);
    const refused = run(none, reg, { type: 'dynamic/set_setup', payload: { holders: 2 } });
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state.dynamic).toBeUndefined();

    const on = campaign(reg, 2);
    on.content = { enabled: ['restraint'] };
    const made = run(on, reg, { type: 'dynamic/set_setup', payload: { holders: 2, pace: 'fast' } });
    expect(errors(made.events)).toEqual([]);
    expect(made.state.dynamic!.setup).toEqual({ holders: 2, pace: 'fast', frequency: 'normal', units: {} });
    expect(typeof made.state.dynamic!.salt).toBe('number');
    expect(made.state.rng).toEqual(on.rng); // nothing was drawn
    expect(errors(run(made.state, reg, { type: 'dynamic/set_setup', payload: { holders: 7 } }).events)).toHaveLength(1);
    expect(errors(run(made.state, reg, { type: 'dynamic/set_setup', payload: { pace: 'warp' } }).events)).toHaveLength(1);
    expect(errors(run(made.state, reg, { type: 'dynamic/set_setup', payload: { frequency: 'daily' } }).events)).toHaveLength(1);
  });

  it('set_setup { holders: 0 } ends nothing', () => {
    const s = world({ holders: 'any' });
    s.relations[ANN].dynamic = { ...blankDynamic(1), frame: 'role', hold: 50 };
    s.relations[BEA].dynamic = { ...blankDynamic(1), frame: 'play', hold: 25 };
    const after = run(s, reg, { type: 'dynamic/set_setup', payload: { holders: 0 } });
    expect(errors(after.events)).toEqual([]);
    expect(after.state.dynamic!.setup.holders).toBe(0);
    expect(dynamicOn(after.state, reg)).toBe(false);
    expect(dynamicOf(after.state, ANN)!.frame).toBe('role');
    expect(dynamicOf(after.state, BEA)!.frame).toBe('play');
    expect(dynamicOf(after.state, ANN)!.hold).toBe(50);
  });

  it('set_unit stores her fields and refuses a grunt or an unknown value', () => {
    const s = world();
    const r = run(s, reg, { type: 'dynamic/set_unit', payload: { unitId: ANN, mayHold: 'no', sensitivity: 'lively' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dynamic!.setup.units[ANN]).toEqual({ mayHold: 'no', sensitivity: 'lively' });
    expect(errors(run(s, reg, { type: 'dynamic/set_unit', payload: { unitId: ANN, mayHold: 'maybe' } }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'dynamic/set_unit', payload: { unitId: 'nobody', mayHold: 'no' } }).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'dynamic/set_unit', payload: { unitId: ANN } }).events)).toHaveLength(1);
    const off = campaign(reg, 2);
    expect(errors(run(off, reg, { type: 'dynamic/set_unit', payload: { unitId: ANN, mayHold: 'no' } }).events)).toHaveLength(1);
  });

  it('set_setup seeds: a unit that can hold gets the head start once, and never a frame', () => {
    const s = world({ holders: 2 });
    const r = run(s, reg, { type: 'dynamic/set_setup', payload: { seeds: [ANN] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dynamic!.setup.units[ANN]).toMatchObject({ seeded: true });
    expect(dynamicOf(r.state, ANN)).toMatchObject({ hold: 25, frame: 'equal' });
    const again = run(r.state, reg, { type: 'dynamic/set_setup', payload: { seeds: [ANN] } });
    expect(dynamicOf(again.state, ANN)!.hold).toBe(25);
    expect(errors(run(s, reg, { type: 'dynamic/set_setup', payload: { seeds: [BEA] } }).events)[0]).toMatchObject({ message: expect.stringMatching(/cannot hold/) });
    expect(errors(run(s, reg, { type: 'dynamic/set_setup', payload: { seeds: [ANN, BEA, CAT] } }).events)).toHaveLength(1);
  });
});

describe('dynamicHash and ensureDynamic', () => {
  it('dynamicHash is stable for the same day and key and differs across days', () => {
    const s = world();
    const a = dynamicHash(s, ANN, 'probe_axis');
    expect(dynamicHash(s, ANN, 'probe_axis')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(dynamicHash({ ...s, day: s.day + 1 }, ANN, 'probe_axis')).not.toBe(a);
    expect(dynamicHash(s, ANN, 'gossip')).not.toBe(a);
    expect(dynamicHash(s, BEA, 'probe_axis')).not.toBe(a);
    const other = structuredClone(s);
    other.dynamic!.salt = 8;
    expect(dynamicHash(other, ANN, 'probe_axis')).not.toBe(a);
  });

  it('ensureDynamic emits dynamic_started once', () => {
    const s = world();
    const first = ensureDynamic(s, reg, ANN);
    expect(ofType(first, 'dynamic_started')).toEqual([{ type: 'dynamic_started', unitId: ANN }]);
    expect(dynamicOf(s, ANN)).toMatchObject({ hold: 0, frame: 'equal', domains: [], milestones: [] });
    expect(ensureDynamic(s, reg, ANN)).toEqual([]);
    const off = world({ holders: 0 });
    expect(ensureDynamic(off, reg, ANN)).toEqual([]);
    expect(dynamicOf(off, ANN)).toBeUndefined(); // off writes nothing
  });
});
