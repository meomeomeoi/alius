import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the warden controller needs from the app: the world deps and the context builder its directives are read into. */
export interface WardenDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Replaces the state with a day-start snapshot when `expected` is still the current one (the app's `restoreSnapshot`, then a reload of what hangs on the state). */
  restore(snap: CampaignState, expected: CampaignState): boolean;
  /** Opens a scene and its screen (the app's `beginScene`); resolves whether it opened. */
  startScene(o: { locationId: string; participants: string[]; origin: 'event'; consumesSlot: false }): Promise<boolean>;
}

export type { WorldDeps };
