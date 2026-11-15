import { isLiving } from '../economy';
import type { CampaignState, PowerState, RationMode, Vote, VoteLogEntry } from '../state/types';
import { TUNING } from '../tuning';

/**
 * The leaf of the power module: reading and writing `CampaignState.power` with nothing else imported, so the places that
 * must forget a unit or read a grudge (`leash/use`, `loyalty/refusal`) do not pull in the vote flow.
 */

/** The power state, created on the first write (a save without it reads as no votes, no hierarchy, no merit). */
export function powerOf(draft: CampaignState): PowerState {
  return (draft.power ??= { votes: { log: [], seq: 0 } });
}

/** How a shortage is shared out. */
export const RATION_MODES: readonly RationMode[] = ['equal', 'fighters_first', 'commander_short'];

/** The current ration mode (a save that never chose one reads `equal`). */
export const rationsOf = (state: Pick<CampaignState, 'base'>): RationMode =>
  state.base.rations !== undefined && RATION_MODES.includes(state.base.rations) ? state.base.rations : 'equal';

/** Does an overruled vote still hold a grudge against her: she voted against the commander and was overruled, today. */
export function grudgeHolds(state: Pick<CampaignState, 'power'>, unitId: string): boolean {
  return state.power?.grudges?.[unitId] !== undefined;
}

/** Writes a resolved vote into the log (the newest 30 stay). */
export function logVote(draft: CampaignState, vote: Vote, result: VoteLogEntry['result']): void {
  const power = powerOf(draft);
  power.votes.log.push({ id: vote.id, day: vote.day, kind: vote.kind, subject: vote.subject, result, forWeight: vote.forWeight, againstWeight: vote.againstWeight });
  if (power.votes.log.length > TUNING.power.vote.logMax) power.votes.log.splice(0, power.votes.log.length - TUNING.power.vote.logMax);
}

/** The weights and result of a vote from the ballots it still holds (a ballot of a unit that is gone adds nothing). */
function retally(vote: Vote): void {
  const side = (v: 'for' | 'against'): number => vote.ballots.filter((b) => b.vote === v).reduce((sum, b) => sum + b.weight, 0);
  vote.forWeight = vote.commanderWeight + side('for');
  vote.againstWeight = side('against');
  vote.passed = vote.forWeight >= vote.againstWeight;
  if (vote.status === 'passed' || vote.status === 'failed') vote.status = vote.passed ? 'passed' : 'failed';
}

/**
 * The open vote as the panel reads it: ballots of units that are no longer in service dropped and the result worked out
 * again (a copy; the stored vote is not rewritten). An overruled vote keeps its status.
 */
export function liveVote(state: CampaignState): Vote | null {
  const open = state.power?.votes.open;
  if (!open) return null;
  const copy = structuredClone(open);
  copy.ballots = copy.ballots.filter((b) => {
    const u = state.squad.find((x) => x.id === b.unitId);
    return u !== undefined && isLiving(u);
  });
  retally(copy);
  return copy;
}

/** A unit leaves the service: her grudge and her ballot go (the open vote is worked out again without her). */
export function forgetPower(draft: CampaignState, unitId: string): void {
  const power = draft.power;
  if (!power) return;
  if (power.grudges) {
    delete power.grudges[unitId];
    if (Object.keys(power.grudges).length === 0) delete power.grudges;
  }
  const open = power.votes.open;
  if (open && open.ballots.some((b) => b.unitId === unitId)) {
    open.ballots = open.ballots.filter((b) => b.unitId !== unitId);
    retally(open);
  }
}
