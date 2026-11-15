import type { VoteKindEntry, VoteLean } from '../../content/schemas';
import type { Registries } from '../../content/types';
import { commandStance, stanceEntry } from '../discipline/stance';
import { isLiving } from '../economy';
import { socialRank } from '../social';
import { BALLOT_TERMS, VALUE_AXES, VOTE_KINDS, type Ballot, type BallotTerm, type CampaignState, type Unit, type ValueAxis, type Vote, type VoteKind } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveValues } from '../worldOptions/stances';
import { missionById } from '../world/missions';
import { leaderVoteWeight } from './leader';
import { assertiveness } from './options';
import { leaderOf } from './state';

/**
 * Ballots and the tally of a squad vote (P9b §2). Everything here is pure and draws no rng: a ballot is a score from the
 * unit's values, her Trust, her command stance, an open demand and what the decision does to her; the tally adds the
 * weights. The commander picks first and always votes FOR; a tie goes to the commander.
 */

export { VOTE_KINDS, type VoteKind };

type Lean = Partial<Record<ValueAxis, number>>;

const kindEntry = (reg: Registries, kind: VoteKind): VoteKindEntry | undefined => reg.voteKinds.get(kind) as unknown as VoteKindEntry | undefined;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** How alike two units are in values, 0 (opposite extremes on every axis) to 1 (equal): `1 − Σ|a − b| / (6 × 6)`. */
export function compatibility(a: Pick<Unit, 'values'>, b: Pick<Unit, 'values'>): number {
  const total = VALUE_AXES.reduce((sum, axis) => sum + Math.abs(a.values[axis] - b.values[axis]), 0);
  return 1 - total / (VALUE_AXES.length * 6);
}

const addLean = (into: Lean, from: VoteLean | undefined, mult = 1): void => {
  if (!from || mult === 0) return;
  for (const axis of VALUE_AXES) {
    const n = from[axis];
    if (typeof n === 'number') into[axis] = (into[axis] ?? 0) + n * mult;
  }
};

/**
 * How a decision leans on the value axes: the kind's base lean, plus the subject's own (a mission template, its danger and
 * whether it is a command order; a facility; a ration mode or a scapegoat option). Each axis is clamped to −2…2 and an axis
 * at 0 is left out.
 */
export function leanFor(state: CampaignState, reg: Registries, kind: VoteKind, subject: string): Lean {
  const entry = kindEntry(reg, kind);
  const sum: Lean = {};
  addLean(sum, entry?.lean);
  if (kind === 'mission') {
    const mission = missionById(state, subject);
    if (mission) {
      addLean(sum, (reg.missionTemplates.get(mission.templateId) as { voteLean?: VoteLean } | undefined)?.voteLean);
      addLean(sum, entry?.features?.danger, (mission.danger - 3) / 2);
      addLean(sum, entry?.features?.command, mission.source === 'command' ? 1 : 0);
    }
  } else if (kind === 'upgrade') {
    addLean(sum, (reg.facilities.get(subject) as { voteLean?: VoteLean } | undefined)?.voteLean);
  } else {
    addLean(sum, entry?.subjects?.[subject]);
  }
  const out: Lean = {};
  for (const axis of VALUE_AXES) {
    const n = clamp(sum[axis] ?? 0, -2, 2);
    if (n !== 0) out[axis] = n;
  }
  return out;
}

/**
 * The unit a vote is about, or null: the target of a punishment; for the scapegoat choice `shift_blame`, the unit of the open
 * scapegoat dilemma (`take_blame` lands on the commander, so it is about nobody).
 */
export function subjectOf(kind: VoteKind, subject: string, state?: CampaignState): string | null {
  if (kind === 'punish') return subject;
  if (kind === 'scapegoat' && subject === 'shift_blame') return state?.dilemmas?.open?.subjectId ?? null;
  return null;
}

/** The commander's weight: `(1 + 0.5 × (Authority rank − 1)) × the squad's commanderVoteMult`. */
export function commanderVoteWeight(state: CampaignState, reg: Registries): number {
  const V = TUNING.power.vote;
  return (V.commanderBase + V.commanderPerRank * (socialRank(state, 'authority') - 1)) * assertiveness(state, reg).commanderVoteMult;
}

/**
 * One unit's ballot. A named unit weighs 1 (the leader: her privileged weight). A grunt follows the leader's vote at 0.5, or
 * abstains (weight 0) when there is no leader.
 */
export function ballotFor(state: CampaignState, reg: Registries, unit: Unit, kind: VoteKind, subject: string): Ballot {
  if (unit.kind !== 'named') {
    const leader = leaderOf(state);
    // she follows a leader who votes (is on the active roster); with no leader, or one in the reserve, she abstains
    if (!leader || !state.roster.activeIds.includes(leader.id)) return { unitId: unit.id, vote: 'abstain', weight: 0, score: 0, term: 'values' };
    const led = ballotFor(state, reg, leader, kind, subject);
    return { unitId: unit.id, vote: led.vote, weight: TUNING.power.vote.gruntWeight, score: led.score, term: led.term };
  }
  const B = TUNING.power.ballot;
  const lean = leanFor(state, reg, kind, subject);
  const values = effectiveValues(state, reg, unit);
  const parts: Record<BallotTerm, number> = {
    values: VALUE_AXES.reduce((sum, axis) => sum + values[axis] * (lean[axis] ?? 0), 0),
    trust: clamp(((state.relations[unit.id]?.trust ?? 50) - 50) / B.trustPer, -B.trustCap, B.trustCap),
    stance: Number((() => { const s = commandStance(state, reg, unit.id); return s === null ? 0 : stanceEntry(reg, s)?.voteBias; })() ?? 0),
    demand: (state.discipline?.demands ?? []).some((d) => d.unitId === unit.id && d.status === 'open') ? B.openDemand : 0,
    affected: 0,
  };
  const about = subjectOf(kind, subject, state);
  if (about === unit.id) parts.affected = B.subject;
  else if (kind === 'punish' && about !== null) {
    const target = state.squad.find((u) => u.id === about);
    if (target) parts.affected = B.compatibility * compatibility(unit, target);
  }
  let term: BallotTerm = 'values';
  for (const t of BALLOT_TERMS) if (Math.abs(parts[t]) > Math.abs(parts[term])) term = t;
  const score = BALLOT_TERMS.reduce((sum, t) => sum + parts[t], 0);
  return { unitId: unit.id, vote: score >= 0 ? 'for' : 'against', weight: leaderOf(state)?.id === unit.id ? leaderVoteWeight(state, reg) : assertiveness(state, reg).soldierVoteMult, score, term };
}

/**
 * Every ballot and the result for one decision: one ballot per living unit of the active roster (injured units included),
 * the commander's FOR weight, the weights by side. It passes when `for ≥ against`: a tie, or no ballots at all, goes to the commander.
 */
export function tallyVote(
  state: CampaignState, reg: Registries, kind: VoteKind, subject: string,
): Pick<Vote, 'ballots' | 'commanderWeight' | 'forWeight' | 'againstWeight' | 'passed'> {
  const ballots = state.roster.activeIds
    .map((id) => state.squad.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && isLiving(u))
    .map((u) => ballotFor(state, reg, u, kind, subject));
  const commanderWeight = commanderVoteWeight(state, reg);
  const side = (v: Ballot['vote']): number => ballots.filter((b) => b.vote === v).reduce((sum, b) => sum + b.weight, 0);
  const forWeight = commanderWeight + side('for');
  const againstWeight = side('against');
  return { ballots, commanderWeight, forWeight, againstWeight, passed: forWeight >= againstWeight };
}

/** What a vote is about, in plain words: a mission's title, a facility's name, a soldier's name, else the subject spelt out. */
export function voteSubjectLabel(state: CampaignState, reg: Registries, kind: VoteKind, subject: string): string {
  if (kind === 'mission') return missionById(state, subject)?.title ?? subject.replace(/_/g, ' ');
  if (kind === 'upgrade') return String(reg.facilities.get(subject)?.name ?? subject.replace(/_/g, ' '));
  if (kind === 'punish') return state.squad.find((u) => u.id === subject)?.displayName ?? subject.replace(/_/g, ' ');
  return subject.replace(/_/g, ' ');
}
