import { headlockOf } from '../engine/craft/headlock';
import { CRAFT_EVENT_TYPES } from '../engine/craft/state';
import type { EngineEvent } from '../engine/dispatch';
import type { ContextBuilder } from '../llm/context';
import type { CampaignState } from '../engine/state/types';
import { clearCraftDirectives } from './directives';

/** What the craft controller needs from the app: the context builder its directives are read into and the call that pushes them into the next prompt. */
export interface CraftDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt (the app's `applyContext`, which refreshes them from the state). */
  refreshContext(): void;
  /** The open campaign state, or `null`. */
  state(): CampaignState | null;
  /** Dispatches an engine action as the app does (the chat is checked first). Absent: the controller keeps directives and opens nothing. */
  dispatch?(action: { type: string; payload: Record<string, unknown> }, opts?: { expectChatId?: string }): EngineEvent[];
  /** The id of the open chat (what a dispatch is checked against). */
  chatId?(): string | undefined;
  /** Opens a scene (the app's `beginScene`): resolves false when it did not open. Absent: the sparring hold opens no scene. */
  startScene?(opts: { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean }): Promise<boolean>;
  toast?(kind: 'info' | 'warn' | 'error', text: string): void;
}

export interface CraftController {
  /** The events of a settled dispatch: a craft event (a lesson, a record) or a slip changes the directives. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened (or came back after a reload): her directives are derived afresh. */
  onSceneOpened(): void;
  /** A scene closed: everything the craft told the model belonged to it. */
  onSceneClosed(): void;
  /** A chat switch: no `craft:` directive is carried into another campaign (scene ids repeat across campaigns), and what was offered is forgotten. */
  onChatChanged(): void;
}

const OWN: readonly string[] = CRAFT_EVENT_TYPES;
/** What changes the directives: a slip (the lesson is told for the reply that follows it), her punishment (which pays the waiting slips), a care she shows, a service the commander anticipated. */
const TRIGGERS: readonly string[] = ['physics_slip', 'posture_slip', 'punishment_issued', 'care_noticed', 'practice_anticipated'];

/**
 * The model-facing half of the craft in chunk c1: it calls no model (the engine owns every number and the lesson's words are the registry's), it only keeps the derived `craft:`
 * directives in step with the state. The directives are rebuilt from the state on every refresh (`refreshCraftDirectives`, called by the app's `applyContext`); this controller asks for
 * that refresh when something that changes them happened, and clears them when the scene ends or the chat changes. Later chunks add the cards and the calls that word a drill.
 */
export function createCraft(deps: CraftDeps): CraftController {
  /**
   * The sparring hold (Task 18): a bout she won that suits her opens a short scene at the training yard with her alone (it costs no slot: the bout spent it) and the hold begins
   * (`craft/headlock_start`). Deferred until the dispatch that offered it has settled; nothing opens without a startScene and a dispatch, or while a scene is already open.
   */
  async function openHeadlock(unitId: string, locationId: string): Promise<void> {
    if (deps.startScene === undefined || deps.dispatch === undefined) return;
    const s = deps.state();
    if (s === null || s.scene !== undefined || headlockOf(s, unitId) === undefined) return;
    const chatId = deps.chatId?.();
    if (!(await deps.startScene({ locationId, participants: [unitId], origin: 'event', consumesSlot: false }))) {
      deps.toast?.('warn', 'The scene did not open.');
      return;
    }
    const failed = deps.dispatch({ type: 'craft/headlock_start', payload: { unitId } }, { expectChatId: chatId }).find((e) => e.type === 'error');
    if (failed !== undefined) deps.toast?.('warn', String(failed.message ?? failed.code));
    deps.refreshContext();
  }
  return {
    onEvents(events) {
      if (events.some((e) => OWN.includes(e.type) || TRIGGERS.includes(e.type))) deps.refreshContext();
      for (const e of events) {
        if (e.type === 'headlock_offered' && typeof e.unitId === 'string' && typeof e.locationId === 'string') {
          const { unitId, locationId } = e;
          void Promise.resolve().then(() => openHeadlock(unitId, locationId)).catch(() => deps.toast?.('error', 'The scene did not open.'));
        }
      }
    },
    onSceneOpened() {
      deps.refreshContext();
    },
    onSceneClosed() {
      clearCraftDirectives(deps.context);
    },
    onChatChanged() {
      clearCraftDirectives(deps.context);
    },
  };
}
