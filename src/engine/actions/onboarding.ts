import { registerAction } from '../dispatch';
import { completionReason, currentStep, enterStep, livingNamed, stepIndex } from '../onboarding';
import { stepsOf } from '../onboarding/prologue';
import { withdrawTutorial } from '../onboarding/tutorial';
import type { CampaignState } from '../state/types';

// Importing this module registers the P11 `onboarding/*` actions. Each one is refused once the prologue is over (or was never there).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The open onboarding, or a refusal. */
function open(draft: CampaignState): NonNullable<CampaignState['onboarding']> {
  const o = draft.onboarding;
  if (!o || o.done) throw new Error('The prologue is over.');
  return o;
}

/** The current step, refusing a step id that is no longer current (a stale button after a reload or a skip). */
function currentFor(draft: CampaignState, ctx: { registries: Parameters<typeof currentStep>[1] }, payload: unknown, action: string) {
  const o = open(draft);
  if (!isObj(payload) || typeof payload.stepId !== 'string') throw new Error(`${action} needs { stepId }`);
  if (payload.stepId !== o.stepId) throw new Error('Stale onboarding step.');
  const step = currentStep(draft, ctx.registries);
  if (!step) throw new Error('Stale onboarding step.');
  return step;
}

registerAction('onboarding/complete_step', (draft, payload, ctx) => {
  const step = currentFor(draft, ctx, payload, 'onboarding/complete_step');
  const reason = completionReason(draft, ctx.registries, step);
  if (reason !== null) throw new Error(reason);
  const o = open(draft);
  o.completed.push(step.id);
  return [{ type: 'onboarding_step_completed', stepId: step.id }, ...enterStep(draft, ctx, stepIndex(draft, ctx.registries, step.id) + 1)];
});

registerAction('onboarding/skip_step', (draft, payload, ctx) => {
  const step = currentFor(draft, ctx, payload, 'onboarding/skip_step');
  if (!step.skippable) throw new Error('This step cannot be skipped.');
  const o = open(draft);
  if (step.kind === 'expedition') withdrawTutorial(draft); // the patrol is not going out: it leaves the board
  o.skipped.push(step.id);
  return [{ type: 'onboarding_step_skipped', stepId: step.id }, ...enterStep(draft, ctx, stepIndex(draft, ctx.registries, step.id) + 1, step.kind === 'expedition')];
});

registerAction('onboarding/mark_spoken', (draft, payload) => {
  const o = open(draft);
  if (!isObj(payload) || typeof payload.unitId !== 'string') throw new Error('onboarding/mark_spoken needs { unitId }');
  const unitId = payload.unitId;
  if (!livingNamed(draft).some((u) => u.id === unitId)) throw new Error('Only a living named soldier can be spoken to.');
  if (o.spoken?.includes(unitId)) throw new Error('That soldier has already been spoken to.');
  o.spoken = [...(o.spoken ?? []), unitId];
  return [{ type: 'onboarding_spoken', unitId }];
});

registerAction('onboarding/hint_seen', (draft, payload, ctx) => {
  const o = open(draft);
  if (!isObj(payload) || typeof payload.hintId !== 'string') throw new Error('onboarding/hint_seen needs { hintId }');
  const hintId = payload.hintId;
  const entry = ctx.registries.prologues.get(o.prologueId);
  const known = entry ? stepsOf(entry).some((s) => s.hints?.some((h) => h.id === hintId)) : false;
  if (!known) throw new Error(`Unknown coach hint "${hintId}".`);
  if (!o.hintsSeen?.includes(hintId)) o.hintsSeen = [...(o.hintsSeen ?? []), hintId];
  return [];
});

/** The controller asked the guide to write first; recorded before the (slow) generation so a reload neither repeats nor forgets it. */
registerAction('onboarding/guide_dm_sent', (draft) => {
  open(draft).guideDmSent = true;
  return [];
});
