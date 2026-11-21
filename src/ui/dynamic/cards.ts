import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { OpenClaim, OpenMilestone, OpenReturn } from '../../engine/dynamic/state';
import type { DynamicDomainEntry, DynamicMilestoneEntry } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

export interface MilestoneCardCtx {
  state: CampaignState;
  reg: Registries;
  milestone: OpenMilestone;
  onAnswer: (answer: 'accept' | 'refuse') => void;
}

/**
 * Her milestone as a card in her voice (P15, plan R11): what she asks, in her words (the milestone's text), and `[ ACCEPT ]` / `[ REFUSE ]`.
 * Appends one card to `host`. It shows no number and no frame name, and nothing about what the commander feels: the card says what SHE asks.
 * The card is addressed by its milestone (the vow by the glossary's vow); both buttons are addressed by the glossary's milestone. The same
 * answer can be given in words in the scene or the thread; the card is the other way to give it.
 */
export function renderMilestoneCard(host: HTMLElement, ctx: MilestoneCardCtx): void {
  const { state, reg, milestone } = ctx;
  const entry = reg.dynamicMilestones.get(milestone.milestoneId) as unknown as DynamicMilestoneEntry | undefined;
  const unit = state.squad.find((u) => u.id === milestone.unitId);
  if (entry === undefined || unit === undefined) return;
  const button = (kind: 'accept' | 'refuse', text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-milestone-answer': kind, 'data-milestone': milestone.id,
    ...analyzeNative('glossary:milestone', { unitId: unit.id }),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const body = h('div', { class: 'alius-milestone-body' },
    h('p', { class: 'alius-milestone-text' }, entry.text.replaceAll('{name}', unit.displayName)),
    h('div', { class: 'alius-milestone-answers' }, button('accept', '[ ACCEPT ]'), button('refuse', '[ REFUSE ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-milestone');
  card.setAttribute('data-milestone', milestone.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} asks something of the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs(entry.sworn === true ? 'glossary:vow' : `dynamicMilestones:${entry.id}`, { unitId: unit.id }))) card.setAttribute(k, v);
  host.append(card);
}

/** Draws the open milestones of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held. */
export function drawMilestoneCards(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (milestoneId: string, answer: 'accept' | 'refuse') => void,
): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const milestone of state.dynamic?.open.milestones ?? []) {
    if (pick({ unitId: milestone.unitId })) renderMilestoneCard(host, { state, reg, milestone, onAnswer: (a) => onAnswer(milestone.id, a) });
  }
}


export type ClaimAnswer = 'yield' | 'refuse' | 'talk';

export interface ClaimCardCtx {
  state: CampaignState;
  reg: Registries;
  claim: OpenClaim;
  onAnswer: (answer: ClaimAnswer) => void;
}

/** Her words at the top of the dynamic, when she has asked enough times for the commander to give way (R1's contest; the submit claim has no domain). */
const SUBMIT_WORDS = 'AUTHOR TO WRITE: {name} has asked enough times. She waits for the commander to give way, here and now.';

/**
 * Her claim as a card in her voice (P15, plan R12): the domain she asks for, by its label, with what it would give her in plain words (the
 * glossary's term for each capability, each addressable), and `[ YIELD ]` `[ REFUSE ]` `[ TALK ]`. The submit claim at `rule` is the same card
 * with her words and no domain. It shows no number and no id. TALK opens a one-to-one scene; the card stays until she is answered.
 */
export function renderClaimCard(host: HTMLElement, ctx: ClaimCardCtx): void {
  const { state, reg, claim } = ctx;
  const unit = state.squad.find((u) => u.id === claim.unitId);
  const entry = claim.domainId === undefined ? undefined : (reg.dynamicDomains.get(claim.domainId) as unknown as DynamicDomainEntry | undefined);
  if (unit === undefined || (claim.domainId !== undefined && entry === undefined)) return;
  const live = { unitId: unit.id };
  const button = (kind: ClaimAnswer, text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-claim-answer': kind, 'data-claim': claim.id,
    ...analyzeNative('glossary:claim', live),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const words = (entry?.text ?? SUBMIT_WORDS).replaceAll('{name}', unit.displayName);
  const grants = (entry?.grants ?? []).map((cap) => h('li', { class: 'alius-claim-grant', 'data-grants': cap, ...analyzeAttrs(`glossary:capability_${cap}`, live) }, String(reg.glossary.get(`capability_${cap}`)?.term ?? cap)));
  const body = h('div', { class: 'alius-claim-body' },
    ...(entry === undefined ? [] : [h('p', { class: 'alius-claim-domain' }, h('span', { class: 'alius-chip', ...analyzeAttrs(`dynamicDomains:${entry.id}`, live) }, String(entry.label).toUpperCase()))]),
    h('p', { class: 'alius-claim-text' }, words),
    ...(grants.length > 0 ? [h('ul', { class: 'alius-claim-grants' }, ...grants)] : []),
    h('div', { class: 'alius-claim-answers' }, button('yield', '[ YIELD ]'), button('refuse', '[ REFUSE ]'), button('talk', '[ TALK ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-claim');
  card.setAttribute('data-claim', claim.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} asks something of the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs(entry === undefined ? 'glossary:claim' : `dynamicDomains:${entry.id}`, live))) card.setAttribute(k, v);
  host.append(card);
}

/** Draws the open claims of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held. */
export function drawClaimCards(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (claimId: string, answer: ClaimAnswer) => void,
): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const claim of state.dynamic?.open.claims ?? []) {
    if (pick({ unitId: claim.unitId })) renderClaimCard(host, { state, reg, claim, onAnswer: (a) => onAnswer(claim.id, a) });
  }
}


export type ReturnAnswer = 'accept' | 'refuse';

export interface ReturnCardCtx {
  state: CampaignState;
  reg: Registries;
  offer: OpenReturn;
  onAnswer: (answer: ReturnAnswer) => void;
}

/** Her words on the card, by the terms of the offer (no number, no frame, no pronoun for the commander). */
const RETURN_WORDS: Readonly<Record<OpenReturn['terms'], string>> = {
  lower_band: 'AUTHOR TO WRITE: {name} offers to begin again, from a smaller step than before.',
  after_punishment: 'AUTHOR TO WRITE: {name} offers to begin again, once the commander has paid for what ended it.',
};

/**
 * Her return offer as a card in her voice (P15, plan R15b): what she offers, in her words by the terms, and `[ ACCEPT ]` `[ REFUSE ]`. Appends one
 * card to `host`. It shows nothing of the numbers behind it. Every part is addressed by the glossary's aftermath.
 */
export function renderReturnCard(host: HTMLElement, ctx: ReturnCardCtx): void {
  const { state, offer } = ctx;
  const unit = state.squad.find((u) => u.id === offer.unitId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  const button = (kind: ReturnAnswer, text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-return-answer': kind, 'data-return': offer.id,
    ...analyzeNative('glossary:aftermath', live),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const body = h('div', { class: 'alius-return-body' },
    h('p', { class: 'alius-return-text' }, RETURN_WORDS[offer.terms].replaceAll('{name}', unit.displayName)),
    h('div', { class: 'alius-return-answers' }, button('accept', '[ ACCEPT ]'), button('refuse', '[ REFUSE ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-return');
  card.setAttribute('data-return', offer.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} offers to begin again`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:aftermath', live))) card.setAttribute(k, v);
  host.append(card);
}

/** Draws her return offer when `pick` chooses her (a scene's participants, one thread), replacing what `host` held. */
export function drawReturnCards(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (answer: ReturnAnswer) => void,
): void {
  host.replaceChildren();
  const offer = state.dynamic?.open.returnOffer;
  if (!dynamicOn(state, reg) || offer === undefined || !pick({ unitId: offer.unitId })) return;
  renderReturnCard(host, { state, reg, offer, onAnswer });
}
