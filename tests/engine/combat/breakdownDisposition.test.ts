import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { makeCtx, type EffectCtx } from '../../../src/engine/combat/effects';
import { addStress, breakdownAction, enterBreakdown, makeBreakdown } from '../../../src/engine/combat/stress';
import { performAction } from '../../../src/engine/combat/turn';
import type { CombatState } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, loadCore } from '../../helpers/world';
import { cidOf, startFight } from '../../helpers/loyalty';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
});

const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;
const skills = ['as_strike', 'as_burst'];
const COMMANDER = { hp: 40, maxHp: 40, def: 5, coverId: 's2', downed: false };

/** A broken-down s1 (unit_ann) with `defectId`, at the given world disposition (and her own offset). */
function broken(defectId: string, level: string, o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; offset?: number; commander?: Partial<typeof COMMANDER> | null; seed?: number } = {}) {
  const st = structuredClone(state);
  st.world.options = { ...(st.world.options ?? {}), disposition: level };
  st.squad[0].defects = [{ id: defectId, origin: 'x' }];
  if (o.offset !== undefined) st.squad[0].dispositionOffset = o.offset;
  const squad: FixtureCombatant[] = o.squad ?? [{}, { row: 'front' }];
  squad[0] = { unitId: 'unit_ann', skills, atk: 24, row: 'front', ...squad[0] };
  const cs = fixtureCombat({ squad, enemies: o.enemies ?? [{ row: 'front', atk: 10 }, { row: 'front', atk: 50 }] });
  if (o.commander !== null && o.commander !== undefined) cs.commander = { ...COMMANDER, ...o.commander };
  const ctx: EffectCtx = makeCtx(cs, st, reg, rngOf(o.seed ?? 5));
  enterBreakdown(ctx, 's1');
  return { cs, ctx, st };
}

/** Targets chosen over many breakdown actions. */
const targets = (w: ReturnType<typeof broken>, n = 120): Set<string> => {
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const a = breakdownAction(w.ctx, 's1')!;
    seen.add(a.kind === 'skill' ? String(a.targetCid) : a.kind);
  }
  return seen;
};

describe('breakdown target follows disposition', () => {
  it('guarded keeps the defect\'s own target', () => {
    const w = broken('rage_governor', 'guarded');
    expect(c(w.cs, 's1').breakdown).toMatchObject({ policy: 'attack', target: 'strongest_enemy' });
    expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_strike', targetCid: 'e2' });
  });

  it('kind: an attacking breakdown hurts herself for 10% and never below 1 HP', () => {
    const w = broken('rage_governor', 'kind', { squad: [{ hp: 100, maxHp: 100 }, {}] });
    expect(c(w.cs, 's1').breakdown!.target).toBe('self');
    const action = breakdownAction(w.ctx, 's1')!;
    expect(action).toEqual({ kind: 'self_harm' });
    performAction(w.ctx, 's1', action, { trusted: true });
    expect(c(w.cs, 's1').hp).toBe(100 - Math.round((100 * TUNING.disposition.selfHarmPct) / 100));
    expect(w.cs.log.at(-1)).toMatchObject({ kind: 'self_harm', actor: 's1', amount: 10 });
    // enemies and allies are untouched
    expect(c(w.cs, 's2').hp).toBe(c(w.cs, 's2').maxHp);
    expect(c(w.cs, 'e1').hp).toBe(c(w.cs, 'e1').maxHp);
    // never below 1 HP, and at 1 HP nothing is lost
    c(w.cs, 's1').hp = 4;
    performAction(w.ctx, 's1', action, { trusted: true });
    expect(c(w.cs, 's1').hp).toBe(1);
    performAction(w.ctx, 's1', action, { trusted: true });
    expect(c(w.cs, 's1').hp).toBe(1);
    expect(c(w.cs, 's1').downed).toBe(false);
  });

  it('self-harm costs at least 1 HP on a tiny pool', () => {
    const w = broken('rage_governor', 'kind', { squad: [{ hp: 6, maxHp: 6 }, {}] });
    performAction(w.ctx, 's1', { kind: 'self_harm' }, { trusted: true });
    expect(c(w.cs, 's1').hp).toBe(5);
  });

  it('prickly hits the nearest ally', () => {
    const w = broken('rage_governor', 'prickly', { squad: [{}, { row: 'front' }, { row: 'back' }] });
    expect(c(w.cs, 's1').breakdown!.target).toBe('nearest_ally');
    for (let i = 0; i < 20; i++) expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_strike', targetCid: 's2' });
  });

  it('volatile may pick the exposed commander and never a downed one', () => {
    const exposed = broken('rage_governor', 'volatile', { commander: {} });
    expect(c(exposed.cs, 's1').breakdown!.target).toBe('allies_commander');
    expect(targets(exposed)).toEqual(new Set(['s2', 'commander']));
    const downed = broken('rage_governor', 'volatile', { commander: { downed: true } });
    expect(targets(downed)).toEqual(new Set(['s2']));
    const hidden = broken('rage_governor', 'volatile', { commander: null });
    expect(targets(hidden)).toEqual(new Set(['s2']));
  });

  it('volatile makes no rng draw when the commander is not a candidate', () => {
    const w = broken('rage_governor', 'volatile', { commander: null });
    const before = w.ctx.rng.state;
    breakdownAction(w.ctx, 's1');
    expect(w.ctx.rng.state).toEqual(before);
  });

  it('hazardous picks among everyone standing, herself and the downed excluded', () => {
    const w = broken('rage_governor', 'hazardous', { commander: {}, squad: [{}, { row: 'front' }, { downed: true }], enemies: [{ row: 'front' }, { row: 'front', downed: true }, { row: 'front' }] });
    expect(c(w.cs, 's1').breakdown!.target).toBe('everyone');
    expect(targets(w, 200)).toEqual(new Set(['s2', 'e1', 'e3', 'commander']));
  });

  it('a unit\'s own offset changes only her target', () => {
    const w = broken('rage_governor', 'guarded', { offset: -1 }); // kind
    expect(c(w.cs, 's1').breakdown!.target).toBe('self');
    const other = broken('rage_governor', 'guarded', { offset: 0 });
    expect(c(other.cs, 's1').breakdown!.target).toBe('strongest_enemy');
  });

  it('a skip-policy breakdown is unchanged at every level', () => {
    for (const level of ['kind', 'guarded', 'prickly', 'volatile', 'hazardous']) {
      const w = broken('affect_dampener', level);
      expect(c(w.cs, 's1').breakdown, level).toMatchObject({ policy: 'skip' });
      expect(c(w.cs, 's1').breakdown!.target, level).toBeUndefined();
      expect(breakdownAction(w.ctx, 's1'), level).toEqual({ kind: 'pass' });
    }
    // random_skill and normal policies too
    expect(c(broken('echo_bleed', 'kind').cs, 's1').breakdown!.target).toBeUndefined();
    expect(c(broken('graft_rejection', 'hazardous').cs, 's1').breakdown!.target).toBeUndefined();
  });

  it('the repeat_last fallback follows disposition, a repeated skill does not', () => {
    const w = broken('compulsive_protocol', 'kind');
    expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'self_harm' }); // nothing to repeat: the fallback attack
    c(w.cs, 's1').lastSkillId = 'as_burst';
    c(w.cs, 's1').lastTargetCid = 'e2';
    expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'skill', skillId: 'as_burst', targetCid: 'e2' });
    const p = broken('compulsive_protocol', 'prickly');
    expect(breakdownAction(p.ctx, 's1')).toMatchObject({ kind: 'skill', targetCid: 's2' });
  });

  it('twice_then_shutdown follows disposition for both attacks', () => {
    const w = broken('overclock_bias', 'kind');
    expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'self_harm' });
    expect(w.cs.extraAction).toBe('s1');
    w.cs.extraAction = undefined;
    expect(breakdownAction(w.ctx, 's1')).toEqual({ kind: 'self_harm' });
  });

  it('a breaking turn (80 to 99 stress) follows the same target', () => {
    const st = structuredClone(state);
    st.world.options = { ...(st.world.options ?? {}), disposition: 'kind' };
    st.squad[0].defects = [{ id: 'rage_governor', origin: 'x' }];
    const cs = fixtureCombat({ squad: [{ unitId: 'unit_ann', skills, stress: 85 }, {}], enemies: [{}] });
    const ctx = makeCtx(cs, st, reg, rngOf(3));
    expect(breakdownAction(ctx, 's1', { breaking: true })).toEqual({ kind: 'self_harm' });
  });

  it('a hit on the commander by a broken-down unit lands (cover takes it) and the fight goes on', () => {
    const w = broken('rage_governor', 'hazardous', { commander: {}, squad: [{}, { row: 'front', hp: 100, maxHp: 100 }], enemies: [{}] });
    performAction(w.ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'commander' }, { trusted: true });
    expect(w.cs.log.some((l) => l.kind === 'cover' && l.target === 'commander')).toBe(true);
  });
});

describe('a breakdown restored from the unit (a new combat)', () => {
  it('makeBreakdown writes the level\'s target for attacking policies only', () => {
    const lv = (id: string) => reg.dispositionLevels.get(id) as never;
    expect(makeBreakdown(reg, 'rage_governor', lv('hazardous')).target).toBe('everyone');
    expect(makeBreakdown(reg, 'rage_governor', lv('guarded')).target).toBe('strongest_enemy');
    expect(makeBreakdown(reg, 'rage_governor').target).toBe('strongest_enemy');
    expect(makeBreakdown(reg, 'affect_dampener', lv('kind')).target).toBeUndefined();
  });

  it('combat/start gives a unit that carries a breakdown the target of her level', () => {
    const st = structuredClone(state);
    st.world.options = { ...(st.world.options ?? {}), disposition: 'volatile' };
    st.squad[0].defects = [{ id: 'rage_governor', origin: 'x' }];
    st.squad[0].breakdown = { defectId: 'rage_governor', day: 1 };
    const fight = startFight(st, reg);
    const ann = fight.combat!.combatants.find((x) => x.cid === cidOf(fight, 'unit_ann'))!;
    expect(ann.breakdown).toMatchObject({ defectId: 'rage_governor', target: 'allies_commander' });
  });

  it('addStress to 100 enters the breakdown with the level\'s target', () => {
    const st = structuredClone(state);
    st.world.options = { ...(st.world.options ?? {}), disposition: 'kind' };
    st.squad[0].defects = [{ id: 'rage_governor', origin: 'x' }];
    const cs = fixtureCombat({ squad: [{ unitId: 'unit_ann', skills }, {}], enemies: [{}] });
    const ctx = makeCtx(cs, st, reg, rngOf(2));
    addStress(ctx, 's1', 100, 'enemy');
    expect(c(cs, 's1').breakdown!.target).toBe('self');
  });
});
