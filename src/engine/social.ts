import type { Registries } from '../content/types';
import { traitEffects } from './commander/traits';
import type { CampaignState, Commander } from './state/types';

export const SOCIAL_STATS = ['authority', 'insight', 'empathy', 'cunning'] as const;
export type SocialStat = (typeof SOCIAL_STATS)[number];

/** Points needed for rank 1…5. */
export const SOCIAL_THRESHOLDS = [0, 10, 25, 45, 70] as const;
const MAX_RANK = SOCIAL_THRESHOLDS.length;
const MAX_POINTS = SOCIAL_THRESHOLDS[MAX_RANK - 1];

export function rankForPoints(points: number): number {
  let rank = 1;
  SOCIAL_THRESHOLDS.forEach((t, i) => {
    if (points >= t) rank = i + 1;
  });
  return rank;
}

/** The effective rank: the stored one, lowered on a sleepless day by the trait's `sleepless_rank` (never below 1). */
export function socialRank(state: CampaignState, stat: SocialStat): number {
  const rank = state.commander.socialStats[stat];
  if (state.commander.sleeplessDay !== state.day) return rank;
  return Math.max(1, rank + (state.commander.sleeplessRank?.[stat] ?? 0));
}

/** Multiplier on this stat's activity points from the commander's `social_growth` traits. */
export function socialGrowthMult(state: CampaignState, reg: Registries, stat: SocialStat): number {
  return traitEffects(state, reg, 'social_growth').filter((fx) => fx.stat === stat).reduce((m, fx) => m * fx.mult, 1);
}

/**
 * Adds points to a stat. Without stored points the current rank counts as its threshold, so a rank
 * granted by a start (P1) is never lost. Ranks never go down.
 */
export function addSocialPoints(
  commander: Commander, stat: SocialStat, amount: number,
): { rank: number; gained: number; rankedUp: boolean } {
  const before = commander.socialStats[stat];
  const points = (commander.socialPoints ??= {
    authority: SOCIAL_THRESHOLDS[commander.socialStats.authority - 1] ?? 0,
    insight: SOCIAL_THRESHOLDS[commander.socialStats.insight - 1] ?? 0,
    empathy: SOCIAL_THRESHOLDS[commander.socialStats.empathy - 1] ?? 0,
    cunning: SOCIAL_THRESHOLDS[commander.socialStats.cunning - 1] ?? 0,
  });
  // a rank raised elsewhere (a start effect, P6) lifts the points to its threshold
  const floor = SOCIAL_THRESHOLDS[before - 1] ?? 0;
  const next = Math.min(MAX_POINTS, Math.max(points[stat], floor) + amount);
  const gained = next - Math.max(points[stat], floor);
  points[stat] = next;
  const rank = Math.max(before, rankForPoints(next));
  commander.socialStats[stat] = rank;
  return { rank, gained, rankedUp: rank > before };
}

/** Queryable by P3/P6/UI, e.g. `{ empathy: 3 }`. */
export function meetsSocialRequirements(state: CampaignState, requires: Partial<Record<SocialStat, number>>): boolean {
  return (Object.entries(requires) as Array<[SocialStat, number]>).every(([stat, min]) => socialRank(state, stat) >= min);
}
