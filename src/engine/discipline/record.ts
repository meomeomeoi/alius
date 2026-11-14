import type { EngineEvent } from '../dispatch';
import type { CampaignState, DisciplineState } from '../state/types';
import { TUNING } from '../tuning';

/** The stored term `R` of a unit's Impunity (P9): −40…40, absent = 0. */
export const recordOf = (state: Pick<CampaignState, 'relations'>, unitId: string): number => state.relations[unitId]?.impunityRecord ?? 0;

/** The discipline object of the campaign; created on the first write. Readers use `state.discipline?.…`. */
export function disciplineOf(draft: CampaignState): DisciplineState {
  draft.discipline ??= { defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [] };
  return draft.discipline;
}

function setRecord(draft: CampaignState, unitId: string, value: number): void {
  const rel = draft.relations[unitId];
  if (!rel) return;
  if (value === 0) delete rel.impunityRecord; // back at nothing: the save looks like one that never had a record
  else rel.impunityRecord = value;
}

/** Adds to `R`, clamped to ±40. Emits `impunity_changed` with the delta that was actually applied (nothing when it is 0). */
export function addRecord(draft: CampaignState, unitId: string, amount: number, reason: string): EngineEvent[] {
  if (!draft.relations[unitId]) return [];
  const T = TUNING.impunity;
  const before = recordOf(draft, unitId);
  const after = Math.min(T.recordMax, Math.max(T.recordMin, before + amount));
  const delta = after - before;
  if (delta === 0) return [];
  setRecord(draft, unitId, after);
  return [{ type: 'impunity_changed', unitId, delta, reason }];
}

/** Every record moves `decayPerDay` toward 0 (the day-end step). */
export function decayRecords(draft: CampaignState): void {
  const step = TUNING.impunity.decayPerDay;
  for (const [id, rel] of Object.entries(draft.relations)) {
    const r = rel.impunityRecord ?? 0;
    if (r === 0) continue;
    setRecord(draft, id, r > 0 ? Math.max(0, r - step) : Math.min(0, r + step));
  }
}
