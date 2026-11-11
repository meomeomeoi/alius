import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

export type { Toast } from '../world/deps';

/** What the loyalty controllers need from the app: the world deps plus the context builder their directives go to. */
export interface LoyaltyDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
}

export type { WorldDeps };
