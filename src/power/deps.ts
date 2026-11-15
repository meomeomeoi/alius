import type { OverruleMeans } from '../engine/power/votes';
import type { Vote } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import type { WorldDeps } from '../world/deps';

/** What the commander answered on the VOTE panel. `accept` is for a failed vote taken as it stands; `cancel` closes the panel. */
export type VoteChoice =
  | { choice: 'carry' }
  | { choice: 'accept' }
  | { choice: 'overrule'; means: OverruleMeans; punish?: { unitId: string; measure: string } }
  | { choice: 'cancel' };

/** What the power controller needs from the app: the world deps, the context builder its directives are read into and the VOTE panel. */
export interface PowerDeps extends WorldDeps {
  context: ContextBuilder;
  /** Pushes the changed directives into the next main-model prompt. */
  refreshContext(): void;
  /** Shows the VOTE panel for an open vote with one reason line per voter; resolves with the commander's answer. */
  showVote(vote: Vote, lines: Record<string, string>): Promise<VoteChoice>;
}

export type { WorldDeps };
