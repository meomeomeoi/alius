import type { ContextBuilder } from '../llm/context';
import type { StartOptions } from '../scene/sceneController';
import type { ModalOpts } from '../ui/shell/modal';
import type { WorldDeps } from '../world/deps';

/** What the onboarding controller needs from the app: the world deps, the context its directives go to, and the scene and modal the app owns. */
export interface OnboardingDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene through the app (screen, loyalty and discipline hooks). Resolves whether it opened. */
  startScene(o: StartOptions): Promise<boolean>;
  /** Ends the open scene the way the player's END does (summary, chronicle). */
  endScene(): Promise<void>;
  /** Raises the open scene's screen (after a reload the card offers RESUME SCENE). */
  resumeScene(): void;
  modal(o: ModalOpts): Promise<string | null>;
}

export type { WorldDeps };
