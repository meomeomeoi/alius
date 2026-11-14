import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the discipline controller needs from the app: the world deps plus the context builder its directives go to. */
export interface DisciplineDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's own start: location picker skipped, her quarters). Resolves whether it opened. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event' }) => Promise<boolean>;
}

export type { WorldDeps };
