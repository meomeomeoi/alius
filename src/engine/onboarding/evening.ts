import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import { nextId } from '../memory';
import { enqueueNight } from '../night';
import type { CampaignState, NightEntry } from '../state/types';
import { registerStepEntry } from './state';

/**
 * Who leads the guided first evening: the living named unit with the highest Affinity (ties: higher Trust, then squad
 * order), or `null` when nobody is left.
 */
export function guideUnit(state: Pick<CampaignState, 'squad' | 'relations'>): string | null {
  let best: { id: string; affinity: number; trust: number } | null = null;
  for (const u of state.squad) {
    if (u.kind !== 'named' || !isLiving(u)) continue;
    const r = state.relations[u.id];
    if (!r) continue;
    if (best === null || r.affinity > best.affinity || (r.affinity === best.affinity && r.trust > best.trust)) {
      best = { id: u.id, affinity: r.affinity, trust: r.trust };
    }
  }
  return best?.id ?? null;
}

// Entering a guided step that waits for the next day picks the guide; a step with a `nightKnock` also queues her visit
// for tonight (it lapses a day later, like any night entry, and ignoring it costs what the step says).
registerStepEntry('guided_slot', (draft, _ctx, step) => {
  if (step.completion !== 'next_day' || !draft.onboarding) return [];
  const id = guideUnit(draft);
  if (id === null) return [];
  draft.onboarding.guideUnitId = id;
  if (!step.nightKnock) return [];
  const unit = draft.squad.find((u) => u.id === id)!;
  const entry: NightEntry = {
    id: nextId(draft, 'n'), unitId: id, kind: 'visit', priority: 5,
    framing: step.nightKnock.framing.replace('{name}', unit.displayName),
    ignore: { event: step.nightKnock.ignore.event, severity: step.nightKnock.ignore.severity as NightEntry['ignore']['severity'] },
    expiresDay: draft.day + 1,
  };
  return enqueueNight(draft, entry) ? [{ type: 'night_queued', entry }] : [];
});
