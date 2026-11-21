import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { addFact, recordPromise, revealCrime } from '../memory';
import { factTextMax } from '../memory/config';
import { roundAway } from './gain';
import { affectedUnits, computeDeltas, stressFromHint } from './deltas';
import { applyEventToUnit } from './effects';
import { applyDisciplineEvent } from '../discipline/record';
import { recordWitnesses } from '../development/appraisal';
import { measureList } from '../discipline';
import { evaluateAutomatic } from './graph';
import { yieldPartial } from '../dynamic/domains';
import { applyDynamicIntent, DYNAMIC_ROW_IS_CONDITIONAL, dynamicIntentInput } from '../dynamic/intents';
import { applyLifeIntent, lifeIntentInput, ROW_IS_CONDITIONAL } from '../life/intents';
import { validateIntents } from './intents';
import { LIFE_EVENT_TYPES } from './vocab';
import { commanderProposal, offerProposal } from './proposals';
import { applyRuleEvent, RULE_EVENT_TYPES, rulesOf } from '../bonds/rules';
import { expectationEvent } from '../warden/agenda';
import { conspireInput, tryAlly } from '../warden/intrigue';
import { resolveCompromise } from '../warden/override';
import { wardenOf, wardenOverrideOpen } from '../warden/state';
import { frequencyLeak, leakCandidates } from '../special/frequency/leaks';
import { actOnWarning } from '../special/paranoia/accusations';
import { warnedUnits } from '../special/paranoia/premonitions';
import { TUNING } from '../tuning';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface ApplyParams {
  channel: 'scene' | 'dm';
  participants: string[];
  intents: unknown;
  sceneId?: string;
  /** P9: where the reply that was read sits (scene: `chat:<index>`, DM: `dm:<message id>`), kept by what a reading logs. */
  messageRef?: string;
}

/** P13: the ids of the warden's open override while she is in the scene (the one a compromise may settle). */
function openOverrideIds(state: CampaignState, participants: string[]): string[] {
  const o = wardenOverrideOpen(state);
  const w = wardenOf(state);
  return o !== null && w !== null && participants.includes(w.unitId) && o.context !== 'combat' ? [o.id] : [];
}

/** P13: the ids of the warden's expectations while she is among the participants. */
function expectationIds(state: CampaignState, participants: string[]): string[] {
  const w = wardenOf(state);
  return w !== null && participants.includes(w.unitId) ? w.expectations.map((x) => x.id) : [];
}

const DISCIPLINE_EVENTS: readonly string[] = ['defied', 'commander_enforced', 'commander_yielded', 'threatened'];
/** The events of the commander's side whose reading is only trusted at `TUNING.impunity.minConfidence`. */
const GATED_EVENTS: readonly string[] = ['commander_enforced', 'threatened'];
const CONFIDENCE_EPS = 1e-9;

/**
 * Turns what the mechanic model reported into state changes. Everything is re-validated first; nothing outside the
 * rules can get through. Per event: the delta chain → diminishing returns → stress → history → event-driven states;
 * then stress hints, promises, facts and proposals; finally one automatic-transition pass for every touched unit.
 */
export function applyIntents(draft: CampaignState, ctx: EngineCtx, p: ApplyParams): EngineEvent[] {
  const reg = ctx.registries;
  const rules = rulesOf(draft).filter((r) => r.status === 'active' || r.status === 'negotiating').map((r) => ({ id: r.id, unitId: r.unitId }));
  const intents = validateIntents(p.intents, { participants: p.participants, squad: draft.squad, factTextMax: factTextMax(draft), maxEvents: TUNING.relations.maxEventsRead, measures: measureList(reg, draft), rules,
    intercepted: leakCandidates(draft, reg, p.participants).map((c) => c.id), // P12: only items the frequency really caught
    warned: warnedUnits(draft, p.participants), // P12: only units there is an open warning about
    overrides: openOverrideIds(draft, p.participants), // P13: the warden's override a compromise may settle
    expectations: expectationIds(draft, p.participants), // P13: her expectations, while she is present
    ...conspireInput(draft, reg, p.participants), // P13: the units the commander may enlist against her
    ...lifeIntentInput(draft, reg, p.participants, p.channel === 'scene' ? draft.scene ?? null : null, p.channel), // P14c: what she may tell, her hobbies, her views
    ...dynamicIntentInput(draft, reg, p.participants, p.channel) }); // P15: a probe to answer, an open milestone, claim or offer (nothing while off)
  const events: EngineEvent[] = [];
  const touched = new Set<string>();
  /** Types of the events that landed on at least one unit (P8: an event dropped for every unit is not here). */
  const landed: string[] = [];

  // P8: each event is judged per unit first; one that is dropped for every unit it targets takes no slot, and only then
  // are the first `maxEventsPerExchange` of the rest applied (an event that targets nobody keeps its slot, as before)
  const judged = intents.events.map((e) => {
    const units = affectedUnits(e, p.participants);
    // P9: a punishment or a threat the model is not sure about is dropped for every unit, before the cut to six
    const gated = GATED_EVENTS.includes(e.type) && e.confidence + CONFIDENCE_EPS < TUNING.impunity.minConfidence;
    return { e, units, believed: gated ? [] : units.filter((id) => computeDeltas(draft, reg, id, e).dropped !== true) };
  }).filter((j) => j.units.length === 0 || j.believed.length > 0).slice(0, TUNING.relations.maxEventsPerExchange);
  intents.events = judged.map((j) => j.e);

  for (const { e, believed } of judged) {
    for (const id of believed) {
      events.push(...(DISCIPLINE_EVENTS.includes(e.type)
        ? applyDisciplineEvent(draft, ctx, id, e, { channel: p.channel, ...(p.sceneId ? { sceneId: p.sceneId } : {}), ...(p.messageRef ? { messageRef: p.messageRef } : {}) })
        : ROW_IS_CONDITIONAL.includes(e.type) || DYNAMIC_ROW_IS_CONDITIONAL.includes(e.type) ? [] : applyEventToUnit(draft, reg, id, e))); // P14c: an agreement's row is applied by applyLifeIntent, on a strong opinion only; P15: the dynamic's rows are zero, its effect is applyDynamicIntent's
      // P9d: what a kept or broken rule does on top of the event's own row, and a compromise's text
      if ((e.type === 'expectation_kept' || e.type === 'expectation_broken') && e.expectationId !== undefined) events.push(...expectationEvent(draft, ctx, e.expectationId, e.type === 'expectation_kept', e.severity)); // P13
      if (e.type === 'conspired') events.push(...tryAlly(draft, ctx, id)); // P13: the ally check
      if (LIFE_EVENT_TYPES.includes(e.type)) events.push(...applyLifeIntent(draft, ctx, id, e)); // P14c: her news told, a hobby praised, ...
      if (DYNAMIC_ROW_IS_CONDITIONAL.includes(e.type)) events.push(...applyDynamicIntent(draft, ctx, id, e, events)); // P15: a probe answered or observed, ...
      if (e.type === 'compromise_reached' && e.overrideId !== undefined) events.push(...resolveCompromise(draft, ctx, e.overrideId, e.text)); // P13: a compromise with the warden
      else if (e.type === 'compromise_reached' && (e.claimId !== undefined || e.exitId !== undefined)) {
        // P15: a compromise with her over a claim yields the domain for a week; only her own open claim (an exit's compromise arrives with the exit)
        if (e.claimId !== undefined && draft.dynamic?.open.claims.some((c) => c.id === e.claimId && c.unitId === id)) events.push(...yieldPartial(draft, ctx, e.claimId));
      } else if (RULE_EVENT_TYPES.includes(e.type)) events.push(...applyRuleEvent(draft, ctx, id, e, p.participants));
      // P12: she noticed the commander using what the frequency told (suspicion; the event's own row already moved Trust)
      if (e.type === 'accused') events.push(...actOnWarning(draft, ctx, id, 'accused')); // P12: scored by the warning's truth
      if (e.type === 'knowledge_leak' && e.itemId !== undefined) events.push(...frequencyLeak(draft, ctx, id, e.itemId, e.severity));
      touched.add(id);
    }
    if (believed.length > 0) landed.push(e.type);
    // P14b: the others in the room read it from the side (scene only; a DM has no witnesses)
    if (p.channel === 'scene') events.push(...recordWitnesses(draft, reg, e, believed, p.participants, p.sceneId));
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
