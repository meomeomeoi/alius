import type { Action } from '../engine/dispatch';
import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the practice controller needs from the app: the world deps and the context builder its directives are read into. */
export interface PracticeDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Opens a scene (the app's `beginScene`): the TALK of a task is a one-to-one scene with her that costs no slot. Absent = TALK opens nothing. */
  startScene?: (o: { locationId: string; participants: string[]; origin: 'event'; consumesSlot?: boolean }) => Promise<boolean>;
  /** P9b: runs a decision the squad votes on (the app's `power.requestVote`). Without it DO IT on a measure the squad votes on is refused like any other action. */
  requestVote?: (action: Action) => Promise<'ran' | 'dropped' | 'cancelled'>;
  /** P16: opens the expedition setup for a mission or a point of interest with `withoutCommand` (`[ SEND THE SQUAD ]` on a kept alarm). Absent = the button toasts that it cannot be opened. */
  openPlanner?: (target: { missionId: string } | { poi: { regionId: string; poiId: string } }) => void;
}

export type { WorldDeps };
