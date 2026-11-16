import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { fnv1a } from '../hub';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/**
 * Which day of a rumor's span a unit hears it on: FNV-1a over the fact id and the unit id, so the same save always gives the
 * same days. This is the whole of the "randomness" of rumors; the campaign RNG is never drawn from.
 */
export function hashDay(factId: string, unitId: string, span: number): number {
  return fnv1a(`${factId}\0${unitId}`) % Math.max(1, span);
}

/** The span of a spreading fact: fast 2 days, slow 4, halved (rounded down, at least 1) at importance 4 and 5. */
const spanOf = (spread: 'slow' | 'fast', importance: number): number => {
  const w = TUNING.memory.rumor[spread];
  return importance >= 4 ? Math.max(1, Math.floor(w / 2)) : w;
};

/**
 * The `dm_rumors` day-end step of P3b: a fact written with `spread` is heard by every living named unit who did not see it, on
 * the day `hashDay` says inside its span (never on the day it happened). Hearing adds her to `knownBy` and records the day in
 * `heard`. `draft.day` is the day that is ending. The spread stops once nobody who could hear is left, or the span is over.
 */
export function spreadRumors(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  const squad = draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);
  for (const fact of draft.memory.facts) {
    if (!fact.spread) continue;
    if (fact.knownBy.includes('*')) {
      delete fact.spread; // public: nothing to spread
      continue;
    }
    const span = spanOf(fact.spread, fact.importance);
    const age = draft.day - fact.day;
    const heard: string[] = [];
    for (const id of squad) {
      if (fact.knownBy.includes(id) || age < hashDay(fact.id, id, span) + 1) continue;
      fact.knownBy.push(id);
      (fact.heard ??= {})[id] = draft.day;
      heard.push(id);
    }
    if (heard.length > 0) events.push({ type: 'rumor_heard', factId: fact.id, unitIds: heard });
    if (squad.every((id) => fact.knownBy.includes(id)) || age >= span) delete fact.spread;
  }
  return events;
}
