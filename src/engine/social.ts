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

export const socialRank = (state: CampaignState, stat: SocialStat): number => state.commander.socialStats[stat];

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
  const next = Math.min(MAX_POINTS, points[stat] + amount);
  const gained = next - points[stat];
  points[stat] = next;
  const rank = Math.max(before, rankForPoints(next));
  commander.socialStats[stat] = rank;
  return { rank, gained, rankedUp: rank > before };
}

/** Queryable by P3/P6/UI, e.g. `{ empathy: 3 }`. */
export function meetsSocialRequirements(state: CampaignState, requires: Partial<Record<SocialStat, number>>): boolean {
  return (Object.entries(requires) as Array<[SocialStat, number]>).every(([stat, min]) => socialRank(state, stat) >= min);
}
