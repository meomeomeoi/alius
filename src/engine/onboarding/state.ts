import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState, OnboardingState, Unit } from '../state/types';
import { wardenUnitId } from '../warden/state';
import { isWizardStep, stepsOf, type StepWithId } from './prologue';

/** Absent `onboarding` means there is no prologue: old campaigns and starts without one count as done. */
export const onboardingDone = (state: Pick<CampaignState, 'onboarding'>): boolean => state.onboarding === undefined || state.onboarding.done;

/** Named units that still count for the prologue's scenes: not dead, deserted or terminated. */
export const livingNamed = (state: Pick<CampaignState, 'squad'>): Unit[] => state.squad.filter((u) => u.kind === 'named' && isLiving(u));

/** The step the campaign is on, or `null` once the prologue is done (or absent, or its entry is gone from the registries). */
export function currentStep(state: CampaignState, reg: Registries): StepWithId | null {
  const o = state.onboarding;
  if (!o || o.done) return null;
  const entry = reg.prologues.get(o.prologueId);
  return (entry ? stepsOf(entry).find((s) => s.id === o.stepId) : undefined) ?? null;
}

/** Why a step cannot complete yet, or `null` (the closed enum of completions; see the plan's "Completion conditions"). */
export function completionReason(state: CampaignState, reg: Registries, step: Pick<StepWithId, 'completion'>): string | null {
  void reg;
  const o = state.onboarding;
  switch (step.completion) {
    case 'manual':
      return null;
    case 'no_open_scene':
      return state.scene ? 'A scene is still open.' : null;
    case 'all_spoken': {
      const spoken = new Set(o?.spoken ?? []);
      return livingNamed(state).every((u) => spoken.has(u.id)) ? null : 'Not every soldier has been spoken to yet.';
    }
    case 'tutorial_returned': {
      if (state.expedition) return 'The patrol is still out.';
      const id = o?.tutorialMissionId;
      return id !== undefined && state.lastExpedition?.missionId === id ? null : 'The patrol has not returned yet.';
    }
    case 'debriefed': {
      const id = o?.tutorialMissionId;
      return id !== undefined && state.lastExpedition?.missionId === id && state.lastExpedition.debriefed ? null : 'The patrol has not been debriefed yet.';
    }
    case 'next_day':
      return o !== undefined && state.day > o.stepDay ? null : 'It is still the same day.';
  }
}

/**
 * The onboarding a new campaign starts with: every wizard step is behind it (`completed` after the prologue, `skipped`
 * after the veteran intake), the current step is the first campaign step. `buildCampaign` then settles it with `enterStep`.
 */
export function initialOnboarding(reg: Registries, prologueId: string, opts: { veteran: boolean; day: number }): OnboardingState {
  const entry = reg.prologues.get(prologueId);
  if (!entry) throw new Error(`Unknown prologue "${prologueId}".`);
  const steps = stepsOf(entry);
  const wizard = steps.filter(isWizardStep).map((s) => s.id);
  const first = steps.find((s) => !isWizardStep(s));
  if (!first) throw new Error(`Prologue "${prologueId}" has no campaign step.`);
  return {
    prologueId, stepId: first.id, stepDay: opts.day,
    completed: opts.veteran ? [] : wizard, skipped: opts.veteran ? wizard : [], done: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Moving between steps

/** What entering a step of a kind does beyond the bookkeeping (offering the tutorial mission, picking the guide...). Later tasks register these. */
export type StepEntry = (draft: CampaignState, ctx: EngineCtx, step: StepWithId) => EngineEvent[];
const entryEffects = new Map<string, StepEntry>();

export function registerStepEntry(kind: StepWithId['kind'], fn: StepEntry): void {
  entryEffects.set(kind, fn);
}

/**
 * Enters the step at `index` of the prologue, then keeps going while the step is skipped by rule: a scene or expedition
 * with no living named unit, and the `debriefed` step that follows a skipped expedition. Entering `free` completes the
 * prologue. Skipped steps are listed in `skipped`; a skipped step is never "started".
 */
export function enterStep(draft: CampaignState, ctx: EngineCtx, index: number, afterSkippedExpedition = false): EngineEvent[] {
  const o = draft.onboarding;
  if (!o) return [];
  const entry = ctx.registries.prologues.get(o.prologueId);
  if (!entry) throw new Error(`Unknown prologue "${o.prologueId}".`);
  const steps = stepsOf(entry);
  const events: EngineEvent[] = [];
  let skipDebrief = afterSkippedExpedition;
  for (let i = index; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind === 'free') {
      o.stepId = step.id; o.stepDay = draft.day;
      events.push({ type: 'onboarding_step_started', stepId: step.id });
      o.completed.push(step.id);
      o.done = true;
      events.push({ type: 'onboarding_done' });
      return events;
    }
    const noOne = ((step.kind === 'scene' || step.kind === 'expedition') && livingNamed(draft).length === 0)
      || (step.participants === 'warden' && wardenUnitId(draft) === null); // P13: nobody holds the leash, so there is no one to meet
    if (noOne || (skipDebrief && step.completion === 'debriefed')) {
      o.skipped.push(step.id);
      events.push({ type: 'onboarding_step_skipped', stepId: step.id });
      skipDebrief = step.kind === 'expedition';
      continue;
    }
    o.stepId = step.id; o.stepDay = draft.day;
    events.push({ type: 'onboarding_step_started', stepId: step.id });
    const effect = entryEffects.get(step.kind);
    if (effect) events.push(...effect(draft, ctx, step));
    return events;
  }
  return events;
}

/** Index of a step in its prologue (the step the campaign is on when `stepId` is not given). */
export function stepIndex(state: CampaignState, reg: Registries, stepId = state.onboarding?.stepId): number {
  const entry = state.onboarding ? reg.prologues.get(state.onboarding.prologueId) : undefined;
  return entry ? stepsOf(entry).findIndex((s) => s.id === stepId) : -1;
}
