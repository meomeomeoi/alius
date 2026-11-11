import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState } from '../state/types';
import { computeDeltas } from './deltas';
import { roundAway } from './gain';
import { evaluateEvent, pushHistory } from './graph';
import type { EventIntent } from './intents';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Applies one event to one unit: the delta chain, the gain handler (diminishing returns, clamps), stress, a history
 * line and event-driven state entries. Automatic transitions are the caller's job (it re-evaluates once at the end).
 * `opts.scale` multiplies the three axis deltas (a negative scale flips them: approval) and the stress by `max(0, scale)` (P6).
 */
export function applyEventToUnit(
  draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, opts: { scale?: number } = {},
): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !draft.relations[unitId]) return [];
  const events: EngineEvent[] = [];
  const d = computeDeltas(draft, reg, unitId, event);
  const scale = opts.scale ?? 1;
  if (scale !== 1) {
    d.trust *= scale;
    d.affinity *= scale;
    d.attraction *= scale;
    d.stress *= Math.max(0, scale);
  }
  for (const axis of ['trust', 'affinity', 'attraction'] as const) {
    if (d[axis] === 0) continue;
    const applied = applyRelationDelta(draft, unitId, axis, d[axis], `intent:${event.type}`);
    if (applied !== 0) events.push({ type: 'relation_changed', unitId, axis, delta: applied, applied });
  }
  const dStress = roundAway(d.stress);
  if (dStress !== 0) {
    const next = clamp(unit.stress + dStress, 0, 100);
    if (next !== unit.stress) events.push({ type: 'stress_changed', unitId, delta: next - unit.stress });
    unit.stress = next;
  }
  pushHistory(draft, unitId, { day: draft.day, kind: 'event', type: event.type, severity: d.severity });
  events.push(...evaluateEvent(draft, reg, unitId, event.type));
  return events;
}
