import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { buildCombat, checkStart } from '../../../src/engine/combat/build';
import { makeCtx } from '../../../src/engine/combat/effects';
import { defaultFormation, enemyStats, unitStats } from '../../../src/engine/combat/stats';
import { checkEnd, completeAction, performAction, runUntilInput, startRound } from '../../../src/engine/combat/turn';
import type { CombatState, StartPayload } from '../../../src/engine/combat/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';
import { fixtureCombat, rngOf, type FixtureCombatant } from '../../helpers/combat';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});
const fresh = () => structuredClone(base);
const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const payload = (s: CampaignState, enemies = [husk], over: Partial<StartPayload> = {}): StartPayload => ({
  encounter: { enemies, danger: 1 },
  formation: defaultFormation(s, reg, s.roster.activeIds),
  ...over,
});
const build = (s: CampaignState, p = payload(s)) => buildCombat(s, reg, new Rng(seedRng(9)), p);
const comb = (cs: CombatState, cid: string) => cs.combatants.find((c) => c.cid === cid)!;

describe('buildCombat', () => {
  it('squad combatants carry effective stats, carried stress and loadout', () => {
    const s = fresh();
    s.squad[0].level = 5;
    s.squad[0].stress = 33;
    const cs = build(s);
    const ann = cs.combatants.find((c) => c.unitId === 'unit_ann')!;
    expect(ann.base).toEqual(unitStats(s, reg, s.squad[0]));
    expect(ann.maxHp).toBe(ann.base.hp);
    expect(ann.stress).toBe(33);
    expect(ann.skills).toEqual(['as_strike', 'as_burst']);
    expect(ann.level).toBe(5);
    expect(cs.combatants.filter((c) => c.side === 'squad')).toHaveLength(4);
    expect(cs.formation.front.length + cs.formation.back.length).toBe(4);
  });

  it('a saved loadout of known skills replaces the starters; unknown skills drop out', () => {
    const s = fresh();
    s.squad[0].loadout = ['as_burst', 'ghost_skill', 'as_breach_charge'];
    expect(build(s).combatants[0].skills).toEqual(['as_burst']); // as_breach_charge is not unlocked
    s.squad[0].unlockedNodes = ['as_b1_t1'];
    expect(build(s).combatants[0].skills).toEqual(['as_burst', 'as_breach_charge']);
  });

  it('defect, signature, equipment and synergy passives are attached with their source', () => {
    const s = fresh();
    s.inventory.push({ uid: 'it_1', itemId: 'bloom_fang', rarity: 'anomalous', upgrade: 0, affixes: ['bloom_leak'] });
    s.squad[0].equipment = { weapon: 'it_1' };
    s.relations.unit_ann.stateId = 'devoted';
    const ann = build(s).combatants[0];
    const sources = new Set(ann.passives.map((p) => p.source));
    expect(sources.has('defect:echo_bleed')).toBe(true);
    expect(sources.has('defect:echo_bleed:down')).toBe(true);
    expect(sources.has('sig:sig_last_stand')).toBe(true);
    expect(sources.has('item:it_1')).toBe(true);
    expect(sources.has('synergy:devoted_sacrifice')).toBe(true);
    expect(sources.has('synergy:lover_link')).toBe(true);
  });

  it('an active signature skill becomes a button, an ultimate appears once its node is owned', () => {
    const s = fresh();
    s.squad[0].signatureSkill = { templateId: 'sig_frenzy', name: 'Frenzy', description: 'd' };
    s.squad[0].unlockedNodes = ['as_ult'];
    expect(build(s).combatants[0].skills).toEqual(['as_strike', 'as_burst', 'sig_frenzy', 'as_ult_overrun']);
    s.squad[0].kind = 'grunt';
    expect(build(s).combatants[0].skills).not.toContain('sig_frenzy');
  });

  it('friend state adds friend_assist', () => {
    const s = fresh();
    s.relations.unit_bea.stateId = 'friend';
    const bea = build(s).combatants.find((c) => c.unitId === 'unit_bea')!;
    expect(bea.passives.some((p) => p.source === 'synergy:friend_assist' && p.type === 'follow_up')).toBe(true);
  });

  it('enemy level, difficulty and armored/elite affixes scale stats; elite adds its elite skill', () => {
    const s = fresh();
    const cs = build(s, payload(s, [husk, { ...husk, level: 4 }, { ...husk, affixes: ['armored'] }, { ...husk, affixes: ['elite'] }]));
    const e = (n: number) => comb(cs, `e${n}`);
    expect(e(1).base).toEqual(enemyStats(reg, 'husk', 1, [], 'normal'));
    expect(e(2).base.hp).toBeGreaterThan(e(1).base.hp);
    expect(e(3).base.def).toBeGreaterThan(e(1).base.def);
    expect(e(4).base.atk).toBe(Math.round(11 * 1.4));
    expect(e(4).skills).toEqual(['en_claw', 'en_infectious_bite', 'en_elite_strike']);
    expect(e(1).skills).toEqual(['en_claw', 'en_infectious_bite']);
    s.difficulty = 'hard';
    expect(build(s).combatants.find((c) => c.side === 'enemy')!.maxHp).toBe(Math.round(55 * 1.2));
  });

  it('enemies fill their preferred row and overflow to the other', () => {
    const s = fresh();
    const cs = build(s, payload(s, Array.from({ length: 5 }, () => husk)));
    const rows = cs.combatants.filter((c) => c.side === 'enemy').map((c) => c.row);
    expect(rows.filter((r) => r === 'front')).toHaveLength(3);
    expect(rows.filter((r) => r === 'back')).toHaveLength(2);
  });

  it('CP starts at 1, 2 with liquidation', () => {
    const s = fresh();
    expect(build(s).cp).toBe(1);
    s.commander.crimeId = 'liquidation';
    expect(build(s).cp).toBe(2);
  });

  it('keeps the rng state from before the build and the payload for a retry', () => {
    const s = fresh();
    const rng = new Rng(seedRng(4));
    const before = rng.state;
    const cs = buildCombat(s, reg, rng, payload(s));
    expect(cs.start.rng).toEqual(before);
    expect(cs.start.payload.formation).toEqual(cs.formation);
    expect(cs.id).toMatch(/^cmb_1_/);
  });

  it('restores a breakdown and exposes the commander with a cover unit', () => {
    const s = fresh();
    s.squad[1].breakdown = { defectId: 'rage_governor', day: 1 };
    const cs = build(s, payload(s, [husk], { coverId: 'unit_cat', encounter: { enemies: [husk], danger: 1, exposesCommander: true } }));
    const bea = cs.combatants.find((c) => c.unitId === 'unit_bea')!;
    expect(bea.breakdown).toMatchObject({ policy: 'attack', ignoresOrders: true });
    expect(bea.stress).toBe(100);
    expect(cs.commander).toMatchObject({ hp: 50, maxHp: 50, def: 10, downed: false, coverId: cs.combatants.find((c) => c.unitId === 'unit_cat')!.cid });
  });
});

describe('checkStart', () => {
  const reject = (mutate: (s: CampaignState) => Partial<StartPayload> | void, expected: RegExp) => {
    const s = fresh();
    const extra = mutate(s) ?? {};
    const p = { ...payload(s), ...extra };
    expect(checkStart(s, reg, p as StartPayload)).toMatch(expected);
  };

  it('accepts a valid payload', () => {
    const s = fresh();
    expect(checkStart(s, reg, payload(s))).toBeNull();
  });

  it('rejects five units, four in one row, a duplicate', () => {
    reject(() => ({ formation: { front: ['unit_ann', 'unit_bea', 'unit_cat'], back: ['unit_dee', 'unit_eve'] } }), /1 to 4/);
    reject(() => ({ formation: { front: ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'], back: [] } }), /at most 3/);
    reject(() => ({ formation: { front: ['unit_ann', 'unit_ann'], back: [] } }), /twice/);
    reject(() => ({ formation: { front: [], back: [] } }), /1 to 4/);
  });

  it('rejects an injured unit, a reserve unit and an unknown unit', () => {
    reject((s) => { s.squad[0].status = 'injured'; }, /not available/);
    reject((s) => { s.roster.activeIds = ['unit_bea', 'unit_cat', 'unit_dee']; return { formation: { front: ['unit_ann'], back: ['unit_bea'] } }; }, /not available/);
    reject(() => ({ formation: { front: ['ghost'], back: [] } }), /Unknown unit/);
  });

  it('rejects bad encounters', () => {
    reject(() => ({ encounter: { enemies: [{ enemyId: 'nobody', level: 1, affixes: [] }], danger: 1 } }), /Unknown enemy/);
    reject(() => ({ encounter: { enemies: [{ ...husk, affixes: ['honed'] }], danger: 1 } }), /Unknown enemy affix/);
    reject(() => ({ encounter: { enemies: [], danger: 1 } }), /1 to 6/);
    reject(() => ({ encounter: { enemies: Array.from({ length: 7 }, () => husk), danger: 1 } }), /1 to 6/);
    reject(() => ({ encounter: { enemies: [husk], danger: 1, lootTableId: 'nope' } }), /loot table/);
  });

  it('crisis needs a fielded cover unit, cover without crisis is refused', () => {
    reject(() => ({ encounter: { enemies: [husk], danger: 1, exposesCommander: true } }), /cover unit is required/);
    reject(() => ({ encounter: { enemies: [husk], danger: 1, exposesCommander: true }, coverId: 'ghost' }), /must be fielded/);
    reject(() => ({ coverId: 'unit_ann' }), /only used when the commander is exposed/);
  });

  it('refuses a second combat', () => {
    const s = fresh();
    s.combat = build(s);
    expect(checkStart(s, reg, payload(s))).toMatch(/already open/);
  });
});

// ---- turn loop on hand-built combats ------------------------------------------------------------------------------

const ctxOf = (cs: CombatState, seed = 3) => makeCtx(cs, fresh(), reg, rngOf(seed));
const strike = ['as_strike'];
const duel = (squad: FixtureCombatant[] = [{}], enemies: FixtureCombatant[] = [{}], extra: Partial<CombatState> = {}) => {
  const cs = fixtureCombat({ squad: squad.map((s) => ({ skills: strike, ...s })), enemies: enemies.map((e) => ({ skills: ['en_claw'], ...e })) });
  Object.assign(cs, { round: 0 }, extra);
  const ctx = ctxOf(cs);
  startRound(ctx);
  runUntilInput(ctx);
  return { cs, ctx };
};

describe('turn loop', () => {
  it('round 2 adds CP up to 5', () => {
    const cs = fixtureCombat();
    const ctx = ctxOf(cs);
    cs.round = 0;
    startRound(ctx);
    expect([cs.round, cs.cp]).toEqual([1, 1]);
    startRound(ctx);
    expect([cs.round, cs.cp]).toEqual([2, 2]);
    for (let i = 0; i < 6; i++) startRound(ctx);
    expect(cs.cp).toBe(5);
    expect(cs.timeline).toHaveLength(2);
  });

  it('enemy turns run until a squad unit must act', () => {
    const { cs } = duel([{ spd: 5, hp: 500, maxHp: 500 }], [{ spd: 30, hp: 500, maxHp: 500 }]);
    expect(cs.awaitingCid).toBe('s1');
    expect(cs.log.some((l) => l.kind === 'skill' && l.actor === 'e1')).toBe(true);
    expect(cs.phase).toBe('awaiting');
  });

  it('a stunned unit loses its turn', () => {
    const { cs } = duel([{ spd: 30, statuses: [{ id: 'stun', turns: 1 }] }, { spd: 5 }], [{ spd: 1, hp: 500, maxHp: 500 }]);
    expect(cs.log.some((l) => l.kind === 'pass' && l.actor === 's1')).toBe(true);
    expect(cs.awaitingCid).toBe('s2');
    expect(comb(cs, 's1').statuses.some((s) => s.id === 'stun')).toBe(false);
  });

  it('a cooldown blocks a skill for N own turns', () => {
    const { cs, ctx } = duel([{ skills: ['as_burst'], hp: 9999, maxHp: 9999, spd: 30 }], [{ hp: 9999, maxHp: 9999, def: 0, atk: 1 }]);
    const roundUsed = cs.round;
    expect(cs.awaitingCid).toBe('s1');
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_burst', targetCid: 'e1' });
    expect(comb(cs, 's1').cooldowns.as_burst).toBe(3);
    completeAction(ctx, 's1');
    runUntilInput(ctx);
    // as_burst has a cooldown of 2: her next two turns pass by themselves, the third offers it again
    expect(cs.round).toBe(roundUsed + 3);
    expect(comb(cs, 's1').cooldowns.as_burst).toBe(0);
    expect(cs.awaitingCid).toBe('s1');
    expect(cs.log.filter((l) => l.kind === 'pass' && l.actor === 's1')).toHaveLength(2);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_burst', targetCid: 'e1' });
    expect(() => performAction(ctx, 's1', { kind: 'skill', skillId: 'as_burst', targetCid: 'e1' })).toThrow(/cooldown/);
  });

  it('an ultimate needs CP or authorization', () => {
    const mk = (cp: number, statuses: FixtureCombatant['statuses'] = []) => {
      const cs = fixtureCombat({ squad: [{ skills: ['as_ult_overrun'], statuses }], enemies: [{ hp: 9999, maxHp: 9999 }], cp });
      return { cs, ctx: ctxOf(cs) };
    };
    const act = { kind: 'skill', skillId: 'as_ult_overrun' } as const;
    const poor = mk(2);
    expect(() => performAction(poor.ctx, 's1', act)).toThrow(/3 CP/);
    expect(poor.cs.cp).toBe(2);
    const rich = mk(4);
    performAction(rich.ctx, 's1', act);
    expect(rich.cs.cp).toBe(1);
    const authorized = mk(0, [{ id: 'authorized' }]);
    performAction(authorized.ctx, 's1', act);
    expect(authorized.cs.cp).toBe(0);
    expect(comb(authorized.cs, 's1').statuses.some((s) => s.id === 'authorized')).toBe(false);
  });

  it('an ultimate emits a cut-in event', () => {
    const cs = fixtureCombat({ squad: [{ cid: 's1', skills: ['as_ult_overrun'] }], enemies: [{ hp: 9999, maxHp: 9999 }], cp: 3 });
    const ctx = ctxOf(cs);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_ult_overrun' });
    expect(ctx.events.find((e) => e.type === 'combat_cutin')).toMatchObject({ kind: 'ultimate', cid: 's1', text: 'Overrun' });
    const plain = fixtureCombat({ squad: [{ skills: ['as_strike'] }], enemies: [{}] });
    const pctx = ctxOf(plain);
    performAction(pctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    expect(pctx.events).toEqual([]);
  });

  it('an illegal or missing target is rejected', () => {
    const cs = fixtureCombat({ squad: [{ skills: strike }], enemies: [{ row: 'front' }, { row: 'back' }] });
    const ctx = ctxOf(cs);
    expect(() => performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e2' })).toThrow(/Illegal target/);
    expect(() => performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike' })).toThrow(/Illegal target/);
    expect(() => performAction(ctx, 's1', { kind: 'skill', skillId: 'ghost', targetCid: 'e1' })).toThrow(/Unknown skill/);
    expect(() => performAction(ctx, 's1', { kind: 'skill', skillId: 'as_burst', targetCid: 'e1' })).toThrow(/Unknown skill/); // not in her loadout
  });

  it('wins when all enemies are down, loses when all squad units are down', () => {
    const won = duel([{ spd: 30, atk: 500 }], [{ hp: 1, maxHp: 1, spd: 1 }]);
    performAction(won.ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    expect(checkEnd(won.ctx)).toBe('won');
    const lost = duel([{ hp: 1, maxHp: 1, spd: 1, def: 0 }], [{ spd: 30, atk: 500 }]);
    expect(lost.cs.phase).toBe('ended');
    expect(lost.cs.outcome).toBe('lost');
    expect(checkEnd(lost.ctx)).toBe('lost');
  });

  it('stalemate ends as retreated at the round cap', () => {
    const cs = fixtureCombat({ squad: [{ skills: [] }, { skills: [] }], enemies: [{ skills: [] }, { skills: [] }] });
    cs.round = 0;
    const ctx = ctxOf(cs);
    startRound(ctx);
    runUntilInput(ctx);
    expect(cs.phase).toBe('ended');
    expect(cs.outcome).toBe('retreated');
    expect(cs.round).toBe(30);
  });

  it('a unit without a legal action passes', () => {
    const { cs } = duel([{ skills: [], spd: 30 }, { spd: 5 }], [{ hp: 500, maxHp: 500, spd: 1 }]);
    expect(cs.log.filter((l) => l.kind === 'pass' && l.actor === 's1').length).toBeGreaterThan(0);
    expect(cs.awaitingCid).toBe('s2');
  });

  it('a misfire wastes the action but spends its costs', () => {
    const cs = fixtureCombat({
      squad: [{ skills: ['as_burst'], passives: [{ type: 'misfire', chance: 1, source: 'defect:sensor_ghosting:down', downside: true } as never] }],
      enemies: [{ hp: 100, maxHp: 100 }],
    });
    const ctx = ctxOf(cs);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_burst', targetCid: 'e1' });
    expect(comb(cs, 'e1').hp).toBe(100);
    expect(comb(cs, 's1').cooldowns.as_burst).toBe(3);
    expect(cs.log.some((l) => l.kind === 'miss')).toBe(true);
  });

  it('an extra action lets the unit act again before the next turn, once', () => {
    const cs = fixtureCombat({ squad: [{ skills: ['sig_overclock_burst', 'as_strike'], spd: 30, hp: 9999, maxHp: 9999 }], enemies: [{ hp: 9999, maxHp: 9999, spd: 1, skills: [] }] });
    cs.round = 0;
    const ctx = ctxOf(cs);
    startRound(ctx);
    runUntilInput(ctx);
    const turnBefore = cs.turn;
    performAction(ctx, 's1', { kind: 'skill', skillId: 'sig_overclock_burst' });
    expect(cs.extraAction).toBe('s1');
    completeAction(ctx, 's1');
    expect(cs.turn).toBe(turnBefore); // the turn is not over yet
    runUntilInput(ctx);
    expect(cs.awaitingCid).toBe('s1');
    expect(cs.inExtra).toBe(true);
    performAction(ctx, 's1', { kind: 'skill', skillId: 'as_strike', targetCid: 'e1' });
    completeAction(ctx, 's1');
    expect(cs.turnStarted).toBe(false);
    expect(comb(cs, 's1').statuses.find((s) => s.id === 'stun')!.turns).toBe(1); // the stun she gave herself outlasts this turn
    runUntilInput(ctx);
    // ... and costs her the next one
    expect(cs.log.filter((l) => l.kind === 'pass' && l.actor === 's1').length).toBeGreaterThanOrEqual(1);
  });
});
