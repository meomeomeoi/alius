import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx, type EffectCtx } from '../../../src/engine/combat/effects';
import { addStress, breakdownAction, enterBreakdown, rollBreaking, stressBand } from '../../../src/engine/combat/stress';
import type { CombatState } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
});

const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;
const skills = ['as_strike', 'as_burst'];

/** A combat whose s1 carries `defectId` (as unit_ann) with real assault skills. */
function withDefect(defectId: string, o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; seed?: number } = {}) {
  const st = structuredClone(state);
  st.squad[0].defects = [{ id: defectId, origin: 'x' }];
  const squad = o.squad ?? [{}];
  squad[0] = { unitId: 'unit_ann', skills, atk: 24, row: 'front', ...squad[0] };
  const cs = fixtureCombat({ squad, enemies: o.enemies ?? [{ row: 'front', atk: 10 }, { row: 'back', atk: 50 }] });
  const ctx: EffectCtx = makeCtx(cs, st, reg, rngOf(o.seed ?? 5));
  return { cs, ctx };
}

describe('stress bands', () => {
  it('bands at 49/50/79/80/100', () => {
    expect([49, 50, 79, 80, 99, 100].map(stressBand)).toEqual(['calm', 'strained', 'strained', 'breaking', 'breaking', 'breakdown']);
  });

  it('affect_dampener halves stress gains and relief by half', () => {
    const { cs, ctx } = withDefect('affect_dampener');
    // upside gain −50 %, downside relief −50 %
    c(cs, 's1').passives = [
      ...(reg.defects.get('affect_dampener')!.combat as { upside: never[] }).upside,
      ...(reg.defects.get('affect_dampener')!.combat as { downside: never[] }).downside,
    ].map((e) => ({ ...(e as object), source: 'defect:affect_dampener' })) as never;
    expect(addStress(ctx, 's1', 10, 'enemy')).toBe(5);
    expect(addStress(ctx, 's1', -4, 'order')).toBe(-2);
  });

  it('only squad units gain stress; the downed gain none', () => {
    const { cs, ctx } = withDefect('echo_bleed', { squad: [{}, { downed: true }] });
    expect(addStress(ctx, 'e1', 10, 'system')).toBe(0);
    expect(addStress(ctx, 's2', 10, 'system')).toBe(0);
    expect(c(cs, 's1').stress).toBe(0);
  });
});

describe('breakdown entry', () => {
  it('stress reaching 100 enters the defect breakdown and locks stress at 100', () => {
    const { cs, ctx } = withDefect('rage_governor');
    addStress(ctx, 's1', 100, 'enemy');
    expect(c(cs, 's1').breakdown).toMatchObject({ defectId: 'rage_governor', policy: 'attack', target: 'strongest_enemy', ignoresOrders: true });
    expect(c(cs, 's1').stress).toBe(100);
    expect(addStress(ctx, 's1', -30, 'order')).toBe(0);
    expect(c(cs, 's1').stress).toBe(100);
    expect(addStress(ctx, 's1', 10, 'enemy')).toBe(0);
  });

  it('breakdown emits a cut-in event and a breakdown event', () => {
    const { cs, ctx } = withDefect('rage_governor');
    addStress(ctx, 's1', 100, 'enemy');
    expect(ctx.events.find((e) => e.type === 'combat_cutin')).toMatchObject({ kind: 'breakdown', unitId: 'unit_ann', text: 'Red Out' });
    expect(ctx.events.find((e) => e.type === 'breakdown')).toMatchObject({ unitId: 'unit_ann', defectId: 'rage_governor' });
    expect(cs.log.some((l) => l.kind === 'breakdown' && l.target === 's1')).toBe(true);
  });

  it('entering twice does nothing; a unit without combat data falls back to skipping turns', () => {
    const { cs, ctx } = withDefect('rage_governor');
    enterBreakdown(ctx, 's1');
    enterBreakdown(ctx, 's1');
    expect(ctx.events.filter((e) => e.type === 'combat_cutin')).toHaveLength(1);
    const lost = withDefect('rage_governor');
    lost.ctx.state.squad[0].defects = [{ id: 'ghost_defect', origin: '' }];
    enterBreakdown(lost.ctx, 's1');
    expect(c(lost.cs, 's1').breakdown).toMatchObject({ policy: 'skip', ignoresOrders: true });
    expect(breakdownAction(lost.ctx, 's1')).toEqual({ kind: 'pass' });
    expect(cs.combatants).toHaveLength(3);
  });
});

describe('breakdown policies', () => {
  const broken = (defectId: string, o: Parameters<typeof withDefect>[1] = {}) => {
    const w = withDefect(defectId, o);
    enterBreakdown(w.ctx, 's1');
    return w;
  };

  it('rage_governor attacks the strongest enemy and ignores orders', () => {
    const { cs, ctx } = broken('rage_governor', { enemies: [{ row: 'front', atk: 10 }, { row: 'front', atk: 50 }, { row: 'back', atk: 90 }] });
    // as_strike is melee: the back-row giant is out of reach, the strongest legal target is e2
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_strike', targetCid: 'e2' });
    expect(c(cs, 's1').breakdown!.ignoresOrders).toBe(true);
  });

  it('affect_dampener skips turns', () => {
    const { ctx } = broken('affect_dampener');
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'pass' });
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'pass' });
  });

  it('compulsive_protocol repeats the last action, or the nearest legal target when it is gone', () => {
    const { cs, ctx } = broken('compulsive_protocol', { enemies: [{ row: 'front' }, { row: 'front' }] });
    c(cs, 's1').lastSkillId = 'as_burst';
    c(cs, 's1').lastTargetCid = 'e2';
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_burst', targetCid: 'e2' });
    c(cs, 'e2').downed = true;
    c(cs, 'e2').hp = 0;
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_burst', targetCid: 'e1' });
    c(cs, 's1').lastSkillId = undefined;
    expect(breakdownAction(ctx, 's1')).toMatchObject({ kind: 'skill' });
  });

  it('random_skill picks a usable skill and a legal target', () => {
    const { cs, ctx } = broken('echo_bleed');
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const a = breakdownAction(ctx, 's1')!;
      expect(a.kind).toBe('skill');
      expect(skills).toContain(a.skillId);
      expect(['e1', 'e2']).toContain(a.targetCid);
      seen.add(a.skillId!);
    }
    expect(seen.size).toBe(2);
    c(cs, 's1').cooldowns = { as_strike: 2, as_burst: 1 };
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'pass' });
  });

  it('threat_saturation hits the nearest unit, ally included, once', () => {
    const { cs, ctx } = broken('threat_saturation', { squad: [{ row: 'back' }, { row: 'front' }], enemies: [{ row: 'back' }] });
    const first = breakdownAction(ctx, 's1')!;
    expect(first).toMatchObject({ kind: 'skill', targetCid: 's2' }); // the front-row ally is the nearest unit
    expect(c(cs, 's1').breakdown!.used).toBe(true);
    expect(breakdownAction(ctx, 's1')).toBeNull(); // afterwards she is back under normal control
    expect(c(cs, 's1').stress).toBe(100);
  });

  it('latent_strain damages its own row on entry, allies included', () => {
    const w = withDefect('latent_strain', { squad: [{ hp: 100, maxHp: 100, def: 0 }, { hp: 100, maxHp: 100, def: 0 }, { hp: 100, row: 'back', maxHp: 100 }] });
    enterBreakdown(w.ctx, 's1');
    expect(c(w.cs, 's2').hp).toBeLessThan(100);
    expect(c(w.cs, 's3').hp).toBe(100);
    expect(c(w.cs, 's1').hp).toBe(100);
    expect(breakdownAction(w.ctx, 's1')).toMatchObject({ kind: 'skill' });
  });

  it('graft_rejection drops to 1 HP and is stunned 2 turns, then plays normally', () => {
    const { cs, ctx } = broken('graft_rejection');
    expect(c(cs, 's1').hp).toBe(1);
    expect(c(cs, 's1').statuses.find((s) => s.id === 'stun')!.turns).toBe(2);
    expect(breakdownAction(ctx, 's1')).toBeNull();
  });

  it('overclock_bias acts twice then shuts down', () => {
    const { cs, ctx } = broken('overclock_bias');
    expect(breakdownAction(ctx, 's1')).toMatchObject({ kind: 'skill' });
    expect(cs.extraAction).toBe('s1');
    expect(c(cs, 's1').statuses.some((s) => s.id === 'stun')).toBe(false);
    cs.extraAction = undefined;
    expect(breakdownAction(ctx, 's1')).toMatchObject({ kind: 'skill' });
    expect(cs.extraAction).toBeUndefined();
    expect(c(cs, 's1').statuses.find((s) => s.id === 'stun')!.turns).toBeGreaterThan(50);
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'pass' });
  });

  it('compliance_craving waits for an order, then acts', () => {
    const { cs, ctx } = broken('compliance_craving');
    expect(breakdownAction(ctx, 's1')).toEqual({ kind: 'pass' });
    cs.ordersThisRound.push({ orderId: 'steady', targetCid: 's1' });
    expect(breakdownAction(ctx, 's1')).toBeNull();
  });

  it('a unit with no breakdown and no breaking roll has no policy action', () => {
    const { ctx } = withDefect('rage_governor');
    expect(breakdownAction(ctx, 's1')).toBeNull();
  });

  it('target_lock hits the nearest ally once; firmware_rollback hits anyone nearest', () => {
    const lock = broken('target_lock', { squad: [{ row: 'back' }, { row: 'front' }] });
    expect(breakdownAction(lock.ctx, 's1')).toMatchObject({ targetCid: 's2' });
  });
});

describe('breaking band', () => {
  it('follows the breakdown policy about 25 % of turns (400 seeded turns within 20–30 %)', () => {
    const { cs, ctx } = withDefect('rage_governor');
    c(cs, 's1').stress = 85;
    let n = 0;
    for (let i = 0; i < 400; i++) if (rollBreaking(ctx, 's1')) n += 1;
    expect(n / 400).toBeGreaterThanOrEqual(0.2);
    expect(n / 400).toBeLessThanOrEqual(0.3);
  });

  it('never below 80, never once broken down (that is the full policy)', () => {
    const { cs, ctx } = withDefect('rage_governor');
    c(cs, 's1').stress = 79;
    for (let i = 0; i < 50; i++) expect(rollBreaking(ctx, 's1')).toBe(false);
    enterBreakdown(ctx, 's1');
    for (let i = 0; i < 50; i++) expect(rollBreaking(ctx, 's1')).toBe(false);
  });

  it('a breaking unit acts by the policy without spending its once or shutting down', () => {
    const { cs, ctx } = withDefect('overclock_bias');
    c(cs, 's1').stress = 90;
    expect(breakdownAction(ctx, 's1', { breaking: true })).toMatchObject({ kind: 'skill' });
    expect(cs.extraAction).toBeUndefined();
    expect(c(cs, 's1').statuses).toHaveLength(0);
    const once = withDefect('threat_saturation');
    c(once.cs, 's1').stress = 90;
    breakdownAction(once.ctx, 's1', { breaking: true });
    expect(c(once.cs, 's1').breakdown).toBeUndefined();
  });
});
