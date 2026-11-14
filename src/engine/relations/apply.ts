import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { addFact, recordPromise, revealCrime } from '../memory';
import { roundAway } from './gain';
import { affectedUnits, computeDeltas, stressFromHint } from './deltas';
import { applyEventToUnit } from './effects';
import { evaluateAutomatic } from './graph';
import { validateIntents } from './intents';
import { commanderProposal, offerProposal } from './proposals';
import { TUNING } from '../tuning';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface ApplyParams {
  channel: 'scene' | 'dm';
  participants: string[];
  intents: unknown;
  sceneId?: string;
}

/**
 * Turns what the mechanic model reported into state changes. Everything is re-validated first; nothing outside the
 * rules can get through. Per event: the delta chain → diminishing returns → stress → history → event-driven states;
 * then stress hints, promises, facts and proposals; finally one automatic-transition pass for every touched unit.
 */
export function applyIntents(draft: CampaignState, ctx: EngineCtx, p: ApplyParams): EngineEvent[] {
  const reg = ctx.registries;
  const intents = validateIntents(p.intents, { participants: p.participants, squad: draft.squad, maxEvents: TUNING.relations.maxEventsRead });
  const events: EngineEvent[] = [];
  const touched = new Set<string>();
  /** Types of the events that landed on at least one unit (P8: an event dropped for every unit is not here). */
  const landed: string[] = [];

  // P8: each event is judged per unit first; one that is dropped for every unit it targets takes no slot, and only then
  // are the first `maxEventsPerExchange` of the rest applied (an event that targets nobody keeps its slot, as before)
  const judged = intents.events.map((e) => {
    const units = affectedUnits(e, p.participants);
    return { e, units, believed: units.filter((id) => computeDeltas(draft, reg, id, e).dropped !== true) };
  }).filter((j) => j.units.length === 0 || j.believed.length > 0).slice(0, TUNING.relations.maxEventsPerExchange);
  intents.events = judged.map((j) => j.e);

  for (const { e, believed } of judged) {
    for (const id of believed) {
      events.push(...applyEventToUnit(draft, reg, id, e));
      touched.add(id);
    }
    if (believed.length > 0) landed.push(e.type);
    if (e.type === 'crime_revealed') events.push(...revealCrime(draft, reg, believed));
    if (e.type === 'shared_secret' && e.actor !== 'commander') {
      for (const id of believed) {
        const flags = draft.relations[id].flags;
        if (!flags.includes('shared_secret')) flags.push('shared_secret');
      }
    }
  }

  for (const h of intents.stressHints) {
    const unit = draft.squad.find((u) => u.id === h.unitId);
    if (!unit) continue;
    const next = clamp(unit.stress + roundAway(stressFromHint(h.severity, h.direction)), 0, 100);
    if (next !== unit.stress) events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
    unit.stress = next;
    touched.add(unit.id);
  }

  // promise-derived events share the per-exchange event budget
  let eventBudget = TUNING.relations.maxEventsPerExchange - intents.events.length;
  for (const pr of intents.promises) {
    const { event } = recordPromise(draft, pr, draft.day, p.participants);
    if (!event) continue;
    const unit = event.targets[0];
    const duplicate = intents.events.some((e) => e.type === event.type && e.targets.includes(unit));
    if (duplicate || !p.participants.includes(unit) || eventBudget <= 0) continue;
    eventBudget--;
    events.push(...applyEventToUnit(draft, reg, unit, event));
    touched.add(unit);
  }

  // a scene stores at most `factsPerScene` facts over all its exchanges
  const already = p.sceneId ? draft.memory.facts.filter((f) => f.sceneId === p.sceneId).length : 0;
  const factRoom = Math.max(0, TUNING.memory.factsPerScene - already);
  let storedFacts = 0;
  for (const f of intents.facts) {
    if (storedFacts >= factRoom) break;
    storedFacts++;
    addFact(draft, {
      about: Array.isArray(f.about) ? f.about : [f.about], text: f.text, tags: f.tags, importance: f.importance, day: draft.day,
      knownBy: [...p.participants], ...(p.sceneId ? { sceneId: p.sceneId } : {}),
    });
    // the `crime` tag only counts for a fact about the commander: a model-chosen tag on any other fact reveals nothing
    if (f.tags.includes('crime') && f.about === 'commander') events.push(...revealCrime(draft, reg, p.participants));
  }

  for (const pr of intents.proposals) {
    const unitId = pr.from === 'commander' ? pr.to : pr.from;
    touched.add(unitId);
    if (pr.from === 'commander') {
      try {
        events.push(...commanderProposal(draft, reg, { unitId, kind: pr.kind, channel: p.channel }));
      } catch {
        // she already has an open proposal, or cannot be proposed to: nothing happens
      }
    } else {
      events.push(...offerProposal(draft, reg, { unitId, kind: pr.kind, channel: p.channel }));
    }
  }

  for (const id of touched) events.push(...evaluateAutomatic(draft, reg, id));

  events.push({
    type: 'intents_applied', channel: p.channel,
    counts: {
      events: intents.events.length, facts: storedFacts, proposals: intents.proposals.length,
      promises: intents.promises.length, stressHints: intents.stressHints.length,
    },
    landed,
  });
  return events;
}
