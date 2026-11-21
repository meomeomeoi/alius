import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the dynamic controller needs from the app: the world deps and the context builder its directives are read into. */
export interface DynamicDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's `beginScene`): the TALK of her claim is a one-to-one scene with her. Absent = TALK does nothing. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event' }) => Promise<boolean>;
}

export type { WorldDeps };
