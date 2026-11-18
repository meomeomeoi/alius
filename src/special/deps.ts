import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the special controller needs from the app: the world deps and the context builder its directives are read into. */
export interface SpecialDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** A titled toast in the frequency's voice (the app picks the voice). Without it nothing is toasted. */
  notice?: (kind: 'info' | 'warn', text: string, title: string, source: 'frequency' | 'premonition' | 'handler') => void;
  /** A one-animation cut-in for a major moment (the app draws it). Without it there is none. */
  cutIn?: (text: string) => void;
}

export type { WorldDeps };
