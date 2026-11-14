import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx } from '../../../src/engine/combat/effects';
import { issueOrder } from '../../../src/engine/combat/orders';
import { desertionChance } from '../../../src/engine/loyalty/desertion';
import { rawRefusalChance, refusalChance } from '../../../src/engine/loyalty/refusal';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, cidOf, loadCore, setRelation, startFight, withDefect } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
    withDefect(base, u.id, 'echo_bleed');
  }
});

const LEVELS = ['kind', 'guarded', 'prickly', 'volatile', 'hazardous'] as const;
const MULT = { kind: 0.5, guarded: 1, prickly: 1.3, volatile: 1.7, hazardous: 2.0 } as const;
const at = (level: string, tweak: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), disposition: level };
  tweak(s);
  return s;
};

describe('refusal scales with disposition', () => {
  const breaking = (level: string) => at(level, (s) => setRelation(s, ANN, { band: 'breaking' }));

  it.each(LEVELS)('%s: the breaking band chance 0.35 is scaled', (level) => {
    expect(refusalChance(breaking(level), reg, ANN)).toBeCloseTo(0.35 * MULT[level], 12);
    expect(rawRefusalChance(breaking(level), reg, ANN)).toBe(0.35); // the unscaled source, for the reason shown to the player
  });

  it('refusal and desertion scale ×0.5 at kind and ×2 at hazardous, within their clamps: the 0.95 cap', () => {
    const r = { ...reg, synergies: new Map(reg.synergies) } as Registries;
    r.synergies.set('loyalty_breaking', { ...reg.synergies.get('loyalty_breaking')!, effects: [{ type: 'order_refusal', chance: 0.6 }] });
    expect(refusalChance(breaking('hazardous'), r, ANN)).toBe(0.95);
    expect(refusalChance(breaking('volatile'), r, ANN)).toBeCloseTo(0.95, 12);
    expect(refusalChance(breaking('guarded'), r, ANN)).toBe(0.6); // ×1 is the identity
    expect(refusalChance(breaking('kind'), r, ANN)).toBeCloseTo(0.3, 12);
  });

  it('a steady unit that never refuses never refuses, at any level', () => {
    for (const level of LEVELS) expect(refusalChance(at(level), reg, ANN)).toBe(0);
  });

  it('a unit\'s own offset changes only her refusals', () => {
    const s = breaking('guarded');
    s.squad[0].dispositionOffset = 2; // volatile ×1.7
    expect(refusalChance(s, reg, ANN)).toBeCloseTo(0.35 * 1.7, 12);
    setRelation(s, 'unit_bea', { band: 'breaking' });
    expect(refusalChance(s, reg, 'unit_bea')).toBe(0.35);
  });

  describe('in combat', () => {
    function combatRate(s: CampaignState, n: number, seed = 5): number {
      const fight = startFight(s, reg);
      const cs = fight.combat!;
      const cid = cidOf(fight, ANN);
      const ctx = makeCtx(cs, fight, reg, new Rng(seedRng(seed)));
      let refused = 0;
      for (let i = 0; i < n; i++) {
        cs.cp = 5;
        cs.combatants.find((c) => c.cid === cid)!.stress = 0;
        if (!issueOrder(ctx, 'steady', cid)) refused += 1;
      }
      return refused / n;
    }
    it('a breaking unit refuses orders about 17.5% at kind, 35% at guarded and 70% at hazardous', () => {
      expect(Math.abs(combatRate(breaking('kind'), 4000) - 0.175)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(combatRate(breaking('guarded'), 4000) - 0.35)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(combatRate(breaking('hazardous'), 4000) - 0.7)).toBeLessThanOrEqual(0.025);
    });
  });
});

describe('desertion scales with disposition', () => {
  const at5 = (level: string, trust = 5, affinity = 0, stress = 50) => at(level, (s) => {
    setRelation(s, ANN, { trust, affinity });
    s.squad.find((u) => u.id === ANN)!.stress = stress;
  });

  it.each(LEVELS)('%s: trust 5, affinity 0, stress 50 → 0.25 × %s', (level) => {
    expect(desertionChance(at5(level), reg, ANN)).toBeCloseTo(0.25 * MULT[level], 12);
  });

  it('stays inside the 0.03 to 0.6 clamp', () => {
    expect(desertionChance(at5('hazardous', 0, -100, 100), reg, ANN)).toBe(0.6);
    expect(desertionChance(at5('kind', 9, 100, 0), reg, ANN)).toBe(0.03);
    expect(desertionChance(at5('hazardous', 9, 100, 0), reg, ANN)).toBe(0.03);
    expect(desertionChance(at5('kind', 0, -100, 100), reg, ANN)).toBeCloseTo(0.375, 12); // raw 0.75 halved, still above the floor
  });

  it('a unit\'s own offset changes only her desertion chance', () => {
    const s = at5('guarded');
    s.squad.find((u) => u.id === ANN)!.dispositionOffset = -1; // kind ×0.5
    expect(desertionChance(s, reg, ANN)).toBeCloseTo(0.125, 12);
    setRelation(s, 'unit_bea', { trust: 5, affinity: 0 });
    s.squad.find((u) => u.id === 'unit_bea')!.stress = 50;
    expect(desertionChance(s, reg, 'unit_bea')).toBeCloseTo(0.25, 12);
  });
});
