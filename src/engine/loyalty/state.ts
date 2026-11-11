import type { CampaignState, LoyaltyRecord } from '../state/types';

const blank = (): LoyaltyRecord => ({ signs: [], attempts: 0 });

/** The unit's loyalty record, created on first use (mutates `draft`). */
export function loyaltyRecord(draft: CampaignState, unitId: string): LoyaltyRecord {
  const d = (draft.disloyalty ??= { units: {} });
  return (d.units[unitId] ??= blank());
}

/** Read-only access: `undefined` when the unit has no record. */
export function loyaltyOf(state: Pick<CampaignState, 'disloyalty'>, unitId: string): LoyaltyRecord | undefined {
  return state.disloyalty?.units[unitId];
}
