import { DYNAMIC_EVENT_TYPES } from '../engine/dynamic/types';
import type { CampaignState } from '../engine/state/types';
import type { DynamicDeps } from './deps';
import { clearDynamicDirectives, refreshDynamicDirectives } from './directives';

export type { DynamicDeps } from './deps';

export interface DynamicController {
  /** The events of a settled dispatch: one of the dynamic's own (a probe issued, a band or a frame crossed, a position shifted, ...) changes what the model is told. */
  onEvents(events: Array<{ type: string; [k: string]: unknown }>): void;
  /** A scene opened: the directives of each present woman who holds, or whose probe is pending, are set. */
  onSceneOpened(): void;
  /** The scene closed, or the chat changed: every directive of the dynamic goes. */
  onSceneClosed(): void;
}

const OWN: readonly string[] = DYNAMIC_EVENT_TYPES;

/**
 * The model-facing half of the dynamic (P15): its directives are derived from the state on every refresh (`refreshDynamicDirectives`, called
 * by the app's context pass), so the controller only has to push a refresh when something of the dynamic happened, set them when a scene opens
 * and drop them when it closes or the chat switches. It asks for no model call of its own and dispatches nothing.
 */
export function createDynamic(deps: DynamicDeps): DynamicController {
  const state = (): CampaignState | null => deps.app.current().state;
  return {
    onEvents(events) {
      if (events.some((e) => OWN.includes(e.type))) deps.refreshContext();
    },
    onSceneOpened() {
      const s = state();
      if (s) refreshDynamicDirectives(deps.context, s, deps.registries());
      deps.refreshContext();
    },
    onSceneClosed() {
      clearDynamicDirectives(deps.context);
      deps.refreshContext();
    },
  };
}
