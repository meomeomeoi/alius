import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { impunityOf } from './impunity';

/** What a unit does about the commander's authority, from Trust × Impunity (P9 §3). Not to be confused with P8's world stances. */
export type CommandStance = 'disciplined' | 'defiant_loyal' | 'fearful' | 'open_defiance';

/**
 * Trust ≥ 45 is high, Impunity ≥ 50 is high: high Trust and low Impunity obeys by the book (`disciplined`), high both
 * argues and does it her way (`defiant_loyal`), low both is silent and sabotages (`fearful`), low Trust and high
 * Impunity defies openly (`open_defiance`). `null` for a grunt, a unit that is not living and an unknown id.
 */
export function commandStance(state: CampaignState, reg: Registries, unitId: string): CommandStance | null {
  const i = impunityOf(state, reg, unitId);
  const rel = state.relations[unitId];
  if (!i || !rel) return null;
  const T = TUNING.impunity.stance;
  const trustHigh = rel.trust >= T.trustHigh;
  const impunityHigh = i.value >= T.impunityHigh;
  return trustHigh ? (impunityHigh ? 'defiant_loyal' : 'disciplined') : (impunityHigh ? 'open_defiance' : 'fearful');
}

/** The registry entry of a stance: its texts, its `covert` flag and its `demandWeight`. */
export const stanceEntry = (reg: Registries, stance: CommandStance): Entry | undefined => reg.commandStances.get(stance);
