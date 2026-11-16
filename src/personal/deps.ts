import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the commander is asked when a soldier edits something before it goes out. */
export interface EditPrompt {
  editorName: string;
  channel: 'leash' | 'recruit';
  /** One plain sentence saying what she did. */
  text: string;
}

/** What the personal controller needs from the app: the world deps, the context builder its directives are read into and the questions it asks. */
export interface PersonalDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's own start). Resolves whether it opened. Without it a booking opens no scene. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event' }) => Promise<boolean>;
  /** Asks KEEP or REVERT about an edited request (a Leash request or a recruit order). Without it a request is never intercepted. */
  confirmEdit?: (p: EditPrompt) => Promise<'keep' | 'revert'>;
  /** A soldier claimed the commander in public: shows the claim card. Without it the claim is only announced in a toast. */
  onClaim?: (unitId: string) => void;
}

export type { WorldDeps };
