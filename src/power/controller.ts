import type { Registries } from '../content/types';
import type { Action, EngineEvent } from '../engine/dispatch';
import { leanFor, voteSubjectLabel } from '../engine/power/ballot';
import { liveVote } from '../engine/power/state';
import type { OverruleMeans } from '../engine/power/votes';
import { VALUE_AXES, type CampaignState, type Vote } from '../engine/state/types';
import { effectiveValues } from '../engine/worldOptions/stances';
import { generateBallotFlavor } from '../llm/calls/flavor';
import type { ChallengeStat } from '../engine/power/moves';
import type { PowerDeps, VoteChoice } from './deps';

export type { PowerDeps, VoteChoice } from './deps';

export interface PowerController {
  /** Reads the events of one dispatch: a grudge that starts or ends changes the scene directives. */
  onEvents(events: EngineEvent[]): void;
  /**
   * Runs a decision the squad may vote on. An ungated action runs as it is. When the engine says `vote_needed`, the vote is
   * opened, the VOTE panel shown and the commander's answer carried out: CARRY OUT or an overrule re-dispatches the action with
   * the vote id; ACCEPT drops the vote; closing the panel drops it too. Refusals are toasted.
   */
  requestVote(action: Action): Promise<'ran' | 'dropped' | 'cancelled'>;
  /** Overrules a failed vote. Toasts the reason and returns false when the engine refuses (no authorization left, a measure she cannot be given). */
  overrule(voteId: string, means: OverruleMeans, punish?: { unitId: string; measure: string }): boolean;
  /** Drops an open vote. Toasts the reason and returns false when the engine refuses. */
  drop(voteId: string): boolean;
  /** One reason line per voter: the template of the vote kind, or (setting `ballotWording`, the model answering) the worded line. */
  ballotLines(vote: Vote): Promise<Record<string, string>>;
  /** ENDORSE the squad leader. Toasts and returns false when the engine refuses. */
  endorse(): boolean;
  /**
   * CHALLENGE the squad leader on a stat: the engine rolls and decides, then a scene with her opens (her quarters, origin
   * `event`) with the outcome as the hard directive `power:challenge`. Toasts and returns false when the engine refuses.
   */
  challenge(stat: ChallengeStat): Promise<boolean>;
  /** ACCEPT or OVERRULE the leader's countermand. Toasts and returns false when the engine refuses. */
  answerCountermand(answer: 'accept' | 'overrule'): boolean;
  /** P9e: gives or lifts the standing order "ask me first" for one soldier. Toasts and resolves false when the engine refuses. */
  askFirst(unitId: string, on: boolean): Promise<boolean>;
}

/**
 * The power half of the app (P9b): the VOTE flow between the engine's `vote/*` actions and the panel, the wording of the
 * ballots and the scene directives of a grudge. The engine decides everything that is true; nothing here changes a number.
 */
export function createPower(deps: PowerDeps): PowerController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  const failure = (events: EngineEvent[]): EngineEvent | undefined => events.find((e) => e.type === 'error');

  /** The template line of one ballot: the reason of the term that moved her most, with her name and, for values, the axis that moved her. */
  function templateLine(s: CampaignState, reg: Registries, vote: Vote, unitId: string): string {
    const unit = s.squad.find((u) => u.id === unitId);
    const name = unit?.displayName ?? unitId;
    const ballot = vote.ballots.find((b) => b.unitId === unitId);
    if (!unit || !ballot || ballot.vote === 'abstain') return `${name} has no vote of her own.`;
    const lean = leanFor(s, reg, vote.kind, vote.subject);
    const values = effectiveValues(s, reg, unit);
    const axis = [...VALUE_AXES].sort((a, b) => Math.abs(values[b] * (lean[b] ?? 0)) - Math.abs(values[a] * (lean[a] ?? 0)))[0];
    const reasons = (reg.voteKinds.get(vote.kind) as { reasons?: Record<string, { for: string; against: string }> } | undefined)?.reasons;
    const text = reasons?.[ballot.term]?.[ballot.vote] ?? `${name} voted ${ballot.vote}.`;
    return text.replaceAll('{name}', name).replaceAll('{axis}', axis);
  }

  async function ballotLines(vote: Vote): Promise<Record<string, string>> {
    const s = state();
    const reg = deps.registries();
    if (!s) return {};
    const lines: Record<string, string> = {};
    for (const b of vote.ballots) lines[b.unitId] = templateLine(s, reg, vote, b.unitId);
    if (!deps.settings().ballotWording) return lines;
    const voters = vote.ballots.filter((b) => b.vote !== 'abstain').map((b) => ({ id: b.unitId, name: s.squad.find((u) => u.id === b.unitId)?.displayName ?? b.unitId, vote: b.vote as 'for' | 'against', term: b.term }));
    if (voters.length === 0 || new Set(voters.map((v) => v.name)).size !== voters.length) return lines; // a name the model could not tell apart keeps its template
    try {
      const worded = await generateBallotFlavor({
        kind: 'ballot', voteKind: String(reg.voteKinds.get(vote.kind)?.label ?? vote.kind), subjectLabel: voteSubjectLabel(s, reg, vote.kind, vote.subject),
        ballots: voters.map((v) => ({ name: v.name, vote: v.vote, term: v.term })),
      }, { st: deps.st, settings: deps.settings(), contentLine: deps.contentLine });
      for (const v of voters) if (worded[v.name] !== undefined) lines[v.id] = worded[v.name];
    } catch {
      // a failed call never blocks the vote: the template lines stand
    }
    return lines;
  }

  function send(action: Action, chat: string | undefined): boolean {
    const events = deps.app.dispatch(action, { expectChatId: chat });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    deps.refreshContext();
    return true;
  }

  const overrule: PowerController['overrule'] = (voteId, means, punish) =>
    send({ type: 'vote/overrule', payload: { voteId, means, ...(punish !== undefined ? { punish } : {}) } }, chatId());
  const drop: PowerController['drop'] = (voteId) => send({ type: 'vote/drop', payload: { voteId } }, chatId());

  let voting = false;
  async function requestVote(action: Action): Promise<'ran' | 'dropped' | 'cancelled'> {
    if (voting) {
      deps.toast('info', 'A squad vote is already open: finish it first.');
      return 'cancelled';
    }
    voting = true;
    try {
      return await runVote(action);
    } finally {
      voting = false;
    }
  }

  async function runVote(action: Action): Promise<'ran' | 'dropped' | 'cancelled'> {
    const chat = chatId();
    const first = deps.app.dispatch(action, { expectChatId: chat });
    const needed = first.find((e) => e.type === 'error' && e.code === 'vote_needed');
    if (!needed) {
      const bad = failure(first);
      if (bad) {
        deps.toast('error', String(bad.message ?? bad.code));
        return 'cancelled';
      }
      return 'ran';
    }
    if (!send({ type: 'vote/open', payload: { kind: needed.kind, subject: needed.subject } }, chat)) return 'cancelled';
    const opened = state()?.power?.votes.open;
    if (!opened) return 'cancelled';
    const read = liveVote(state()!) ?? opened;
    const lines = await ballotLines(read);
    if (chatId() !== chat) return 'cancelled'; // the chat changed meanwhile: the open vote stays where it was held and ends with the day
    const answer: VoteChoice = await deps.showVote(read, lines);
    if (chatId() !== chat) return 'cancelled';
    const rerun = (): 'ran' | 'cancelled' => {
      const payload = { ...((action.payload as Record<string, unknown> | undefined) ?? {}), voteId: opened.id };
      return send({ ...action, payload }, chat) ? 'ran' : 'cancelled';
    };
    if (answer.choice === 'carry' && read.status === 'passed') return rerun();
    if (answer.choice === 'overrule') {
      if (overrule(opened.id, answer.means, answer.punish)) return rerun();
      drop(opened.id); // nothing half done is left open
      return 'cancelled';
    }
    drop(opened.id);
    return answer.choice === 'accept' ? 'dropped' : 'cancelled';
  }

  const nameOf = (id: unknown): string => state()?.squad.find((u) => u.id === id)?.displayName ?? String(id);

  function endorse(): boolean {
    const events = deps.app.dispatch({ type: 'power/endorse', payload: {} }, { expectChatId: chatId() });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    const id = events.find((e) => e.type === 'leader_endorsed' && e.unitId !== undefined)?.unitId;
    deps.toast('info', `${nameOf(id)} is now second-in-command.`);
    deps.refreshContext();
    return true;
  }

  /** What the engine decided, told to the main model as a hard fact of her scene. */
  function challengeText(name: string, stat: string, won: boolean): string {
    return won
      ? `${name} has just lost a challenge to the commander (${stat}); she no longer leads the squad for two weeks. The outcome is decided: play the aftermath and do not change it.`
      : `${name} has just beaten a challenge from the commander (${stat}); she keeps the lead of the squad and stands stronger for it. The outcome is decided: play the aftermath and do not change it.`;
  }

  async function challenge(stat: ChallengeStat): Promise<boolean> {
    const chat = chatId();
    const events = deps.app.dispatch({ type: 'power/challenge', payload: { stat } }, { expectChatId: chat });
    const bad = failure(events);
    if (bad) {
      deps.toast('error', String(bad.message ?? bad.code));
      return false;
    }
    const result = events.find((e) => e.type === 'challenge_resolved') as { unitId?: string; won?: boolean } | undefined;
    deps.refreshContext();
    if (!result?.unitId) return true;
    const opened = deps.startScene ? await deps.startScene({ locationId: 'quarters_unit', participants: [result.unitId], origin: 'event' }) : false;
    if (opened && chatId() === chat) {
      deps.context.setDirective({ id: 'power:challenge', expiresAfter: 'scene', text: challengeText(nameOf(result.unitId), stat, result.won === true) });
      deps.refreshContext();
    }
    return true;
  }

  function answerCountermand(answer: 'accept' | 'overrule'): boolean {
    return send({ type: 'power/countermand', payload: { answer } }, chatId());
  }

  /** P9e: after a run, each soldier who took a decision on her own gets one line for her next scene (her last call wins). */
  function herCallDirectives(reportId: unknown): void {
    const report = state()?.lastExpedition;
    if (!report || report.id !== reportId || !report.herCalls) return;
    const last = new Map<string, 'good' | 'bad'>();
    for (const c of report.herCalls) last.set(c.unitId, c.outcome);
    let any = false;
    for (const [unitId, outcome] of last) {
      const unit = state()?.squad.find((u) => u.id === unitId);
      if (!unit) continue;
      deps.context.setDirective({
        id: `power:herCall:${unitId}`, expiresAfter: 'scene',
        text: `${unit.displayName} took the decision herself in the field; it went ${outcome === 'good' ? 'well' : 'badly'}.`,
      });
      any = true;
    }
    if (any) deps.refreshContext();
  }

  async function askFirst(unitId: string, on: boolean): Promise<boolean> {
    return send({ type: 'power/ask_first', payload: { unitId, on } }, chatId());
  }

  return {
    onEvents(events) {
      for (const e of events) if (e.type === 'expedition_ended') herCallDirectives(e.reportId);
      const refresh = ['vote_overruled', 'grudges_ended', 'leader_changed', 'leader_endorsed', 'outside_feat', 'challenge_resolved'];
      if (events.some((e) => refresh.includes(e.type))) deps.refreshContext();
      for (const e of events) {
        if (e.type === 'countermanded') {
          const activity = String(deps.registries().activities.get(String(e.activityId))?.name ?? e.activityId);
          deps.toast('warn', `${nameOf(e.leaderId)} countermands ${activity} with ${nameOf(e.unitId)}: ACCEPT or OVERRULE.`);
        } else if (e.type === 'leader_changed') {
          deps.toast('info', e.to !== undefined ? `${nameOf(e.to)} has become the one the squad looks to.` : `The squad no longer looks to ${nameOf(e.from)}.`);
        } else if (e.type === 'countermand_overruled' && state()?.scene?.participants.includes(String(e.leaderId))) {
          // the commander overruled her in her presence: her next reply shows it
          deps.context.setDirective({
            id: 'power:countermand', expiresAfter: 'next_reply',
            text: `The commander has just overruled ${nameOf(e.leaderId)}'s call in front of her; she reacts in character.`,
          });
          deps.refreshContext();
        }
      }
    },
    endorse,
    challenge,
    answerCountermand,
    askFirst,
    requestVote,
    overrule,
    drop,
    ballotLines,
  };
}
