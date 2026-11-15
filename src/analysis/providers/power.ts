import { challengeChance, challengeCooldown, countermandOpen, meritOf, outsideActive, outsideSuppressedFor, rationsOf, rationsVotable, respectOf, standingOf, votingOn, CHALLENGE_STATS, type ChallengeStat } from '../../engine/power';
import { leaderOf, liveVote } from '../../engine/power/state';
import type { BallotTerm } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
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

const band = (n: number): string => (n < 40 ? 'low' : n < 70 ? 'notable' : 'dominant');
const nameOf = (state: NonNullable<AnalyzeEnv['state']>, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** Her standing as a band word, where it comes from and whether she leads; the number and its parts only with raw values on. */
function standingProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const n = state && unitId !== null ? standingOf(state, env.registries, unitId) : null;
  if (!state || unitId === null || n === null) return null;
  const leader = leaderOf(state);
  const lines = [`Her standing: ${band(n)}.`];
  if (leader?.id === unitId) lines.push('She is the squad leader.');
  else if (leader) lines.push(`The squad leader is ${nameOf(state, leader.id)}.`);
  lines.push('It rests on her fights of the last two weeks, how well the others get on with her and how safe she feels defying the commander, times how hard her card says she pushes for power.');
  const raw = k.raw(n);
  if (raw !== null) {
    lines.push(`Standing: ${raw} (merit ${Math.round(meritOf(state, unitId) * 100)} %, respect ${Math.round(respectOf(state, unitId) * 100)} %; a leader needs a lead of ${TUNING.power.standing.margin}).`);
  }
  return { lines };
}

/** Who leads, what the leader may do and what keeps someone from leading. */
function leaderProvider(_subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const leader = leaderOf(state);
  const h = state.power?.hierarchy;
  const lines: string[] = [];
  if (leader) {
    lines.push(`Squad leader: ${leader.displayName}${h?.endorsed ? ' (second-in-command)' : ''}.`);
    lines.push('Her vote weighs more, the grunts follow it, her defiance rubs off on the others more and she may countermand a minor order.');
  } else {
    lines.push('No one leads the squad: nobody is far enough ahead, or the one who is does not push for power.');
  }
  if (h?.deposed && h.deposed.untilDay > state.day) {
    const days = k.raw(h.deposed.untilDay - state.day);
    lines.push(`${nameOf(state, h.deposed.unitId)} lost a challenge and cannot lead for a while${days !== null ? ` (${days} more days)` : ''}.`);
  }
  const left = challengeCooldown(state);
  if (left > 0) {
    const days = k.raw(left);
    lines.push(`The next challenge has to wait${days !== null ? ` ${days} more days` : ' a while'}.`);
  }
  return { lines };
}

/** Whether outsiders address the leader, and what holds it back. */
function outsideProvider(_subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const leader = leaderOf(state);
  if (!leader) return { lines: ['There is no squad leader: outsiders address no one in the commander\'s place.'] };
  if (state.power?.hierarchy?.endorsed) return { lines: [`Oversight treats ${leader.displayName} as the commander's second-in-command; outsiders address both. It is never held back.`] };
  if (outsideActive(state)) return { lines: [`Outsiders address ${leader.displayName} as the one who really runs the unit.`, 'A visible feat holds that back for a while.'] };
  const days = k.raw(outsideSuppressedFor(state));
  return { lines: [`A feat of the commander holds it back: outsiders address the commander again${days !== null ? ` for ${days} days` : ' for a while'}.`] };
}

/** The odds of a challenge on one stat in words; the percentage only with raw values on. */
function challengeProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  if (!leaderOf(state)) return { lines: ['There is no squad leader to challenge.'] };
  const stats = typeof subject.data.stat === 'string' && (CHALLENGE_STATS as readonly string[]).includes(subject.data.stat) ? [subject.data.stat as ChallengeStat] : [...CHALLENGE_STATS];
  const word = (p: number): string => (p < 0.35 ? 'unlikely' : p < 0.65 ? 'even' : 'likely');
  return {
    lines: stats.map((stat) => {
      const p = challengeChance(state, env.registries, stat);
      const raw = k.raw(Math.round(p * 100));
      return `With ${stat}: ${word(p)}${raw !== null ? ` (${raw} %)` : ''}.`;
    }),
  };
}

/** A countermand waiting for the commander's answer. */
function countermandProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const c = state ? countermandOpen(state) : null;
  if (!state || !c) return null;
  const activityId = (c.payload as { activityId?: unknown } | null)?.activityId;
  const activity = typeof activityId === 'string' ? String(env.registries.activities.get(activityId)?.name ?? activityId) : 'an order';
  return { lines: [`${nameOf(state, c.leaderId)} countermanded ${activity} with ${nameOf(state, c.unitId)}; it waits for your answer.`] };
}

/** The open scapegoat case: who answers for the decision and who backed it. */
function scapegoatProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const open = state?.dilemmas?.open;
  if (!state || !open || open.context !== 'scapegoat' || open.subjectId === undefined) return null;
  const witnesses = (open.witnessIds ?? []).map((id) => nameOf(state, id));
  const herCall = open.scapegoatSource === 'her_call'; // P9e: a decision she took herself, not a squad vote
  return {
    lines: [
      herCall ? `${nameOf(state, open.subjectId)} made the call herself in the field, and the run failed.` : `${nameOf(state, open.subjectId)} carried the squad's vote for the decision that failed.`,
      witnesses.length > 0 ? `${herCall ? 'Also there' : 'Also for it'}: ${witnesses.join(', ')}.` : herCall ? 'Nobody else was named.' : 'Nobody else voted for it.',
      'Take the blame and oversight punishes the commander; shift it and oversight punishes her.',
    ],
  };
}

/** A decision a soldier took on her own at an event (P9e): the logged call (this run's, else the last report's), the mark and, with raw values on, the stored odds. */
function herCallProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const nodeId = typeof subject.data.nodeId === 'string' ? subject.data.nodeId : null;
  const entries = [...(state.lastExpedition?.herCalls ?? []), ...(state.expedition?.herCalls ?? [])]
    .filter((c) => (unitId === null || c.unitId === unitId) && (nodeId === null || c.nodeId === nodeId));
  const call = entries.at(-1);
  if (!call) return null;
  const name = nameOf(state, call.unitId);
  const lines = [`${name} took the decision herself in the field; it went ${call.outcome === 'good' ? 'well' : 'badly'}.`];
  const missionId = typeof subject.data.missionId === 'string' ? subject.data.missionId : state.expedition?.missionId ?? state.lastExpedition?.missionId;
  const mission = [...state.missions.active, ...state.missions.offered, ...state.missions.completed].find((m) => m.id === missionId);
  if (call.outcome === 'good') lines.push('It is hers: merit and boldness for her. It blames nobody.');
  else if (mission?.decidedBy?.source === 'her_call' && mission.decidedBy.unitId === call.unitId) {
    lines.push('The run is marked on her call: if it fails, oversight will want a name, and the commander answers for it or shifts it onto her.');
  } else lines.push('It cost the run but left no mark: nobody answers for it if the run fails.');
  const odds = k.raw(Math.round(call.odds * 100));
  if (odds !== null) lines.push(`Odds it would go well: ${odds}%.`);
  return { lines };
}

/** The standing order "ask me first" for one soldier: whether it holds, since when, and what it costs. */
function askFirstProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  if (!state || unitId === null || !state.squad.some((u) => u.id === unitId)) return null;
  const name = nameOf(state, unitId);
  const since = state.power?.askFirst?.[unitId];
  return {
    lines: [
      since !== undefined
        ? `${name} is under the order to ask first, since day ${since}: she takes no decision of her own in the field.`
        : `${name} is not under the order: she may take a decision of her own in the field.`,
      `Giving the order costs her Trust, like a decision that went against her values (${TUNING.herCall.askFirst.severity}); lifting it is free.`,
    ],
  };
}

/** Registers the P9b readings (called from `registerCoreProviders`). */
export function registerPowerProviders(): void {
  registerAnalyzeProvider('glossary:vote', voteProvider);
  registerAnalyzeProvider('glossary:rations', rationsProvider);
  registerAnalyzeProvider('glossary:standing', standingProvider);
  registerAnalyzeProvider('glossary:squad_leader', leaderProvider);
  registerAnalyzeProvider('glossary:outside_perception', outsideProvider);
  registerAnalyzeProvider('glossary:challenge', challengeProvider);
  registerAnalyzeProvider('glossary:countermand', countermandProvider);
  registerAnalyzeProvider('glossary:scapegoat', scapegoatProvider);
  registerAnalyzeProvider('glossary:her_call', herCallProvider);
  registerAnalyzeProvider('glossary:ask_first', askFirstProvider);
}
