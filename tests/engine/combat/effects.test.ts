import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import {
  activePassives, amplify, applyEffects, applyStatus, checkCondition, clearRoundLimits, dealDamage, effectiveStat,
  expireStatuses, fireTrigger, incomingPct, makeCtx, outgoingPct, tickStatuses, type EffectCtx,
} from '../../../src/engine/combat/effects';
import { addStress } from '../../../src/engine/combat/stress';
import type { CombatState, EffectSpec } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let state: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  state = campaign(reg, 4);
});

const P = (e: Record<string, unknown>, source = 'test') => ({ ...e, source }) as unknown as EffectSpec & { source: string };
const setup = (o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; seed?: number } = {}) => {
  const cs = fixtureCombat(o);
  const ctx = makeCtx(cs, structuredClone(state), reg, rngOf(o.seed ?? 3));
  return { cs, ctx };
};
const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;
const has = (cs: CombatState, cid: string, status: string) => c(cs, cid).statuses.some((s) => s.id === status);

describe('triggers', () => {
  it('onCombatStart', () => {
    const { cs, ctx } = setup({ squad: [{ passives: [P({ type: 'stat', stat: 'atk', pct: 50, turns: 2, trigger: 'onCombatStart' })] }] });
    fireTrigger(ctx, 'onCombatStart', {});
    expect(effectiveStat(ctx, 's1', 'atk')).toBe(30);
    expect(cs.combatants[0].mods).toHaveLength(1);
  });

  it('onRoundStart', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 50, maxHp: 100, passives: [P({ type: 'heal', pctMaxHp: 10, trigger: 'onRoundStart' })] }] });
    fireTrigger(ctx, 'onRoundStart', {});
    expect(c(cs, 's1').hp).toBe(60);
  });

  it('onTurnStart fires for the actor only', () => {
    const passive = P({ type: 'heal', pctMaxHp: 10, trigger: 'onTurnStart' });
    const { cs, ctx } = setup({ squad: [{ hp: 50, maxHp: 100, passives: [passive] }, { hp: 50, maxHp: 100, passives: [passive] }] });
    fireTrigger(ctx, 'onTurnStart', { actorCid: 's2' });
    expect([c(cs, 's1').hp, c(cs, 's2').hp]).toEqual([50, 60]);
  });

  it('onAction', () => {
    const { cs, ctx } = setup({ squad: [{ passives: [P({ type: 'cp', amount: 1, trigger: 'onAction' })] }] });
    fireTrigger(ctx, 'onAction', { actorCid: 's1' });
    expect(cs.cp).toBe(2);
  });

  it('onHit applies a status to the target', () => {
    const { cs, ctx } = setup({ squad: [{ passives: [P({ type: 'status', statusId: 'burn', trigger: 'onHit', target: 'target' })] }] });
    dealDamage(ctx, 's1', 'e1', 1);
    expect(has(cs, 'e1', 'burn')).toBe(true);
  });

  it('onCrit', () => {
    const { cs, ctx } = setup({ squad: [{ crit: 100, passives: [P({ type: 'cp', amount: 2, trigger: 'onCrit' })] }] });
    dealDamage(ctx, 's1', 'e1', 1);
    expect(cs.cp).toBe(3);
    const noCrit = setup({ squad: [{ crit: 0, passives: [P({ type: 'cp', amount: 2, trigger: 'onCrit' })] }] });
    dealDamage(noCrit.ctx, 's1', 'e1', 1);
    expect(noCrit.cs.cp).toBe(1);
  });

  it('onDamaged fires for the victim with the attacker as source', () => {
    const { cs, ctx } = setup({
      squad: [{ passives: [P({ type: 'status', statusId: 'mark', trigger: 'onDamaged', target: 'source' })] }],
    });
    dealDamage(ctx, 'e1', 's1', 1);
    expect(has(cs, 'e1', 'mark')).toBe(true);
  });

  it('onAllyDowned fires for the downed unit allies and for the downed unit itself', () => {
    const { cs, ctx } = setup({
      squad: [{ hp: 1 }, { passives: [P({ type: 'stat', stat: 'atk', pct: 20, turns: 3, trigger: 'onAllyDowned' })] }],
      enemies: [{ atk: 80, passives: [] }],
    });
    dealDamage(ctx, 'e1', 's1', 2);
    expect(c(cs, 's1').downed).toBe(true);
    expect(effectiveStat(ctx, 's2', 'atk')).toBe(24);
    // volatile: the exploding unit's own downing hits the killer's row
    const v = setup({
      squad: [{ hp: 200, def: 0 }],
      enemies: [{ hp: 1, passives: [P({ type: 'damage', mult: 1, trigger: 'onAllyDowned', target: 'target_row' })] }],
    });
    dealDamage(v.ctx, 's1', 'e1', 1);
    expect(c(v.cs, 's1').hp).toBeLessThan(200);
  });

  it('onKill fires for the killer', () => {
    const { cs, ctx } = setup({
      squad: [{ hp: 50, maxHp: 100, atk: 200, passives: [P({ type: 'heal', pctMaxHp: 20, trigger: 'onKill' })] }],
      enemies: [{ hp: 1 }],
    });
    dealDamage(ctx, 's1', 'e1', 1);
    expect(c(cs, 'e1').downed).toBe(true);
    expect(c(cs, 's1').hp).toBe(70);
  });

  it('onStressThreshold 50/80/100 fire once when crossing upward', () => {
    const passives = [50, 80, 100].map((t) => P({ type: 'cp', amount: 1, trigger: 'onStressThreshold', threshold: t }, `t${t}`));
    const { cs, ctx } = setup({ squad: [{ passives }] });
    addStress(ctx, 's1', 49, 'enemy');
    expect(cs.cp).toBe(1);
    addStress(ctx, 's1', 1, 'enemy');
    expect(cs.cp).toBe(2);
    addStress(ctx, 's1', 5, 'enemy');
    expect(cs.cp).toBe(2);
    addStress(ctx, 's1', 25, 'enemy');
    expect(cs.cp).toBe(3);
    addStress(ctx, 's1', -20, 'order');
    addStress(ctx, 's1', 20, 'enemy');
    expect(cs.cp).toBe(4);
    addStress(ctx, 's1', 50, 'enemy');
    expect(c(cs, 's1').stress).toBe(100);
    expect(cs.cp).toBe(5);
    addStress(ctx, 's1', 10, 'enemy');
    expect(cs.cp).toBe(5);
  });

  it('onCombatEnd', () => {
    const { cs, ctx } = setup({ squad: [{ passives: [P({ type: 'cp', amount: 1, trigger: 'onCombatEnd' })] }] });
    fireTrigger(ctx, 'onCombatEnd', {});
    expect(cs.cp).toBe(2);
  });

  it('scope ally onCrit fires for a friend\'s crit, not her own', () => {
    const passive = P({ type: 'follow_up', mult: 0.5, trigger: 'onCrit', scope: 'ally', target: 'target' });
    const { cs, ctx } = setup({ squad: [{ crit: 100 }, { crit: 100, passives: [passive] }], enemies: [{ hp: 1000, maxHp: 1000 }] });
    dealDamage(ctx, 's1', 'e1', 1);
    expect(cs.log.filter((l) => l.actor === 's2' && l.kind !== 'stress')).toHaveLength(1);
    cs.log.length = 0;
    dealDamage(ctx, 's2', 'e1', 1);
    expect(cs.log.filter((l) => l.actor === 's2' && (l.kind === 'hit' || l.kind === 'crit'))).toHaveLength(1); // only her own hit
  });

  it('limit round fires once per round, limit combat once per combat', () => {
    const passive = (limit: string) => P({ type: 'cp', amount: 1, trigger: 'onAction', limit });
    const a = setup({ squad: [{ passives: [passive('round')] }] });
    fireTrigger(a.ctx, 'onAction', { actorCid: 's1' });
    fireTrigger(a.ctx, 'onAction', { actorCid: 's1' });
    expect(a.cs.cp).toBe(2);
    clearRoundLimits(a.cs);
    fireTrigger(a.ctx, 'onAction', { actorCid: 's1' });
    expect(a.cs.cp).toBe(3);
    const b = setup({ squad: [{ passives: [passive('combat')] }] });
    fireTrigger(b.ctx, 'onAction', { actorCid: 's1' });
    clearRoundLimits(b.cs);
    fireTrigger(b.ctx, 'onAction', { actorCid: 's1' });
    expect(b.cs.cp).toBe(2);
  });
});

describe('conditions', () => {
  const holds = (squad: FixtureCombatant[], when: Record<string, unknown>, o: { target?: string; skill?: string; mutate?: (cs: CombatState) => void } = {}) => {
    const { cs, ctx } = setup({ squad, enemies: [{ statuses: [{ id: 'mark' }] }] });
    o.mutate?.(cs);
    return checkCondition(ctx, 's1', when, o.target, o.skill);
  };

  it('hpBelowPct / hpAbovePct', () => {
    expect(holds([{ hp: 29, maxHp: 100 }], { hpBelowPct: 30 })).toBe(true);
    expect(holds([{ hp: 30, maxHp: 100 }], { hpBelowPct: 30 })).toBe(false);
    expect(holds([{ hp: 80, maxHp: 100 }], { hpAbovePct: 50 })).toBe(true);
    expect(holds([{ hp: 50, maxHp: 100 }], { hpAbovePct: 50 })).toBe(false);
  });

  it('stressMin / stressMax', () => {
    expect(holds([{ stress: 50 }], { stressMin: 50 })).toBe(true);
    expect(holds([{ stress: 49 }], { stressMin: 50 })).toBe(false);
    expect(holds([{ stress: 10 }], { stressMax: 10 })).toBe(true);
    expect(holds([{ stress: 11 }], { stressMax: 10 })).toBe(false);
  });

  it('roundMin', () => {
    expect(holds([{}], { roundMin: 4 }, { mutate: (cs) => { cs.round = 4; } })).toBe(true);
    expect(holds([{}], { roundMin: 4 }, { mutate: (cs) => { cs.round = 3; } })).toBe(false);
  });

  it('targetHasStatus / selfHasStatus', () => {
    expect(holds([{}], { targetHasStatus: 'mark' }, { target: 'e1' })).toBe(true);
    expect(holds([{}], { targetHasStatus: 'stun' }, { target: 'e1' })).toBe(false);
    expect(holds([{}], { targetHasStatus: 'mark' })).toBe(false);
    expect(holds([{ statuses: [{ id: 'guard' }] }], { selfHasStatus: 'guard' })).toBe(true);
    expect(holds([{}], { selfHasStatus: 'guard' })).toBe(false);
  });

  it('aloneInRow', () => {
    expect(holds([{ row: 'front' }, { row: 'back' }], { aloneInRow: true })).toBe(true);
    expect(holds([{ row: 'front' }, { row: 'front' }], { aloneInRow: true })).toBe(false);
    expect(holds([{ row: 'front' }, { row: 'front', downed: true }], { aloneInRow: true })).toBe(true);
  });

  it('sameRowAndSkill / rowChanged', () => {
    const last = (row: 'front' | 'back', skill: string) => (cs: CombatState) => { cs.combatants[0].lastRow = row; cs.combatants[0].lastSkillId = skill; };
    expect(holds([{ row: 'front' }], { sameRowAndSkill: true }, { skill: 'a', mutate: last('front', 'a') })).toBe(true);
    expect(holds([{ row: 'front' }], { sameRowAndSkill: true }, { skill: 'b', mutate: last('front', 'a') })).toBe(false);
    expect(holds([{ row: 'front' }], { sameRowAndSkill: true }, { skill: 'a', mutate: last('back', 'a') })).toBe(false);
    expect(holds([{ row: 'front' }], { sameRowAndSkill: true })).toBe(false);
    expect(holds([{ row: 'front' }], { rowChanged: true }, { mutate: last('back', 'a') })).toBe(true);
    expect(holds([{ row: 'front' }], { rowChanged: true }, { mutate: last('front', 'a') })).toBe(false);
  });

  it('commanderExposed', () => {
    const expose = (cs: CombatState) => { cs.commander = { hp: 60, maxHp: 60, def: 10, coverId: 's1', downed: false }; };
    expect(holds([{}], { commanderExposed: true }, { mutate: expose })).toBe(true);
    expect(holds([{}], { commanderExposed: true })).toBe(false);
  });

  it('notOrderedThisRound', () => {
    expect(holds([{}], { notOrderedThisRound: true })).toBe(true);
    expect(holds([{}], { notOrderedThisRound: true }, { mutate: (cs) => { cs.ordersThisRound.push({ orderId: 'steady', targetCid: 's1' }); } })).toBe(false);
  });

  it('upkeepWithinDays / upkeepOlderThanDays', () => {
    const run = (upkeepDay: number | undefined, day: number, when: Record<string, unknown>) => {
      const { ctx } = setup({ squad: [{ unitId: 'unit_ann' }] });
      ctx.state.day = day;
      ctx.state.squad[0].defects[0].upkeepDay = upkeepDay;
      return checkCondition(ctx, 's1', when);
    };
    expect(run(10, 12, { upkeepWithinDays: 3 })).toBe(true);
    expect(run(10, 14, { upkeepWithinDays: 3 })).toBe(false);
    expect(run(10, 14, { upkeepOlderThanDays: 3 })).toBe(true);
    expect(run(10, 12, { upkeepOlderThanDays: 3 })).toBe(false);
    expect(run(undefined, 2, { upkeepWithinDays: 3 })).toBe(true);
    expect(run(undefined, 9, { upkeepOlderThanDays: 3 })).toBe(true);
  });

  it('every key present must hold', () => {
    expect(holds([{ hp: 10, maxHp: 100, stress: 60 }], { hpBelowPct: 30, stressMin: 50 })).toBe(true);
    expect(holds([{ hp: 10, maxHp: 100, stress: 40 }], { hpBelowPct: 30, stressMin: 50 })).toBe(false);
    expect(holds([{}], {})).toBe(true);
  });
});

describe('effects', () => {
  it('amplify multiplies magnitudes and caps chance at 1', () => {
    expect(amplify({ type: 'stress', amount: 4 } as EffectSpec, 1.5)).toMatchObject({ amount: 6 });
    expect(amplify({ type: 'stat', stat: 'atk', pct: -10 } as EffectSpec, 1.5)).toMatchObject({ pct: -15 });
    expect(amplify({ type: 'order_refusal', chance: 0.8 } as EffectSpec, 1.5)).toMatchObject({ chance: 1 });
    expect(amplify({ type: 'damage', mult: 2 } as EffectSpec, 1.5)).toMatchObject({ mult: 3 });
  });

  it('heal caps at max HP and skips the downed', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 90, maxHp: 100 }, { downed: true }, { hp: 10, maxHp: 100 }] });
    applyEffects(ctx, 's1', [{ type: 'heal', pctMaxHp: 30, target: 'allies' }], {});
    expect([c(cs, 's1').hp, c(cs, 's2').hp, c(cs, 's3').hp]).toEqual([100, 0, 40]);
  });

  it('revive only downed, once', () => {
    const { cs, ctx } = setup({ squad: [{}, { downed: true, maxHp: 100 }, {}] });
    const fx: EffectSpec[] = [{ type: 'revive', pctMaxHp: 30, limit: 'combat' }];
    applyEffects(ctx, 's1', fx, { targets: ['s3'] }, 'sk');
    expect(c(cs, 's3').hp).toBe(100);
    applyEffects(ctx, 's1', fx, { targets: ['s2'] }, 'sk');
    expect(c(cs, 's2').hp).toBe(0); // the combat limit was spent on the first use
    const second = setup({ squad: [{}, { downed: true, maxHp: 100 }] });
    applyEffects(second.ctx, 's1', fx, { targets: ['s2'] }, 'sk');
    expect(c(second.cs, 's2')).toMatchObject({ hp: 30, downed: false });
  });

  it('status stacks add vs refresh and respect maxStacks', () => {
    const { cs, ctx } = setup();
    for (let i = 0; i < 5; i++) applyStatus(ctx, 'e1', 'bleed', 3);
    expect(c(cs, 'e1').statuses.find((s) => s.id === 'bleed')!.stacks).toBe(3);
    applyStatus(ctx, 'e1', 'mark', 1);
    applyStatus(ctx, 'e1', 'mark', 4);
    const mark = c(cs, 'e1').statuses.find((s) => s.id === 'mark')!;
    expect([mark.stacks, mark.turns]).toEqual([1, 4]);
    applyStatus(ctx, 'e1', 'mark', 2);
    expect(mark.turns).toBe(4);
  });

  it('immune blocks a status', () => {
    const { cs, ctx } = setup({ enemies: [{ passives: [P({ type: 'immune', statusId: 'stun' })] }] });
    expect(applyStatus(ctx, 'e1', 'stun', 1)).toBe(false);
    expect(has(cs, 'e1', 'stun')).toBe(false);
    expect(applyStatus(ctx, 'e1', 'burn', 1)).toBe(true);
    const cond = setup({ squad: [{ hp: 20, maxHp: 100, passives: [P({ type: 'immune', statusId: 'stun', when: { hpBelowPct: 30 } })] }] });
    expect(applyStatus(cond.ctx, 's1', 'stun', 1)).toBe(false);
    c(cond.cs, 's1').hp = 90;
    expect(applyStatus(cond.ctx, 's1', 'stun', 1)).toBe(true);
  });

  it('bleed ticks per stack at turn start; statuses expire at turn end', () => {
    const { cs, ctx } = setup({ enemies: [{ hp: 100, maxHp: 100 }] });
    applyStatus(ctx, 'e1', 'bleed', 2, 2);
    tickStatuses(ctx, 'e1');
    expect(c(cs, 'e1').hp).toBe(92); // 4 % of 100, twice
    expireStatuses(ctx, 'e1');
    expect(has(cs, 'e1', 'bleed')).toBe(true);
    expireStatuses(ctx, 'e1');
    expect(has(cs, 'e1', 'bleed')).toBe(false);
  });

  it('a damage-over-time tick can down its owner', () => {
    const { cs, ctx } = setup({ enemies: [{ hp: 3, maxHp: 100 }] });
    applyStatus(ctx, 'e1', 'burn', 2);
    tickStatuses(ctx, 'e1');
    expect(c(cs, 'e1')).toMatchObject({ hp: 0, downed: true });
  });

  it('infect ticks stress onto its owner', () => {
    const { cs, ctx } = setup({ squad: [{}] });
    applyStatus(ctx, 's1', 'infect', 2, 2, 'e1');
    tickStatuses(ctx, 's1');
    expect(c(cs, 's1').stress).toBe(6);
  });

  it('shield absorbs before HP', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 100, maxHp: 100 }] });
    applyStatus(ctx, 's1', 'shield', 3, 1, 's1'); // 15 % of 100
    expect(c(cs, 's1').statuses[0].value).toBe(15);
    dealDamage(ctx, 'e1', 's1', 0.0001); // 1 damage
    expect(c(cs, 's1').hp).toBe(100);
    expect(c(cs, 's1').statuses[0].value).toBe(14);
    dealDamage(ctx, 'e1', 's1', 5);
    expect(c(cs, 's1').statuses.some((s) => s.id === 'shield')).toBe(false);
    expect(c(cs, 's1').hp).toBeLessThan(100);
  });

  it('guard cuts damage 30 %, mark adds 15 %', () => {
    const base = setup({ squad: [{ def: 0 }] });
    const guarded = setup({ squad: [{ def: 0, statuses: [{ id: 'guard' }] }] });
    const marked = setup({ squad: [{ def: 0, statuses: [{ id: 'mark' }] }] });
    const dmg = (s: ReturnType<typeof setup>) => dealDamage(s.ctx, 'e1', 's1', 1).dealt;
    const plain = dmg(base);
    expect(dmg(guarded)).toBeLessThan(plain);
    expect(dmg(marked)).toBeGreaterThan(plain);
    expect(incomingPct(guarded.ctx, 's1')).toBe(-30);
    expect(incomingPct(marked.ctx, 's1')).toBe(15);
  });

  it('redirect sends half the damage to the protector', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 100, def: 0 }, { hp: 100, def: 0 }], enemies: [{ atk: 100, crit: 0 }] });
    applyEffects(ctx, 's2', [{ type: 'redirect', pct: 50, turns: 2, from: 'ally' }], { targets: ['s1'] });
    const r = dealDamage(ctx, 'e1', 's1', 1);
    const lost1 = 100 - c(cs, 's1').hp;
    const lost2 = 100 - c(cs, 's2').hp;
    expect(lost1 + lost2).toBe(r.dealt);
    expect(lost2).toBe(Math.round((lost1 + lost2) / 2));
    expireStatuses(ctx, 's2');
    expireStatuses(ctx, 's2');
    expect(c(cs, 's2').redirects).toEqual([]);
  });

  it('intercept_lethal saves the commander once', () => {
    const guard = P({ type: 'intercept_lethal', protect: 'commander', limit: 'combat' });
    const mk = () => {
      const s = setup({ squad: [{ cid: 's1', row: 'front', passives: [] }, { cid: 's2', passives: [guard], hp: 500, maxHp: 500 }], enemies: [{ atk: 500 }] });
      s.cs.commander = { hp: 10, maxHp: 60, def: 10, coverId: 's1', downed: false };
      c(s.cs, 's1').downed = true;
      c(s.cs, 's1').hp = 0;
      return s;
    };
    const { cs, ctx } = mk();
    dealDamage(ctx, 'e1', 'commander', 1);
    expect(cs.commander!.hp).toBe(10);
    expect(cs.commanderDown).toBeUndefined();
    expect(c(cs, 's2').hp).toBeLessThan(500);
    dealDamage(ctx, 'e1', 'commander', 1);
    expect(cs.commander!.downed).toBe(true);
    expect(cs.commanderDown).toBe(true);
  });

  it('stat scale by stress above 30', () => {
    const { ctx } = setup({ squad: [{ stress: 60, atk: 20, passives: [P({ type: 'stat', stat: 'atk', pct: 0, scale: { by: 'stress_above', per: 1, base: 30 } })] }] });
    expect(effectiveStat(ctx, 's1', 'atk')).toBe(26); // +30 %
  });

  it('outgoing scales with missing HP and honors vs marked / locked', () => {
    const { cs, ctx } = setup({
      squad: [{ hp: 50, maxHp: 100, lockedTargetId: 'e2', passives: [
        P({ type: 'outgoing', pct: 0, scale: { by: 'own_hp_missing_pct', per: 0.5 } }),
        P({ type: 'outgoing', pct: 10, vs: 'marked' }),
        P({ type: 'outgoing', pct: 40, vs: 'locked' }),
      ] }],
      enemies: [{ statuses: [{ id: 'mark' }] }, {}],
    });
    expect(outgoingPct(ctx, 's1', 'e1')).toBe(25 + 10);
    expect(outgoingPct(ctx, 's1', 'e2')).toBe(25 + 40);
    expect(cs.combatants).toHaveLength(3);
  });

  it('downside effects are 1.5× when strained, upside not', () => {
    const down = P({ type: 'stress', amount: 4, trigger: 'onRoundStart', downside: true });
    const up = P({ type: 'cp', amount: 1, trigger: 'onRoundStart' });
    const calm = setup({ squad: [{ stress: 10, passives: [down] }, { stress: 10, passives: [up] }] });
    fireTrigger(calm.ctx, 'onRoundStart', {});
    expect(c(calm.cs, 's1').stress).toBe(14);
    const strained = setup({ squad: [{ stress: 60, passives: [down] }] });
    fireTrigger(strained.ctx, 'onRoundStart', {});
    expect(c(strained.cs, 's1').stress).toBe(66);
    const pas = setup({ squad: [{ stress: 60, passives: [P({ type: 'order_refusal', chance: 0.2, downside: true })] }] });
    expect(activePassives(pas.ctx, 's1', 'order_refusal')[0].chance).toBeCloseTo(0.3);
  });

  it('cleanse removes the newest debuffs first and leaves buffs', () => {
    const { cs, ctx } = setup({ squad: [{ statuses: [{ id: 'mark' }, { id: 'guard' }, { id: 'burn' }, { id: 'stun' }] }] });
    applyEffects(ctx, 's1', [{ type: 'cleanse', kind: 'debuff', count: 2 }], {});
    expect(c(cs, 's1').statuses.map((s) => s.id)).toEqual(['mark', 'guard']);
  });

  it('summon adds an enemy up to max and never beyond 3 per row', () => {
    const { cs, ctx } = setup({ enemies: [{ cid: 'e1', row: 'front' }] });
    const fx: EffectSpec[] = [{ type: 'summon', enemyId: 'husk', max: 2 }];
    applyEffects(ctx, 'e1', fx, {});
    applyEffects(ctx, 'e1', fx, {});
    applyEffects(ctx, 'e1', fx, {});
    const summoned = cs.combatants.filter((x) => x.summonedBy === 'e1');
    expect(summoned).toHaveLength(2);
    expect(summoned.every((x) => x.enemyId === 'husk' && x.hp > 0)).toBe(true);
    expect(cs.combatants.filter((x) => x.side === 'enemy' && x.row === 'front')).toHaveLength(3);
    const full = setup({ enemies: [{ row: 'front' }, { row: 'front' }, { row: 'front' }, { row: 'back' }, { row: 'back' }, { row: 'back' }] });
    applyEffects(full.ctx, 'e1', [{ type: 'summon', enemyId: 'husk', max: 5 }], {});
    expect(full.cs.combatants.filter((x) => x.summonedBy)).toHaveLength(0);
  });

  it('move respects rooted and row capacity; swap exchanges with a full row', () => {
    const { cs, ctx } = setup({ squad: [{ row: 'front' }, { row: 'back' }, { row: 'back' }, { row: 'back' }] });
    applyEffects(ctx, 's1', [{ type: 'move', to: 'swap', target: 'self' }], {});
    expect(c(cs, 's1').row).toBe('back'); // swapped places with s2
    expect(c(cs, 's2').row).toBe('front');
    applyStatus(ctx, 's2', 'hold_line', 1);
    applyEffects(ctx, 's2', [{ type: 'move', to: 'back', target: 'self' }], {});
    expect(c(cs, 's2').row).toBe('front');
  });

  it('follow_up, lock_target, loot_roll, extra_action, hp_set and cp set their flags', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 100, maxHp: 100 }], enemies: [{ hp: 100, maxHp: 100 }] });
    applyEffects(ctx, 's1', [
      { type: 'lock_target', turns: 3 }, { type: 'loot_roll', extra: 2 }, { type: 'extra_action' }, { type: 'cp', amount: 9 },
      { type: 'repeat_order' }, { type: 'hp_set', value: 1 },
    ], { targets: ['e1'], targetCid: 'e1' });
    expect(c(cs, 's1')).toMatchObject({ lockedTargetId: 'e1', lockTurns: 3, hp: 100 });
    expect(cs.pendingLootRolls).toBe(2);
    expect(cs.extraAction).toBe('s1');
    expect(cs.cp).toBe(5);
    expect(cs.repeatOrder).toBe(true);
    applyEffects(ctx, 's1', [{ type: 'hp_set', value: 1, target: 'self' }], {});
    expect(c(cs, 's1').hp).toBe(1);
    applyEffects(ctx, 's1', [{ type: 'follow_up', mult: 1 }], { targets: ['e1'] });
    expect(c(cs, 'e1').hp).toBeLessThan(100);
  });

  it('chance gates an effect, a condition skips it', () => {
    const never = setup({ squad: [{}] });
    applyEffects(never.ctx, 's1', [{ type: 'cp', amount: 1, chance: 0 }], {});
    expect(never.cs.cp).toBe(1);
    const gated = setup({ squad: [{ stress: 0 }] });
    applyEffects(gated.ctx, 's1', [{ type: 'cp', amount: 1, when: { stressMin: 50 } }], {});
    expect(gated.cs.cp).toBe(1);
  });

  it('crits taken, downed allies and kills move stress', () => {
    const { cs, ctx } = setup({ squad: [{ hp: 500, maxHp: 500, def: 0 }, { hp: 1 }], enemies: [{ atk: 200, crit: 100 }] });
    dealDamage(ctx, 'e1', 's1', 1);
    expect(c(cs, 's1').stress).toBe(6); // crit taken
    dealDamage(ctx, 'e1', 's2', 1);
    expect(c(cs, 's2').downed).toBe(true);
    expect(c(cs, 's1').stress).toBe(6 + 8); // s2 falls (no crit stress for the downed), s1 sees an ally fall
    const killer = setup({ squad: [{ atk: 300, stress: 10 }], enemies: [{ hp: 1 }] });
    dealDamage(killer.ctx, 's1', 'e1', 1);
    expect(c(killer.cs, 's1').stress).toBe(8);
  });

  it('effectiveStat combines mods, status mods and passives', () => {
    const { ctx } = setup({ squad: [{ def: 20, statuses: [{ id: 'corrode', stacks: 2 }], passives: [P({ type: 'stat', stat: 'def', pct: 10 })] }] });
    ctx.cs.combatants[0].mods.push({ stat: 'def', pct: 20, turnsLeft: 1, source: 'x' });
    // 20 × (1 − 0.30 + 0.10 + 0.20) = 20
    expect(effectiveStat(ctx, 's1', 'def')).toBe(20);
    const crit = setup({ squad: [{ crit: 10, passives: [P({ type: 'stat', stat: 'crit', pct: 15 })] }] });
    expect(effectiveStat(crit.ctx, 's1', 'crit')).toBe(25);
    const all = setup({ squad: [{ atk: 20, def: 10, spd: 10, passives: [P({ type: 'stat', stat: 'all', pct: 10 })] }] });
    expect([effectiveStat(all.ctx, 's1', 'atk'), effectiveStat(all.ctx, 's1', 'def'), effectiveStat(all.ctx, 's1', 'spd')]).toEqual([22, 11, 11]);
  });
});
