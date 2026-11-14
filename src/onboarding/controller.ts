import type { Entry, Registries } from '../content/types';
import { restrictionReason } from '../engine/discipline';
import type { EngineEvent } from '../engine/dispatch';
import { completionReason, currentStep, livingNamed, type StepWithId } from '../engine/onboarding';
import type { CampaignState } from '../engine/state/types';
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
  /** Reads the events of one dispatch: exchange caps and a closed prologue scene. */
  onEvents(events: EngineEvent[]): void;
  /** A scene opened (by this controller or after a reload): picks up the goal directive and the tracking. */
  onSceneOpened(): void;
  onSceneClosed(): void;
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

  /** The units the step's scene can take: living, named, not held back by discipline, at most one scene's worth. */
  function candidates(s: CampaignState): string[] {
    return livingNamed(s).filter((u) => restrictionReason(s, u.id, 'scene') === null).map((u) => u.id).slice(0, TUNING.scene.maxParticipants);
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
      const who = candidates(s);
      if (who.length === 0) {
        deps.toast('warn', 'Nobody is free for the line-up right now.');
        return false;
      }
      return open(step, who);
    },

    async talkFirstWords(unitId) {
      const s = state();
      const step = s ? currentStep(s, reg()) : null;
      if (!s || !step || step.kind !== 'scene' || step.perUnit !== true || s.scene) return false;
      if (!livingNamed(s).some((u) => u.id === unitId) || s.onboarding?.spoken?.includes(unitId)) return false;
      const held = restrictionReason(s, unitId, 'scene');
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

    onSceneOpened() {
      const s = state();
      const scene = s?.scene;
      if (!s || !scene || scene.origin !== 'prologue') return;
      tracked = { sceneId: scene.id, participants: [...scene.participants] };
      const step = currentStep(s, reg());
      if (step) setGoal(step);
    },

    onSceneClosed() {
      tracked = null;
      clearDirectives();
      deps.refreshContext();
    },

    onEvents(events) {
      const s = state();
      if (!s) return;
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
    },
  };
}
