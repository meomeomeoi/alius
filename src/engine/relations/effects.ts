import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { countDeed } from '../discipline/deeds';
import { recordAppraisal, recordWitnessOf } from '../development/appraisal';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState, Relation, Severity, Unit } from '../state/types';
import { computeDeltas } from './deltas';
import { roundAway } from './gain';
import { evaluateEvent, pushHistory } from './graph';
import type { EventIntent } from './intents';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What lands after an event has landed on one unit (P15's hold feed): it may change state and returns events; it must draw nothing. */
export type EventLandedHook = (draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, severity: Severity) => EngineEvent[];
const landedHooks: EventLandedHook[] = [];

/**
 * P15 plugs in here (an engine-internal hook, not a content one): `fn` runs at the very end of `applyEventToUnit`, for an event that
 * landed on the unit itself (a bystander's appraisal is not a landing). Several may be registered; they run in registration order.
 */
export function registerEventLanded(fn: EventLandedHook): void {
  landedHooks.push(fn);
}
/**
 * Runs only the landing hooks for an event the engine produced itself (an engine check that found a rule broken): the same consequences for
 * hold as a reported event, with none of the delta chain (the caller applies its own). Returns the hooks' events.
 */
export function landEvent(draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, severity: Severity): EngineEvent[] {
  return landedHooks.flatMap((hook) => hook(draft, reg, unitId, event, severity));
}
/** Tests: forget every registered hook. */
export function resetEventLanded(): void {
  landedHooks.length = 0;
}

/**
 * The stress her defects add when this event lands on her (P9d `eventStress`); a negative value relieves. A defect that names an
 * `embraceFlag`, with that flag set on her relation, counts only half of its positive values. Read by field, never by defect id.
 */
export function defectEventStress(reg: Registries, unit: Pick<Unit, 'defects'>, rel: Pick<Relation, 'flags'>, eventType: string): number {
  let sum = 0;
  for (const d of unit.defects) {
    const def = reg.defects.get(d.id);
    const value = (def?.eventStress as Record<string, number> | undefined)?.[eventType];
    if (value === undefined) continue;
    const flag = def?.embraceFlag as string | undefined;
    sum += value > 0 && flag !== undefined && rel.flags.includes(flag) ? value / 2 : value;
  }
  return Math.round(sum);
}

/**
 * Applies one event to one unit: the delta chain, the gain handler (diminishing returns, clamps), stress, a history
 * line and event-driven state entries. Automatic transitions are the caller's job (it re-evaluates once at the end).
 * `opts.scale` multiplies the three axis deltas (a negative scale flips them: approval) and the stress by `max(0, scale)` (P6).
 */
export function applyEventToUnit(
  draft: CampaignState, reg: Registries, unitId: string, event: EventIntent, opts: { scale?: number; /** P14b: she is a bystander of an event that landed on this unit: her appraisal is a witness's. */ witnessOf?: string } = {},
): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !draft.relations[unitId]) return [];
  const events: EngineEvent[] = [];
  const d = computeDeltas(draft, reg, unitId, event);
  if (d.dropped) return []; // P8: below both of her confidence floors: no stress, no history, no state entry
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
  const dStress = roundAway(d.stress) + Math.round(defectEventStress(reg, unit, draft.relations[unitId], event.type) * Math.max(0, scale));
  if (dStress !== 0) {
    const next = clamp(unit.stress + dStress, 0, 100);
    if (next !== unit.stress) events.push({ type: 'stress_changed', unitId, delta: next - unit.stress });
    unit.stress = next;
  }
  pushHistory(draft, unitId, { day: draft.day, kind: 'event', type: event.type, severity: d.severity });
  // P9: what the squad will remember the commander for
  if (event.actor === 'commander') {
    if (event.type === 'protected' && (d.severity === 'major' || d.severity === 'extreme')) countDeed(draft, 'protected');
    else if (event.type === 'kept_promise') countDeed(draft, 'promises_kept');
    else if (event.type === 'broke_promise') countDeed(draft, 'promises_broken');
  }
  events.push(...evaluateEvent(draft, reg, unitId, event.type));
  // P14b: how she read it (nothing while development is off); it changes no relation axis
  events.push(...(opts.witnessOf !== undefined
    ? recordWitnessOf(draft, reg, unitId, event, opts.witnessOf)
    : recordAppraisal(draft, reg, unitId, event, event.actor === unitId ? 'actor' : 'subject')));
  if (opts.witnessOf === undefined) for (const hook of landedHooks) events.push(...hook(draft, reg, unitId, event, d.severity)); // P15: hold
  return events;
}
