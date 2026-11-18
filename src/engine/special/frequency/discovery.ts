import type { EngineCtx, EngineEvent } from '../../dispatch';
import { isLiving } from '../../economy';
import { addFact } from '../../memory';
import { evaluateAutomatic } from '../../relations/graph';
import { applyEventToUnit } from '../../relations/effects';
import type { CampaignState } from '../../state/types';
import { frequencyOf } from './intercepts';

/** The relation flag of a unit who knows the commander hears thoughts (P9 leverage: no extra code for the Impunity term). */
export const KNOWS_FREQUENCY = 'knows_frequency';

const namedLiving = (state: CampaignState, id: string) => {
  const u = state.squad.find((x) => x.id === id);
  return u !== undefined && u.kind === 'named' && isLiving(u);
};

/**
 * What learning it does to her: an `extreme` violation (Trust and Affinity crash, stress up), or after the implant was burned a
 * `major` one, plus a small `decision_aligned` for a unit who hates lies (the honesty tag P7 uses: there is no honesty value axis).
 */
function expose(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const burned = frequencyOf(draft).burnedDay !== undefined;
  const events = applyEventToUnit(draft, reg, unitId, {
    type: 'frequency_exposed', actor: 'commander', targets: [unitId], severity: burned ? 'major' : 'extreme', evidence: 'the frequency', confidence: 1,
  });
  const unit = draft.squad.find((u) => u.id === unitId);
  if (burned && unit?.triggers.includes('lies')) {
    events.push(...applyEventToUnit(draft, reg, unitId, {
      type: 'decision_aligned', actor: 'commander', targets: [unitId], severity: 'minor', evidence: 'the implant was burned out', confidence: 1,
    }));
  }
  events.push(...evaluateAutomatic(draft, reg, unitId));
  return events;
}

/**
 * She is sure: the commander hears thoughts. She gets `knows_frequency`, the hit, and a hidden fact that spreads fast
 * (`{Name} knows the commander hears thoughts.`, known by her alone, pinned). Nothing happens for a unit who already knows.
 * The event names her only; no number and no truth leave here. Draws nothing.
 */
export function frequencyDiscovered(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel || !namedLiving(draft, unitId) || rel.flags.includes(KNOWS_FREQUENCY)) return [];
  const f = frequencyOf(draft);
  rel.flags.push(KNOWS_FREQUENCY);
  delete f.suspicion[unitId];
  (f.discovered ??= []).push(unitId);
  const events: EngineEvent[] = [{ type: 'frequency_discovered', unitId }, ...expose(draft, ctx, unitId)];
  const existing = f.factId === undefined ? undefined : draft.memory.facts.find((x) => x.id === f.factId);
  if (existing) {
    if (!existing.knownBy.includes(unitId)) existing.knownBy.push(unitId);
  } else {
    const name = draft.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
    f.factId = addFact(draft, {
      about: [unitId], text: `${name} knows the commander hears thoughts.`, tags: ['frequency'], importance: 5, day: draft.day,
      knownBy: [unitId], hiddenFromCommander: true, spread: 'fast', pinned: true,
    }).id;
  }
  return events;
}

/**
 * The squad learns by rumor: every named living unit now in the hidden fact's `knownBy` without the flag gets the flag and the
 * same hit. Deterministic and idempotent; run after P3b's rumor spread.
 */
export function syncFrequencyKnowers(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const f = draft.special?.frequency;
  if (!f || f.factId === undefined) return [];
  const fact = draft.memory.facts.find((x) => x.id === f.factId);
  if (!fact) return [];
  const events: EngineEvent[] = [];
  for (const id of fact.knownBy) {
    if (id === '*' || !namedLiving(draft, id) || draft.relations[id]?.flags.includes(KNOWS_FREQUENCY)) continue;
    events.push(...frequencyDiscovered(draft, ctx, id));
  }
  return events;
}

/** One-way: the implant is burned out. From now on nothing is intercepted and no leak is offered. */
export function burnImplant(draft: CampaignState): EngineEvent[] {
  const f = frequencyOf(draft);
  if (f.burnedDay !== undefined) return [];
  f.burnedDay = draft.day;
  return [{ type: 'implant_burned' }];
}
