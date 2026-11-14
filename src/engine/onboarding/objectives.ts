import type { Registries } from '../../content/types';
import { waitingDemands } from '../hub';
import type { CampaignState } from '../state/types';
import { currentBeat } from '../world/spine';
import { currentStep, livingNamed } from './state';

export type ObjectiveSource = 'prologue' | 'spine' | 'director' | 'unit';

/** One line of the objective list: what to do, where it came from and how many days are left (null = no deadline). */
export interface ObjectiveView { id: string; text: string; source: ObjectiveSource; dueDays: number | null }

/**
 * The objectives in the order the commander should read them: the current prologue step, the proposed spine beat, the
 * director's open lead, then what soldiers are waiting for (the guide of the first evening, demands left unanswered).
 * Only the director's lead is stored; the rest is read from where it already lives.
 */
export function objectiveList(state: CampaignState, reg: Registries): ObjectiveView[] {
  const out: ObjectiveView[] = [];

  const step = currentStep(state, reg);
  if (step?.objective) out.push({ id: `prologue:${step.id}`, text: step.objective, source: 'prologue', dueDays: null });

  const beat = currentBeat(state, reg);
  if (beat && state.world.spine?.proposed === beat.id) out.push({ id: `spine:${beat.id}`, text: String(beat.goal), source: 'spine', dueDays: null });

  const lead = (state.objectives ?? []).find((o) => !o.done);
  if (lead) out.push({ id: lead.id, text: lead.text, source: 'director', dueDays: lead.dueDay === undefined ? null : lead.dueDay - state.day });

  const nameOf = (id: string): string | undefined => state.squad.find((u) => u.id === id)?.displayName;
  const guide = step && step.kind === 'guided_slot' ? state.onboarding?.guideUnitId : undefined;
  if (guide !== undefined && livingNamed(state).some((u) => u.id === guide)) {
    out.push({ id: `unit:guide:${guide}`, text: `${nameOf(guide)} wants to talk.`, source: 'unit', dueDays: null });
  }
  for (const d of waitingDemands(state)) {
    out.push({ id: `unit:demand:${d.id}`, text: `${nameOf(d.unitId)} is waiting for an answer.`, source: 'unit', dueDays: null });
  }
  return out;
}
