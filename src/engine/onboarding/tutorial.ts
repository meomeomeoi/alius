import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { buildMission } from '../world/missions';
import { currentStep, registerStepEntry } from './state';

/** A coach hint of the tutorial step, as the prologue lists it. */
export interface CoachHint { id: string; screen: 'combat' | 'expedition'; glossaryId: string; text: string }

/** Whether the open expedition is the prologue's tutorial run (read from the mission's template, never from an id). */
export function isTutorialRun(state: CampaignState, reg: Registries): boolean {
  const exp = state.expedition;
  if (!exp) return false;
  const mission = state.missions.active.find((m) => m.id === exp.missionId);
  return mission !== undefined && reg.missionTemplates.get(mission.templateId)?.tutorial === true;
}

/** The hints of the current expedition step that were not dismissed yet and belong to this screen; empty outside the tutorial run. */
export function coachHints(state: CampaignState, reg: Registries, screen: CoachHint['screen']): CoachHint[] {
  if (!isTutorialRun(state, reg)) return [];
  const step = currentStep(state, reg);
  if (!step || step.kind !== 'expedition') return [];
  const seen = new Set(state.onboarding?.hintsSeen ?? []);
  return (step.hints ?? []).filter((h) => h.screen === screen && !seen.has(h.id));
}

/** Takes the offered tutorial mission off the board (skipping the step); a run that already started is not touched. */
export function withdrawTutorial(draft: CampaignState): void {
  const id = draft.onboarding?.tutorialMissionId;
  if (id === undefined) return;
  draft.missions.offered = draft.missions.offered.filter((m) => m.id !== id);
}

// Entering an expedition step offers its mission: in the step's region, from the command, with no deadline, past the
// board's size limit (it is never pushed out and never expires).
registerStepEntry('expedition', (draft, ctx, step) => {
  if (step.expeditionId === undefined || step.regionId === undefined) return [];
  const mission = buildMission(draft, ctx, { templateId: step.expeditionId, regionId: step.regionId, source: 'command' });
  delete mission.deadlineDay;
  draft.missions.offered.push(mission);
  if (draft.onboarding) draft.onboarding.tutorialMissionId = mission.id;
  return [{ type: 'mission_offered', missionId: mission.id, source: mission.source, regionId: mission.regionId, title: mission.title }];
});
