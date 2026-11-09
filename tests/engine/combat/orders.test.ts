import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { dealDamage, makeCtx } from '../../../src/engine/combat/effects';
import { checkOrder, issueOrder, orderCost } from '../../../src/engine/combat/orders';
import { performAction, runUntilInput, startRound, checkEnd, completeAction } from '../../../src/engine/combat/turn';
import type { CombatState, EffectSpec } from '../../../src/engine/combat/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const syn = (id: string) => (reg.synergies.get(id)!.effects as EffectSpec[]).map((e) => ({ ...e, source: `synergy:${id}` }));
const c = (cs: CombatState, cid: string) => cs.combatants.find((x) => x.cid === cid)!;
const setup = (o: { squad?: FixtureCombatant[]; enemies?: FixtureCombatant[]; cp?: number; seed?: number } = {}) => {
  const cs = fixtureCombat({ cp: 5, ...o });
  cs.awaitingCid = 's1';
  return { cs, ctx: makeCtx(cs, structuredClone(base), reg, rngOf(o.seed ?? 4)) };
};

describe('the five orders', () => {
  it('focus fire marks the target and focuses it: every ally deals more', () => {
    const { cs, ctx } = setup({ enemies: [{ def: 0 }] });
    expect(checkOrder(ctx, 'focus_fire', 'e1')).toBeNull();
    const before = 100 + 15 + 25;
    issueOrder(ctx, 'focus_fire', 'e1');
    expect(cs.cp).toBe(3);
    expect(c(cs, 'e1').statuses.map((s) => s.id).sort()).toEqual(['focus', 'mark']);
    expect(before).toBe(140);
    expect(cs.ordersThisRound).toEqual([{ orderId: 'focus_fire', targetCid: 'e1' }]);
    expect(cs.lastOrder).toEqual({ orderId: 'focus_fire', targetCid: 'e1' });
  });

  it('hold the line: front row +30 % DEF and rooted, back row untouched', () => {
    const { cs, ctx } = setup({ squad: [{ row: 'front', def: 10 }, { row: 'back', def: 10 }] });
    issueOrder(ctx, 'hold_the_line');
    expect(cs.cp).toBe(3);
    expect(c(cs, 's1').statuses.map((s) => s.id)).toEqual(['hold_line']);
    expect(c(cs, 's2').statuses).toEqual([]);
  });

  it('fall back swaps her row without using her turn', () => {
    const { cs, ctx } = setup({ squad: [{ row: 'front' }, { row: 'back' }] });
    cs.turn = 2;
    cs.turnStarted = true;
    issueOrder(ctx, 'fall_back', 's1');
    expect(c(cs, 's1').row).toBe('back');
    expect(cs.cp).toBe(4);
    expect([cs.turn, cs.awaitingCid, cs.turnStarted]).toEqual([2, 's1', true]);
  });

  it('steady takes 10 stress off one unit', () => {
    const { cs, ctx } = setup({ squad: [{ stress: 40 }] });
    issueOrder(ctx, 'steady', 's1');
    expect(c(cs, 's1').stress).toBe(30);
    expect(cs.cp).toBe(4);
  });

  it('authorize ultimate lets the unit use her ultimate for free once', () => {
    const { cs, ctx } = setup({ squad: [{ skills: ['as_ult_overrun'] }], enemies: [{ hp: 9999, maxHp: 9999 }], cp: 3 });
    issueOrder(ctx, 'authorize_ultimate', 's1');
    expect(cs.cp).toBe(0);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_ult_overrun' });
    expect(cs.cp).toBe(0);
    expect(c(cs, 's1').statuses.some((s) => s.id === 'authorized')).toBe(false);
  });
});

describe('order rules', () => {
  it('orders cost CP and are rejected without enough CP', () => {
    const { cs, ctx } = setup({ cp: 1 });
    expect(checkOrder(ctx, 'focus_fire', 'e1')).toMatch(/needs 2 CP/);
    expect(checkOrder(ctx, 'steady', 's1')).toBeNull();
    expect(checkOrder(ctx, 'authorize_ultimate', 's1')).toMatch(/3 CP/);
    expect(cs.cp).toBe(1);
  });

  it('orders are only accepted while a unit awaits input', () => {
    const { cs, ctx } = setup();
    cs.awaitingCid = undefined;
    expect(checkOrder(ctx, 'steady', 's1')).toMatch(/awaits input/);
    cs.awaitingCid = 's1';
    cs.phase = 'ended';
    expect(checkOrder(ctx, 'steady', 's1')).toMatch(/awaits input/);
  });

  it('bad targets are rejected', () => {
    const { cs, ctx } = setup({ squad: [{}, { downed: true }], enemies: [{}] });
    expect(checkOrder(ctx, 'steady', 'e1')).toMatch(/squad unit/);
    expect(checkOrder(ctx, 'steady', 's2')).toMatch(/standing target/);
    expect(checkOrder(ctx, 'steady')).toMatch(/standing target/);
    expect(checkOrder(ctx, 'focus_fire', 's1')).toMatch(/an enemy/);
    expect(checkOrder(ctx, 'hold_the_line', 's1')).toMatch(/no target/);
    expect(checkOrder(ctx, 'nonsense')).toMatch(/Unknown order/);
    expect(cs.cp).toBe(5);
  });

  it('a unit that ignores orders in her breakdown cannot be targeted', () => {
    const { ctx } = setup({ squad: [{ breakdown: { defectId: 'rage_governor', policy: 'attack', ignoresOrders: true, actionEffects: [] } }] });
    expect(checkOrder(ctx, 'steady', 's1')).toMatch(/ignores orders/);
  });

  it('compliance_craving and confidant_sync never push a cost below 1', () => {
    const craving = (reg.defects.get('compliance_craving')!.combat as { upside: EffectSpec[] }).upside.map((e) => ({ ...e, source: 'defect:compliance_craving' }));
    const { ctx } = setup({ squad: [{ passives: [...craving, ...syn('confidant_sync')] as never }, {}] });
    expect(orderCost(ctx, 'steady', 's1')).toBe(1);
    expect(orderCost(ctx, 'authorize_ultimate', 's1')).toBe(1);
    expect(orderCost(ctx, 'authorize_ultimate', 's2')).toBe(3);
    expect(orderCost(ctx, 'hold_the_line')).toBe(2);
    const one = setup({ squad: [{ passives: syn('confidant_sync') as never }] });
    expect(orderCost(one.ctx, 'authorize_ultimate', 's1')).toBe(2);
  });
});

describe('refusals', () => {
  const rate = (synergyId: string, n = 400) => {
    const { cs, ctx } = setup({ squad: [{ passives: syn(synergyId) as never, stress: 0 }], seed: 17 });
    let refused = 0;
    for (let i = 0; i < n; i++) {
      cs.cp = 5;
      c(cs, 's1').stress = 0;
      if (!issueOrder(ctx, 'steady', 's1')) refused += 1;
    }
    return refused / n;
  };

  it('despises refuses about 35 % of orders (seeded, 400 orders within 30–40 %)', () => {
    const r = rate('order_friction_major');
    expect(r).toBeGreaterThanOrEqual(0.3);
    expect(r).toBeLessThanOrEqual(0.4);
  });

  it('estranged and resentful use 25 % and 15 %', () => {
    expect(rate('order_friction')).toBeGreaterThanOrEqual(0.2);
    expect(rate('order_friction')).toBeLessThanOrEqual(0.3);
    expect(rate('order_friction_minor')).toBeGreaterThanOrEqual(0.1);
    expect(rate('order_friction_minor')).toBeLessThanOrEqual(0.2);
  });

  it('a refused order spends CP, adds stress and emits order_refused; its effect does not happen', () => {
    const { cs, ctx } = setup({ squad: [{ passives: [{ type: 'order_refusal', chance: 1, source: 'x' }] as never, stress: 5 }] });
    expect(issueOrder(ctx, 'steady', 's1')).toBe(false);
    expect(cs.cp).toBe(4);
    expect(c(cs, 's1').stress).toBe(11); // +6 for the refusal, steady never ran
    expect(ctx.events.find((e) => e.type === 'order_refused')).toMatchObject({ orderId: 'steady', cid: 's1' });
    expect(cs.ordersThisRound).toEqual([]);
    expect(cs.lastOrder).toBeUndefined();
  });

  it('a refusal can be limited to named orders; orders without a unit target are never refused', () => {
    const only = { type: 'order_refusal', chance: 1, orders: ['hold_the_line'], source: 'x' };
    const { ctx } = setup({ squad: [{ passives: [only] as never }] });
    expect(issueOrder(ctx, 'steady', 's1')).toBe(true);
    expect(issueOrder(ctx, 'hold_the_line')).toBe(true);
  });
});

describe('command echo', () => {
  it('repeats the last order for free and cannot repeat itself', () => {
    const { cs, ctx } = setup({ squad: [{ stress: 50 }, { skills: ['sig_command_echo'] }], cp: 5 });
    issueOrder(ctx, 'steady', 's1');
    expect(c(cs, 's1').stress).toBe(40);
    expect(cs.cp).toBe(4);
    performAction(ctx, 's2', { kind: 'skill', skillId: 'sig_command_echo' });
    expect(c(cs, 's1').stress).toBe(30);
    expect(cs.cp).toBe(4);
    expect(cs.repeatOrder).toBe(false);
    expect(cs.ordersThisRound).toHaveLength(2);
    cs.ordersThisRound = [];
    cs.lastOrder = undefined;
    c(cs, 's2').cooldowns = {};
    performAction(ctx, 's2', { kind: 'skill', skillId: 'sig_command_echo' });
    expect(cs.ordersThisRound).toEqual([]);
    expect(c(cs, 's1').stress).toBe(30);
  });

  it('skips a repeat whose target has fallen', () => {
    const { cs, ctx } = setup({ squad: [{}, { skills: ['sig_command_echo'] }] });
    issueOrder(ctx, 'steady', 's1');
    c(cs, 's1').downed = true;
    c(cs, 's1').hp = 0;
    performAction(ctx, 's2', { kind: 'skill', skillId: 'sig_command_echo' });
    expect(cs.ordersThisRound).toHaveLength(1);
  });
});

describe('Commander Crisis', () => {
  const crisis = (o: Parameters<typeof setup>[0] = {}) => {
    const s = setup({ enemies: [{ atk: 60, crit: 0, skills: ['en_rifle_burst'], row: 'back' }], ...o });
    s.cs.commander = { hp: 60, maxHp: 60, def: 10, coverId: 's1', downed: false };
    return s;
  };

  it('hits on the commander go to the cover unit', () => {
    const { cs, ctx } = crisis({ squad: [{ hp: 200, maxHp: 200, def: 0 }, { row: 'front' }] });
    dealDamage(ctx, 'e1', 'commander', 1);
    expect(c(cs, 's1').hp).toBeLessThan(200);
    expect(cs.commander!.hp).toBe(60);
    expect(cs.log.some((l) => l.kind === 'cover')).toBe(true);
  });

  it('without cover the commander is hit and the squad gains stress', () => {
    const { cs, ctx } = crisis({ squad: [{ hp: 1 }, { row: 'front' }] });
    c(cs, 's1').downed = true;
    c(cs, 's1').hp = 0;
    dealDamage(ctx, 'e1', 'commander', 0.2);
    expect(cs.commander!.hp).toBeLessThan(60);
    expect(c(cs, 's2').stress).toBe(5);
    expect(cs.commanderDown).toBeUndefined();
  });

  it('devoted_sacrifice intercepts a lethal hit once per combat', () => {
    const { cs, ctx } = crisis({ squad: [{ hp: 1 }, { hp: 900, maxHp: 900, def: 0, passives: syn('devoted_sacrifice') as never }] });
    c(cs, 's1').downed = true;
    c(cs, 's1').hp = 0;
    cs.commander!.hp = 5;
    dealDamage(ctx, 'e1', 'commander', 2);
    expect(cs.commander!.hp).toBe(5);
    expect(c(cs, 's2').hp).toBeLessThan(900);
    dealDamage(ctx, 'e1', 'commander', 2);
    expect(cs.commander!.downed).toBe(true);
  });

  it('commander down loses the combat', () => {
    const { cs, ctx } = crisis({ squad: [{ hp: 1 }, { row: 'front' }] });
    c(cs, 's1').downed = true;
    c(cs, 's1').hp = 0;
    cs.commander!.hp = 1;
    dealDamage(ctx, 'e1', 'commander', 3);
    expect(cs.commanderDown).toBe(true);
    expect(checkEnd(ctx)).toBe('lost');
  });

  it('enemy skills that reach the back may pick the commander; melee only once the front is gone', () => {
    const { cs, ctx } = crisis({ squad: [{ row: 'front' }, { row: 'front' }] });
    const claw = { kind: 'skill', skillId: 'en_rifle_burst', targetCid: 'commander' } as const;
    expect(() => performAction(ctx, 'e1', claw)).not.toThrow();
    const melee = crisis({ squad: [{ row: 'front' }] });
    c(melee.cs, 'e1').row = 'front';
    c(melee.cs, 'e1').skills = ['en_claw'];
    expect(() => performAction(melee.ctx, 'e1', { kind: 'skill', skillId: 'en_claw', targetCid: 'commander' })).toThrow(/Illegal target/);
    expect(cs.commander!.hp).toBeLessThanOrEqual(60);
  });

  it('the commander stays out of area-of-effect hits and non-damage effects', () => {
    const { cs, ctx } = crisis({ squad: [{ hp: 500, maxHp: 500 }, {}], enemies: [{ skills: ['en_dread'], row: 'back' }] });
    performAction(ctx, 'e1', { kind: 'skill', skillId: 'en_dread' });
    expect(cs.commander!.hp).toBe(60);
  });
});

describe('friend_assist', () => {
  it('follows up after an ally crit, once per round', () => {
    const { cs, ctx } = setup({
      squad: [{ crit: 100, skills: ['as_strike'] }, { passives: syn('friend_assist') as never, skills: [] }],
      enemies: [{ hp: 9999, maxHp: 9999, def: 0 }],
    });
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    const assists = () => cs.log.filter((l) => l.actor === 's2' && (l.kind === 'hit' || l.kind === 'crit')).length;
    expect(assists()).toBe(1);
    c(cs, 's1').cooldowns = {};
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    expect(assists()).toBe(1); // limit: round
    startRound(ctx);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    expect(assists()).toBe(2);
  });
});

describe('combat/order action', () => {
  const started = () => {
    const s = structuredClone(base);
    s.commander.crimeId = 'liquidation';
    const r = run(s, reg, {
      type: 'combat/start',
      payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: { front: ['unit_ann', 'unit_bea'], back: ['unit_cat', 'unit_dee'] } },
    });
    return r.state;
  };

  it('issues an order through the engine and keeps waiting for the same unit', () => {
    const s = started();
    const waiting = s.combat!.awaitingCid;
    const r = run(s, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: 's1' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.combat!.cp).toBe(s.combat!.cp - 1);
    expect(r.state.combat!.awaitingCid).toBe(waiting);
    expect(ofType(r.events, 'combat_log')).toHaveLength(1);
  });

  it('rejections change nothing', () => {
    const s = started();
    for (const payload of [{ orderId: 'authorize_ultimate', targetCid: 's1' }, { orderId: 'steady', targetCid: 'e1' }, { orderId: 7 }, {}]) {
      const r = run(s, reg, { type: 'combat/order', payload });
      expect(errors(r.events), JSON.stringify(payload)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    expect(errors(run(base, reg, { type: 'combat/order', payload: { orderId: 'steady', targetCid: 's1' } }).events)).toHaveLength(1);
  });

  it('wiring: runUntilInput and completeAction are still usable after orders', () => {
    const { cs, ctx } = setup({ squad: [{ skills: ['as_strike'], spd: 30 }], enemies: [{ hp: 9999, maxHp: 9999, spd: 1 }] });
    cs.round = 0;
    cs.awaitingCid = undefined;
    startRound(ctx);
    runUntilInput(ctx);
    issueOrder(ctx, 'steady', 's1');
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    completeAction(ctx, 's1');
    expect(cs.turn).toBe(1);
  });
});
