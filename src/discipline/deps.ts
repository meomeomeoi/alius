import type { Action } from '../engine/dispatch';
import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the discipline controller needs from the app: the world deps plus the context builder its directives go to. */
export interface DisciplineDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's own start: location picker skipped, her quarters). Resolves whether it opened. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event' }) => Promise<boolean>;
  /** P9b: runs a decision the squad votes on (the app's `power.requestVote`). Without it a gated punishment is refused like any other. */
  requestVote?: (action: Action) => Promise<'ran' | 'dropped' | 'cancelled'>;
}

export type { WorldDeps };
