import { runActivity } from '../activities';
import { registerDayEndStep } from '../calendar';
import { addRecord } from '../discipline/record';
import { countermandOpen } from '../power/leader';
import { challenge, endorse } from '../power/moves';
import { TUNING } from '../tuning';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { punishmentFor } from '../discipline/perception';
import { registerAction, registerVoteGate } from '../dispatch';
import { rationsVotable, RATION_MODES, setRations } from '../power/rations';
import { dropVote, openVote, overruleVote, type OverruleMeans } from '../power/votes';
import { powerDayStep } from '../power/dayStep';
import { VOTE_KINDS, type VoteKind } from '../state/types';

// Importing this module registers the P9b actions (votes, and the later rations and leader moves), the vote gates and the
// power day step. `src/app.ts` imports it next to `actions/bonds`.

registerDayEndStep('director_tick', powerDayStep);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------
// Votes

/** Computes every ballot and the tally for a decision the commander picked. Draws no rng. */
registerAction('vote/open', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.kind !== 'string' || typeof payload.subject !== 'string') throw new Error('vote/open needs { kind, subject }');
  return openVote(draft, ctx, payload.kind as VoteKind, payload.subject);
});

/** A failed vote the commander accepts, or a passed one not carried out: costs nothing. */
registerAction('vote/drop', (draft, payload) => {
  if (!isObj(payload) || typeof payload.voteId !== 'string') throw new Error('vote/drop needs { voteId }');
  return dropVote(draft, payload.voteId);
});

/** Overrules a failed vote by an order, a punishment of one dissenter or the Leash. Always pays the spec's costs. */
registerAction('vote/overrule', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.voteId !== 'string' || typeof payload.means !== 'string') throw new Error('vote/overrule needs { voteId, means }');
  let punish: { unitId: string; measure: string } | undefined;
  if (payload.punish !== undefined) {
    if (!isObj(payload.punish) || typeof payload.punish.unitId !== 'string' || typeof payload.punish.measure !== 'string') throw new Error('vote/overrule: punish needs { unitId, measure }');
    punish = { unitId: payload.punish.unitId, measure: payload.punish.measure };
  }
  return overruleVote(draft, ctx, payload.voteId, payload.means as OverruleMeans, punish);
});

// ---------------------------------------------------------------------------------------------
// Gates: the decisions the squad votes on (while the world's `voting` is on)

/** A run from the board needs a vote; a point-of-interest run and the tutorial run do not. */
registerVoteGate('expedition/start', (state, payload, reg) => {
  if (!isObj(payload) || typeof payload.missionId !== 'string' || isObj(payload.poi)) return null;
  const mission = state.missions.offered.find((m) => m.id === payload.missionId); // on the board
  if (!mission || reg.missionTemplates.get(mission.templateId)?.tutorial === true) return null;
  return { kind: 'mission', subject: mission.id };
});

registerVoteGate('base/upgrade', (_state, payload) => (isObj(payload) && typeof payload.facilityId === 'string' ? { kind: 'upgrade', subject: payload.facilityId } : null));

/** The weight of the lightest punishment that benches her: a measure at most this heavy goes to a vote, a heavier one does not. Read from the side effects. */
function benchSeverity(reg: Parameters<typeof punishmentFor>[0]): number | null {
  const heavy = [...reg.punishments.values()].filter((p) => (p.sideEffects as Array<{ type: string }> | undefined)?.some((e) => e.type === 'bench'));
  return heavy.length === 0 ? null : Math.min(...heavy.map((p) => Number(p.severity)));
}

registerVoteGate('discipline/punish', (_state, payload, reg) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || typeof payload.measure !== 'string') return null;
  const pun = punishmentFor(reg, payload.measure);
  const limit = benchSeverity(reg);
  if (!pun || limit === null || Number(pun.severity) > limit) return null;
  return { kind: 'punish', subject: payload.unitId };
});

/** Rations are voted on only while a shortage is on or coming; an unknown mode is left to the action to refuse. */
registerVoteGate('rations/set', (state, payload, reg) => {
  if (!isObj(payload) || typeof payload.mode !== 'string' || !RATION_MODES.includes(payload.mode as never)) return null;
  return rationsVotable(state, reg) ? { kind: 'rations', subject: payload.mode } : null;
});

// ---------------------------------------------------------------------------------------------
// Rations

/** The BASE tab's RATIONS row. Draws no rng. */
registerAction('rations/set', (draft, payload) => {
  if (!isObj(payload)) throw new Error('rations/set needs { mode }');
  return setRations(draft, payload.mode);
});

// ---------------------------------------------------------------------------------------------
// The leader's moves

/** ACCEPT drops a countermand; OVERRULE runs the activity once (not rolled again) and costs the leader Trust and the commander Impunity with her. */
registerAction('power/countermand', (draft, payload, ctx) => {
  if (!isObj(payload) || (payload.answer !== 'accept' && payload.answer !== 'overrule')) throw new Error('power/countermand needs { answer: "accept" | "overrule" }');
  const open = countermandOpen(draft);
  if (!open) {
    if (draft.power) delete draft.power.countermand;
    throw new Error('There is no countermand to answer.');
  }
  delete draft.power!.countermand;
  if (payload.answer === 'accept') return [{ type: 'countermand_accepted', leaderId: open.leaderId, unitId: open.unitId }];
  const events = runActivity(draft, ctx, { ...(open.payload as object), countermandChecked: true });
  events.push(...applyEventToUnit(draft, ctx.registries, open.leaderId, {
    type: 'leader_overruled', actor: 'commander', targets: [open.leaderId], severity: 'moderate', evidence: "overruled the squad leader's call", confidence: 1,
  }));
  events.push(...addRecord(draft, open.leaderId, TUNING.power.countermand.overruleRecord, 'leader_overruled'));
  events.push(...evaluateAutomatic(draft, ctx.registries, open.leaderId));
  events.push({ type: 'countermand_overruled', leaderId: open.leaderId, unitId: open.unitId });
  return events;
});

/** ENDORSE the squad leader (second-in-command). Draws no rng. */
registerAction('power/endorse', (draft, _payload, ctx) => endorse(draft, ctx));

/** CHALLENGE the squad leader on a social or body stat: one seeded roll. */
registerAction('power/challenge', (draft, payload, ctx) => challenge(draft, ctx, isObj(payload) ? payload.stat : undefined));

export const GATED_KINDS: readonly VoteKind[] = VOTE_KINDS;
