import { rationsOf, rationsVotable, votingOn } from '../../engine/power';
import { liveVote } from '../../engine/power/state';
import type { BallotTerm } from '../../engine/state/types';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of the squad's power structure (P9b). Words first: a ballot says how she voted and what moved her most; the
 * weights and her score only through `Knowledge` (raw values on). Nothing here is stored or invented: it is the open vote
 * as the panel reads it.
 */

/** What moved a ballot most, in words. */
const TERM_WORDS: Record<BallotTerm, string> = {
  values: 'what she values',
  trust: 'how far she trusts the commander',
  stance: "how she stands toward the commander's authority",
  demand: 'a demand of hers that is still open',
  affected: 'what the decision does to her',
};


/** The open vote's tally, or (with `data.unitId`) one soldier's ballot. */
function voteProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const vote = state ? liveVote(state) : null;
  if (!state || !vote) return null;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  if (unitId !== null) {
    const ballot = vote.ballots.find((b) => b.unitId === unitId);
    if (!ballot) return null;
    if (ballot.vote === 'abstain') return { lines: ['She has no vote of her own: she follows no leader.'] };
    const lines = [`Her ballot: ${ballot.vote}.`, `What moved her most: ${TERM_WORDS[ballot.term]}.`];
    const weight = k.raw(ballot.weight);
    const score = k.raw(Math.round(ballot.score * 100) / 100);
    if (weight !== null) lines.push(`Weight: ${weight}.`);
    if (score !== null) lines.push(`Score: ${ballot.score < 0 ? '−' : ''}${Math.abs(Math.round(ballot.score * 100) / 100)} (for at 0 or more).`);
    return { lines };
  }
  const label = String(env.registries.voteKinds.get(vote.kind)?.label ?? vote.kind);
  const lines = [`Open vote: [[voteKinds:${vote.kind}|${label}]].`, `Result: ${vote.passed ? 'passed' : 'failed'}${vote.status === 'overruled' ? ' and overruled' : ''}. A tie goes to the commander.`];
  const forW = k.raw(Math.round(vote.forWeight * 100) / 100);
  const againstW = k.raw(Math.round(vote.againstWeight * 100) / 100);
  if (forW !== null && againstW !== null) lines.push(`Weights: for ${forW}, against ${againstW} (the commander's own: ${k.raw(Math.round(vote.commanderWeight * 100) / 100)}).`);
  return { lines };
}

const RATION_TEXT: Record<string, string> = {
  equal: 'A shortage is shared out evenly.',
  fighters_first: 'Reserve soldiers go without first; the active roster feels a shortage only when the reserve cannot absorb it.',
  commander_short: "The commander goes without first, up to the commander's own share, and sleeps through the next morning.",
};
const MODE_LABEL: Record<string, string> = { equal: 'equal', fighters_first: 'fighters first', commander_short: 'commander short' };

/** The current ration mode (or the one the element stands for) and whether a change goes to a vote now. */
function rationsProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const current = rationsOf(state);
  const asked = typeof subject.data.mode === 'string' && subject.data.mode in RATION_TEXT ? subject.data.mode : current;
  const lines = [`Current mode: ${MODE_LABEL[current]}.`];
  if (asked !== current) lines.push(`${MODE_LABEL[asked][0].toUpperCase()}${MODE_LABEL[asked].slice(1)}: ${RATION_TEXT[asked]}`);
  else lines.push(RATION_TEXT[current]);
  lines.push(votingOn(state, env.registries) && rationsVotable(state, env.registries)
    ? 'A shortage is on or coming: a change goes to a squad vote.'
    : 'A change takes effect at once.');
  return { lines };
}

/** Registers the P9b readings (called from `registerCoreProviders`). */
export function registerPowerProviders(): void {
  registerAnalyzeProvider('glossary:vote', voteProvider);
  registerAnalyzeProvider('glossary:rations', rationsProvider);
}
