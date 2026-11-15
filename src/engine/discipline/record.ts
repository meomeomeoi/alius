import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { nextId } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { EventIntent } from '../relations/intents';
import { SEVERITIES } from '../relations/vocab';
import type { CampaignState, DisciplineState, Inverse, PendingDefiance, PendingThreat, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { countDeed, deedsOf } from './deeds';
import { impunityOf } from './impunity';
import { punishmentFor } from './perception';
import { applyPunishment, checkPunish } from './punish';

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
  countDeed(draft, 'defiance_tolerated');
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
// What one application changed, so UNDO can put exactly that back.

/**
 * Runs `fn` (which changes one unit) and reports what it did to her relation, stress and record as an `Inverse`: the
 * applied deltas after every clamp, the dailyGain change, the state and loyalty band it moved her to and the history
 * lines it wrote (and the old ones a full log dropped for them). Reverting these numbers only (not a snapshot) leaves later changes alone.
 */
export function captureInverse(draft: CampaignState, unitId: string, fn: () => EngineEvent[]): { events: EngineEvent[]; inverse: Inverse } {
  const rel = draft.relations[unitId];
  const unit = draft.squad.find((u) => u.id === unitId);
  const before = rel && unit ? {
    trust: rel.trust, affinity: rel.affinity, attraction: rel.attraction, daily: { ...rel.dailyGain }, stateId: rel.stateId,
    stateSince: rel.stateSince, band: rel.loyaltyBand, history: rel.history.map((h) => JSON.stringify(h)), stress: unit.stress, record: recordOf(draft, unitId),
    publicity: rel.publicity ? structuredClone(rel.publicity) : undefined,
  } : undefined;
  const deedsBefore = deedsOf(draft);
  const events = fn();
  const inverse: Inverse = {};
  const moved: NonNullable<Inverse['deeds']> = {};
  const deedsAfter = deedsOf(draft);
  for (const k of Object.keys(deedsAfter) as Array<keyof typeof deedsAfter>) if (deedsAfter[k] !== deedsBefore[k]) moved[k] = deedsAfter[k] - deedsBefore[k];
  if (Object.keys(moved).length > 0) inverse.deeds = moved;
  const after = draft.relations[unitId];
  const unitAfter = draft.squad.find((u) => u.id === unitId);
  if (!before || !after || !unitAfter) return { events, inverse };
  const axes: NonNullable<Inverse['axes']> = {};
  for (const a of ['trust', 'affinity', 'attraction'] as const) if (after[a] !== before[a]) axes[a] = after[a] - before[a];
  if (Object.keys(axes).length > 0) inverse.axes = axes;
  if (unitAfter.stress !== before.stress) inverse.stress = unitAfter.stress - before.stress;
  const record = recordOf(draft, unitId) - before.record;
  if (record !== 0) inverse.record = record;
  const daily: NonNullable<Inverse['dailyGain']> = {};
  for (const a of ['trust', 'affinity', 'attraction'] as const) if (after.dailyGain[a] !== before.daily[a]) daily[a] = after.dailyGain[a] - before.daily[a];
  if (Object.keys(daily).length > 0) inverse.dailyGain = daily;
  if (after.stateId !== before.stateId) inverse.state = { from: before.stateId, to: after.stateId, sinceFrom: before.stateSince };
  if (before.publicity && JSON.stringify(after.publicity ?? null) !== JSON.stringify(before.publicity)) inverse.publicity = before.publicity;
  if (after.loyaltyBand !== before.band) inverse.loyaltyBand = { from: before.band, to: after.loyaltyBand };
  // lines are compared as a multiset: a full log drops old lines while the new ones arrive, so the length alone says nothing
  const kept = new Map<string, number>();
  for (const k of before.history) kept.set(k, (kept.get(k) ?? 0) + 1);
  const added: typeof after.history = [];
  const stillThere = new Map<string, number>();
  for (const h of after.history) {
    const k = JSON.stringify(h);
    const left = kept.get(k) ?? 0;
    if (left > 0) { kept.set(k, left - 1); stillThere.set(k, (stillThere.get(k) ?? 0) + 1); } else added.push(h);
  }
  if (added.length > 0) inverse.history = structuredClone(added);
  const dropped: NonNullable<Inverse['historyDropped']> = [];
  const seen = new Map<string, number>();
  before.history.forEach((k, at) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > (stillThere.get(k) ?? 0)) dropped.push({ at, line: JSON.parse(k) as typeof after.history[number] });
  });
  if (dropped.length > 0) inverse.historyDropped = dropped;
  return { events, inverse };
}

// ---------------------------------------------------------------------------------------------------------------------
// Threats

const unitThreat = (draft: CampaignState, unitId: string): PendingThreat | undefined => draft.discipline?.threats.find((t) => t.unitId === unitId);
const removeThreat = (draft: CampaignState, id: string): void => {
  if (draft.discipline) draft.discipline.threats = draft.discipline.threats.filter((t) => t.id !== id);
};

/** The severity of a measure: a punishment's, `leash` above them all, `unspecified` below. A word the registry no longer has is unknown (`null`). */
function measureSeverity(reg: Registries, measure: string): number | null {
  if (measure === 'leash') return 5;
  if (measure === 'unspecified') return 0;
  const sev = reg.punishments.get(measure)?.severity;
  return typeof sev === 'number' ? sev : null;
}

/** Applies a `threatened` event: the row, then one pending threat (a new one replaces the measure and keeps the older deadline). */
export function registerThreat(draft: CampaignState, ctx: EngineCtx, unitId: string, event: EventIntent, src: DisciplineSource): EngineEvent[] {
  const reg = ctx.registries;
  const believed = (impunityOf(draft, reg, unitId)?.value ?? 100) < TUNING.impunity.believeBelow; // fixed now: what she believes of this threat
  const created = draft.discipline === undefined;
  const { events, inverse } = captureInverse(draft, unitId, () => [...applyEventToUnit(draft, reg, unitId, event), ...evaluateAutomatic(draft, reg, unitId)]);
  if (created) inverse.createdDiscipline = true;
  const measure = event.measure ?? 'unspecified';
  const old = unitThreat(draft, unitId);
  if (old) inverse.threat = structuredClone(old); // UNDO of the new threat gives the older one back
  const threat: PendingThreat = {
    id: nextId(draft, 'th'), unitId, measure, day: draft.day, deadlineDay: old?.deadlineDay ?? draft.day + 1, believed, channel: src.channel,
    ...(src.sceneId !== undefined ? { sceneId: src.sceneId } : {}), ...(src.messageRef !== undefined ? { messageRef: src.messageRef } : {}), inverse,
  };
  const d = disciplineOf(draft);
  d.threats = [...d.threats.filter((t) => t.unitId !== unitId), threat];
  events.push({ type: 'threat_registered', threatId: threat.id, unitId, measure, believed, channel: src.channel });
  return events;
}

/**
 * A threat nobody carried out: it ends and the engine makes the `commander_yielded` for it (major when the measure was the
 * Leash or a punishment of severity 3 or more, else moderate).
 */
export function lapseThreat(draft: CampaignState, ctx: EngineCtx, threat: PendingThreat): EngineEvent[] {
  removeThreat(draft, threat.id);
  countDeed(draft, 'threats_empty'); // nobody carried it out
  const sev = measureSeverity(ctx.registries, threat.measure);
  const severity: Severity = threat.measure === 'leash' || (sev !== null && sev >= 3) ? 'major' : 'moderate';
  return [
    { type: 'threat_lapsed', threatId: threat.id, unitId: threat.unitId, measure: threat.measure },
    ...applyDisciplineEvent(draft, ctx, threat.unitId, {
      type: 'commander_yielded', actor: 'commander', targets: [threat.unitId], severity, evidence: 'the threat was not carried out', confidence: 1,
    }, { channel: threat.channel === 'dm' ? 'dm' : 'scene' }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Enforcement: the one place a consequence touches `R`, the held defiance and a pending threat.

/** An enforcement of this measure keeps her pending threat? The same measure, an equal or heavier one, any on an unspecified threat, always the Leash. */
function keepsThreat(reg: Registries, threat: PendingThreat, e: { measure: string; severity: number }): boolean {
  if (e.measure === 'leash' || threat.measure === e.measure || threat.measure === 'unspecified') return true;
  const threatSeverity = measureSeverity(reg, threat.measure);
  return threatSeverity !== null && threatSeverity <= e.severity;
}

/**
 * The commander carried out a consequence on her (a punishment, a Leash use): `R` moves by `recordDelta`, her held defiance
 * is removed with no gain, and a pending threat that this enforcement carries out is kept (`threat_kept`). Returns copies
 * of what it removed, for UNDO. Named living units only.
 */
export function enforce(
  draft: CampaignState, ctx: EngineCtx, unitId: string, e: { measure: string; severity: 1 | 2 | 3 | 4; recordDelta: number },
): { events: EngineEvent[]; removed: { defiance?: PendingDefiance; threat?: PendingThreat } } {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return { events: [], removed: {} };
  const events = addRecord(draft, unitId, e.recordDelta, `enforced:${e.measure}`);
  const removed: { defiance?: PendingDefiance; threat?: PendingThreat } = {};
  const defiance = dropDefiance(draft, unitId);
  if (defiance) removed.defiance = defiance;
  const threat = unitThreat(draft, unitId);
  if (threat && keepsThreat(ctx.registries, threat, e)) {
    removeThreat(draft, threat.id);
    removed.threat = threat;
    countDeed(draft, 'threats_kept');
    events.push({ type: 'threat_kept', threatId: threat.id, unitId, measure: threat.measure });
  }
  return { events, removed };
}

/** She is no longer in the squad: everything pending on her goes (held defiance, threats, restrictions, demands, sabotage). */
export function forgetUnit(draft: CampaignState, unitId: string): void {
  const d = draft.discipline;
  if (!d) return;
  d.defiance = d.defiance.filter((x) => x.unitId !== unitId);
  d.threats = d.threats.filter((x) => x.unitId !== unitId);
  d.restrictions = d.restrictions.filter((x) => x.unitId !== unitId);
  d.demands = d.demands.filter((x) => x.unitId !== unitId);
  if (d.sabotage) {
    d.sabotage.queued = d.sabotage.queued.filter((x) => x.unitId !== unitId);
    if (d.sabotage.gear?.unitId === unitId) delete d.sabotage.gear;
  }
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
  if (event.type === 'threatened') return registerThreat(draft, ctx, unitId, event, src);
  // a punishment read from dialogue is a full application (the registry row, the side effects, an UNDO record); one that
  // cannot be imposed (the same measure today, a brig already running) is skipped as if it had not been said
  if (event.type === 'commander_enforced' && punishmentFor(ctx.registries, event.measure ?? 'verbal')) {
    const measure = event.measure ?? 'verbal';
    if (checkPunish(draft, ctx.registries, unitId, measure) !== null) return [];
    return applyPunishment(draft, ctx, {
      unitId, measure, source: 'dialogue', channel: src.channel,
      ...(src.channel === 'scene' && src.sceneId !== undefined ? { sceneId: src.sceneId } : {}), ...(src.messageRef !== undefined ? { messageRef: src.messageRef } : {}),
    });
  }
  const events = applyEventToUnit(draft, ctx.registries, unitId, event);
  switch (event.type) {
    case 'defied':
      events.push(...holdDefiance(draft, unitId, event.severity, 'intent', src.channel === 'scene' ? src.sceneId : undefined));
      break;
    case 'commander_yielded': {
      events.push(...addRecord(draft, unitId, TUNING.impunity.yielded[event.severity], 'commander_yielded'));
      const held = dropDefiance(draft, unitId);
      if (held) events.push(...settleOne(draft, held));
      // backing down ends her pending threat at once (the yield above is its yield: the lapse does not make another)
      const threat = unitThreat(draft, unitId);
      if (threat) {
        removeThreat(draft, threat.id);
        countDeed(draft, 'threats_empty');
        events.push({ type: 'threat_lapsed', threatId: threat.id, unitId, measure: threat.measure, by: 'yield' });
      }
      break;
    }
    case 'commander_enforced': {
      const measure = event.measure ?? 'verbal';
      const sev = measureSeverity(ctx.registries, measure);
      events.push(...enforce(draft, ctx, unitId, {
        measure, severity: (sev !== null && sev >= 1 && sev <= 4 ? sev : 1) as 1 | 2 | 3 | 4, recordDelta: TUNING.impunity.enforcedFallback,
      }).events);
      break;
    }
    default:
      break; // `defied` holds its defiance above; `threatened` returned earlier
  }
  return events;
}
