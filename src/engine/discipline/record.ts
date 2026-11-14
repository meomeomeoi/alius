import type { EngineCtx, EngineEvent } from '../dispatch';
import { applyEventToUnit } from '../relations/effects';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, DisciplineState, PendingDefiance, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { SEVERITIES } from '../relations/vocab';

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

// ---------------------------------------------------------------------------------------------------------------------
// Held defiance: a `defied` row applies at once, but `R` moves only when nobody answered it.

/**
 * Holds a defiance until it settles. One per unit: a second keeps the higher severity (and the record that came with it).
 * Only a named unit holds one.
 */
export function holdDefiance(
  draft: CampaignState, unitId: string, severity: Severity, source: PendingDefiance['source'], sceneId?: string,
): EngineEvent[] {
  if (draft.squad.find((u) => u.id === unitId)?.kind !== 'named') return [];
  const list = disciplineOf(draft).defiance;
  const held = list.find((d) => d.unitId === unitId);
  const next: PendingDefiance = { unitId, severity, day: draft.day, source, ...(sceneId !== undefined ? { sceneId } : {}) };
  if (held) {
    if (SEVERITIES.indexOf(severity) <= SEVERITIES.indexOf(held.severity)) return [];
    list[list.indexOf(held)] = next;
  } else list.push(next);
  return [{ type: 'defiance_noted', unitId, severity, source }];
}

/** An enforcement on her removes her held defiance with no `R` gain; returns it (a punishment stores a copy for UNDO). */
export function dropDefiance(draft: CampaignState, unitId: string): PendingDefiance | undefined {
  const list = draft.discipline?.defiance;
  const i = list?.findIndex((d) => d.unitId === unitId) ?? -1;
  return i < 0 ? undefined : list!.splice(i, 1)[0];
}

/** Nobody answered it: `R` rises by the severity's amount. */
function settleOne(draft: CampaignState, d: PendingDefiance): EngineEvent[] {
  return [
    { type: 'defiance_settled', unitId: d.unitId, tolerated: true },
    ...addRecord(draft, d.unitId, TUNING.impunity.defied[d.severity], 'defiance_tolerated'),
  ];
}

/**
 * Settles held defiance as tolerated. `{ sceneId }`: the ones that happened in that scene (it ended or was aborted);
 * `{ all: true }`: every one; `{}`: the ones that belong to no scene (DM and engine sources, the day-end step).
 */
export function settleDefiance(draft: CampaignState, _ctx: EngineCtx, filter: { sceneId?: string; all?: boolean }): EngineEvent[] {
  const list = draft.discipline?.defiance;
  if (!list || list.length === 0) return [];
  const match = (d: PendingDefiance): boolean => (filter.all === true ? true : filter.sceneId !== undefined ? d.sceneId === filter.sceneId : d.sceneId === undefined);
  const settling = list.filter(match);
  draft.discipline!.defiance = list.filter((d) => !match(d));
  return settling.flatMap((d) => settleOne(draft, d));
}

// ---------------------------------------------------------------------------------------------------------------------
// The four P9 intents. `applyIntents` calls this instead of `applyEventToUnit` for them.

export interface DisciplineSource {
  channel: 'scene' | 'dm';
  sceneId?: string;
  messageRef?: string;
}

/**
 * Applies one `defied`, `commander_enforced`, `commander_yielded` or `threatened` to one unit: the delta row first (through
 * the P3/P8 chain), then what it does to `R` and to what is pending. Grunts have no Impunity: nothing happens.
 */
export function applyDisciplineEvent(
  draft: CampaignState, ctx: EngineCtx, unitId: string, event: EventIntent, src: DisciplineSource,
): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named') return [];
  const events = applyEventToUnit(draft, ctx.registries, unitId, event);
  switch (event.type) {
    case 'defied':
      events.push(...holdDefiance(draft, unitId, event.severity, 'intent', src.channel === 'scene' ? src.sceneId : undefined));
      break;
    case 'commander_yielded': {
      events.push(...addRecord(draft, unitId, TUNING.impunity.yielded[event.severity], 'commander_yielded'));
      const held = dropDefiance(draft, unitId);
      if (held) events.push(...settleOne(draft, held));
      break;
    }
    case 'commander_enforced':
      events.push(...addRecord(draft, unitId, TUNING.impunity.enforcedFallback, 'commander_enforced'));
      dropDefiance(draft, unitId);
      break;
    default:
      break; // `threatened`: the row only (task 4 registers the threat)
  }
  return events;
}
