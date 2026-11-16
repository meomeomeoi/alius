import type { EngineCtx, EngineEvent } from '../dispatch';
import { overrideHer } from '../personal/obedience';
import { obedienceOf } from '../personal/state';
import { isLiving } from '../economy';
import { addRecord } from '../discipline/record';
import { applyPunishment } from '../discipline/punish';
import { compel } from '../leash/use';
import { missionById } from '../world/missions';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { VALUE_AXES, VOTE_KINDS, type CampaignState, type Unit, type Vote, type VoteKind } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveValues } from '../worldOptions/stances';
import { tallyVote } from './ballot';
import { votingOn } from './options';
import { RATION_MODES } from './state';
import { rationsVotable } from './rations';
import { logVote, powerOf } from './state';

/**
 * The vote flow (P9b §2): the commander picks, the squad votes FOR or AGAINST that pick, and the commander carries it out,
 * drops it (a failed vote accepted: free) or overrules it (the costs below). A vote is spent once. Nothing here draws rng.
 */

export type OverruleMeans = 'order' | 'punish' | 'leash';
const MEANS: readonly OverruleMeans[] = ['order', 'punish', 'leash'];

const isNamedLiving = (state: CampaignState, id: string): boolean => {
  const u = state.squad.find((x) => x.id === id);
  return u !== undefined && u.kind === 'named' && isLiving(u);
};

/** Why this decision cannot go to a vote, or null. Rations and scapegoat subjects are checked by their own actions. */
function subjectProblem(state: CampaignState, ctx: EngineCtx, kind: VoteKind, subject: string): string | null {
  const reg = ctx.registries;
  if (kind === 'mission' && !missionById(state, subject)) return `There is no mission "${subject}" to vote on.`;
  if (kind === 'upgrade' && !reg.facilities.has(subject)) return `There is no facility "${subject}" to vote on.`;
  if (kind === 'punish' && !isNamedLiving(state, subject)) return `There is no soldier "${subject}" to vote on.`;
  if (kind === 'scapegoat') {
    const open = state.dilemmas?.open;
    if (open?.context !== 'scapegoat' || open.status !== 'presented') return 'There is no scapegoat decision waiting.';
    if (!open.options?.some((o) => o.id === subject)) return `There is no answer "${subject}" to vote on.`;
  }
  if (kind === 'rations') {
    if (!RATION_MODES.includes(subject as never)) return `There is no ration mode "${subject}" to vote on.`;
    if (!rationsVotable(state, ctx.registries)) return 'There is no shortage: the rations are set freely.';
  }
  return null;
}

/**
 * "The decision went against her values", read from her own: every axis she holds a view on, pushed the other way. `decision_violated`
 * takes its sign from how her values line up with these axes, so a soldier who voted against and was overruled always pays, in
 * proportion to how strongly she holds her values (up to the full row at a total weight of 3).
 */
export const againstHerValues = (draft: CampaignState, reg: EngineCtx['registries'], unit: Unit): Array<{ axis: (typeof VALUE_AXES)[number]; direction: 1 | -1 }> => {
  const values = effectiveValues(draft, reg, unit);
  return VALUE_AXES.filter((a) => values[a] !== 0).map((axis) => ({ axis, direction: values[axis] > 0 ? -1 : 1 }));
};

/** A vote is usable for the action it was held for: open, passed or overruled, the same kind and subject, today. */
export function voteFor(state: CampaignState, kind: VoteKind, subject: string, voteId: unknown): Vote | null {
  const open = state.power?.votes.open;
  if (!open || typeof voteId !== 'string' || open.id !== voteId) return null;
  if (open.kind !== kind || open.subject !== subject || open.day !== state.day) return null;
  return open.status === 'passed' || open.status === 'overruled' ? open : null;
}

/** Computes every ballot and the tally and stores the result as the open vote; an older open vote is dropped. */
export function openVote(draft: CampaignState, ctx: EngineCtx, kind: VoteKind, subject: string): EngineEvent[] {
  if (!votingOn(draft, ctx.registries)) throw new Error('The squad does not vote in this world.');
  if (!VOTE_KINDS.includes(kind)) throw new Error(`"${String(kind)}" is not something the squad votes on.`);
  if (typeof subject !== 'string' || subject === '') throw new Error('A vote needs a subject.');
  const problem = subjectProblem(draft, ctx, kind, subject);
  if (problem) throw new Error(problem);
  const power = powerOf(draft);
  const events: EngineEvent[] = [];
  const older = power.votes.open;
  if (older) {
    logVote(draft, older, older.status === 'overruled' ? 'overruled' : 'dropped');
    events.push({ type: 'vote_dropped', voteId: older.id, reason: 'replaced' });
  }
  power.votes.seq += 1;
  const tally = tallyVote(draft, ctx.registries, kind, subject);
  const vote: Vote = { id: `v${power.votes.seq}`, kind, subject, day: draft.day, ...tally, status: tally.passed ? 'passed' : 'failed' };
  power.votes.open = vote;
  events.push({ type: 'vote_opened', voteId: vote.id, kind, subject, passed: vote.passed, forWeight: vote.forWeight, againstWeight: vote.againstWeight });
  return events;
}

/** A vote the commander accepts as it stands (passed and not wanted, or failed): costs nothing. */
export function dropVote(draft: CampaignState, voteId: string): EngineEvent[] {
  const open = draft.power?.votes.open;
  if (!open || open.id !== voteId) throw new Error(`There is no open vote "${voteId}".`);
  if (open.status !== 'passed' && open.status !== 'failed') throw new Error('That vote was already overruled: carry it out.');
  logVote(draft, open, 'dropped');
  delete draft.power!.votes.open;
  return [{ type: 'vote_dropped', voteId, reason: 'commander' }];
}

/** The vote's action ran: the vote is spent (logged as carried, or as overruled if it was). */
export function carryVote(draft: CampaignState, voteId: string, ctx?: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const open = draft.power?.votes.open;
  if (!open || open.id !== voteId) throw new Error(`There is no open vote "${voteId}".`);
  logVote(draft, open, open.status === 'overruled' ? 'overruled' : 'carried');
  delete draft.power!.votes.open;
  // P3b: `overruled` tells memory this was an overruled vote's action, not a carry
  const events: EngineEvent[] = [{ type: 'vote_carried', voteId, kind: open.kind, subject: open.subject, ...(open.status === 'overruled' ? { overruled: true } : {}) }];
  // P9c: a day the commander obeys her: carrying a decision she voted against is choosing against her (an overruled vote has its own cost)
  const ob = obedienceOf(draft);
  if (ctx && open.status !== 'overruled' && ob?.who === 'commander' && open.ballots.some((b) => b.unitId === ob.unitId && b.vote === 'against')) {
    events.push(...overrideHer(draft, ctx, ob.unitId, 'carried a decision she voted against on the day of obedience'));
  }
  return events;
}

/**
 * Overrules a failed vote. It always costs: `decision_violated` (moderate, confidence 1) and `+5` Impunity record on every
 * unit that voted against, and a grudge on each until the next day end. The means adds its own usual cost: a punishment
 * of one dissenter, or one Leash authorization on the loudest (the highest `|score| × weight` against). Throws, changing
 * nothing, when a part is refused (no authorization left, a measure she cannot be given).
 */
export function overruleVote(
  draft: CampaignState, ctx: EngineCtx, voteId: string, means: OverruleMeans, punish?: { unitId: string; measure: string },
): EngineEvent[] {
  const reg = ctx.registries;
  const open = draft.power?.votes.open;
  if (!open || open.id !== voteId) throw new Error(`There is no open vote "${voteId}".`);
  if (open.status !== 'failed') throw new Error('Only a vote that failed can be overruled.');
  if (!MEANS.includes(means)) throw new Error('A vote is overruled by an order, a punishment or the Leash.');
  const dissent = open.ballots.filter((b) => b.vote === 'against' && isNamedLiving(draft, b.unitId));
  if (dissent.length === 0) throw new Error('No named soldier voted against this: there is no one to overrule.');
  if (means === 'punish') {
    if (!punish || !dissent.some((b) => b.unitId === punish.unitId)) throw new Error('A punishment must name one of the soldiers who voted against.');
  }
  const V = TUNING.power.vote;
  const events: EngineEvent[] = [];
  const grudges = (powerOf(draft).grudges ??= {});
  for (const b of dissent) {
    const unit = draft.squad.find((u) => u.id === b.unitId)!;
    events.push(...applyEventToUnit(draft, reg, b.unitId, {
      type: 'decision_violated', actor: 'commander', targets: [b.unitId], severity: V.overruleSeverity, evidence: 'overruled a squad vote', confidence: 1,
      valueAxes: againstHerValues(draft, reg, unit),
    }));
    events.push(...addRecord(draft, b.unitId, V.overruleRecord, 'vote_overruled'));
    grudges[b.unitId] = draft.day;
  }
  for (const b of dissent) events.push(...evaluateAutomatic(draft, reg, b.unitId));
  if (means === 'punish') {
    events.push(...applyPunishment(draft, ctx, { unitId: punish!.unitId, measure: punish!.measure, source: 'menu', channel: 'pda' }));
  } else if (means === 'leash') {
    const loudest = [...dissent].sort((a, b) => Math.abs(b.score) * b.weight - Math.abs(a.score) * a.weight)[0];
    events.push(...compel(draft, ctx, { unitId: loudest.unitId, context: 'pda', roll: false }).events);
  }
  open.status = 'overruled';
  events.push({ type: 'vote_overruled', voteId, means, against: dissent.map((b) => b.unitId) });
  return events;
}
