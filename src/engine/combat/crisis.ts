import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { Rng } from '../rng';
import type { Archetype, CampaignState, BodyStat } from '../state/types';
import { archetypeOf, commanderProfile } from '../commander/profile';
import { TUNING } from '../tuning';
import type { PresenceKind } from './types';

/**
 * P7: the commander's side of combat. Rules only; the combat modules call these at a few hook points.
 */

/** 20 + 10 × endurance (trait effects join in P7 Task 11), at least `crisisHpMin`. */
export function commanderMaxHp(state: CampaignState, _reg: Registries): number {
  const t = TUNING.commander;
  return Math.max(t.crisisHpMin, t.crisisHpBase + t.crisisHpPerEndurance * commanderProfile(state).body.endurance);
}

/** The commander's dodge chance against a hit that reaches him: 6 % × reflexes. */
export const dodgeChance = (state: CampaignState): number => TUNING.commander.dodgePerReflex * commanderProfile(state).body.reflexes;

/** The once-per-combat presence action of an archetype. */
export function presenceKind(archetype: Archetype): PresenceKind {
  return archetype === 'frail' || archetype === 'slight' ? 'unnoticed' : archetype === 'average' ? 'steady_voice' : 'rally';
}

/** The stats a Crisis scar can lower. */
export const SCAR_STATS: readonly BodyStat[] = ['endurance', 'reflexes'];

/**
 * A downed commander is scarred with chance `scarChance`: endurance or reflexes −1 (one that is above 1, picked by the
 * rng; none → no loss) and seasoning +1 (at most 5). Call it once, when the combat is finalized.
 */
export function scarCommander(draft: CampaignState, rng: Rng): EngineEvent[] {
  if (!rng.chance(TUNING.commander.scarChance)) return [];
  const c = draft.commander;
  const profile = commanderProfile(draft);
  c.body = { ...profile.body };
  const candidates = SCAR_STATS.filter((k) => profile.body[k] > 1);
  const stat = candidates.length > 0 ? rng.pick(candidates) : null;
  if (stat) c.body[stat] -= 1;
  c.archetype = archetypeOf(c.body);
  c.seasoning = Math.min(5, profile.seasoning + 1);
  return [{ type: 'commander_scarred', stat, seasoning: c.seasoning }];
}
