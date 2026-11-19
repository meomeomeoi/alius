import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { initialLoyaltyBand } from '../relations/bands';
import { roundAway } from '../relations/gain';
import { computeDeltas } from '../relations/deltas';
import { evaluateAutomatic, pushHistory } from '../relations/graph';
import type { EventIntent } from '../relations/intents';
import type { CampaignState, Relation, Severity, Unit, ValueAxis } from '../state/types';
import { TUNING } from '../tuning';
import { bandShift, dispositionById } from '../worldOptions';
import type { Impression } from './develop';
import { headStartHash, headStartRaw } from './hash';

type Days = 7 | 14 | 30;
type Requires = { values?: Partial<Record<ValueAxis, '+' | '-'>>; knowsCrime?: boolean; minDays?: number };

/** Moments eligible for her: no `probe` tag, the days, the crime, her values, and the sign of her impression (neutral accepts every sign). */
function eligible(reg: Registries, unit: Unit, ctx: { days: Days; impression: Impression; knowsCrime: boolean }): Entry[] {
  return [...reg.headStartMoments.values()].filter((m) => {
    if (((m.tags as string[] | undefined) ?? []).includes('probe')) return false;
    const req = (m.requires as Requires | undefined) ?? {};
    if (req.minDays !== undefined && req.minDays > ctx.days) return false;
    if (req.knowsCrime !== undefined && req.knowsCrime !== ctx.knowsCrime) return false;
    for (const [axis, sign] of Object.entries(req.values ?? {})) {
      const v = unit.values[axis as ValueAxis]; // P14b: raw profile (build time, development is empty)
      if (sign === '+' ? !(v > 0) : !(v < 0)) return false;
    }
    return m.sign === 'any' || ctx.impression === 'neutral' || m.sign === ctx.impression;
  });
}

/**
 * The remembered moments of her first weeks (§3 step 3): the count by days (hashed within its range), the entries sorted by their
 * own hash, the first ones taken. Deterministic and draw-free.
 */
export function pickMoments(
  _state: CampaignState, reg: Registries, unit: Unit, ctx: { days: Days; seed: number; impression: Impression; knowsCrime: boolean },
): Entry[] {
  const [lo, hi] = TUNING.headStart.moments[ctx.days];
  const count = lo + (hi > lo ? headStartRaw(ctx.seed, unit.id, 'count') % (hi - lo + 1) : 0);
  const keyed = eligible(reg, unit, ctx).map((m) => ({ m, h: headStartHash(ctx.seed, unit.id, `moment:${String(m.id)}`) }));
  keyed.sort((a, b) => a.h - b.h || String(a.m.id).localeCompare(String(b.m.id)));
  return keyed.slice(0, count).map((k) => k.m);
}

const RANGE = { trust: [0, 100], affinity: [-100, 100], attraction: [0, 100] } as const;

/**
 * Runs the moment's event row through the full modifier chain and writes the three axis deltas directly (clamped), with a history
 * line. No stress, no deed counting and no `evaluateEvent`: the head start takes at most one transition (`headStartTransition`).
 * A result below her confidence floors writes nothing; the moment stays picked.
 */
export function applyMoment(draft: CampaignState, reg: Registries, unitId: string, moment: Entry): void {
  const rel = draft.relations[unitId];
  if (!rel) return;
  const row = moment.eventDelta as { type: string; severity: Severity; actor: 'commander' | 'unit' };
  const byCommander = row.actor === 'commander';
  const event: EventIntent = {
    type: row.type as EventIntent['type'], severity: row.severity, actor: byCommander ? 'commander' : unitId,
    targets: byCommander ? [unitId] : [], evidence: 'head start', confidence: 1,
  };
  const d = computeDeltas(draft, reg, unitId, event);
  if (d.dropped) return;
  for (const axis of ['trust', 'affinity', 'attraction'] as const) {
    const [lo, hi] = RANGE[axis];
    rel[axis] = Math.min(hi, Math.max(lo, rel[axis] + roundAway(d[axis])));
  }
  pushHistory(draft, unitId, { day: draft.day, kind: 'event', type: event.type, severity: d.severity });
}

/** §3 step 4: the head start never pushes Trust above 55 and never lowers a Trust that started above it. */
export function capTrust(rel: Relation, trustBefore: number): void {
  rel.trust = Math.min(rel.trust, Math.max(TUNING.headStart.trustCap, trustBefore));
}

/**
 * §3 step 5: the band is re-based from her Trust, then the graph may take one transition that is not romantic (read by `bondTier`).
 * The new state's `stateSince` is `draft.day` (1), as `enterState` writes it.
 */
export function headStartTransition(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel) return [];
  rel.loyaltyBand = initialLoyaltyBand(rel.trust, bandShift(dispositionById(draft, reg, unitId)));
  return evaluateAutomatic(draft, reg, unitId, { allow: (st) => st.bondTier !== 'romantic' });
}
