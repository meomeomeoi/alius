import type { Registries } from '../../content/types';
import { unitObeys } from '../personal/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState, Countermand } from '../state/types';
import { TUNING } from '../tuning';
import { assertiveness } from './options';
import { leaderOf, powerOf } from './state';

/**
 * What a squad leader can do (P9b §3): her vote weighs more, the squad follows her lead on a vote, her record weighs more in
 * the contagion of Impunity, and she may countermand a minor non-combat order. Everything scales with the world's
 * `squad_assertiveness` and with the commander's endorsement.
 */

/** `privilegeMult` of the world × 1.5 while the commander has endorsed the leader; 1 with no leader. */
export function privilegeScale(state: CampaignState, reg: Registries): number {
  if (!leaderOf(state)) return 1;
  return assertiveness(state, reg).privilegeMult * (state.power?.hierarchy?.endorsed === true ? TUNING.power.endorse.multiplier : 1);
}

/** The leader's vote: `1 × 1.5 × privilegeScale`. */
export function leaderVoteWeight(state: CampaignState, reg: Registries): number {
  return TUNING.power.vote.leaderWeight * privilegeScale(state, reg);
}

/** Her chance to countermand one activity: `0.2 × privilegeScale`, at most 0.6; 0 with no leader. */
export function countermandChance(state: CampaignState, reg: Registries): number {
  const leader = leaderOf(state);
  if (!leader || unitObeys(state, leader.id)) return 0; // P9c: a leader who obeys the commander today countermands nothing
  const C = TUNING.power.countermand;
  return Math.min(C.cap, C.chance * privilegeScale(state, reg));
}

/** The countermand waiting for ACCEPT / OVERRULE: it lives for the slot it was made in. */
export function countermandOpen(state: Pick<CampaignState, 'power' | 'day' | 'slot'>): Countermand | null {
  const c = state.power?.countermand;
  return c !== undefined && c.day === state.day && c.slot === state.slot ? c : null;
}

/** What an activity request names (the part the roll reads). */
export interface CountermandRequest { activityId: string; companionId?: string; unitIds?: string[] }

/**
 * Rolls the leader's countermand for an activity (`null`: none, nothing was drawn or the roll missed). Only while a leader
 * exists, only for an activity the content marks `countermandable`, and only when it names a named unit other than her (the
 * companion, else the units picked for it). On a hit nothing of the activity happens; the countermand waits for an answer.
 */
export function rollCountermand(draft: CampaignState, ctx: EngineCtx, req: CountermandRequest): EngineEvent[] | null {
  const leader = leaderOf(draft);
  if (!leader || unitObeys(draft, leader.id)) return null;
  if ((ctx.registries.activities.get(req.activityId) as { countermandable?: boolean } | undefined)?.countermandable !== true) return null;
  const named = (id: string): boolean => draft.squad.some((u) => u.id === id && u.kind === 'named') && id !== leader.id;
  const unitId = (req.companionId !== undefined ? [req.companionId] : req.unitIds ?? []).find(named);
  if (unitId === undefined) return null;
  if (!ctx.rng.chance(countermandChance(draft, ctx.registries))) return null;
  const { countermandChecked: _skip, ...payload } = req as CountermandRequest & { countermandChecked?: boolean };
  powerOf(draft).countermand = { leaderId: leader.id, unitId, payload, day: draft.day, slot: draft.slot };
  return [{ type: 'countermanded', leaderId: leader.id, unitId, activityId: req.activityId }];
}
