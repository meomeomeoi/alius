import type { Registries } from '../../content/types';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { firstImpressionWeight, imageMultiplier } from '../commander/presence';
import { daysKnown } from '../commander/profile';
import { traitEffects } from '../commander/traits';
import { confidenceShift, dispositionFor, dispositionThresholds, effectiveValues, normDistance, stanceEffects } from '../worldOptions';
import { intimacyOf } from './gain';
import type { EventIntent } from './intents';
import { SEVERITIES } from './vocab';

export interface Deltas {
  trust: number;
  affinity: number;
  attraction: number;
  stress: number;
  /** The severity actually used for the table row (after a trigger escalated it). */
  severity: Severity;
  /** P8: the event's confidence is below both of the unit's floors, so it counts for nothing (no stress, no history). */
  dropped?: true;
}

type Row = { trust?: number; affinity?: number; attraction?: number; stress?: number };
type Mods = { gain?: Partial<Record<'trust' | 'affinity' | 'attraction', number>>; loss?: Partial<Record<'trust' | 'affinity' | 'attraction', number>> };

export const escalate = (sev: Severity): Severity => SEVERITIES[Math.min(SEVERITIES.length - 1, SEVERITIES.indexOf(sev) + 1)];

/** Signed stress change for a `stressHints` entry (+1 raises, −1 calms). */
export const stressFromHint = (severity: Severity, direction: -1 | 1): number => direction * TUNING.relations.stressHint[severity];

/**
 * Whose relation an event moves. v1 has no unit↔unit relations: a commander event moves every target, a unit's own
 * event (no targets) moves that unit's stance toward the commander; a unit→unit event moves nobody.
 */
export function affectedUnits(event: EventIntent, participants: string[]): string[] {
  const present = new Set(participants);
  if (event.actor === 'commander') return event.targets.filter((t) => present.has(t));
  if (event.targets.some((t) => t !== event.actor)) return [];
  return present.has(event.actor) ? [event.actor] : [];
}

/** Float noise in `0.5 + (setting − 0.5)` must not decide a comparison. */
const CONFIDENCE_EPS = 1e-9;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Avoids −0 so equality checks stay simple. */
const z = (n: number): number => (n === 0 ? 0 : n);

function receptivity(state: CampaignState, unitId: string): number {
  const rel = state.relations[unitId];
  if (!intimacyOf(state).romance || rel.affinity < 0) return 0;
  return rel.trust < 20 ? 0.5 : 1;
}

/**
 * The modifier chain for one unit and one event, before diminishing returns (those belong to the gain handler).
 * Order: tag check (trigger escalates), table row, value alignment, like/dislike, state modifiers, defect
 * modifiers, image consistency (P7), receptivity. Values are floats.
 */
export function computeDeltas(state: CampaignState, reg: Registries, unitId: string, event: EventIntent): Deltas {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  const zero: Deltas = { trust: 0, affinity: 0, attraction: 0, stress: 0, severity: event.severity };
  if (!unit || !rel) return zero;

  // P8: the unit's disposition judges how much the extraction is believed; below both floors the event is dropped for her
  const level = dispositionFor(state, reg, unit);
  const floors = dispositionThresholds(level, confidenceShift(state));
  const believed = (floor: number): boolean => event.confidence + CONFIDENCE_EPS >= floor;
  if (!believed(Math.min(floors.gain, floors.loss))) return { ...zero, dropped: true };

  // tags: only tags the unit really owns count, whatever the model claims
  const tags = event.tags ?? [];
  const triggered = tags.some((t) => unit.triggers.includes(t));
  const liked = tags.some((t) => unit.likes.includes(t));
  const disliked = tags.some((t) => unit.dislikes.includes(t));
  const severity = triggered ? escalate(event.severity) : event.severity;

  const def = reg.eventDeltas.get(event.type);
  const row = (def?.rows as Record<Severity, Row> | undefined)?.[severity];
  if (!def || !row) return { ...zero, severity };

  let trust = row.trust ?? 0;
  let affinity = row.affinity ?? 0;
  let attraction = row.attraction ?? 0;
  let stress = (row.stress ?? 0) + (triggered ? TUNING.relations.triggerStress : 0);
  // P8 stances: contempt events weigh on a unit who has taken the world's stigma to heart
  for (const fx of stanceEffects(state, reg, unit, 'event_stress')) if (fx.events.includes(event.type)) stress += fx.amount;

  // 1. value alignment: the row holds magnitudes, the sign comes from the unit's values
  if (def.valueAligned === true) {
    const values = effectiveValues(state, reg, unit); // P8: her stance may shift how she weighs a value
    const sum = (event.valueAxes ?? []).reduce((n, a) => n + values[a.axis] * a.direction, 0);
    const m = clamp(sum / 3, -1, 1);
    trust = Math.abs(trust) * m;
    affinity = Math.abs(affinity) * m;
    attraction = Math.abs(attraction) * m;
  }

  // 2. likes and dislikes
  if (disliked) {
    if (affinity > 0) affinity = -affinity;
  } else if (liked) {
    if (affinity > 0) affinity *= TUNING.relations.likeMult;
    if (attraction > 0) attraction *= TUNING.relations.likeMult;
  }

  // 3. current relationship state, 4. defects
  const mods: Mods[] = [];
  const stateMods = reg.relationshipStates.get(rel.stateId)?.modifiers as Mods | undefined;
  if (stateMods) mods.push(stateMods);
  let eventMult = 1;
  for (const d of unit.defects) {
    const rm = reg.defects.get(d.id)?.relationModifiers as (Mods & { events?: Record<string, number> }) | undefined;
    if (!rm) continue;
    mods.push(rm);
    eventMult *= rm.events?.[event.type] ?? 1;
  }
  const scale = (value: number, axis: 'trust' | 'affinity' | 'attraction'): number => {
    let v = value;
    for (const m of mods) v *= (v >= 0 ? m.gain?.[axis] : m.loss?.[axis]) ?? 1;
    return v * eventMult;
  };
  trust = scale(trust, 'trust');
  affinity = scale(affinity, 'affinity');
  attraction = scale(attraction, 'attraction');

  // P7 image consistency: an off-image act of the commander lands harder while the unit is still sizing him up
  const image = imageMultiplier(state, reg, unitId, event);
  trust *= image;
  affinity *= image;
  attraction *= image;

  // P7 traits: `early_trust_gain` on Trust gains while the unit is new to him; `relation_event_mult` on one event type
  if (trust > 0 && daysKnown(state, unitId) < TUNING.commander.earlyDays) {
    const pct = traitEffects(state, reg, 'early_trust_gain').reduce((n, fx) => n + fx.pct, 0);
    trust *= Math.max(0, 1 + pct / 100);
  }
  for (const fx of traitEffects(state, reg, 'relation_event_mult')) {
    if (fx.event !== event.type || (fx.ifTrigger !== undefined && !unit.triggers.includes(fx.ifTrigger))) continue;
    trust *= fx.mult;
    affinity *= fx.mult;
    attraction *= fx.mult;
  }

  // P8 stances: while she is still sizing the commander up, a distance from the world's norm damps the Trust and Affinity he earns
  if (event.actor === 'commander') {
    const distance = normDistance(state, reg) ?? 0;
    const pct = stanceEffects(state, reg, unit, 'gain_damp').reduce((n, fx) => n + fx.pctPerStep, 0);
    if (distance > 0 && pct > 0) {
      const damp = 1 - Math.min(TUNING.disposition.gainDampMax, (pct / 100) * distance) * firstImpressionWeight(state, unitId);
      if (trust > 0) trust *= damp;
      if (affinity > 0) affinity *= damp;
    }
  }

  // P8 disposition: a gain is multiplied by the level's gainMult, a loss by its lossMult; a big gesture of the commander also scales the gains
  const big = event.actor === 'commander' && TUNING.disposition.bigGesture.events.includes(event.type)
    && SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(TUNING.disposition.bigGesture.minSeverity as Severity);
  const byLevel = (v: number): number => (v > 0 ? v * level.gainMult * (big ? level.bigGestureMult : 1) : v < 0 ? v * level.lossMult : v);
  trust = byLevel(trust);
  affinity = byLevel(affinity);
  attraction = byLevel(attraction);

  // receptivity on attraction gains
  if (def.attractionUsesReceptivity === true && attraction > 0) attraction *= receptivity(state, unitId);

  // grunts are Trust-only
  if (unit.kind === 'grunt') {
    affinity = 0;
    attraction = 0;
  }
  // P8: each side of the event must reach its own floor (gains and calming need the gain floor, losses and stress the loss floor)
  const gainOk = believed(floors.gain);
  const lossOk = believed(floors.loss);
  const judged = (v: number): number => (v > 0 ? (gainOk ? v : 0) : v < 0 ? (lossOk ? v : 0) : v);
  const judgedStress = stress > 0 ? (lossOk ? stress : 0) : stress < 0 ? (gainOk ? stress : 0) : stress;
  return { trust: z(judged(trust)), affinity: z(judged(affinity)), attraction: z(judged(attraction)), stress: z(judgedStress), severity };
}
