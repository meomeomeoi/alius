import type { Registries } from '../../content/types';
import { daysKnown } from '../commander/profile';
import type { CampaignState } from '../state/types';
import { worldEffects } from '../worldOptions';

/**
 * The world's acquaintance period (P9): how many days a soldier holds back covert protest after she first met the
 * commander, 0 to 14. A world that never chose reads the option's default; a pack without the option has none.
 */
export function acquaintanceDays(state: CampaignState, reg: Registries): number {
  const days = worldEffects(state, reg, 'acquaintance_grace')[0]?.days;
  return typeof days === 'number' && Number.isFinite(days) ? Math.max(0, Math.min(14, Math.trunc(days))) : 0;
}

/** Is she still getting to know the commander: fewer days since they met than the period? Named units only. */
export function inAcquaintance(state: CampaignState, reg: Registries, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !state.relations[unitId]) return false;
  return daysKnown(state, unitId) < acquaintanceDays(state, reg);
}
