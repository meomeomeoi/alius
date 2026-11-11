/** The relationship hooks other packages use (P3 spec §9). */
import type { Registries } from '../../content/types';
import type { CampaignState, LoyaltyBand, Relation } from '../state/types';
import { TUNING } from '../tuning';

export { applyIntents } from './apply';
export { enqueueNight } from '../night';
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
    // P6: a wavering or breaking unit also carries the refusal chance of her loyalty band (the highest chance wins in combat)
    const band = state.relations[id]?.loyaltyBand;
    if (band === 'wavering' || band === 'breaking') {
      const synergyId = TUNING.disloyalty.bandSynergy[band];
      if (reg.synergies.has(synergyId)) out.push({ unitId: id, synergyId });
    }
  }
  return out;
}
