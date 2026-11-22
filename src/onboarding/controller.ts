import type { Entry, Registries } from '../content/types';
import { restrictionReason } from '../engine/discipline';
import type { EngineEvent } from '../engine/dispatch';
import { whereabouts } from '../engine/hub';
import { completionReason, currentStep, livingNamed, type StepWithId } from '../engine/onboarding';
import type { CampaignState } from '../engine/state/types';
import { wardenUnitId } from '../engine/warden';
import { TUNING } from '../engine/tuning';
import type { OnboardingDeps } from './deps';

export type { OnboardingDeps } from './deps';

export const GOAL_DIRECTIVE = 'prologue:goal';
export const WRAP_DIRECTIVE = 'prologue:wrap';
export const WRAP_TEXT = 'Bring this scene to a natural close within the next reply or two; do not open new topics.';

export interface OnboardingController {
  /** [BEGIN LINE-UP]: one scene with every living named unit that can take part. Resolves whether it opened. */
  startLineup(): Promise<boolean>;
  /** [TALK]: a short private scene with one unit (her restriction, if any, is toasted). */
  talkFirstWords(unitId: string): Promise<boolean>;
  /** [SKIP] on one unit: she counts as spoken to. */
  skipFirstWords(unitId: string): void;
  /** [SKIP]: asks first, then skips the current step. */
  skipStep(): Promise<void>;
  /** [RESUME SCENE] after a reload. */
  resumeScene(): void;
  /** [DEBRIEF]: the debrief scene with the party of the tutorial patrol. */
  debriefTutorial(): Promise<boolean>;
  /** [TALK] with the guide of the first evening, in the room she is in. */
  talkGuide(): Promise<boolean>;
  /** [LAUNCH TUTORIAL] (or [RESUME PATROL] while it is out): opens the planner for the tutorial mission, or the open run. */
  launchTutorial(): boolean;
  /** Reads the events of one dispatch: exchange caps and a closed prologue scene. */
  onEvents(events: EngineEvent[]): void;
  /** A scene opened (by this controller or after a reload): picks up the goal directive and the tracking. */
  onSceneOpened(): void;
  onSceneClosed(): void;
  /** After a (re)load: whatever an event would have started but a reload lost (the guide's first DM). */
  onLoaded(): void;
}

/**
 * Where a scene step is played: the step's own location when it is open this slot, else the first location (registry
 * order) that is. A player who wandered into the night never finds the prologue dead-ended.
 */
export function sceneLocation(state: CampaignState, reg: Registries, step: Pick<StepWithId, 'locationId'>): string {
  const open = (l: Entry): boolean => {
    const slots = l.slots as string[] | undefined;
    return slots === undefined || slots.includes(state.slot);
  };
  const own = step.locationId === undefined ? undefined : reg.locations.get(step.locationId);
  if (own && open(own)) return String(own.id);
  const first = [...reg.locations.values()].find(open);
  return String((first ?? own)?.id ?? step.locationId ?? '');
}

/**
 * The prologue's scenes (P11): the line-up and the first words. The engine owns the steps and decides when one completes;
 * this layer starts the scenes, words the goal and the "wrap it up" directive for the main model, asks the player whether
 * to move on at the exchange cap, and reports the closed scene back. Nothing here reaches the mechanic model.
 */
export function createOnboarding(deps: OnboardingDeps): OnboardingController {
  const state = (): CampaignState | null => deps.app.current().state;
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const reg = (): Registries => deps.registries();

  /** The prologue scene this controller is following (set when it opens, so a close after a reload can still be read). */
  let tracked: { sceneId: string; participants: string[] } | null = null;
  /** Scenes the cap question was already asked in. */
  const asked = new Set<string>();
  /** The guide's first DM waits for the open scene to close. */
  let guideDmDue: string | null = null;

  const clearDirectives = (): void => deps.context.clearMatching((d) => d.id.startsWith('prologue:'));

  function setGoal(step: StepWithId): void {
    if (step.directive) deps.context.setDirective({ id: GOAL_DIRECTIVE, text: step.directive, expiresAfter: 'scene' });
    deps.refreshContext();
  }

  const dispatch = (type: string, payload: unknown, expect: string | undefined): EngineEvent[] => {
    const events = deps.app.dispatch({ type, payload }, { expectChatId: expect });
    const failed = events.find((e) => e.type === 'error');
    if (failed && failed.code !== 'chat_changed') deps.toast('error', String(failed.message ?? failed.code));
    return events;
  };

  const failed = (events: EngineEvent[]): boolean => events.some((e) => e.type === 'error');

  /** Completes the current step when its condition holds (per-unit steps after the last unit; scene steps after the scene closed). */
  function completeIfDone(expect: string | undefined): void {
    const s = state();
    if (!s) return;
    const step = currentStep(s, reg());
    if (!step || completionReason(s, reg(), step) !== null) return;
    dispatch('onboarding/complete_step', { stepId: step.id }, expect);
  }

  /** Completes the current step when it is the kind an event settles (`completion`) and its condition holds. */
  function completeOn(completion: StepWithId['completion'], expect: string | undefined): void {
    const s = state();
    if (s && currentStep(s, reg())?.completion === completion) completeIfDone(expect);
  }

  /** The guide of the first evening writes first (once, and not into the middle of a scene). */
  function sendGuideDm(guideId: string): void {
    const s = state();
    if (!s || s.onboarding?.guideDmSent) return;
    if (s.scene) {
      guideDmDue = guideId;
      return;
    }
    guideDmDue = null;
    // recorded first: a reload during the (slow) generation must not send it a second time
    dispatch('onboarding/guide_dm_sent', {}, chatId());
    void deps.initiateDm(guideId);
  }

  /** The units the step's scene can take: living, named, not held back by discipline, at most one scene's worth. */
  function candidates(s: CampaignState): string[] {
    return livingNamed(s).filter((u) => restrictionReason(s, reg(), u.id, 'scene') === null).map((u) => u.id).slice(0, TUNING.scene.maxParticipants);
  }

  async function open(step: StepWithId, participants: string[]): Promise<boolean> {
    const s = state();
    if (!s) return false;
    const ok = await deps.startScene({ locationId: sceneLocation(s, reg(), step), participants, origin: 'prologue', consumesSlot: false });
    if (!ok) return false;
    setGoal(step);
    return true;
  }

  return {
    async startLineup() {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      if (!s || !step || step.kind !== 'scene' || step.perUnit === true || s.scene) return false;
      // P13: a step with `participants: 'warden'` is held with her alone
      const warden = step.participants === 'warden' ? wardenUnitId(s) : null;
      const who = step.participants === 'warden' ? candidates(s).filter((id) => id === warden) : candidates(s);
      if (who.length === 0) {
        deps.toast('warn', step.participants === 'warden' ? 'The warden is not free right now.' : 'Nobody is free for the line-up right now.');
        return false;
      }
      return open(step, who);
    },

    async talkFirstWords(unitId) {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      if (!s || !step || step.kind !== 'scene' || step.perUnit !== true || s.scene) return false;
      if (!livingNamed(s).some((u) => u.id === unitId) || s.onboarding?.spoken?.includes(unitId)) return false;
      const held = restrictionReason(s, reg(), unitId, 'scene');
      if (held) {
        deps.toast('warn', held);
        return false;
      }
      return open(step, [unitId]);
    },

    skipFirstWords(unitId) {
      const expect = chatId();
      const events = dispatch('onboarding/mark_spoken', { unitId }, expect);
      if (failed(events)) return;
      completeIfDone(expect);
    },

    async skipStep() {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      if (!s || !step) return;
      const expect = chatId();
      const answer = await deps.modal({
        title: 'Skip this step?',
        body: `${step.title ?? 'This step'} will be left out of the prologue.`,
        actions: [{ label: 'SKIP', value: 'skip' }, { label: 'Keep it', value: 'keep' }],
      });
      if (answer !== 'skip' || chatId() !== expect) return;
      dispatch('onboarding/skip_step', { stepId: step.id }, expect);
    },

    resumeScene() {
      deps.resumeScene();
    },

    async debriefTutorial() {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      const report = s?.lastExpedition;
      if (!s || !step || step.completion !== 'debriefed' || !report || report.missionId !== s.onboarding?.tutorialMissionId) return false;
      const who = report.party.filter((id) => livingNamed(s).some((u) => u.id === id) && restrictionReason(s, reg(), id, 'scene') === null).slice(0, TUNING.scene.maxParticipants);
      if (who.length === 0) {
        deps.toast('warn', 'Nobody from the patrol is free to debrief.');
        return false;
      }
      return deps.debrief(who);
    },

    async talkGuide() {
      const s = state();
      const id = s?.onboarding?.guideUnitId;
      if (!s || id === undefined || !livingNamed(s).some((u) => u.id === id)) return false;
      const room = whereabouts(s, reg()).find((w) => w.unitId === id)?.roomId;
      // her room's location when it is open this slot, else the first location that is (never a literal id)
      const location = sceneLocation(s, reg(), { locationId: room ? String(reg().hubRooms.get(room)?.sceneLocationId ?? '') : undefined });
      return deps.talkAt(id, location);
    },

    launchTutorial() {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      if (!s || !step || step.kind !== 'expedition') return false;
      if (s.expedition) {
        deps.openExpedition();
        return true;
      }
      const id = s.onboarding?.tutorialMissionId;
      if (id === undefined || !s.missions.offered.some((m) => m.id === id)) {
        deps.toast('warn', 'The patrol is no longer on the board. Skip this step to go on.');
        return false;
      }
      deps.openExpedition(id);
      return true;
    },

    onSceneOpened() {
      const s = state();
      const scene = s?.scene;
      if (!s || !scene || scene.origin !== 'prologue') return;
      tracked = { sceneId: scene.id, participants: [...scene.participants] };
      const step = currentStep(s, reg());
      if (step) setGoal(step);
      // the squad speaks first: for a scene just opened, and again for one a reload found still empty (the opening is idempotent)
      if (scene.exchanges === 0) void deps.startOpening?.();
    },

    onLoaded() {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      const guide = s?.onboarding?.guideUnitId;
      if (!s || s.scene || step?.completion !== 'next_day' || guide === undefined || !livingNamed(s).some((u) => u.id === guide)) return;
      sendGuideDm(guide);
    },

    onSceneClosed() {
      tracked = null;
      asked.clear(); // scene ids repeat from campaign to campaign; a resumed scene is asked afresh
      clearDirectives();
      deps.refreshContext();
    },

    onEvents(events) {
      const s = state();
      if (!s) return;
      // the debrief was held (from the card or the report), or the evening is over
      if (events.some((e) => e.type === 'expedition_debriefed')) completeOn('debriefed', chatId());
      if (events.some((e) => e.type === 'day_started')) completeOn('next_day', chatId());
      // the first evening began: the guide writes first
      if (events.some((e) => e.type === 'onboarding_step_started')) {
        const step = currentStep(s, reg());
        const guide = s.onboarding?.guideUnitId;
        if (step?.completion === 'next_day' && guide !== undefined && events.some((e) => e.type === 'onboarding_step_started' && e.stepId === step.id)) sendGuideDm(guide);
      }
      if (guideDmDue !== null && events.some((e) => e.type === 'scene_ended' || e.type === 'scene_aborted') && !s.scene) sendGuideDm(guideDmDue);
      // the patrol is back, however it went (a lost or abandoned tutorial never blocks the prologue)
      if (events.some((e) => e.type === 'expedition_ended') && currentStep(s, reg())?.kind === 'expedition') completeIfDone(chatId());
      // the cap: the main model is told to wind down and the player is asked once
      if (events.some((e) => e.type === 'scene_exchange') && s.scene?.origin === 'prologue') {
        const step = currentStep(s, reg());
        const scene = s.scene;
        if (step?.exchangeCap !== undefined && scene.exchanges >= step.exchangeCap && !asked.has(scene.id)) {
          asked.add(scene.id);
          deps.context.setDirective({ id: WRAP_DIRECTIVE, text: WRAP_TEXT, expiresAfter: 'scene' });
          deps.refreshContext();
          const expect = chatId();
          void deps.modal({
            title: 'Move on?',
            body: 'This is a good place to leave it. Keep talking, or move on.',
            actions: [{ label: 'MOVE ON', value: 'move' }, { label: 'Keep talking', value: 'keep' }],
          }).then(async (answer) => {
            if (answer === 'move' && chatId() === expect && state()?.scene?.id === scene.id) await deps.endScene();
          });
        }
      }
      const ended = events.find((e) => e.type === 'scene_ended' && tracked !== null && e.sceneId === tracked.sceneId);
      const aborted = events.some((e) => e.type === 'scene_aborted');
      if (ended && tracked) {
        const done = tracked;
        tracked = null;
        asked.delete(done.sceneId);
        clearDirectives();
        deps.refreshContext();
        const expect = chatId();
        const step = currentStep(s, reg());
        if (step?.perUnit === true) {
          for (const unitId of done.participants) {
            if (!s.onboarding?.spoken?.includes(unitId)) dispatch('onboarding/mark_spoken', { unitId }, expect);
          }
        }
        completeIfDone(expect);
      } else if (aborted && tracked) {
        // the prologue scene was abandoned: the step stays open, its directives go
        tracked = null;
        clearDirectives();
        deps.refreshContext();
      }
      // a soldier lost since the last first-words scene can leave nobody to meet: the step settles itself
      const now = state();
      if (now && !now.scene && currentStep(now, reg())?.completion === 'all_spoken') completeIfDone(chatId());
    },
  };
}
