import type { CampaignState } from '../state/types';
import { bondOf } from './profile';

/**
 * Does her preference differ from how open the relationship is now? Only a relation that has a publicity level can be
 * mismatched (one is set while she is in a romantic-tier state); the level the commander and she live with against what her
 * card prefers. Enables the demand `publicity_talk`.
 */
export function publicityMismatch(state: Pick<CampaignState, 'relations' | 'squad'>, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const bond = unit ? bondOf(unit) : null;
  const level = state.relations[unitId]?.publicity?.level;
  return bond !== null && level !== undefined && level !== bond.publicity;
}
