import type { Registries } from '../../content/types';
import { bondOf, leadRank } from '../bonds/profile';
import type { CombatState } from '../combat/types';
import { impunityOf } from '../discipline/impunity';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import type { CampaignState, Hierarchy, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { compatibility } from './ballot';
import { powerOf } from './state';

/**
 * Merit, standing and the squad leader (P9b §3). A unit's standing is `0.4 × merit + 0.3 × respect + 0.3 × Impunity`, times
 * her lead style; the leader is the unit ahead by the margin whose card says she pushes for power. Everything is derived
 * from state and recomputed weekly by the power day step; nothing here draws rng.
 */

const namedLiving = (state: CampaignState): Unit[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A combat's worth of merit (named squad units only), from its log: damage dealt to enemies ÷ 10, +5 for each enemy she
 * downed with the last blow, healing she did ÷ 10. Entries older than 14 days are forgotten. Writes nothing when there
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
  if (!unit || !bond || !isLiving(unit)) return null;
  const impunity = impunityOf(state, reg, unitId);
  if (!impunity) return null;
  const S = TUNING.power.standing;
  const raw = S.merit * meritOf(state, unitId) + S.respect * respectOf(state, unitId) + S.impunity * (impunity.value / 100);
  const bonus = state.power?.hierarchy?.standingBonus;
  const extra = bonus && bonus.unitId === unitId && bonus.untilDay > state.day ? bonus.amount : 0;
  return Math.round(100 * raw * S.factor[bond.leadStyle]) + extra;
}

/** The squad leader, or null: the unit the hierarchy names, if she is still a named unit in service. */
export function leaderOf(state: Pick<CampaignState, 'power' | 'squad'>): Unit | null {
  const id = state.power?.hierarchy?.leaderId;
  const unit = id === undefined ? undefined : state.squad.find((u) => u.id === id);
  return unit && unit.kind === 'named' && isLiving(unit) ? unit : null;
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

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
  if (top && next && top.standing >= next.standing + S.margin && leadRank(bondOf(top.unit)!.leadStyle) >= 2 && h.deposed?.unitId !== top.unit.id) leader = top.unit.id;

  const events: EngineEvent[] = [];
  const from = old?.leaderId;
  if (leader === undefined) delete h.leaderId;
  else h.leaderId = leader;
  if (from !== leader) {
    h.endorsed = false;
    events.push({ type: 'leader_changed', ...(from !== undefined ? { from } : {}), ...(leader !== undefined ? { to: leader } : {}) });
    const fact = (id: string, text: string): void => {
      addFact(draft, { about: [id], text, tags: ['hierarchy'], importance: 3, day: draft.day, knownBy: ['*'] });
    };
    if (from !== undefined) fact(from, `The squad no longer looks to ${nameOf(draft, from)}.`);
    if (leader !== undefined) fact(leader, `${nameOf(draft, leader)} has become the one the squad looks to.`);
  }
  return events;
}
