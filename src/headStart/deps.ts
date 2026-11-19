import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the head start controller needs from the app: the world deps and the context builder its opening directive is read into. */
export interface HeadStartDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
}

export type { WorldDeps };
