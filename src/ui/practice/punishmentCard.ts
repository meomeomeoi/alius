import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import { canUndoPractice } from '../../engine/practice/punish';
import { severityWord, type OpenPunishment } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import type { GenerationUi } from '../generation/surface';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import { drawPracticeReroll } from './generation';

export type PunishmentAnswer = 'accept' | 'negotiate' | 'refuse';
export type TakeInsteadAnswer = 'do_it' | 'take_it' | 'refuse';

export interface PunishmentCardCtx {
  state: CampaignState;
  reg: Registries;
  punishment: OpenPunishment;
  onAnswer: (answer: PunishmentAnswer) => void;
  /** P14: draws `[ REROLL ]` of her words while the punishment is offered. Absent = the card draws none. */
  generation?: GenerationUi;
}

export interface TakeInsteadCardCtx {
  state: CampaignState;
  reg: Registries;
  punishment: OpenPunishment;
  onAnswer: (answer: TakeInsteadAnswer) => void;
}

/** What the card says of a punishment's weight: a word, never the number (R8). */
const WEIGHT_WORDS = { light: 'light', heavy: 'heavy', harsh: 'harsh' } as const;

const labelOf = (reg: Registries, p: Pick<OpenPunishment, 'entryId'>): string => String(reg.holderPunishments.get(p.entryId)?.label ?? reg.punishments.get(p.entryId)?.label ?? '');
const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * Her discipline as a card in her voice (P16, plan R8, R24): her words (a sealed one is the envelope), what it is called and how heavy it is as a word (never a number), and the
 * answers: ACCEPT, NEGOTIATE and REFUSE. Every part is addressed by the glossary; the text goes through `plainDraft`; no pronoun for the commander.
 */
export function renderPunishmentCard(host: HTMLElement, ctx: PunishmentCardCtx): void {
  const { state, reg, punishment: p } = ctx;
  const unit = state.squad.find((u) => u.id === p.holderId);
  if (unit === undefined) return;
  const live = { unitId: unit.id };
  const button = (kind: PunishmentAnswer, text: string, address: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-punishment-answer': kind, 'data-punishment': p.id, ...analyzeNative(address, live), onclick: () => ctx.onAnswer(kind),
  }, text);
  const label = labelOf(reg, p);
  const parts: Child[] = [
    h('p', { class: 'alius-punishment-text' }, plainDraft(p.sealed === true ? TUNING.practice.sealedLine : p.text)),
    ...(p.sealed === true ? [] : [h('p', { class: 'alius-punishment-weight', ...analyzeAttrs('glossary:holder_punishment', live) }, `${label}. Weight: ${WEIGHT_WORDS[severityWord(p.severity)]}.`)]),
    ...(p.status === 'negotiating' ? [h('p', { class: 'alius-punishment-hint' }, 'It is being talked over.')] : []),
    h('div', { class: 'alius-punishment-answers' }, button('accept', '[ ACCEPT ]', 'glossary:punishment_card'), button('negotiate', '[ NEGOTIATE ]', 'glossary:punishment_card'), button('refuse', '[ REFUSE ]', 'glossary:punishment_card'),
      p.status === 'offered' ? drawPracticeReroll(h('span', { class: 'alius-punishment-reroll' }), ctx.generation, 'punishment', p.requestId) : null),
  ];
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-punishment-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-punishment');
  card.setAttribute('data-punishment', p.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} punishes the commander`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:holder_punishment', live))) card.setAttribute(k, v);
  host.append(card);
}

/**
 * Her order to punish a soldier, as a card (P16, plan R8, TAKE IT INSTEAD): it names the soldier and what she wants done, and the answers: DO IT (the discipline of P9 on the soldier),
 * TAKE IT INSTEAD (the soldier is spared and the commander takes a punishment of the same weight) and REFUSE (a refusal of her order).
 */
export function renderTakeInsteadCard(host: HTMLElement, ctx: TakeInsteadCardCtx): void {
  const { state, reg, punishment: p } = ctx;
  const unit = state.squad.find((u) => u.id === p.holderId);
  const soldier = p.forUnitId === undefined ? undefined : state.squad.find((u) => u.id === p.forUnitId);
  if (unit === undefined || soldier === undefined) return;
  const live = { unitId: unit.id };
  const button = (kind: TakeInsteadAnswer, text: string, address: string): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-take-answer': kind, 'data-punishment': p.id, ...analyzeNative(address, live), onclick: () => ctx.onAnswer(kind),
  }, text);
  const parts: Child[] = [
    h('p', { class: 'alius-punishment-text' }, plainDraft(p.text)),
    h('p', { class: 'alius-punishment-weight', 'data-for-unit': soldier.id, ...analyzeAttrs('glossary:take_it_instead', live) }, `For ${soldier.displayName}: ${labelOf(reg, p)}.`),
    h('div', { class: 'alius-punishment-answers' }, button('do_it', '[ DO IT ]', 'glossary:take_it_instead'), button('take_it', '[ TAKE IT INSTEAD ]', 'glossary:take_it_instead'), button('refuse', '[ REFUSE ]', 'glossary:take_it_instead')),
  ];
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-punishment-body' }, ...parts), accent: unitAccent(unit.id) });
  card.classList.add('alius-punishment', 'alius-take-instead');
  card.setAttribute('data-punishment', p.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} wants ${soldier.displayName} punished`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:take_it_instead', live))) card.setAttribute(k, v);
  host.append(card);
}

/** Handlers of the cards a surface draws: the punishment's id comes with each answer. */
export interface PunishmentCardHandlers {
  answer: (punishmentId: string, answer: PunishmentAnswer) => void;
  takeInstead: (punishmentId: string, answer: TakeInsteadAnswer) => void;
  undo: (punishmentId: string) => void;
  /** P14: the surface's generation ui: the card draws REROLL. */
  generation?: GenerationUi;
}

/**
 * Draws her discipline of the units `pick` chooses (a scene's participants, one thread), replacing what `host` held: the punishments waiting for an answer, her orders about a soldier,
 * and, beside each answered one the engine would still take back, `[ UNDO — not what I meant ]` (as P9's). Nothing for a holder who is not live. Immersive mode keeps all of it (it
 * hides numbers, not what she asks).
 */
export function drawPunishmentCards(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: PunishmentCardHandlers): void {
  host.replaceChildren();
  if (!dynamicOn(state, reg)) return;
  for (const p of state.practices?.punishments ?? []) {
    if (!pick({ unitId: p.holderId }) || !practiceLive(state, reg, p.holderId)) continue;
    const open = p.status === 'offered' || p.status === 'negotiating';
    if (open && p.forUnitId !== undefined) renderTakeInsteadCard(host, { state, reg, punishment: p, onAnswer: (a) => handlers.takeInstead(p.id, a) });
    else if (open) renderPunishmentCard(host, { state, reg, punishment: p, onAnswer: (a) => handlers.answer(p.id, a), generation: handlers.generation });
    else if ((p.status === 'accepted' || p.status === 'refused') && p.forUnitId === undefined && canUndoPractice(state, p.id) === null) {
      host.append(h('div', { class: 'alius-chip-group', 'data-punishment-answered': p.id },
        h('span', { class: 'alius-chip', 'data-chip-unit': p.holderId, ...analyzeAttrs('glossary:holder_punishment', { unitId: p.holderId }) }, `${p.status === 'accepted' ? 'ACCEPTED' : 'REFUSED'} — ${labelOf(reg, p)} (${nameOf(state, p.holderId)})`),
        h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-undo-practice': p.id, ...analyzeNative('glossary:punishment_card', { unitId: p.holderId }), onclick: () => handlers.undo(p.id) }, '[ UNDO — not what I meant ]')));
    }
  }
}
