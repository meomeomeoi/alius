import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { leashLog } from '../../../src/engine/leash/weekly';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, cidOf, errors, loadCore, ofType, run, setRelation, startFight, withDefect } from '../../helpers/loyalty';

let reg: Registries; // loyalty_breaking always refuses, so the refusal is certain
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  const core = await loadCore();
  reg = { ...core } as Registries;
  reg.synergies = new Map(core.synergies);
  const b = core.synergies.get('loyalty_breaking')!;
  reg.synergies.set('loyalty_breaking', { ...b, effects: [{ type: 'order_refusal', chance: 1 }] });
  base = campaign(core, 4, { crimeId: 'purge' });
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
    withDefect(base, u.id, 'echo_bleed');
    u.stress = 20;
  }
  setRelation(base, ANN, { band: 'breaking' });
  base.leash.authorizationsLeft = 2;
});

/** A fight where ANN's first `steady` order was refused (she is certain to refuse). */
function refused(over: Parameters<typeof startFight>[2] = {}): CampaignState {
  const fight = startFight(structuredClone(base), reg, over);
  fight.combat!.cp = 3;
  const r = run(fight, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: cidOf(fight, ANN) } });
  expect(errors(r.events)).toEqual([]);
  expect(ofType(r.events, 'order_refused')).toHaveLength(1);
  return r.state;
}
const compel = (s: CampaignState) => run(s, reg, { type: 'combat/compel' });
const stressOf = (s: CampaignState) => s.combat!.combatants.find((c) => c.unitId === ANN)!.stress;
const STRONG = Array.from({ length: 6 }, () => ({ enemyId: 'husk', level: 30, affixes: [] as string[] }));

describe('combat/compel', () => {
  it('a refusal is recorded as the last refusal', () => {
    const s = refused();
    expect(s.combat!.lastRefusal).toEqual({ orderId: 'steady', targetCid: cidOf(s, ANN) });
  });

  it('runs the refused order for free and without a second roll', () => {
    const s = refused();
    const before = stressOf(s);
    const r = compel(s);
    expect(errors(r.events)).toEqual([]);
    const cs = r.state.combat!;
    expect(cs.cp).toBe(s.combat!.cp); // free
    expect(cs.lastRefusal).toBeUndefined();
    expect(cs.compels).toEqual([ANN]);
    // +15 for the burst, −10 from `steady` that now went through (the unit refuses with certainty otherwise)
    expect(stressOf(r.state)).toBe(before + 15 - 10);
    expect(cs.ordersThisRound).toEqual([{ orderId: 'steady', targetCid: cidOf(s, ANN) }]);
    expect(ofType(r.events, 'combat_compelled')).toEqual([{ type: 'combat_compelled', unitId: ANN, cid: cidOf(s, ANN), forced: true }]);
  });

  it('is refused without a refusal, or with every authorization already pledged', () => {
    const fresh = startFight(structuredClone(base), reg);
    expect(compel(fresh).state).toBe(fresh);
    expect(errors(compel(fresh).events)).toHaveLength(1);

    const pledged = refused();
    pledged.combat!.compels = ['unit_bea', 'unit_cat'];
    expect(compel(pledged).state).toBe(pledged);
    const one = refused();
    one.leash.authorizationsLeft = 1;
    one.combat!.compels = ['unit_bea'];
    expect(errors(compel(one).events)).toHaveLength(1);
    one.leash.authorizationsLeft = 2;
    expect(errors(compel(one).events)).toEqual([]);
  });

  it('only the combat and the rng change while the combat is open', () => {
    const s = refused();
    const r = compel(s);
    const strip = (x: CampaignState) => ({ ...x, combat: undefined, rng: undefined });
    expect(strip(r.state)).toEqual(strip(s));
  });

  it('an order after the refusal clears it', () => {
    const s = refused();
    s.combat!.cp = 3;
    const r = run(s, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: cidOf(s, 'unit_bea') } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat!.lastRefusal).toBeUndefined();
    expect(errors(compel(r.state).events)).toHaveLength(1);
  });

  it('a failed burst still counts as a compel but the order does not run', () => {
    const r2 = { ...reg } as Registries;
    r2.defects = new Map(reg.defects);
    r2.defects.set('imprint_fracture', { ...reg.defects.get('imprint_fracture')!, leash: { costMult: 2, failChance: 1 } });
    const fight = startFight(withDefect(structuredClone(base), ANN, 'imprint_fracture'), r2);
    fight.combat!.cp = 3;
    const refusedFight = run(fight, r2, { type: 'combat/order', payload: { orderId: 'steady', targetCid: cidOf(fight, ANN) } }).state;
    const before = stressOf(refusedFight);
    const r = run(refusedFight, r2, { type: 'combat/compel' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat!.compels).toEqual([ANN]);
    expect(stressOf(r.state)).toBe(before + 8); // +15 halved by imprint_fracture's stress_taken (rounded); no steady ran
    expect(ofType(r.events, 'combat_compelled')[0]).toMatchObject({ forced: false });
    expect(r.state.combat!.ordersThisRound).toEqual([]);
  });
});

describe('settling compels', () => {
  it('costs land once, when the combat is finalized', () => {
    let s = refused();
    s = compel(s).state;
    // nothing is charged while the fight runs
    expect(s.leash.authorizationsLeft).toBe(2);
    expect(s.relations[ANN].trust).toBe(60);
    expect(s.leash.log).toEqual([]);
    const r = run(s, reg, { type: 'combat/auto', payload: { on: true } });
    expect(errors(r.events)).toEqual([]);
    const done = r.state;
    expect(done.combat).toBeUndefined();
    expect(done.lastCombat!.outcome).toBe('won');
    expect(done.lastCombat!.compels).toEqual([ANN]);
    expect(done.leash.authorizationsLeft).toBe(1);
    expect(done.relations[ANN].trust).toBe(60 - 15);
    expect(done.relations[ANN].affinity).toBe(20 - 10);
    expect(done.relations[ANN].flags).toContain('leashed');
    expect(leashLog(done)).toMatchObject([{ unitId: ANN, kind: 'compel', context: 'combat', outcome: 'done' }]);
    // her stress was paid at once, not twice
    const unit = done.squad.find((u) => u.id === ANN)!;
    expect(unit.stress).toBeLessThan(100);
    expect(ofType(r.events, 'leash_used')).toHaveLength(1);
  });

  it('a lost fight that is accepted still charges once', () => {
    let s = refused({ enemies: STRONG, allowRetry: true });
    s = compel(s).state;
    s = run(s, reg, { type: 'combat/auto', payload: { on: true } }).state;
    expect(s.combat!.phase).toBe('lost_pending');
    expect(s.leash.authorizationsLeft).toBe(2);
    const r = run(s, reg, { type: 'combat/accept' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.leash.authorizationsLeft).toBe(1);
    expect(leashLog(r.state)).toHaveLength(1);
  });

  it('a retried combat forgets its compels', () => {
    let s = refused({ enemies: STRONG, allowRetry: true });
    s = compel(s).state;
    s = run(s, reg, { type: 'combat/auto', payload: { on: true } }).state;
    expect(s.combat!.phase).toBe('lost_pending');
    const retried = run(s, reg, { type: 'combat/retry' });
    expect(errors(retried.events)).toEqual([]);
    expect(retried.state.combat!.compels ?? []).toEqual([]);
    expect(retried.state.combat!.lastRefusal).toBeUndefined();
    expect(retried.state.leash.authorizationsLeft).toBe(2);
    // leaving the retry fight charges nothing for the discarded attempt
    const left = run(retried.state, reg, { type: 'combat/retreat' });
    expect(errors(left.events)).toEqual([]);
    expect(left.state.leash.authorizationsLeft).toBe(2);
    expect(left.state.relations[ANN].trust).toBe(60);
    expect(leashLog(left.state)).toEqual([]);
  });
});
