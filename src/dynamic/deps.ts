import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the dynamic controller needs from the app: the world deps and the context builder its directives are read into. */
export interface DynamicDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
}

export type { WorldDeps };
