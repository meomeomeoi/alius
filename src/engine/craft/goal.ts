/**
 * Help with her goal (P16b, plan Task 22): the commander helped with something she cares about (a push of her hobby the commander caused) and a craft-live holder's Regard rises by the reserved
 * `TUNING.regard.value.goal`, once a week. Writes `Relation.craft.goalDay` only for a holder who is craft-live. Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { regardRise } from '../dynamic/regard';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftLive } from './gate';

/** How many days make a week of help. */
export const GOAL_DAYS = 7;

export function helpWithGoal(draft: CampaignState, reg: Registries, unitId: string, _hobbyId: string, day: number): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (rel === undefined || !craftLive(draft, reg, unitId)) return [];
  const last = rel.craft?.goalDay;
  if (last !== undefined && day - last < GOAL_DAYS) return [];
  (rel.craft ??= {}).goalDay = day;
  return regardRise(draft, reg, unitId, 'value', TUNING.regard.value.goal);
}
