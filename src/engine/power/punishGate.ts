/**
 * The squad's vote on a punishment (P9b): which measures go to a vote and what the decision is. The one rule behind the gate of `discipline/punish`; a later action that
 * imposes the same measure (P16's `practice/take_instead`) registers a gate on the same decision, so the squad is never skipped. Reads only.
 */
import type { Registries } from '../../content/types';
import { punishmentFor } from '../discipline/perception';
import type { VoteKind } from '../state/types';

/** The weight of the lightest punishment that benches her: a measure at most this heavy goes to a vote, a heavier one does not. Read from the side effects. */
function benchSeverity(reg: Registries): number | null {
  const heavy = [...reg.punishments.values()].filter((p) => (p.sideEffects as Array<{ type: string }> | undefined)?.some((e) => e.type === 'bench'));
  return heavy.length === 0 ? null : Math.min(...heavy.map((p) => Number(p.severity)));
}

/** The vote that imposing `measure` on `unitId` needs (the world's `voting` is checked by the dispatcher), or `null` when the measure is too heavy for the squad to decide or unknown. */
export function punishVoteDecision(reg: Registries, unitId: string, measure: string): { kind: VoteKind; subject: string } | null {
  const pun = punishmentFor(reg, measure);
  const limit = benchSeverity(reg);
  if (!pun || limit === null || Number(pun.severity) > limit) return null;
  return { kind: 'punish', subject: unitId };
}
