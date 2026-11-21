import type { Registries } from '../../content/types';
import { bondOf, leadRank } from '../bonds/profile';
import type { CombatState } from '../combat/types';
import { hasCapability, holderWith } from '../dynamic/capabilities';
import { standingMalus } from '../dynamic/witness';
import { impunityOf } from '../discipline/impunity';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import type { CampaignState, Hierarchy, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { compatibility } from './ballot';
import { wardenUnitId } from '../warden/state';
import { CO_COMMAND, dropCoCommand, leaderOf, powerOf } from './state';

export { leaderOf };

/**
 * Merit, standing and the squad leader (P9b §3). A unit's standing is `0.4 × merit + 0.3 × respect + 0.3 × Impunity`, times
 * her lead style; the leader is the unit ahead by the margin whose card says she pushes for power. Everything is derived
 * from state and recomputed weekly by the power day step; nothing here draws rng.
 */

/** Named living units, the LEASHSWAP warden excluded (P13: she sits above the hierarchy, not in it). */
const namedLiving = (state: CampaignState): Unit[] => {
  const warden = wardenUnitId(state);
  return state.squad.filter((u) => u.kind === 'named' && isLiving(u) && u.id !== warden);
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A combat's worth of merit (named squad units only), from its log: damage dealt to enemies ÷ 10, damage she took from enemies ÷ 20 (the
 * unit who holds the line earns it), +2 for each enemy she downed with the last blow, healing she did ÷ 10. Entries older than 14 days are forgotten. Writes nothing when there
 * is nothing to credit and no merit is kept.
 */
export function recordMerit(draft: CampaignState, cs: Pick<CombatState, 'combatants' | 'log'>): void {
  const M = TUNING.power.merit;
  const byCid = new Map(cs.combatants.map((c) => [c.cid, c]));
  const points = new Map<string, number>();
  const credit = (cid: string | undefined, n: number): void => {
    const unitId = cid === undefined ? undefined : byCid.get(cid)?.unitId;
    const c = cid === undefined ? undefined : byCid.get(cid);
    if (!c || c.side !== 'squad' || unitId === undefined) return;
    points.set(unitId, (points.get(unitId) ?? 0) + n);
  };
  const isEnemy = (cid: string | undefined): boolean => {
    const c = cid === undefined ? undefined : byCid.get(cid);
    return c !== undefined && c.side === 'enemy' && c.enemyId !== undefined;
  };
  for (const e of cs.log) {
    if ((e.kind === 'hit' || e.kind === 'crit') && isEnemy(e.target)) credit(e.actor, (e.amount ?? 0) / M.damagePer);
    // a hit an enemy lands on a squad unit is merit for the one who stood there (the defender who holds the line earns it)
    else if ((e.kind === 'hit' || e.kind === 'crit') && isEnemy(e.actor) && byCid.get(e.target ?? '')?.side === 'squad') credit(e.target, (e.amount ?? 0) / M.absorbPer);
    else if (e.kind === 'downed' && isEnemy(e.target)) credit(e.actor, M.finishingBlow);
    else if (e.kind === 'heal') credit(e.actor, (e.amount ?? 0) / M.healPer);
  }
  const fresh = [...points].filter(([id, n]) => n > 0 && draft.squad.find((u) => u.id === id)?.kind === 'named');
  if (fresh.length === 0 && !draft.power?.merit) return;
  const power = powerOf(draft);
  power.merit = (power.merit ?? []).filter((m) => draft.day - m.day < M.windowDays);
  for (const c of cs.combatants) {
    const hit = fresh.find(([id]) => id === c.unitId);
    if (hit) power.merit.push({ day: draft.day, unitId: hit[0], points: round2(hit[1]) });
  }
  if (power.merit.length === 0) delete power.merit;
}

/** Her merit of the last 14 days against the highest in the squad: 0…1 (0 when nobody has any). */
export function meritOf(state: CampaignState, unitId: string): number {
  const days = TUNING.power.merit.windowDays;
  const sums = new Map<string, number>();
  for (const m of state.power?.merit ?? []) if (state.day - m.day < days) sums.set(m.unitId, (sums.get(m.unitId) ?? 0) + m.points);
  const best = Math.max(0, ...sums.values());
  return best <= 0 ? 0 : (sums.get(unitId) ?? 0) / best;
}

/** How the squad takes to her, approximated by values compatibility until squad relations exist: the mean with the other named living units (0.5 alone). */
export function respectOf(state: CampaignState, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  const others = namedLiving(state).filter((u) => u.id !== unitId);
  if (!unit || others.length === 0) return 0.5;
  return others.reduce((sum, o) => sum + compatibility(unit, o), 0) / others.length;
}

/** `round(100 × (0.4 merit + 0.3 respect + 0.3 Impunity/100) × lead-style factor)`, plus a lost-challenge bonus while it holds. Named living units only. */
export function standingOf(state: CampaignState, reg: Registries, unitId: string): number | null {
  const unit = state.squad.find((u) => u.id === unitId);
  const bond = unit ? bondOf(unit) : null;
  if (!unit || !bond || !isLiving(unit) || unitId === wardenUnitId(state)) return null;
  const impunity = impunityOf(state, reg, unitId);
  if (!impunity) return null;
  const S = TUNING.power.standing;
  const raw = S.merit * meritOf(state, unitId) + S.respect * respectOf(state, unitId) + S.impunity * (impunity.value / 100);
  const bonus = state.power?.hierarchy?.standingBonus;
  const extra = bonus && bonus.unitId === unitId && bonus.untilDay > state.day ? bonus.amount : 0;
  const coLeader = hasCapability(state, reg, unitId, 'co_leader') ? TUNING.dynamic.coLeaderStanding : 0; // P15: addressed as the one in command
  return Math.round(100 * raw * S.factor[bond.leadStyle]) + extra + coLeader - standingMalus(state, reg, unitId); // P15: the witnesses who dislike what she holds over the commander
}

/**
 * Works out every standing and the leader (weekly, from the day step): the top unit leads when she is ahead of the next by the
 * margin, her card says she pushes for power (`leadRank` ≥ 2) and she is not deposed; a lone named unit never leads. A change
 * emits `leader_changed { from?, to? }`, writes a public fact for each side and takes the endorsement away.
 */
export function computeHierarchy(draft: CampaignState, reg: Registries): EngineEvent[] {
  const power = powerOf(draft);
  const old = power.hierarchy;
  const S = TUNING.power.standing;
  const h: Hierarchy = { ...old, standings: {}, endorsed: old?.endorsed ?? false, computedDay: draft.day };
  if (h.deposed && h.deposed.untilDay <= draft.day) delete h.deposed;
  if (h.standingBonus && h.standingBonus.untilDay <= draft.day) delete h.standingBonus;
  power.hierarchy = h;
  const ranked = namedLiving(draft)
    .map((u) => ({ unit: u, standing: standingOf(draft, reg, u.id) }))
    .filter((r): r is { unit: Unit; standing: number } => r.standing !== null);
  for (const r of ranked) h.standings[r.unit.id] = r.standing;
  ranked.sort((a, b) => b.standing - a.standing);
  const [top, next] = ranked;
  let leader: string | undefined;
  // leadership is earned in a fight and kept by standing: a unit who is not the leader yet needs merit of her own to become one
  const earned = top !== undefined && (top.unit.id === old?.leaderId || meritOf(draft, top.unit.id) > 0);
  if (top && next && earned && top.standing >= next.standing + S.margin && leadRank(bondOf(top.unit)!.leadStyle) >= 2 && h.deposed?.unitId !== top.unit.id) leader = top.unit.id;

  const coLeader = holderWith(draft, reg, 'co_leader'); // P15: the holder of the command is marked, whether or not she leads
  if (coLeader === null) delete h.coLeaderId;
  else h.coLeaderId = coLeader;
  const from = old?.leaderId;
  if (leader === undefined) delete h.leaderId;
  else h.leaderId = leader;
  return changeLeader(draft, reg, from, leader);
}

const nameFor = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * Reports a change of leader (the hierarchy already holds the new one): `leader_changed { from?, to? }`, a public fact for each
 * side, the endorsement gone and `co_command` taken off her who no longer leads. No event when nothing changed.
 */
export function changeLeader(draft: CampaignState, reg: Registries, from: string | undefined, to: string | undefined): EngineEvent[] {
  if (from === to) return [];
  const h = powerOf(draft).hierarchy;
  if (h) h.endorsed = false;
  if (from !== undefined) dropCoCommand(draft, reg, from);
  const fact = (id: string, text: string): void => {
    addFact(draft, { about: [id], text, tags: ['hierarchy'], importance: 3, day: draft.day, knownBy: ['*'] });
  };
  if (from !== undefined) fact(from, `The squad no longer looks to ${nameFor(draft, from)}.`);
  if (to !== undefined) fact(to, `${nameFor(draft, to)} has become the one the squad looks to.`);
  return [{ type: 'leader_changed', ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) }];
}
