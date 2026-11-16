import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

type Reaction = { axis: keyof CampaignState['squad'][number]['values']; sign: '+' | '-'; weight: number };

/**
 * Units that do not yet know the commander's crime learn it and, once, react to it according to their values:
 * Trust += weight·trustPerWeight and Affinity += weight·affinityPerWeight for every matching value reaction.
 * (Units that already knew — from the start or earlier — are left alone.) Grunts only get the Trust part.
 */
export function revealCrime(draft: CampaignState, reg: Registries, unitIds: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const crime: Entry | undefined = draft.commander.crimeId ? reg.crimes.get(draft.commander.crimeId) : undefined;
  const reactions = (crime?.valueReactions as Reaction[] | undefined) ?? [];
  for (const id of unitIds) {
    const unit = draft.squad.find((u) => u.id === id);
    const rel = draft.relations[id];
    if (!unit || !rel || rel.flags.includes('knows_crime')) continue;
    rel.flags.push('knows_crime');
    if (!rel.flags.includes('crime_reaction_done')) {
      rel.flags.push('crime_reaction_done');
      for (const r of reactions) {
        const v = unit.values[r.axis];
        if (r.sign === '+' ? !(v > 0) : !(v < 0)) continue;
        applyRelationDelta(draft, id, 'trust', r.weight * TUNING.relations.crime.trustPerWeight, 'crime_revealed');
        if (unit.kind !== 'grunt') applyRelationDelta(draft, id, 'affinity', r.weight * TUNING.relations.crime.affinityPerWeight, 'crime_revealed');
      }
    }
    events.push({ type: 'crime_known', unitId: id });
  }
  return events;
}
