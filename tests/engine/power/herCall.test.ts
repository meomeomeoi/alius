import { beforeAll, describe, expect, it } from 'vitest';
import type { HerCallSpec } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import { commandStance, impunityOf } from '../../../src/engine/discipline';
import { actorWeight, askFirstHolds, herCallCandidates, herCallChance, herCallOdds, herCallSpecOf, rollHerCall } from '../../../src/engine/power/herCall';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, loadCore, setRelation } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';
import { setRecord, withLeader, withOptions, withStance } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unitOf = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const good = { id: 'good' as const, lean: { pragmatism: 2 }, text: 'Good.', effects: [] };
const bad = { id: 'bad' as const, lean: { autonomy: 2 }, text: 'Bad.', effects: [] };
const rank2: HerCallSpec = { trigger: { minLeadRank: 2 }, outcomes: [good, bad] };
const defiance: HerCallSpec = { trigger: { stances: ['open_defiance', 'defiant_loyal'], minImpunity: 50 }, outcomes: [good, bad] };

/** Four named units, all yielding, no defects, values 0, Trust 50. */
function fresh(): CampaignState {
  const s = campaign(reg, 4);
  for (const id of [ANN, BEA, CAT, DEE]) {
    const u = unitOf(s, id);
    u.values = { ...ZERO };
    u.defects = [];
    withBond(s, id, { leadStyle: 'yielding' });
    setRelation(s, id, { trust: 50 });
  }
  return s;
}
/** Puts her Impunity at `target` by moving only her stored record. */
function atImpunity(s: CampaignState, id: string, target: number): CampaignState {
  setRecord(s, id, 0);
  const at0 = impunityOf(s, reg, id)!.value;
  setRecord(s, id, Math.max(-40, Math.min(40, target - at0)));
  return s;
}
const party = [ANN, BEA, CAT, DEE];

describe('P9e: herCallSpecOf', () => {
  it('reads the block of a template, null for none', () => {
    expect(herCallSpecOf(undefined)).toBeNull();
    expect(herCallSpecOf({ id: 'x' })).toBeNull();
    expect(herCallSpecOf({ id: 'x', herCall: rank2 })).toEqual(rank2);
  });
});

describe('P9e: who may act', () => {
  it('a yielding or balanced unit with a disciplined stance is not a candidate', () => {
    const s = fresh();
    withBond(s, BEA, { leadStyle: 'balanced' });
    withStance(s, reg, ANN, 'disciplined');
    withStance(s, reg, BEA, 'disciplined');
    expect(herCallCandidates(s, reg, rank2, party)).toEqual([]);
    expect(herCallCandidates(s, reg, defiance, party)).toEqual([]);
  });

  it('an assertive unit is a candidate on minLeadRank 2; a dominant one too', () => {
    const s = fresh();
    withBond(s, BEA, { leadStyle: 'assertive' });
    withBond(s, CAT, { leadStyle: 'dominant' });
    expect(herCallCandidates(s, reg, rank2, party)).toEqual([BEA, CAT]);
    expect(herCallCandidates(s, reg, { ...rank2, trigger: { minLeadRank: 3 } }, party)).toEqual([CAT]);
  });

  it('an open_defiance unit at Impunity ≥ minImpunity is a candidate on a stances trigger; below it she is not', () => {
    const s = fresh();
    withStance(s, reg, ANN, 'open_defiance');
    expect(impunityOf(s, reg, ANN)!.value).toBeGreaterThanOrEqual(50);
    expect(herCallCandidates(s, reg, defiance, party)).toEqual([ANN]);
    expect(herCallCandidates(s, reg, { ...defiance, trigger: { stances: ['open_defiance'], minImpunity: 95 } }, party)).toEqual([]);
    // a stance not in the list does not count
    expect(herCallCandidates(s, reg, { ...defiance, trigger: { stances: ['defiant_loyal'], minImpunity: 50 } }, party)).toEqual([]);
    expect(commandStance(s, reg, ANN)).toBe('open_defiance');
  });

  it('grunts, injured units and ask-first units are never candidates', () => {
    const s = fresh();
    for (const id of [ANN, BEA, CAT]) withBond(s, id, { leadStyle: 'dominant' });
    unitOf(s, ANN).status = 'injured';
    s.power = { votes: { log: [], seq: 0 }, askFirst: { [BEA]: s.day } };
    // a grunt in the party: no bond, no candidacy
    const grunt = { ...structuredClone(unitOf(s, DEE)), id: 'grunt_1', kind: 'grunt' as const };
    delete (grunt as { bond?: unknown }).bond;
    s.squad.push(grunt);
    s.relations.grunt_1 = structuredClone(s.relations[DEE]);
    expect(askFirstHolds(s, BEA)).toBe(true);
    expect(askFirstHolds(s, CAT)).toBe(false);
    expect(herCallCandidates(s, reg, rank2, [ANN, BEA, CAT, 'grunt_1'])).toEqual([CAT]);
    // a dead unit, and an id nobody has
    unitOf(s, CAT).status = 'dead';
    expect(herCallCandidates(s, reg, rank2, [ANN, BEA, CAT, 'grunt_1', 'ghost'])).toEqual([]);
  });
});

describe('P9e: the actor weight', () => {
  it('the squad leader weighs exactly twice an identical non-leader', () => {
    const s = fresh();
    for (const id of [ANN, BEA]) {
      withBond(s, id, { leadStyle: 'assertive' });
      setRelation(s, id, { trust: 50 });
    }
    withLeader(s, ANN);
    atImpunity(s, ANN, 55);
    atImpunity(s, BEA, 55);
    expect(actorWeight(s, reg, ANN)).toBe(2 * actorWeight(s, reg, BEA));
  });

  it('weights follow leadBonus and the Impunity band (assertive at high = 2; dominant at brazen = 4.5)', () => {
    const s = fresh();
    withBond(s, ANN, { leadStyle: 'assertive' });
    withBond(s, BEA, { leadStyle: 'dominant' });
    atImpunity(s, ANN, 55);
    atImpunity(s, BEA, 80);
    expect(actorWeight(s, reg, ANN)).toBe((1 + TUNING.herCall.leadBonus.assertive) * TUNING.herCall.band.high);
    expect(actorWeight(s, reg, ANN)).toBe(2);
    expect(actorWeight(s, reg, BEA)).toBe(4.5);
    withBond(s, CAT, { leadStyle: 'yielding' });
    atImpunity(s, CAT, 10);
    expect(actorWeight(s, reg, CAT)).toBe(0.5);
  });
});

describe('P9e: the odds of a good outcome', () => {
  it('values aligned with the good lean raise them, aligned with the bad lean lower them, clamped to 0.15…0.85', () => {
    const s = fresh();
    const odds = () => herCallOdds(s, reg, ANN, rank2);
    expect(odds()).toBe(0.5);
    unitOf(s, ANN).values = { ...ZERO, pragmatism: 1 };
    expect(odds()).toBeCloseTo(0.5 + 0.05 * 2, 10);
    unitOf(s, ANN).values = { ...ZERO, autonomy: 1 };
    expect(odds()).toBeCloseTo(0.5 - 0.05 * 2, 10);
    unitOf(s, ANN).values = { ...ZERO, pragmatism: 3, autonomy: -3 };
    expect(odds()).toBe(0.85);
    unitOf(s, ANN).values = { ...ZERO, pragmatism: -3, autonomy: 3 };
    expect(odds()).toBe(0.15);
  });

  it('a defect of a tilted category shifts the odds by its shift, once per entry', () => {
    const s = fresh();
    const neural = [...reg.defects.values()].filter((d) => d.category === 'neural').slice(0, 2);
    const somatic = [...reg.defects.values()].find((d) => d.category === 'somatic')!;
    expect(neural).toHaveLength(2);
    const spec: HerCallSpec = { ...rank2, defectTilt: [{ category: 'neural', shift: -0.1 }, { category: 'cybernetic', shift: 0.2 }] };
    unitOf(s, ANN).defects = [{ id: somatic.id }];
    expect(herCallOdds(s, reg, ANN, spec)).toBe(0.5);
    unitOf(s, ANN).defects = [{ id: neural[0].id }];
    expect(herCallOdds(s, reg, ANN, spec)).toBeCloseTo(0.4, 10);
    // two defects of the same category: still one tilt
    unitOf(s, ANN).defects = [{ id: neural[0].id }, { id: neural[1].id }];
    expect(herCallOdds(s, reg, ANN, spec)).toBeCloseTo(0.4, 10);
  });
});

describe('P9e: the chance', () => {
  it('is 0.35 at normal, 0.525 at high assertiveness, capped at 0.8', () => {
    const s = fresh();
    expect(herCallChance(s, reg)).toBe(0.35);
    withOptions(s, { squad_assertiveness: 'high' });
    expect(herCallChance(s, reg)).toBeCloseTo(0.525, 10);
    // the cap: a world whose multiplier is huge still stops at chanceCap
    const wide: Registries = {
      ...reg,
      worldOptions: new Map([...reg.worldOptions].map(([id, o]) => [id, id === 'squad_assertiveness'
        ? { ...o, choices: (o.choices as Array<{ id: string; effects: unknown[] }>).map((c) => (c.id === 'high' ? { ...c, effects: [{ ...(c.effects[0] as object), privilegeMult: 3 }] } : c)) }
        : o])),
    };
    expect(herCallChance(s, wide)).toBe(0.8);
  });
});

describe('P9e: the roll and its draws', () => {
  const rngOf = (seed: number) => new Rng(seedRng(seed));
  /** A seed whose first float is below (or not below) `p`. */
  const seedWhere = (below: boolean, p: number): number => {
    for (let seed = 1; seed < 500; seed++) if ((rngOf(seed).float() < p) === below) return seed;
    throw new Error('no seed');
  };

  it('no candidate: rollHerCall returns null and the rng state is unchanged', () => {
    const s = fresh();
    const rng = rngOf(7);
    const before = rng.state;
    expect(rollHerCall(s, reg, rng, rank2, party)).toBeNull();
    expect(rng.state).toEqual(before);
  });

  it('a candidate and a failed chance roll: one draw, null', () => {
    const s = fresh();
    withBond(s, ANN, { leadStyle: 'assertive' });
    const seed = seedWhere(false, TUNING.herCall.chance);
    const rng = rngOf(seed);
    expect(rollHerCall(s, reg, rng, rank2, party)).toBeNull();
    const probe = rngOf(seed);
    probe.float();
    expect(rng.state).toEqual(probe.state);
  });

  it('she acts: exactly three draws (chance, actor, outcome)', () => {
    const s = fresh();
    withBond(s, ANN, { leadStyle: 'assertive' });
    withBond(s, BEA, { leadStyle: 'dominant' });
    const seed = seedWhere(true, TUNING.herCall.chance);
    const rng = rngOf(seed);
    const call = rollHerCall(s, reg, rng, rank2, party);
    expect(call).not.toBeNull();
    expect([ANN, BEA]).toContain(call!.unitId);
    expect(call!.odds).toBe(0.5);
    const probe = rngOf(seed);
    for (let i = 0; i < 3; i++) probe.float();
    expect(rng.state).toEqual(probe.state);
  });

  it('a lone candidate still draws the actor and the outcome', () => {
    const s = fresh();
    withBond(s, CAT, { leadStyle: 'dominant' });
    const seed = seedWhere(true, TUNING.herCall.chance);
    const rng = rngOf(seed);
    expect(rollHerCall(s, reg, rng, rank2, party)!.unitId).toBe(CAT);
    const probe = rngOf(seed);
    for (let i = 0; i < 3; i++) probe.float();
    expect(rng.state).toEqual(probe.state);
  });

  it('the same seed gives the same actor and outcome', () => {
    const s = fresh();
    withBond(s, ANN, { leadStyle: 'assertive' });
    withBond(s, BEA, { leadStyle: 'dominant' });
    withBond(s, CAT, { leadStyle: 'assertive' });
    const seed = seedWhere(true, TUNING.herCall.chance);
    expect(rollHerCall(s, reg, rngOf(seed), rank2, party)).toEqual(rollHerCall(s, reg, rngOf(seed), rank2, party));
  });

  it('the leader is picked about twice as often as an identical soldier', () => {
    const s = fresh();
    for (const id of [ANN, BEA]) withBond(s, id, { leadStyle: 'assertive' });
    withLeader(s, ANN);
    atImpunity(s, ANN, 55);
    atImpunity(s, BEA, 55);
    withOptions(s, { squad_assertiveness: 'high' });
    const tally = { [ANN]: 0, [BEA]: 0 } as Record<string, number>;
    const rng = rngOf(99);
    let acted = 0;
    while (acted < 1500) {
      const call = rollHerCall(s, reg, rng, rank2, party);
      if (call) { tally[call.unitId]++; acted++; }
    }
    const ratio = tally[ANN] / tally[BEA];
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.4);
  });
});
