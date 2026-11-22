import type { Action, EngineEvent } from '../engine/dispatch';
import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the dynamic controller needs from the app: the world deps and the context builder its directives are read into. */
export interface DynamicDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's `beginScene`): the TALK of her claim is a one-to-one scene with her. Absent = TALK does nothing. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event' }) => Promise<boolean>;
  /** The scene controller's `stage` (an offer made in her scene is staged, so a swipe rebases on it). Absent = the offer is dispatched directly. */
  stage?: (action: Action) => EngineEvent[];
  /** The commander's line of an offer, said in the open scene (the model answers it) or in her thread. Absent = the offer is only staged. */
  sayInScene?: (text: string) => Promise<boolean>;
  sayInDm?: (unitId: string, text: string) => Promise<void>;
}

export type { WorldDeps };
