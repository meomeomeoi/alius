import type { Entry, Registries } from '../content/types';
import type { NightSpec } from '../content/schemas';
import type { EngineEvent } from './dispatch';
import { isLiving } from './economy';
import { nextId } from './memory';
import type { Rng } from './rng';
import { availableStates } from './relations/graph';
import { intimacyOf } from './relations/gain';
import type { CampaignState, NightEntry } from './state/types';
import { TUNING } from './tuning';

/** Adds an entry to the night queue (highest priority first, stable). A second entry for the same unit and kind is refused. */
export function enqueueNight(draft: CampaignState, e: NightEntry): boolean {
  const queue = draft.calendar.nightEventsQueue;
  if (queue.some((q) => q.unitId === e.unitId && q.kind === e.kind)) return false;
  queue.push(e);
  // stable sort: equal priorities keep their arrival order
  const ranked = queue.map((q, i) => ({ q, i })).sort((a, b) => b.q.priority - a.q.priority || a.i - b.i);
  queue.splice(0, queue.length, ...ranked.map((x) => x.q));
  return true;
}

const EXPIRES_IN_DAYS = 2;

/** The night specs a unit has right now: those of its current state (if usable) and of its defects. */
function specsOf(state: CampaignState, reg: Registries, unitId: string, usable: Set<string>): NightSpec[] {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  if (!unit || !rel) return [];
  const out: NightSpec[] = [];
  const st: Entry | undefined = usable.has(rel.stateId) ? reg.relationshipStates.get(rel.stateId) : undefined;
  out.push(...(((st?.unlocks as { nightEvents?: NightSpec[] } | undefined)?.nightEvents) ?? []));
  for (const d of unit.defects) out.push(...((reg.defects.get(d.id)?.nightEvents as NightSpec[] | undefined) ?? []));
  return out;
}

/**
 * Rolls the night visits of every living named unit for a trigger (`daily` at the day end, `commander_injured` when
 * the commander is hurt) and queues the winners. Expired entries are dropped first.
 */
export function rollNight(draft: CampaignState, reg: Registries, rng: Rng, trigger: 'daily' | 'commander_injured'): EngineEvent[] {
  const events: EngineEvent[] = [];
  const queue = draft.calendar.nightEventsQueue;
  draft.calendar.nightEventsQueue = queue.filter((e) => e.expiresDay >= draft.day);
  const usable = new Set(availableStates(draft, reg).map((s) => s.id));
  const mult = TUNING.comms.initiativeMult[intimacyOf(draft).initiative];
  for (const u of draft.squad) {
    if (u.kind !== 'named' || !isLiving(u)) continue;
    for (const spec of specsOf(draft, reg, u.id, usable)) {
      if (spec.trigger !== trigger) continue;
      if (!rng.chance(Math.min(1, spec.chance * mult))) continue;
      const entry: NightEntry = {
        id: nextId(draft, 'n'), unitId: u.id, kind: spec.kind, priority: spec.priority,
        framing: spec.framing.replace('{name}', u.displayName), ignore: { ...spec.ignore } as NightEntry['ignore'],
        expiresDay: draft.day + EXPIRES_IN_DAYS,
      };
      if (enqueueNight(draft, entry)) events.push({ type: 'night_queued', entry });
    }
  }
  return events;
}
