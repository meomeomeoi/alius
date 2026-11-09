/** The relationship hooks other packages use (P3 spec §9). */
import type { Registries } from '../../content/types';
import type { CampaignState, LoyaltyBand, Relation } from '../state/types';

export { applyIntents } from './apply';
export { addFact } from '../memory';

export const getRelation = (state: CampaignState, unitId: string): Relation | undefined => state.relations[unitId];

/** The unit's loyalty band (steady / wavering / breaking), with hysteresis; P6 reads it. */
export const loyaltyBand = (state: CampaignState, unitId: string): LoyaltyBand | undefined => state.relations[unitId]?.loyaltyBand;

/** Combat synergies unlocked by the units' current relationship states (P4 reads them). */
export function getSynergies(state: CampaignState, reg: Registries, unitIds: string[]): Array<{ unitId: string; synergyId: string }> {
  const out: Array<{ unitId: string; synergyId: string }> = [];
  for (const id of unitIds) {
    const st = reg.relationshipStates.get(state.relations[id]?.stateId ?? '');
    for (const synergyId of (st?.unlocks as { synergies?: string[] } | undefined)?.synergies ?? []) out.push({ unitId: id, synergyId });
  }
  return out;
}
