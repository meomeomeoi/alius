import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { valuesOf } from '../development/profile';

type Reaction = { axis: keyof CampaignState['squad'][number]['values']; sign: '+' | '-'; weight: number };

/** Whether one of the crime's value reactions matches the unit's values (sign `+` needs a value above 0, `−` below 0). */
export function reactsToCrime(unit: Pick<CampaignState['squad'][number], 'values' | 'development'>, crime: Entry | undefined): boolean {
  return ((crime?.valueReactions as Reaction[] | undefined) ?? []).some((r) => (r.sign === '+' ? valuesOf(unit)[r.axis] > 0 : valuesOf(unit)[r.axis] < 0));
}

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
        const v = valuesOf(unit)[r.axis];
        if (r.sign === '+' ? !(v > 0) : !(v < 0)) continue;
        applyRelationDelta(draft, id, 'trust', r.weight * TUNING.relations.crime.trustPerWeight, 'crime_revealed');
        if (unit.kind !== 'grunt') applyRelationDelta(draft, id, 'affinity', r.weight * TUNING.relations.crime.affinityPerWeight, 'crime_revealed');
      }
    }
    events.push({ type: 'crime_known', unitId: id });
  }
  return events;
}
