import type { Registries } from '../../content/types';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { imageMultiplier } from '../commander/presence';
import { daysKnown } from '../commander/profile';
import { traitEffects } from '../commander/traits';
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
  const stress = (row.stress ?? 0) + (triggered ? TUNING.relations.triggerStress : 0);

  // 1. value alignment: the row holds magnitudes, the sign comes from the unit's values
  if (def.valueAligned === true) {
    const sum = (event.valueAxes ?? []).reduce((n, a) => n + unit.values[a.axis] * a.direction, 0);
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

  // receptivity on attraction gains
  if (def.attractionUsesReceptivity === true && attraction > 0) attraction *= receptivity(state, unitId);

  // grunts are Trust-only
  if (unit.kind === 'grunt') {
    affinity = 0;
    attraction = 0;
  }
  return { trust: z(trust), affinity: z(affinity), attraction: z(attraction), stress: z(stress), severity };
}
