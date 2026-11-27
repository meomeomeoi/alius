import { CRAFT_EVENT_TYPES } from '../engine/craft/state';
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
  return {
    onEvents(events) {
      if (events.some((e) => OWN.includes(e.type) || TRIGGERS.includes(e.type))) deps.refreshContext();
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
