import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { defaultFormation } from '../../../src/engine/combat';
import { finalizeCombat } from '../../../src/engine/combat/outcome';
import type { CombatState, LogEntry } from '../../../src/engine/combat/types';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { removeFromService } from '../../../src/engine/leash/use';
import { compatibility } from '../../../src/engine/power/ballot';
import { powerDayStep } from '../../../src/engine/power/dayStep';
import { computeHierarchy, leaderOf, meritOf, recordMerit, respectOf, standingOf } from '../../../src/engine/power/standing';
import { Rng, seedRng } from '../../../src/engine/rng';
import { TUNING } from '../../../src/engine/tuning';
import type { Bond, CampaignState } from '../../../src/engine/state/types';
import { ctxOf } from '../../helpers/world';
import { campaign, endDay, loadCore, run, setRelation } from '../../helpers/loyalty';
import { withBond } from '../../helpers/bonds';
import { withLeader } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };

/** Four named units: equal values (respect 1), equal Trust, no merit, and the given lead styles (default balanced). */
function squad(styles: Partial<Record<string, Bond['leadStyle']>> = {}): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  for (const u of s.squad) {
    u.values = { ...ZERO };
    setRelation(s, u.id, { trust: 50 });
    withBond(s, u.id, { leadStyle: styles[u.id] ?? 'balanced' });
  }
  return s;
}
const merit = (s: CampaignState, unitId: string, points: number, day = s.day): void => {
  (s.power ??= { votes: { log: [], seq: 0 } }).merit = [...(s.power?.merit ?? []), { day, unitId, points }];
};
const bonus = (s: CampaignState, unitId: string, amount: number): void => {
  const p = (s.power ??= { votes: { log: [], seq: 0 } });
  p.hierarchy = { standings: {}, endorsed: false, computedDay: -99, ...(p.hierarchy ?? {}), standingBonus: { unitId, amount, untilDay: s.day + 14 } };
};
const compute = (s: CampaignState) => {
  const draft = structuredClone(s);
  const events = computeHierarchy(draft, reg);
  return { draft, events };
};

describe('merit', () => {
  it('counts damage, finishing blows and heals; older than 14 days drops out', () => {
    const s = squad();
    s.day = 30;
    merit(s, ANN, 10, 10); // 20 days old
    merit(s, ANN, 5, 17); // 13 days old: counts
    merit(s, BEA, 10, 30);
    expect(meritOf(s, ANN)).toBe(0.5); // her 20-day-old 10 is gone: 5 against the highest, 10
    expect(meritOf(s, BEA)).toBe(1);
    expect(meritOf(s, CAT)).toBe(0);
    expect(meritOf(squad(), ANN)).toBe(0); // nobody has merit
  });

  it('finalizeCombat writes one entry per named squad unit from the combat log', () => {
    const s0 = squad();
    const open = run(s0, reg, {
      type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(s0, reg, s0.roster.activeIds) },
    }).state;
    const draft = structuredClone(open);
    const cs = draft.combat as CombatState;
    const cid = (u: string) => cs.combatants.find((c) => c.unitId === u)!.cid;
    const foe = cs.combatants.find((c) => c.side === 'enemy')!;
    const log: LogEntry[] = [
      { round: 1, kind: 'hit', actor: cid(ANN), target: foe.cid, amount: 25 },
      { round: 1, kind: 'crit', actor: cid(ANN), target: foe.cid, amount: 40 },
      { round: 1, kind: 'hit', actor: foe.cid, target: cid(BEA), amount: 99 }, // the enemy's hit on her is merit for the one who took it
      { round: 2, kind: 'downed', actor: cid(ANN), target: foe.cid },
      { round: 2, kind: 'heal', actor: cid(BEA), target: cid(ANN), amount: 30 },
      { round: 2, kind: 'heal', target: cid(ANN), amount: 50 }, // no healer on the entry: nobody's
    ];
    cs.log = log;
    foe.downed = true;
    foe.hp = 0;
    finalizeCombat(draft, reg, new Rng(seedRng(3)), 'won');
    expect(draft.power!.merit!.map((m) => ({ ...m, points: Math.round(m.points * 100) / 100 }))).toEqual([
      { day: draft.day, unitId: ANN, points: 6.5 + TUNING.power.merit.finishingBlow }, // 65 damage / 10 and one finishing blow
      { day: draft.day, unitId: BEA, points: 3 + 99 / TUNING.power.merit.absorbPer }, // 30 healed / 10, and 99 damage taken from the enemy
    ]);
  });

  it('a grunt earns no merit and a combat with nothing to credit writes nothing', () => {
    const s0 = squad();
    const open = run(s0, reg, {
      type: 'combat/start', payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(s0, reg, s0.roster.activeIds) },
    }).state;
    const draft = structuredClone(open);
    draft.combat!.log = [];
    finalizeCombat(draft, reg, new Rng(seedRng(3)), 'won');
    expect(draft.power).toBeUndefined();
  });

  it('recordMerit forgets entries older than 14 days', () => {
    const s = squad();
    merit(s, ANN, 4, 2);
    s.day = 20;
    const cs = { combatants: [{ cid: 's1', side: 'squad', unitId: BEA }, { cid: 'e1', side: 'enemy', enemyId: 'husk' }], log: [{ round: 1, kind: 'hit', actor: 's1', target: 'e1', amount: 20 }] } as unknown as CombatState;
    recordMerit(s, cs);
    expect(s.power!.merit).toEqual([{ day: 20, unitId: BEA, points: 2 }]);
  });
});

describe('standing', () => {
  it('matches the formula: 0.4 merit + 0.3 respect + 0.3 Impunity, times the lead style', () => {
    const s = squad({ [ANN]: 'dominant', [BEA]: 'balanced', [CAT]: 'yielding', [DEE]: 'assertive' });
    unitValues(s, ANN, { corporate: 3 });
    merit(s, ANN, 30);
    merit(s, BEA, 15);
    const factor = { dominant: 1.3, assertive: 1.15, balanced: 1, yielding: 0.7 } as const;
    const style: Record<string, keyof typeof factor> = { [ANN]: 'dominant', [BEA]: 'balanced', [CAT]: 'yielding', [DEE]: 'assertive' };
    const m = { [ANN]: 1, [BEA]: 0.5, [CAT]: 0, [DEE]: 0 };
    for (const id of [ANN, BEA, CAT, DEE]) {
      const others = [ANN, BEA, CAT, DEE].filter((x) => x !== id);
      const unit = (x: string) => s.squad.find((u) => u.id === x)!;
      const respect = others.reduce((n, x) => n + compatibility(unit(id), unit(x)), 0) / others.length;
      const impunity = impunityOf(s, reg, id)!.value;
      const expected = Math.round(100 * (0.4 * m[id as keyof typeof m] + 0.3 * respect + 0.3 * (impunity / 100)) * factor[style[id]]);
      expect(respectOf(s, id), id).toBeCloseTo(respect, 10);
      expect(standingOf(s, reg, id), id).toBe(expected);
    }
    expect(standingOf(s, reg, ANN)!).toBeGreaterThan(standingOf(s, reg, BEA)!);
  });

  it('respect is 0.5 for a unit alone, a grunt or someone out of service has no standing, a lost-challenge bonus adds', () => {
    const s = squad();
    for (const id of [BEA, CAT, DEE]) s.squad.find((u) => u.id === id)!.status = 'dead';
    expect(respectOf(s, ANN)).toBe(0.5);
    const g = squad();
    g.squad.push({ ...structuredClone(g.squad[0]), id: 'grunt_1', kind: 'grunt', displayName: 'G-1' });
    expect(standingOf(g, reg, 'grunt_1')).toBeNull();
    expect(standingOf(g, reg, 'unit_ghost')).toBeNull();
    g.squad.find((u) => u.id === DEE)!.status = 'dead';
    expect(standingOf(g, reg, DEE)).toBeNull();
    const base = standingOf(squad(), reg, ANN)!;
    const b = squad();
    bonus(b, ANN, 10);
    expect(standingOf(b, reg, ANN)).toBe(base + 10);
    b.power!.hierarchy!.standingBonus!.untilDay = b.day - 1; // expired
    expect(standingOf(b, reg, ANN)).toBe(base);
  });
});

const unitValues = (s: CampaignState, id: string, v: Partial<typeof ZERO>): void => {
  s.squad.find((u) => u.id === id)!.values = { ...ZERO, ...v };
};

describe('the leader', () => {
  /** ANN dominant, the rest balanced: the gap is her lead-style factor; `gap` tunes the margin through the runner-up's bonus. */
  function margin(gap: number): CampaignState {
    const s = squad({ [ANN]: 'dominant' });
    merit(s, ANN, 1); // she has fought: leadership is earned
    const a = standingOf(s, reg, ANN)!;
    const b = standingOf(s, reg, BEA)!;
    bonus(s, BEA, a - b - gap);
    return s;
  }

  it('a dominant unit 10 ahead becomes leader; 9 ahead does not', () => {
    const lead = compute(margin(10));
    expect(lead.draft.power!.hierarchy).toMatchObject({ leaderId: ANN, endorsed: false, computedDay: 20 });
    expect(leaderOf(lead.draft)!.id).toBe(ANN);
    const no = compute(margin(9));
    expect(no.draft.power!.hierarchy!.leaderId).toBeUndefined();
    expect(leaderOf(no.draft)).toBeNull();
    expect(Object.keys(no.draft.power!.hierarchy!.standings).sort()).toEqual([ANN, BEA, CAT, DEE].sort());
  });

  it('a balanced or modest unit never becomes leader, however far ahead', () => {
    const s = squad();
    merit(s, ANN, 100);
    bonus(s, ANN, 40);
    const r = compute(s);
    expect(standingOf(r.draft, reg, ANN)!).toBeGreaterThan(standingOf(r.draft, reg, BEA)! + 10);
    expect(r.draft.power!.hierarchy!.leaderId).toBeUndefined();
    const modest = campaign(reg, 4); // the import default bond is modest = balanced
    modest.day = 20;
    merit(modest, ANN, 100);
    expect(compute(modest).draft.power!.hierarchy!.leaderId).toBeUndefined();
  });

  it('a dominant unit with no merit anywhere does not become leader; an incumbent keeps it without merit', () => {
    const s = squad({ [ANN]: 'dominant' });
    const a = standingOf(s, reg, ANN)!;
    const b = standingOf(s, reg, BEA)!;
    bonus(s, BEA, a - b - 10); // a lead of exactly 10 from her lead style alone
    expect(compute(s).draft.power!.hierarchy!.leaderId).toBeUndefined();
    merit(s, ANN, 1);
    const earned = standingOf(s, reg, ANN)!;
    bonus(s, BEA, earned - standingOf(s, reg, BEA)! + (s.power!.hierarchy!.standingBonus?.amount ?? 0) - 10);
    const lead = compute(s).draft;
    expect(lead.power!.hierarchy!.leaderId).toBe(ANN);
    // two weeks later the merit has aged out, but she keeps the lead while her margin holds
    const later = structuredClone(lead);
    later.day += 15;
    later.power!.hierarchy!.standingBonus!.untilDay = later.day + 30;
    const gap = standingOf(later, reg, ANN)! - standingOf(later, reg, BEA)!;
    later.power!.hierarchy!.standingBonus!.amount += gap - 10;
    computeHierarchy(later, reg);
    expect(later.power!.hierarchy!.leaderId).toBe(ANN);
  });

  it('a lone named unit is never leader', () => {
    const s = squad({ [ANN]: 'dominant' });
    for (const id of [BEA, CAT, DEE]) s.squad.find((u) => u.id === id)!.status = 'dead';
    merit(s, ANN, 50);
    expect(compute(s).draft.power!.hierarchy!.leaderId).toBeUndefined();
  });

  it('a unit that was deposed cannot lead until the day passes', () => {
    const s = margin(10);
    s.power!.hierarchy!.deposed = { unitId: ANN, untilDay: s.day + 3 };
    expect(compute(s).draft.power!.hierarchy!.leaderId).toBeUndefined();
    s.power!.hierarchy!.deposed.untilDay = s.day;
    const r = compute(s);
    expect(r.draft.power!.hierarchy!.leaderId).toBe(ANN);
    expect(r.draft.power!.hierarchy!.deposed).toBeUndefined();
  });

  it('leader_changed writes the public fact and clears endorsed', () => {
    const first = compute(margin(10));
    expect(first.events).toEqual([{ type: 'leader_changed', to: ANN }]);
    const fact = first.draft.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ text: 'Ann has become the one the squad looks to.', knownBy: ['*'] });
    first.draft.power!.hierarchy!.endorsed = true;
    first.draft.power!.hierarchy!.standingBonus = { unitId: BEA, amount: 99, untilDay: first.draft.day + 5 }; // she falls behind
    const second = computeHierarchy(first.draft, reg);
    expect(second).toEqual([{ type: 'leader_changed', from: ANN }]);
    expect(first.draft.memory.facts.at(-1)!.text).toBe('The squad no longer looks to Ann.');
    expect(first.draft.power!.hierarchy).toMatchObject({ endorsed: false });
    expect(first.draft.power!.hierarchy!.leaderId).toBeUndefined();
    expect(computeHierarchy(first.draft, reg)).toEqual([]); // no change, no event
  });

  it('a new leader replacing an old one reports both', () => {
    const s = margin(10);
    const a = compute(s).draft;
    withBond(a, BEA, { leadStyle: 'dominant' });
    merit(a, BEA, 500);
    const ev = computeHierarchy(a, reg);
    expect(ev).toEqual([{ type: 'leader_changed', from: ANN, to: BEA }]);
  });

  it('removeFromService of the leader clears her at once', () => {
    const s = squad({ [ANN]: 'dominant' });
    withLeader(s, ANN, { endorsed: true });
    merit(s, ANN, 20);
    merit(s, BEA, 10);
    s.power!.hierarchy!.deposed = { unitId: ANN, untilDay: s.day + 5 };
    removeFromService(s, ANN, 'deserted');
    expect(s.power!.hierarchy).toMatchObject({ endorsed: false });
    expect(s.power!.hierarchy!.leaderId).toBeUndefined();
    expect(s.power!.hierarchy!.standings[ANN]).toBeUndefined();
    expect(s.power!.hierarchy!.deposed).toBeUndefined();
    expect(s.power!.merit!.map((m) => m.unitId)).toEqual([BEA]);
    expect(leaderOf(s)).toBeNull();
  });

  it('a leader who died is not read as the leader', () => {
    const s = squad({ [ANN]: 'dominant' });
    withLeader(s, ANN);
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(leaderOf(s)).toBeNull();
  });
});

describe('the day step', () => {
  it('recomputes only weekly', () => {
    const s = margin7();
    const draft = structuredClone(s);
    const ctx = ctxOf(draft, reg);
    powerDayStep(draft, ctx);
    expect(draft.power!.hierarchy).toMatchObject({ leaderId: ANN, computedDay: 20 });
    delete draft.power!.hierarchy!.leaderId; // a change that a recompute would repair
    draft.day = 26;
    powerDayStep(draft, ctx);
    expect(draft.power!.hierarchy!.leaderId).toBeUndefined(); // 6 days: not due
    draft.day = 27;
    powerDayStep(draft, ctx);
    expect(draft.power!.hierarchy).toMatchObject({ leaderId: ANN, computedDay: 27 });
  });

  it('acceptance 6: nothing changes with voting off and no leader', () => {
    const s = campaign(reg, 4); // modest bond profiles: no unit can lead
    s.resources.supplies = 100;
    const before = structuredClone(s);
    const draft = structuredClone(s);
    const ctx = ctxOf(draft, reg);
    const rngBefore = JSON.stringify(ctx.rng.state);
    for (let day = 1; day <= 8; day++) {
      draft.day = day;
      powerDayStep(draft, ctx);
    }
    draft.day = before.day;
    expect(JSON.stringify(ctx.rng.state)).toBe(rngBefore);
    expect(draft.power!.hierarchy!.leaderId).toBeUndefined();
    expect(Object.keys(draft.power!).sort()).toEqual(['hierarchy', 'votes']);
    const { power: _a, ...rest } = draft;
    const { power: _b, ...was } = before;
    expect(rest).toEqual(was);
    // through the real day end, seven times: still no leader, no gate, no vote
    let cur = s;
    for (let i = 0; i < 7; i++) cur = endDay({ ...cur, resources: { ...cur.resources, supplies: 100 } }, reg);
    expect(cur.power!.hierarchy!.leaderId).toBeUndefined();
    expect(cur.power!.votes.open).toBeUndefined();
  });

  it('a save without power gets only the hierarchy standings', () => {
    const s = campaign(reg, 4);
    s.resources.supplies = 100;
    const after = endDay(s, reg);
    expect(after.power).toEqual({ votes: { log: [], seq: 0 }, hierarchy: { standings: expect.any(Object), endorsed: false, computedDay: s.day } });
  });

  it('writes a standing ledger entry when a standing changes', () => {
    const s = squad({ [ANN]: 'dominant' });
    s.resources.supplies = 100;
    const first = endDay(s, reg);
    expect(first.ledger?.some((e) => e.key.startsWith('standing:')) ?? false).toBe(false); // the first computation is not a change
    const moved = structuredClone(first);
    moved.resources.supplies = 100;
    merit(moved, ANN, 50);
    moved.power!.hierarchy!.computedDay = -99; // due now
    const after = endDay(moved, reg);
    expect(after.ledger!.some((e) => e.key === `standing:${ANN}` && e.delta > 0)).toBe(true);
  });
});

function margin7(): CampaignState {
  const s = squad({ [ANN]: 'dominant' });
  merit(s, ANN, 1);
  const a = standingOf(s, reg, ANN)!;
  const b = standingOf(s, reg, BEA)!;
  bonus(s, BEA, a - b - 10);
  delete (s.power!.hierarchy as { computedDay?: number }).computedDay;
  return s;
}
