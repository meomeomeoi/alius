import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { OUTSIDE_TRIGGERS, type CampaignState, type OutsideTrigger } from '../state/types';
import { TUNING } from '../tuning';
import { leaderOf, powerOf } from './state';

/**
 * Outside perception (P9b §4): while a squad leader exists, outsiders (oversight, traders, enemy commanders) address her as
 * the one who really runs the unit. A visible feat of the commander suppresses that for 14 days; endorsing her makes it the
 * official arrangement and it is never suppressed. The only effects built are the directive (Task 11) and the Leash `cc`.
 */

export { OUTSIDE_TRIGGERS, type OutsideTrigger };

/** Is the effect on: a leader exists and (she is endorsed or no feat holds it back today). */
export function outsideActive(state: CampaignState): boolean {
  if (!leaderOf(state)) return false;
  const h = state.power?.hierarchy;
  return h?.endorsed === true || state.day >= (h?.outsideSuppressedUntil ?? 0);
}

/** Days left of the feat's suppression (0 when none holds or she is endorsed). */
export function outsideSuppressedFor(state: CampaignState): number {
  const h = state.power?.hierarchy;
  if (!h || h.endorsed) return 0;
  return Math.max(0, (h.outsideSuppressedUntil ?? 0) - state.day);
}

/**
 * The commander did something outsiders saw: the first feat of the registry with this trigger holds the effect back for 14
 * days. Noted even with no leader, so a leader who rises later starts suppressed. Draws no rng.
 */
export function noteFeat(draft: CampaignState, reg: Registries, trigger: OutsideTrigger): EngineEvent[] {
  const feat = [...reg.outsideFeats.values()].find((f) => f.trigger === trigger);
  if (!feat) return [];
  const power = powerOf(draft);
  // a hierarchy that was never computed is due at the next day end
  power.hierarchy ??= { standings: {}, endorsed: false, computedDay: draft.day - TUNING.power.standing.recomputeDays };
  power.hierarchy.outsideSuppressedUntil = draft.day + TUNING.power.outside.suppressDays;
  return [{ type: 'outside_feat', featId: String(feat.id) }];
}

/** A `dilemma_resolved` that counts as a negotiation: a passed social route or a passed check (a passed body route is not one). */
export function negotiationHolds(e: { [key: string]: unknown }): boolean {
  return (e.routePassed === true && e.routeKind === 'social') || e.checkPassed === true;
}
