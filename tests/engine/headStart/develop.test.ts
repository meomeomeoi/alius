import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { crimeChance, developRelation, headStartHash, headStartRaw, impressionOf, rollCrime } from '../../../src/engine/headStart';
import { reactsToCrime } from '../../../src/engine/memory/crime';
import type { CampaignState, Relation, Unit } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
const spreadOf = (seed: number, axis: string): number => (headStartRaw(seed, ANN, `spread:${axis}`) % 7) - 3;
const rel = (over: Partial<Relation> = {}): Relation => ({
  trust: 30, affinity: 10, attraction: 5, stateId: 'stranger', stateSince: -13, history: [], flags: [],
  dailyGain: { trust: 0, affinity: 0, attraction: 0 }, loyaltyBand: 'steady', marks: [], metDay: -13, ...over,
} as Relation);

/** A liquidation campaign (sacrifice and ingroup > 0 react to it) with Ann's values set. */
function world(values: Partial<Unit['values']> = {}, likes: string[] = []): CampaignState {
  const s = campaign(reg, 2, { crimeId: 'liquidation' });
  const ann = s.squad.find((u) => u.id === ANN)!;
  ann.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0, ...values };
  ann.likes = likes;
  return s;
}
const ann = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;

describe('the hash', () => {
  it('is stable, in [0, 1) and differs by unit and key', () => {
    const a = headStartHash(7, ANN, 'crime');
    expect(headStartHash(7, ANN, 'crime')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(headStartHash(7, 'unit_bea', 'crime')).not.toBe(a);
    expect(headStartHash(7, ANN, 'count')).not.toBe(a);
    expect(headStartRaw(7, ANN, 'crime') / 2 ** 32).toBe(a);
  });
});

describe('impressionOf', () => {
  it('reads trust + affinity only', () => {
    expect(impressionOf({ trust: 3, affinity: -3, attraction: 9 })).toBe('neutral');
    expect(impressionOf({ trust: 1, affinity: 0, attraction: 0 })).toBe('positive');
    expect(impressionOf({ trust: -4, affinity: 1, attraction: 0 })).toBe('negative');
  });
});

describe('developRelation', () => {
  it('follows the impression: round(Δ × k) plus a hashed spread, axes with no change stay', () => {
    const r = rel();
    developRelation(r, { trust: 6, affinity: 4, attraction: 0 }, 14, 7, ANN);
    expect(r.trust).toBe(30 + Math.round(6 * 0.8) + spreadOf(7, 'trust'));
    expect(r.affinity).toBe(10 + Math.round(4 * 0.8) + spreadOf(7, 'affinity'));
    expect(r.attraction).toBe(5);
    for (const axis of ['trust', 'affinity']) expect(Math.abs(spreadOf(7, axis))).toBeLessThanOrEqual(3);
  });

  it('a negative impression develops downwards', () => {
    const r = rel();
    developRelation(r, { trust: -8, affinity: 0, attraction: 0 }, 30, 7, ANN);
    expect(r.trust).toBe(30 + Math.round(-8 * 1.2) + spreadOf(7, 'trust'));
    expect(r.trust).toBeLessThan(25);
  });

  it('is deterministic and varies with the seed', () => {
    const run = (seed: number) => { const r = rel(); developRelation(r, { trust: 6, affinity: 6, attraction: 6 }, 7, seed, ANN); return [r.trust, r.affinity, r.attraction]; };
    expect(run(7)).toEqual(run(7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => run(s).join())).size).toBeGreaterThan(1);
  });

  it('axes stay in range', () => {
    const low = rel({ trust: 2, affinity: -98 });
    developRelation(low, { trust: -8, affinity: -8, attraction: 0 }, 30, 7, ANN);
    expect(low.trust).toBe(0);
    expect(low.affinity).toBe(-100);
    const high = rel({ trust: 99, affinity: 99, attraction: 99 });
    developRelation(high, { trust: 8, affinity: 8, attraction: 8 }, 30, 7, ANN);
    expect([high.trust, high.affinity, high.attraction]).toEqual([100, 100, 100]);
  });
});

describe('crime chance', () => {
  it('is 0.25 / 0.4 / 0.6 with no reacting value', () => {
    const s = world();
    expect([7, 14, 30].map((d) => crimeChance(s, reg, ann(s), d as 7 | 14 | 30))).toEqual([0.25, 0.4, 0.6]);
  });

  it('a reacting value multiplies by 1.5, capped at 0.9', () => {
    const s = world({ sacrifice: 2 });
    expect(reactsToCrime(ann(s), reg.crimes.get('liquidation')!)).toBe(true);
    expect(crimeChance(s, reg, ann(s), 7)).toBeCloseTo(0.375, 10);
    expect(crimeChance(s, reg, ann(s), 30)).toBeCloseTo(0.9, 10); // 0.6 × 1.5 sits exactly on the cap
  });

  it('a value of the wrong sign does not react', () => {
    const s = world({ sacrifice: -2, ingroup: 0 });
    expect(reactsToCrime(ann(s), reg.crimes.get('liquidation')!)).toBe(false);
    expect(crimeChance(s, reg, ann(s), 7)).toBe(0.25);
  });

  it('has no curious multiplier', () => {
    const plain = world();
    const curious = world({}, ['secrets']);
    expect(crimeChance(curious, reg, ann(curious), 14)).toBe(crimeChance(plain, reg, ann(plain), 14));
  });
});

describe('rollCrime', () => {
  const hitSeed = (chance: number): number => {
    for (let seed = 1; seed <= 200; seed++) if (headStartHash(seed, ANN, 'crime') < chance) return seed;
    throw new Error('no hit seed');
  };
  const missSeed = (chance: number): number => {
    for (let seed = 1; seed <= 200; seed++) if (headStartHash(seed, ANN, 'crime') >= chance) return seed;
    throw new Error('no miss seed');
  };

  it('a hit reveals the crime with her reaction', () => {
    const s = world({ sacrifice: 2 });
    const seed = hitSeed(0.9);
    const trust = s.relations[ANN].trust;
    expect(rollCrime(s, reg, ann(s), 30, seed)).toBe(true);
    const flags = s.relations[ANN].flags;
    expect(flags).toContain('knows_crime');
    expect(flags).toContain('crime_reaction_done');
    expect(s.relations[ANN].trust).toBeLessThan(trust); // weight −1 × trustPerWeight 3, twice at most
  });

  it('a miss changes nothing', () => {
    const s = world({ sacrifice: 2 });
    const before = structuredClone(s.relations[ANN]);
    expect(rollCrime(s, reg, ann(s), 7, missSeed(0.375))).toBe(false);
    expect(s.relations[ANN]).toEqual(before);
  });

  it('a unit who already knows is not rolled', () => {
    const s = world({ sacrifice: 2 });
    s.relations[ANN].flags.push('knows_crime');
    const before = structuredClone(s.relations[ANN]);
    expect(rollCrime(s, reg, ann(s), 30, hitSeed(0.9))).toBe(false);
    expect(s.relations[ANN]).toEqual(before);
  });
});
