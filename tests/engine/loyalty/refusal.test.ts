import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx } from '../../../src/engine/combat/effects';
import { issueOrder } from '../../../src/engine/combat/orders';
import { refusalChance } from '../../../src/engine/loyalty/refusal';
import { Rng, seedRng } from '../../../src/engine/rng';
import { getSynergies } from '../../../src/engine/relations';
import type { CampaignState, LoyaltyBand } from '../../../src/engine/state/types';
import { campaign, cidOf, errors, loadCore, ofType, run, setRelation, startFight, withDefect } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
const BEA = 'unit_bea';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
    withDefect(base, u.id, 'echo_bleed');
  }
});

const clone = () => structuredClone(base);
const band = (b: LoyaltyBand, stateId = 'comrade'): CampaignState => setRelation(clone(), ANN, { band: b, stateId });

/** Refusal rate of ANN's real combatant (built by the engine, band synergy included) over `n` seeded orders. */
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

describe('band refusals in combat', () => {
  it('a wavering unit refuses about 15 % of 4000 seeded orders and a breaking one about 35 %', () => {
    expect(Math.abs(combatRate(band('wavering'), 4000) - 0.15)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(combatRate(band('breaking'), 4000) - 0.35)).toBeLessThanOrEqual(0.02);
  });

  it('a steady unit in a neutral state never refuses', () => {
    expect(combatRate(band('steady'), 1000)).toBe(0);
  });

  it('getSynergies adds the band synergy next to the state ones', () => {
    expect(getSynergies(band('wavering'), reg, [ANN])).toContainEqual({ unitId: ANN, synergyId: 'loyalty_wavering' });
    expect(getSynergies(band('breaking'), reg, [ANN])).toContainEqual({ unitId: ANN, synergyId: 'loyalty_breaking' });
    expect(getSynergies(band('steady'), reg, [ANN]).map((s) => s.synergyId)).not.toContain('loyalty_wavering');
  });

  it('a band whose synergy vanished from the content adds nothing', () => {
    const r = { ...reg } as Registries;
    r.synergies = new Map(reg.synergies);
    r.synergies.delete('loyalty_breaking');
    expect(getSynergies(band('breaking'), r, [ANN]).map((s) => s.synergyId)).not.toContain('loyalty_breaking');
  });
});

describe('refusalChance', () => {
  it('is the band chance for a neutral state', () => {
    expect(refusalChance(band('steady'), reg, ANN)).toBe(0);
    expect(refusalChance(band('wavering'), reg, ANN)).toBe(0.15);
    expect(refusalChance(band('breaking'), reg, ANN)).toBe(0.35);
  });

  it('the higher of band and state friction wins', () => {
    expect(refusalChance(band('wavering', 'despises'), reg, ANN)).toBe(0.35);
    expect(refusalChance(band('wavering', 'estranged'), reg, ANN)).toBe(0.25);
    expect(refusalChance(band('breaking', 'resentful'), reg, ANN)).toBe(0.35);
    expect(refusalChance(band('steady', 'resentful'), reg, ANN)).toBe(0.15);
  });

  it('defect downsides count, strained ones amplified', () => {
    const s = withDefect(band('steady'), ANN, 'imprint_fracture');
    expect(refusalChance(s, reg, ANN)).toBeCloseTo(0.1);
    s.squad.find((u) => u.id === ANN)!.stress = 60;
    expect(refusalChance(s, reg, ANN)).toBeCloseTo(0.15);
  });

  it('an effect limited to named orders only counts for those orders', () => {
    const s = withDefect(band('steady'), ANN, 'rage_governor');
    expect(refusalChance(s, reg, ANN)).toBe(0);
    expect(refusalChance(s, reg, ANN, 'steady')).toBe(0);
    expect(refusalChance(s, reg, ANN, 'hold_the_line')).toBeCloseTo(0.25);
  });
});

describe('scene orders', () => {
  const inScene = (s: CampaignState, ids = [ANN, BEA]): CampaignState => {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const order = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'scene/order', payload: { unitId } });
  /** The first seed in 1…80 whose state gives the wanted verdict. */
  function seeded(s: CampaignState, refused: boolean): ReturnType<typeof order> {
    for (let seed = 1; seed <= 80; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      const out = order(t);
      if (errors(out.events).length === 0 && ofType(out.events, 'scene_order')[0].refused === refused) return out;
    }
    throw new Error('no seed found');
  }

  it('scene/order needs an open scene with her', () => {
    const none = band('breaking');
    expect(order(none).state).toBe(none);
    expect(errors(order(none).events)).toHaveLength(1);
    const elsewhere = inScene(band('breaking'), [BEA]);
    expect(errors(order(elsewhere).events)).toHaveLength(1);
  });

  it('a steady unit complies and reports the chance', () => {
    const r = order(inScene(band('steady')));
    expect(ofType(r.events, 'scene_order')).toEqual([{ type: 'scene_order', unitId: ANN, refused: false, chance: 0 }]);
    expect(r.state.scene!.refusals ?? []).toEqual([]);
  });

  it('a refused order is remembered and a second order waits for the next exchange', () => {
    const s = inScene(band('breaking'));
    const first = seeded(s, true);
    expect(ofType(first.events, 'scene_order')).toEqual([{ type: 'scene_order', unitId: ANN, refused: true, chance: 0.35 }]);
    expect(first.state.scene!.refusals).toEqual([{ unitId: ANN, exchange: 0 }]);
    const again = order(first.state);
    expect(again.state).toBe(first.state);
    expect(errors(again.events)).toMatchObject([{ message: 'She has already refused: wait for her answer.' }]);
    // the next exchange lifts the block
    const next = structuredClone(first.state);
    next.scene!.exchanges = 1;
    expect(errors(order(next).events)).toEqual([]);
  });

  it('a compliance clears an older refusal of hers', () => {
    const s = inScene(band('steady'));
    s.scene!.refusals = [{ unitId: ANN, exchange: 0 }, { unitId: BEA, exchange: 0 }];
    s.scene!.exchanges = 1;
    const r = order(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.refusals).toEqual([{ unitId: BEA, exchange: 0 }]);
  });

  it('leash/compel in a scene needs a standing refusal and clears it', () => {
    const s = inScene(band('breaking'));
    expect(errors(run(s, reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } }).events)).toHaveLength(1);
    const refused = seeded(s, true).state;
    const r = run(refused, reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.refusals).toEqual([]);
    // she may be ordered again at once
    expect(errors(order(r.state).events)).toEqual([]);
  });
});
