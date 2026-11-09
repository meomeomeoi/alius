import { describe, expect, it } from 'vitest';
import { initiativeOrder, rollCrit, rollDamage } from '../../../src/engine/combat/formulas';
import { Rng, seedRng } from '../../../src/engine/rng';
import { fixtureCombat, rngOf } from '../../helpers/combat';

describe('rollDamage', () => {
  it('matches the formula at fixed rng', () => {
    const f = new Rng(seedRng(4)).float();
    const expected = Math.round(24 * 1 * (100 / 112) * (0.9 + 0.2 * f));
    expect(rollDamage(rngOf(4), { atk: 24, mult: 1, def: 12, crit: false })).toBe(expected);
    const r = rngOf(8);
    for (let i = 0; i < 500; i++) {
      const d = rollDamage(r, { atk: 24, mult: 1, def: 12, crit: false });
      expect(d).toBeGreaterThanOrEqual(19);
      expect(d).toBeLessThanOrEqual(24);
    }
  });

  it('crit multiplies by 1.5', () => {
    const plain = rollDamage(rngOf(2), { atk: 100, mult: 1, def: 0, crit: false });
    const crit = rollDamage(rngOf(2), { atk: 100, mult: 1, def: 0, crit: true });
    expect(crit).toBe(Math.round(plain * 1.5));
  });

  it('damage is at least 1', () => {
    expect(rollDamage(rngOf(), { atk: 1, mult: 0.1, def: 400, crit: false })).toBe(1);
  });

  it('draws exactly one number', () => {
    const a = rngOf(6);
    rollDamage(a, { atk: 10, mult: 1, def: 0, crit: false });
    const b = rngOf(6);
    b.float();
    expect(a.state).toEqual(b.state);
  });
});

describe('rollCrit', () => {
  it('crit chance 0 never crits, 100 always', () => {
    const r = rngOf(3);
    for (let i = 0; i < 300; i++) {
      expect(rollCrit(r, 0)).toBe(false);
      expect(rollCrit(r, 100)).toBe(true);
    }
  });

  it('crit chance 25 crits about a quarter of the time', () => {
    const r = rngOf(5);
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollCrit(r, 25)) n += 1;
    expect(n / 4000).toBeGreaterThan(0.22);
    expect(n / 4000).toBeLessThan(0.28);
  });
});

describe('initiativeOrder', () => {
  it('orders by SPD plus 0–3', () => {
    const cs = fixtureCombat({ squad: [{ spd: 10 }, { spd: 30 }], enemies: [{ spd: 20 }] });
    // SPD gaps larger than the 0–3 roll are decisive
    expect(initiativeOrder(cs, rngOf())).toEqual(['s2', 'e1', 's1']);
  });

  it('adds a 0–3 roll: close SPDs swap sometimes', () => {
    const seen = new Set<string>();
    const r = rngOf(12);
    for (let i = 0; i < 60; i++) {
      seen.add(initiativeOrder(fixtureCombat({ squad: [{ spd: 10 }, { spd: 11 }], enemies: [] }), r).join());
    }
    expect(seen).toEqual(new Set(['s1,s2', 's2,s1']));
  });

  it('ties: squad first, then base SPD, then index', () => {
    // a spd-12 + roll 0 enemy ties a spd-10 + roll 2 squad unit; force equal keys via a constant spdOf
    const cs = fixtureCombat({ squad: [{ spd: 10 }, { spd: 14 }], enemies: [{ spd: 12 }, { spd: 12 }] });
    const flat = () => 0;
    const noRoll = { int: () => 0, float: () => 0 } as unknown as Parameters<typeof initiativeOrder>[1];
    expect(initiativeOrder(cs, noRoll, flat)).toEqual(['s2', 's1', 'e1', 'e2']);
    // equal keys everywhere: squad before enemy, higher base SPD first inside a side, then lower index
    const same = fixtureCombat({ squad: [{ spd: 10 }, { spd: 10 }], enemies: [{ spd: 10 }] });
    expect(initiativeOrder(same, noRoll)).toEqual(['s1', 's2', 'e1']);
  });

  it('downed units have no initiative', () => {
    const cs = fixtureCombat({ squad: [{ spd: 10 }, { downed: true }], enemies: [{ spd: 5 }] });
    expect(initiativeOrder(cs, rngOf())).toEqual(['s1', 'e1']);
  });
});
