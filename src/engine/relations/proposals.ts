import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { nextId } from '../memory';
import type { Rng } from '../rng';
import type { CampaignState, PendingProposal } from '../state/types';
import { TUNING } from '../tuning';
import { applyEventToUnit } from './effects';
import { intimacyOf } from './gain';
import { enterState, evaluateAutomatic, pushHistory, stateForProposal, type ProposalFailure } from './graph';
import type { EventIntent } from './intents';
import { ROMANTIC_PROPOSALS } from './vocab';

export type ProposalAnswer = 'accept' | 'accept_secret' | 'decline' | 'not_now';
export const PROPOSAL_ANSWERS: readonly ProposalAnswer[] = ['accept', 'accept_secret', 'decline', 'not_now'];

type Channel = PendingProposal['channel'];
const proposals = (draft: CampaignState): PendingProposal[] => (draft.proposals ??= []);

/** Units in a romantic state (other than `unrequited`, which is one-sided) that are still in the squad. */
export function romanticPartners(state: CampaignState, reg: Registries, exceptId: string): string[] {
  return state.squad
    .filter((u) => u.id !== exceptId && u.kind === 'named' && isLiving(u))
    .filter((u) => {
      const st = state.relations[u.id]?.stateId;
      return st !== undefined && st !== 'unrequited' && reg.relationshipStates.get(st)?.romance === true;
    })
    .map((u) => u.id);
}

const commanderEvent = (type: 'broke_promise' | 'sided_against' | 'rejected_advance' | 'dismissed', unitId: string, severity: EventIntent['severity'], evidence: string): EventIntent => ({
  type, actor: 'commander', targets: [unitId], severity, evidence, confidence: 1,
});

/** Partners who learn of a second romance react at once: a lover/devoted feels betrayed, anyone else feels sidelined. */
export function partnersReact(draft: CampaignState, reg: Registries, partnerIds: string[], why: string): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const id of partnerIds) {
    const st = draft.relations[id]?.stateId;
    if (st === undefined) continue;
    const type = st === 'lover' || st === 'devoted' ? 'broke_promise' : 'sided_against';
    events.push(...applyEventToUnit(draft, reg, id, commanderEvent(type, id, 'extreme', why)));
    events.push(...evaluateAutomatic(draft, reg, id));
  }
  return events;
}

function openFor(draft: CampaignState, unitId: string): PendingProposal | undefined {
  return proposals(draft).find((p) => p.unitId === unitId);
}

function pending(
  draft: CampaignState, reg: Registries, p: { unitId: string; kind: string; channel: Channel; from: PendingProposal['from']; targetState: string },
): PendingProposal {
  // a secret-affair proposal is hidden by definition: there is nothing to disclose
  const romantic = reg.relationshipStates.get(p.targetState)?.romance === true;
  const needsDisclosure = p.kind !== 'secret_affair' && romantic && romanticPartners(draft, reg, p.unitId).length > 0;
  const rec: PendingProposal = { id: nextId(draft, 'q'), day: draft.day, needsDisclosure, ...p };
  proposals(draft).push(rec);
  return rec;
}

const offered = (rec: PendingProposal): EngineEvent => ({
  type: 'proposal_offered', proposalId: rec.id, unitId: rec.unitId, kind: rec.kind, needsDisclosure: rec.needsDisclosure, from: rec.from,
});

/** A unit proposes something to the commander. Dropped silently when her own entry conditions do not hold. */
export function offerProposal(draft: CampaignState, reg: Registries, p: { unitId: string; kind: string; channel: Channel }): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === p.unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit) || openFor(draft, p.unitId)) return [];
  const check = stateForProposal(draft, reg, p.unitId, p.kind);
  if (!('stateId' in check)) return [];
  const rec = pending(draft, reg, { ...p, from: 'unit', targetState: check.stateId });
  return [offered(rec)];
}

/** Enters the state a proposal leads to (and its side effects). Hidden: through `secret_affair`. */
function conclude(
  draft: CampaignState, reg: Registries, unitId: string, kind: string, target: string, secret: boolean,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const rel = draft.relations[unitId];
  const romantic = reg.relationshipStates.get(target)?.romance === true;
  const partners = romantic ? romanticPartners(draft, reg, unitId) : [];
  if (secret) {
    const as = target === 'secret_affair' ? 'flirting' : target;
    if (rel.stateId !== 'secret_affair') events.push(enterState(draft, unitId, 'secret_affair', `proposal:${kind}`));
    rel.affair = { as, hiddenFrom: partners, since: draft.day };
  } else {
    if (rel.stateId !== target) events.push(enterState(draft, unitId, target, `proposal:${kind}`));
  }
  if (kind === 'confide' && !rel.flags.includes('shared_secret')) rel.flags.push('shared_secret');
  pushHistory(draft, unitId, { day: draft.day, kind: 'proposal', type: kind, detail: secret ? 'secret' : 'accepted' });
  if (!secret && partners.length > 0) events.push(...partnersReact(draft, reg, partners, 'a second romance became known'));
  events.push(...evaluateAutomatic(draft, reg, unitId));
  return events;
}

/**
 * The commander proposes something. The engine decides her answer: receptive (the state is entered, or — with a
 * second romance in play — waits for [OPENLY]/[SECRETLY]) or a reason band. The scene narrates the result.
 */
export function commanderProposal(draft: CampaignState, reg: Registries, p: { unitId: string; kind: string; channel: Channel }): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === p.unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error(`proposal: unit "${p.unitId}" cannot be proposed to`);
  if (openFor(draft, p.unitId)) throw new Error('proposal: she already has an open proposal');
  const check = stateForProposal(draft, reg, p.unitId, p.kind);
  if ('fail' in check) {
    return [{ type: 'proposal_resolved', unitId: p.unitId, kind: p.kind, receptive: false, reason: check.fail }];
  }
  if (p.kind === 'secret_affair') {
    return [{ type: 'proposal_resolved', unitId: p.unitId, kind: p.kind, receptive: true }, ...conclude(draft, reg, p.unitId, p.kind, check.stateId, true)];
  }
  const rec = pending(draft, reg, { ...p, from: 'commander', targetState: check.stateId });
  if (rec.needsDisclosure) {
    return [{ type: 'proposal_resolved', unitId: p.unitId, kind: p.kind, receptive: true, pending: true }, offered(rec)];
  }
  proposals(draft).pop();
  return [{ type: 'proposal_resolved', unitId: p.unitId, kind: p.kind, receptive: true }, ...conclude(draft, reg, p.unitId, p.kind, check.stateId, false)];
}

/** The commander's answer to an open proposal (or, for a second romance, his choice of OPENLY / SECRETLY). */
export function answerProposal(
  draft: CampaignState, reg: Registries, a: { proposalId: string; answer: ProposalAnswer },
): EngineEvent[] {
  const list = proposals(draft);
  const idx = list.findIndex((x) => x.id === a.proposalId);
  if (idx < 0) throw new Error(`proposal: no open proposal "${a.proposalId}"`);
  if (!PROPOSAL_ANSWERS.includes(a.answer)) throw new Error(`proposal: unknown answer "${String(a.answer)}"`);
  const rec = list[idx];
  if (rec.needsDisclosure && a.answer === 'decline') throw new Error('proposal: a second romance is answered OPENLY, SECRETLY or NOT NOW');
  if (a.answer === 'decline' && rec.from === 'commander') throw new Error('proposal: only her proposals can be declined');
  if (a.answer === 'accept_secret' && !rec.needsDisclosure) throw new Error('proposal: only a second romance can be accepted secretly');
  list.splice(idx, 1);
  const base = { proposalId: rec.id, unitId: rec.unitId, kind: rec.kind, answer: a.answer };

  if (a.answer === 'not_now') return [{ type: 'proposal_answered', ...base }];

  if (a.answer === 'decline') {
    const romantic = (ROMANTIC_PROPOSALS as readonly string[]).includes(rec.kind);
    const hurt = commanderEvent(romantic ? 'rejected_advance' : 'dismissed', rec.unitId, 'moderate', 'declined her proposal');
    return [{ type: 'proposal_answered', ...base }, ...applyEventToUnit(draft, reg, rec.unitId, hurt), ...evaluateAutomatic(draft, reg, rec.unitId)];
  }

  // accept / accept_secret: conditions may have changed since the offer
  const check = stateForProposal(draft, reg, rec.unitId, rec.kind);
  if ('fail' in check) {
    return [{ type: 'proposal_answered', ...base }, { type: 'proposal_resolved', unitId: rec.unitId, kind: rec.kind, receptive: false, reason: check.fail as ProposalFailure }];
  }
  // someone may have become a partner since the offer: the commander must then choose OPENLY or SECRETLY first
  if (a.answer === 'accept' && !rec.needsDisclosure && rec.kind !== 'secret_affair'
    && reg.relationshipStates.get(check.stateId)?.romance === true && romanticPartners(draft, reg, rec.unitId).length > 0) {
    rec.needsDisclosure = true;
    list.push(rec);
    return [offered(rec)];
  }
  return [
    { type: 'proposal_answered', ...base },
    ...conclude(draft, reg, rec.unitId, rec.kind, check.stateId, a.answer === 'accept_secret' || rec.kind === 'secret_affair'),
  ];
}

/** A romantic state may only be entered while romance is on. */
const romanceAllowed = (reg: Registries, state: CampaignState, stateId: string): boolean =>
  reg.relationshipStates.get(stateId)?.romance !== true || intimacyOf(state).romance;

/** Has a hidden partner already heard about this affair? (a public fact, or one that partner knows, tagged `affair`) */
function affairKnown(draft: CampaignState, unitId: string, hiddenFrom: string[]): boolean {
  return draft.memory.facts.some(
    (f) => f.tags.includes('affair') && f.about.includes(unitId) && (f.knownBy.includes('*') || hiddenFrom.some((h) => f.knownBy.includes(h))),
  );
}

/**
 * Rolls for the discovery of every concealed romance (called at each scene end and DM exchange). A unit takes part when
 * she is present — or when a hidden partner already knows. On discovery she becomes what she really is, and the hidden
 * partners react as to an open second romance.
 */
export function rollDiscovery(draft: CampaignState, reg: Registries, rng: Rng, presentIds: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  const T = TUNING.relations.affair;
  for (const unit of draft.squad) {
    const affair = draft.relations[unit.id]?.affair;
    if (!affair || !isLiving(unit)) continue;
    const hidden = affair.hiddenFrom.filter((id) => {
      const u = draft.squad.find((x) => x.id === id);
      return u && isLiving(u) && reg.relationshipStates.get(draft.relations[id]?.stateId)?.romance === true;
    });
    if (hidden.length === 0) {
      // everyone it was hidden from has left romance: nothing to conceal any more
      const rel = draft.relations[unit.id];
      delete rel.affair;
      if (rel.stateId !== affair.as && romanceAllowed(reg, draft, affair.as)) events.push(enterState(draft, unit.id, affair.as, 'affair_ended'));
      events.push({ type: 'affair_ended', unitId: unit.id });
      continue;
    }
    const certain = affairKnown(draft, unit.id, hidden);
    const present = presentIds.includes(unit.id);
    if (!certain && !present) continue;
    const p = T.base + T.perOther * Math.max(0, presentIds.length - 1) + (hidden.some((h) => presentIds.includes(h)) ? T.partnerPresent : 0);
    const roll = rng.chance(p);
    if (!certain && !roll) continue;
    const rel = draft.relations[unit.id];
    const as = affair.as;
    delete rel.affair;
    // with romance off no romantic transition fires: she stays as she is, the secret is simply out
    if (rel.stateId !== as && romanceAllowed(reg, draft, as)) events.push(enterState(draft, unit.id, as, 'affair_discovered'));
    events.push({ type: 'affair_discovered', unitId: unit.id, by: hidden });
    events.push(...partnersReact(draft, reg, hidden, 'discovered a secret romance'));
    events.push(...evaluateAutomatic(draft, reg, unit.id));
  }
  return events;
}

