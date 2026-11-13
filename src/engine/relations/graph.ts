import type { Conditions } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { traitEffects, traitIds } from '../commander/traits';
import { isLiving } from '../economy';
import type { CampaignState, HistoryEntry, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { intimacyOf } from './gain';
import { nextLoyaltyBand } from './bands';
import { bandShift, dispositionById, dispositionFor } from '../worldOptions';

export type ProposalFailure = 'too_soon' | 'no_trust' | 'not_interested' | 'committed' | 'unavailable';
export type ProposalCheck = { stateId: string } | { fail: ProposalFailure };

type EntryShape = { via: string[]; fromStates?: string[]; events?: string[]; proposals?: string[]; when?: Conditions };
const entryOf = (st: Entry): EntryShape => st.entry as EntryShape;

/**
 * Appends a history line and trims the log to `historyMax`. Entries whose type some `eventCount` condition counts
 * (`TUNING.relations.historyKeep`) are evicted last, so a chatty scene cannot push the marks out of reach.
 */
export function pushHistory(draft: CampaignState, unitId: string, h: HistoryEntry): void {
  const rel = draft.relations[unitId];
  if (!rel) return;
  rel.history.push(h);
  const keep: readonly string[] = TUNING.relations.historyKeep;
  while (rel.history.length > TUNING.relations.historyMax) {
    const at = rel.history.findIndex((e) => !keep.includes(e.type));
    rel.history.splice(at < 0 ? 0 : at, 1);
  }
}

/** Does `unitId` satisfy every key of `cond`? An empty condition holds; an empty `anyOf` never does. */
/** P8: the days a stage must last, scaled by the unit's disposition (kind quicker, hazardous slower). */
function stageDays(state: CampaignState, reg: Registries, unit: Unit, days: number): number {
  return Math.round(days * dispositionFor(state, reg, unit).stageDaysMult);
}

export function meets(state: CampaignState, reg: Registries, unitId: string, cond: Conditions): boolean {
  const rel = state.relations[unitId];
  const unit = state.squad.find((u) => u.id === unitId);
  if (!rel || !unit) return false;
  if (cond.axes) {
    for (const axis of ['trust', 'affinity', 'attraction'] as const) {
      const r = cond.axes[axis];
      if (r && (rel[axis] < r[0] || rel[axis] > r[1])) return false;
    }
  }
  if (cond.stressMin !== undefined && unit.stress < cond.stressMin) return false;
  if (cond.flagsAll && !cond.flagsAll.every((f) => rel.flags.includes(f))) return false;
  if (cond.flagsNone && cond.flagsNone.some((f) => rel.flags.includes(f))) return false;
  if (cond.defectsAny && !cond.defectsAny.some((id) => unit.defects.some((d) => d.id === id))) return false;
  if (cond.inStates && !cond.inStates.includes(rel.stateId)) return false;
  if (cond.minDaysInState !== undefined && state.day - rel.stateSince < stageDays(state, reg, unit, cond.minDaysInState)) return false;
  if (cond.eventCount) {
    const { type, min, withinDays } = cond.eventCount;
    const n = rel.history.filter((h) => h.kind === 'event' && h.type === type && (withinDays === undefined || state.day - h.day <= withinDays)).length;
    if (n < min) return false;
  }
  if (cond.leashUsesMin !== undefined) {
    const uses = state.leash.log.filter((l) => typeof l === 'object' && l !== null && (l as { unitId?: unknown }).unitId === unitId).length;
    if (uses < cond.leashUsesMin) return false;
  }
  if (cond.anyOf && !cond.anyOf.some((c) => meets(state, reg, unitId, c))) return false;
  return true;
}

/** Is this state usable for this unit right now? Romance off hides romantic states; grunts only use `grunts` states. */
function usable(state: CampaignState, st: Entry, unitId?: string): boolean {
  if (st.romance === true && !intimacyOf(state).romance) return false;
  if (typeof st.requiresTrait === 'string' && !traitIds(state).includes(st.requiresTrait)) return false; // P7
  if (unitId !== undefined && state.squad.find((u) => u.id === unitId)?.kind === 'grunt' && st.grunts !== true) return false;
  return true;
}

/** The states the graph may currently enter (for a unit, also filtered by what that unit may be). */
export function availableStates(state: CampaignState, reg: Registries, unitId?: string): Entry[] {
  return [...reg.relationshipStates.values()].filter((st) => usable(state, st, unitId));
}

/** Moves the unit to `stateId` and records it. The caller has checked that the state differs from the current one. */
export function enterState(draft: CampaignState, unitId: string, stateId: string, why: string): EngineEvent {
  const rel = draft.relations[unitId];
  const from = rel.stateId;
  rel.stateId = stateId;
  rel.stateSince = draft.day;
  if (from === 'secret_affair') delete rel.affair; // a concealed romance ends with its state
  pushHistory(draft, unitId, { day: draft.day, kind: 'state', type: stateId, detail: why });
  return { type: 'relation_state_changed', unitId, from, to: stateId, why };
}

/**
 * P7 platonic thresholds: the lower bounds of the axis ranges of an entry condition are lowered by `pct` percent (rounded
 * to the nearest integer) for the states a trait names (`platonic_threshold`: confidant, kindred). Upper bounds and a lower
 * bound of 0 stay; nested `anyOf` alternatives are scaled too. Returns a copy.
 */
export function platonicThresholds(state: CampaignState, reg: Registries, stateId: string, cond: Conditions): Conditions {
  const pct = traitEffects(state, reg, 'platonic_threshold').filter((fx) => fx.states.includes(stateId)).reduce((n, fx) => n + fx.pct, 0);
  if (pct === 0) return cond;
  const scale = (c: Conditions): Conditions => {
    const out: Conditions = { ...c };
    if (c.axes) {
      out.axes = {};
      for (const axis of ['trust', 'affinity', 'attraction'] as const) {
        const r = c.axes[axis];
        if (r) out.axes[axis] = [Math.round(r[0] * (1 - pct / 100)), r[1]];
      }
    }
    if (c.anyOf) out.anyOf = c.anyOf.map(scale);
    return out;
  };
  return scale(cond);
}

const byPriority = (a: Entry, b: Entry): number => (b.priority as number) - (a.priority as number) || String(a.id).localeCompare(String(b.id));

/** Candidates entered through `via`, from the unit's current state, whose condition holds. */
function candidates(
  draft: CampaignState, reg: Registries, unitId: string, via: 'automatic' | 'event', eventType?: string,
): Entry[] {
  const cur = draft.relations[unitId].stateId;
  return availableStates(draft, reg, unitId)
    .filter((st) => {
      const e = entryOf(st);
      if (st.id === cur || !e.via.includes(via)) return false;
      if (via === 'event' && !e.events?.includes(eventType as string)) return false;
      if (e.fromStates && e.fromStates.length > 0 && !e.fromStates.includes(cur)) return false;
      return meets(draft, reg, unitId, platonicThresholds(draft, reg, st.id as string, e.when ?? {}));
    })
    .sort(byPriority);
}

/**
 * Re-evaluates the unit: the first exit rule of its state that holds wins; otherwise the highest-priority automatic
 * state that outranks the current one (so a unit settles instead of flapping). At most one transition per call; then
 * the loyalty band is recomputed.
 */
export function evaluateAutomatic(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel || !draft.squad.some((u) => u.id === unitId)) return [];
  const events: EngineEvent[] = [];
  const cur = reg.relationshipStates.get(rel.stateId);
  let target: string | null = null;
  let why = 'automatic';
  if (cur) {
    const ok = new Set(availableStates(draft, reg, unitId).map((s) => s.id));
    const rule = (cur.exit as Array<{ when: Conditions; to: string }>).find((x) => ok.has(x.to) && meets(draft, reg, unitId, x.when));
    if (rule) {
      target = rule.to;
      why = 'exit';
    }
  }
  if (target === null) {
    const rank = (cur?.priority as number | undefined) ?? -1;
    const pick = candidates(draft, reg, unitId, 'automatic').find((st) => (st.priority as number) > rank);
    if (pick) target = pick.id;
  }
  if (target !== null) events.push(enterState(draft, unitId, target, why));

  const band = nextLoyaltyBand(rel.loyaltyBand, rel.trust, bandShift(dispositionById(draft, reg, unitId))); // P8: the unit's own thresholds
  if (band !== rel.loyaltyBand) {
    events.push({ type: 'loyalty_band_changed', unitId, from: rel.loyaltyBand, to: band });
    rel.loyaltyBand = band;
  }
  return events;
}

/** States entered by an event type (e.g. `rejected_advance` → unrequited) once the history holds the event. */
export function evaluateEvent(draft: CampaignState, reg: Registries, unitId: string, eventType: string): EngineEvent[] {
  if (!draft.relations[unitId] || !draft.squad.some((u) => u.id === unitId)) return [];
  const pick = candidates(draft, reg, unitId, 'event', eventType)[0];
  return pick ? [enterState(draft, unitId, pick.id as string, `event:${eventType}`)] : [];
}

const ORDER: ProposalFailure[] = ['too_soon', 'no_trust', 'not_interested', 'committed'];

/** The first group of a condition that fails, or null when it holds: time/flags → trust → interest → alternatives. */
function failedGroup(state: CampaignState, reg: Registries, unitId: string, cond: Conditions): ProposalFailure | null {
  const { axes, anyOf, ...rest } = cond;
  if (!meets(state, reg, unitId, rest)) return 'too_soon';
  if (axes?.trust && !meets(state, reg, unitId, { axes: { trust: axes.trust } })) return 'no_trust';
  if ((axes?.affinity || axes?.attraction) && !meets(state, reg, unitId, { axes: { affinity: axes.affinity, attraction: axes.attraction } })) return 'not_interested';
  if (anyOf && !meets(state, reg, unitId, { anyOf })) {
    // report the alternative that came closest
    let worst = 0;
    for (const alt of anyOf) {
      const g = failedGroup(state, reg, unitId, alt);
      if (g !== null) worst = Math.max(worst, ORDER.indexOf(g as (typeof ORDER)[number]));
    }
    return ORDER[worst];
  }
  return null;
}

/** Whether the unit would accept a proposal of `kind` now, and into which state; else the first failed group. */
export function stateForProposal(state: CampaignState, reg: Registries, unitId: string, kind: string): ProposalCheck {
  const rel = state.relations[unitId];
  if (!rel || !state.squad.some((u) => u.id === unitId)) return { fail: 'unavailable' };
  const listed = availableStates(state, reg, unitId).filter((st) => entryOf(st).proposals?.includes(kind));
  if (listed.length === 0) return { fail: 'unavailable' };
  // a dead, deserted or terminated devoted partner no longer holds the commander
  const committedElsewhere = state.squad.some((u) => u.id !== unitId && isLiving(u) && state.relations[u.id]?.stateId === 'devoted');
  let worst = -1;
  for (const st of [...listed].sort(byPriority)) {
    const e = entryOf(st);
    let fail: ProposalFailure | null = null;
    if (e.fromStates && e.fromStates.length > 0 && !e.fromStates.includes(rel.stateId)) fail = 'too_soon';
    else fail = failedGroup(state, reg, unitId, platonicThresholds(state, reg, st.id as string, e.when ?? {}));
    if (fail === null && st.romance === true && committedElsewhere) fail = 'committed';
    if (fail === null) return { stateId: st.id };
    worst = Math.max(worst, ORDER.indexOf(fail as (typeof ORDER)[number]));
  }
  return { fail: ORDER[worst] };
}
