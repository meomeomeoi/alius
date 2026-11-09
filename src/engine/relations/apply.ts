import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { addFact, recordPromise, revealCrime } from '../memory';
import { roundAway } from './gain';
import { affectedUnits, stressFromHint } from './deltas';
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
  const intents = validateIntents(p.intents, { participants: p.participants, squad: draft.squad });
  const events: EngineEvent[] = [];
  const touched = new Set<string>();

  for (const e of intents.events) {
    const units = affectedUnits(e, p.participants);
    for (const id of units) {
      events.push(...applyEventToUnit(draft, reg, id, e));
      touched.add(id);
    }
    if (e.type === 'crime_revealed') events.push(...revealCrime(draft, reg, units));
    if (e.type === 'shared_secret' && e.actor !== 'commander') {
      for (const id of units) {
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

  for (const pr of intents.promises) {
    const { event } = recordPromise(draft, pr, draft.day);
    if (!event) continue;
    const unit = event.targets[0];
    const duplicate = intents.events.some((e) => e.type === event.type && e.targets.includes(unit));
    if (duplicate || !p.participants.includes(unit)) continue;
    events.push(...applyEventToUnit(draft, reg, unit, event));
    touched.add(unit);
  }

  let storedFacts = 0;
  for (const f of intents.facts) {
    if (storedFacts >= TUNING.memory.factsPerScene) break;
    storedFacts++;
    addFact(draft, {
      about: Array.isArray(f.about) ? f.about : [f.about], text: f.text, tags: f.tags, importance: f.importance, day: draft.day,
      knownBy: [...p.participants], ...(p.sceneId ? { sceneId: p.sceneId } : {}),
    });
    if (f.tags.includes('crime')) events.push(...revealCrime(draft, reg, p.participants));
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
  });
  return events;
}
