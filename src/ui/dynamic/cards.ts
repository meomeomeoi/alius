import type { Registries } from '../../content/types';
import { frameRank } from '../../engine/blocking/state';
import { isLiving } from '../../engine/economy';
import { dynamicOn } from '../../engine/dynamic/gate';
import { exitCostWord, EXIT_MEANS, leashProblem, meansDone, type ExitMeans } from '../../engine/dynamic/exit';
import { dynamicOf } from '../../engine/dynamic/state';
import type { OpenClaim, OpenMilestone, OpenReturn } from '../../engine/dynamic/state';
import type { DynamicDomainEntry, DynamicMilestoneEntry, ExitRoute } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderDisciplineMenu } from '../discipline/menu';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import { plainDraft } from '../../content/draft';
import { practiceOf } from '../../engine/dynamic/profile';
import { voiceLine, type VoiceKind, type VoiceRun } from '../scene/cards/voice';
import { gistOf } from '../scene/cards/gist';
import { herLook, scenePill, sceneCard, type SceneCondition } from '../scene/cards/sceneCard';
import type { CardLook } from '../practice/taskCard';

/** Her static words of card-voice.md §3 (`static.*`), filled with her name; null when the registry has none for this key. */
function staticWords(state: CampaignState, reg: Registries, unitId: string, kind: VoiceKind, key: string, name: string): VoiceRun[] | null {
  const runs = voiceLine(reg, kind, practiceOf(state, reg, unitId)?.style.primary, key, { name });
  return runs.length > 0 ? runs : null;
}

/** The hooks every card of hers carries, the same in both looks. */
function finish(card: HTMLElement, classes: string[], attrs: Record<string, string>, label: string, analyze: string, live: Record<string, unknown>): void {
  card.classList.add(...classes);
  for (const [k, v] of Object.entries(attrs)) card.setAttribute(k, v);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', label);
  for (const [k, v] of Object.entries(analyzeAttrs(analyze, live))) card.setAttribute(k, v);
}

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
export function renderMilestoneCard(host: HTMLElement, ctx: MilestoneCardCtx, opts: CardLook = {}): void {
  const { state, reg, milestone } = ctx;
  const entry = reg.dynamicMilestones.get(milestone.milestoneId) as unknown as DynamicMilestoneEntry | undefined;
  const unit = state.squad.find((u) => u.id === milestone.unitId);
  if (entry === undefined || unit === undefined) return;
  if (opts.look === 'scene') {
    // P10e-e Task 7: her step (or her vow) in the scene's look: her static words (card-voice.md §3), else the milestone's text; accept · refuse
    const live = { unitId: unit.id };
    const pill = (kind: 'accept' | 'refuse'): HTMLElement => scenePill(kind, () => ctx.onAnswer(kind), { 'data-milestone-answer': kind, 'data-milestone': milestone.id, ...analyzeNative('glossary:milestone', live) });
    const text = plainDraft(entry.text).replaceAll('{name}', unit.displayName);
    const card = sceneCard({
      her: herLook(state, reg, unit.id), kind: entry.sworn === true ? 'vow' : 'step', conditions: [], answers: [pill('accept'), pill('refuse')],
      words: staticWords(state, reg, unit.id, `static.milestone.${entry.id}`, milestone.id, unit.displayName) ?? text,
      gist: gistOf({ kind: 'milestone', gist: text.replace(/[.\s]+$/, '') }) ?? '',
    });
    finish(card, ['alius-milestone'], { 'data-milestone': milestone.id }, `${unit.displayName} asks something of the commander`, entry.sworn === true ? 'glossary:vow' : `dynamicMilestones:${entry.id}`, live);
    host.append(card);
    return;
  }
  const button = (kind: 'accept' | 'refuse', text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-milestone-answer': kind, 'data-milestone': milestone.id,
    ...analyzeNative('glossary:milestone', { unitId: unit.id }),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const body = h('div', { class: 'alius-milestone-body' },
    h('p', { class: 'alius-milestone-text' }, plainDraft(entry.text).replaceAll('{name}', unit.displayName)),
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
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (milestoneId: string, answer: 'accept' | 'refuse') => void, opts: CardLook = {},
): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const milestone of state.dynamic?.open.milestones ?? []) {
    if (pick({ unitId: milestone.unitId })) renderMilestoneCard(host, { state, reg, milestone, onAnswer: (a) => onAnswer(milestone.id, a) }, opts);
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
export function renderClaimCard(host: HTMLElement, ctx: ClaimCardCtx, opts: CardLook = {}): void {
  const { state, reg, claim } = ctx;
  const unit = state.squad.find((u) => u.id === claim.unitId);
  const entry = claim.domainId === undefined ? undefined : (reg.dynamicDomains.get(claim.domainId) as unknown as DynamicDomainEntry | undefined);
  if (unit === undefined || (claim.domainId !== undefined && entry === undefined)) return;
  const live = { unitId: unit.id };
  if (opts.look === 'scene') {
    // P10e-e Task 7 (cards.html `bodyOf`, case `claim`): her static words for the domain (or the submit claim), then `You'd give me:` and each grant as `· {grant}`
    const pill = (kind: ClaimAnswer, text: string): HTMLElement => scenePill(text, () => ctx.onAnswer(kind), { 'data-claim-answer': kind, 'data-claim': claim.id, ...analyzeNative('glossary:claim', live) });
    const fallback = plainDraft(entry?.text ?? SUBMIT_WORDS).replaceAll('{name}', unit.displayName);
    const words = staticWords(state, reg, unit.id, entry === undefined ? 'static.claim.submit' : `static.claim.${entry.id}`, claim.id, unit.displayName) ?? fallback;
    const conditions: SceneCondition[] = [];
    const grants = entry?.grants ?? [];
    if (grants.length > 0) {
      conditions.push({ runs: voiceLine(reg, 'grants', practiceOf(state, reg, unit.id)?.style.primary, claim.id, {}), dry: 'What she would hold:', analyze: 'glossary:claim', ctx: live });
      for (const cap of grants) {
        const term = String(reg.glossary.get(`capability_${cap}`)?.term ?? cap);
        conditions.push({ runs: [{ text: '· ' }, { text: term.toLowerCase(), value: true }], dry: term, analyze: `glossary:capability_${cap}`, ctx: live, attrs: { 'data-grants': cap } });
      }
    }
    const card = sceneCard({
      her: herLook(state, reg, unit.id), kind: 'claim', words, conditions, answers: [pill('yield', 'yield'), pill('refuse', 'refuse'), pill('talk', 'talk it over')],
      gist: gistOf({ kind: 'claim', domain: entry === undefined ? 'everything' : String(entry.label).toLowerCase() }) ?? '',
    });
    finish(card, ['alius-claim'], { 'data-claim': claim.id }, `${unit.displayName} asks something of the commander`, entry === undefined ? 'glossary:claim' : `dynamicDomains:${entry.id}`, live);
    host.append(card);
    return;
  }
  const button = (kind: ClaimAnswer, text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-claim-answer': kind, 'data-claim': claim.id,
    ...analyzeNative('glossary:claim', live),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const words = plainDraft(entry?.text ?? SUBMIT_WORDS).replaceAll('{name}', unit.displayName);
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
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (claimId: string, answer: ClaimAnswer) => void, opts: CardLook = {},
): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const claim of state.dynamic?.open.claims ?? []) {
    if (pick({ unitId: claim.unitId })) renderClaimCard(host, { state, reg, claim, onAnswer: (a) => onAnswer(claim.id, a) }, opts);
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
export function renderReturnCard(host: HTMLElement, ctx: ReturnCardCtx, opts: CardLook = {}): void {
  const { state, offer } = ctx;
  const unit = state.squad.find((u) => u.id === offer.unitId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  if (opts.look === 'scene') {
    // P10e-e Task 7: her return in the scene's look: her static words by the terms (card-voice.md §3); accept · refuse
    const reg = ctx.reg;
    const pill = (kind: ReturnAnswer): HTMLElement => scenePill(kind, () => ctx.onAnswer(kind), { 'data-return-answer': kind, 'data-return': offer.id, ...analyzeNative('glossary:aftermath', live) });
    const runs = staticWords(state, reg, unit.id, `static.return.${offer.terms}`, offer.id, unit.displayName);
    const words = runs ?? plainDraft(RETURN_WORDS[offer.terms]).replaceAll('{name}', unit.displayName);
    const card = sceneCard({
      her: herLook(state, reg, unit.id), kind: 'begin again', kindId: 'return', words, conditions: [], answers: [pill('accept'), pill('refuse')],
      gist: gistOf({ kind: 'return', gist: (typeof words === 'string' ? words : words.map((r) => r.text).join('')).replace(/[.\s]+$/, '') }) ?? '',
    });
    finish(card, ['alius-return'], { 'data-return': offer.id }, `${unit.displayName} offers to begin again`, 'glossary:aftermath', live);
    host.append(card);
    return;
  }
  const button = (kind: ReturnAnswer, text: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-return-answer': kind, 'data-return': offer.id,
    ...analyzeNative('glossary:aftermath', live),
    onclick: () => ctx.onAnswer(kind),
  }, text);
  const body = h('div', { class: 'alius-return-body' },
    h('p', { class: 'alius-return-text' }, plainDraft(RETURN_WORDS[offer.terms]).replaceAll('{name}', unit.displayName)),
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
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, onAnswer: (answer: ReturnAnswer) => void, opts: CardLook = {},
): void {
  host.replaceChildren();
  const offer = state.dynamic?.open.returnOffer;
  if (!dynamicOn(state, reg) || offer === undefined || !pick({ unitId: offer.unitId })) return;
  renderReturnCard(host, { state, reg, offer, onAnswer }, opts);
}


// ---------------------------------------------------------------------------------------------
// Leaving: the exit confirm card (R15)

export interface ExitCardCtx {
  state: CampaignState;
  reg: Registries;
  unitId: string;
  /** A route chosen: `transfer` names the holder who takes the commander on, `force` its means. Absent = the button does nothing. */
  onExit?: (route: ExitRoute, opts?: { toUnitId?: string; means?: ExitMeans }) => void;
  /** The means of a forced exit, each through its own path (the squad's vote, the warden's co-sign, the warnings): never run by the card. */
  means?: {
    /** The DISCIPLINE menu's click: a punishment (a vote may come first). */
    punish?: (measure: string, days?: number) => void;
    leash?: () => void;
    request?: () => void;
  };
  onClose?: () => void;
  /** Draw the cost of each route as a word (default); immersive mode draws none. */
  costWords?: boolean;
}

/** The other holders a transfer may go to: named, living, at `play` or beyond. */
export function transferTargets(state: CampaignState, unitId: string): CampaignState['squad'] {
  return state.squad.filter((u) => u.id !== unitId && u.kind === 'named' && isLiving(u) && frameRank(dynamicOf(state, u.id)?.frame ?? 'equal') >= frameRank('play'));
}

const MEANS_LABEL: Readonly<Record<ExitMeans, string>> = { discipline: 'A PUNISHMENT', leash: 'THE LEASH', transfer_request: 'AN OVERSIGHT REQUEST' };
const ROUTE_LABEL: Readonly<Record<ExitRoute, string>> = { abrupt: '[ LEAVE NOW ]', negotiated: '[ TALK IT THROUGH ]', transfer: '[ HAND OVER ]', force: '[ FORCE IT ]' };

/**
 * The exit confirm card (P15, plan R15), in her voice: what leaving costs, as a word for each route (`exitCostWord`, never a number). `abrupt` is the cost as it
 * stands; `negotiated` opens a scene and shows what a compromise would make of it; `transfer` goes to another holder (one button for each); `force` needs a means
 * done on her today (`meansDone`): each means is a row with its own way of doing it (her DISCIPLINE menu, the Leash, the oversight request) and a soft-disabled
 * FORCE until it is done. A negotiation that is open says so. Every part is addressed by the glossary's `dynamic_exit`. Replaces what `host` held.
 */
export function renderExitCard(host: HTMLElement, ctx: ExitCardCtx): void {
  const { state, reg, unitId } = ctx;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined) return;
  const live = { unitId };
  const cost = (word: string): HTMLElement | null => ctx.costWords === false ? null : h('span', { class: 'alius-chip', 'data-cost': '', ...analyzeAttrs('glossary:dynamic_exit', live) }, word);
  const go = (route: ExitRoute, opts: { toUnitId?: string; means?: ExitMeans } | undefined, text: string, soft?: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-option', ...(opts?.means !== undefined ? { 'data-means': opts.means } : {}), ...analyzeNative('glossary:dynamic_exit', live),
    ...(soft !== undefined ? { 'aria-disabled': 'true', title: soft } : {}),
    onclick: () => {
      if (soft === undefined) ctx.onExit?.(route, opts);
    },
  }, text);
  const row = (route: ExitRoute, ...parts: Array<Node | string | null>): HTMLElement => h('div', { class: 'alius-exit-route', 'data-exit-route': route }, ...parts);

  const rows: HTMLElement[] = [
    row('abrupt', go('abrupt', undefined, ROUTE_LABEL.abrupt), ' ', cost(exitCostWord(state, reg, unitId, 'abrupt'))),
    row('negotiated', go('negotiated', undefined, ROUTE_LABEL.negotiated), ' ', cost(exitCostWord(state, reg, unitId, 'negotiated', true)),
      state.dynamic?.open.exits?.some((e) => e.unitId === unitId) === true ? h('span', { class: 'alius-dim', 'data-negotiating': '' }, ' A talk is open: no compromise yet.') : null),
  ];
  for (const to of transferTargets(state, unitId)) {
    const r = row('transfer', go('transfer', { toUnitId: to.id }, `${ROUTE_LABEL.transfer} > ${to.displayName.toUpperCase()}`), ' ', cost(exitCostWord(state, reg, unitId, 'transfer')));
    r.setAttribute('data-to', to.id);
    rows.push(r);
  }

  // the forced route: every means is done through its own path first
  const means = (m: ExitMeans): HTMLElement => {
    const done = meansDone(state, unitId, m);
    const doIt = ctx.means?.[m === 'discipline' ? 'punish' : m === 'leash' ? 'leash' : 'request'];
    const why = m === 'leash' ? leashProblem(state, reg, unitId) : null; // M7: the Leash needs a refusal in her scene and is held for the holder of the block
    return h('div', { class: 'alius-exit-means', 'data-exit-means': m },
      h('span', { class: 'alius-exit-means-label' }, `${MEANS_LABEL[m]}: ${done ? 'done today' : 'not yet'} `),
      done ? null : (m === 'discipline'
        ? renderDisciplineMenu({ state, registries: reg, unitId, onPunish: (measure, days) => ctx.means?.punish?.(measure, days) })
        : h('button', {
          type: 'button', class: 'alius-btn alius-option', 'data-do-means': m, ...analyzeNative('glossary:dynamic_exit', live),
          ...(why !== null ? { 'aria-disabled': 'true', title: why } : {}),
          onclick: () => {
            if (why === null && doIt !== undefined) (doIt as () => void)();
          },
        }, m === 'leash' ? '[ FILE THE LEASH ]' : '[ FILE THE REQUEST ]')),
      !done && why !== null ? h('span', { class: 'alius-dim', 'data-means-why': m }, ` ${why}`) : null,
      ' ', go('force', { means: m }, ROUTE_LABEL.force, done ? undefined : 'Do it first.'));
  };
  const forced = row('force', cost(exitCostWord(state, reg, unitId, 'force')), ...EXIT_MEANS.map(means));
  rows.push(forced);

  const body = h('div', { class: 'alius-exit-body' },
    h('p', { class: 'alius-exit-text' }, plainDraft('AUTHOR TO WRITE: {name} will hear it either way. What it costs depends on what she held.').replaceAll('{name}', unit.displayName)),
    ...rows,
    h('div', { class: 'alius-exit-close' }, h('button', {
      type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'dyn-exit-close', ...analyzeNative('glossary:dynamic_exit', live), onclick: () => ctx.onClose?.(),
    }, '[ CLOSE ]')));
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-exit');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `Ending it with ${unit.displayName}`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:dynamic_exit', live))) card.setAttribute(k, v);
  host.replaceChildren(card);
}
