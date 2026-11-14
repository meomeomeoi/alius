import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the discipline controller needs from the app: the world deps plus the context builder its directives go to. */
export interface DisciplineDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
}

export type { WorldDeps };
