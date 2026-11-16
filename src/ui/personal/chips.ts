import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { unitAccent } from '../voice/voiceCard';

/** A DM edit that waits for KEEP or REVERT (what `PersonalController.pendingEdit` returns). */
export interface EditView {
  id: string;
  editorId: string;
  toUnitId: string;
  original: string;
  edited: string;
}

/** `EDITED BY {NAME}` with [KEEP] and [REVERT]: the commander keeps the edit (it is sent) or reverts it (defiance toward her). Text only. */
export function editChip(edit: EditView, name: string, onKeep: () => void, onRevert: () => void): HTMLElement {
  const group = h('div', { class: 'alius-edit alius-chip-group', 'data-edit': edit.id },
    h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:device_access', { unitId: edit.editorId }) }, `EDITED BY ${name.toUpperCase()}`),
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'keep', onclick: onKeep }, '[KEEP]'),
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'revert', onclick: onRevert }, '[REVERT]'));
  group.style.setProperty('--unit-accent', unitAccent(edit.editorId));
  return group;
}

export interface PersonalChipHandlers {
  onAnswerToken(offerId: string, accept: boolean): void;
  onAnswerWager(wagerId: string, accept: boolean): void;
  /** `pick` is the commander's hand in rock-paper-scissors (undefined for the other games). */
  onPlayWager(wagerId: string, pick: string | undefined): void;
  onAnswerQuestion(wagerId: string, text: string): void;
}

const HANDS = ['rock', 'paper', 'scissors'] as const;

/**
 * What a soldier has put in front of the commander (P9c chunk b), drawn into `host` for the units `pick` accepts: a token offer
 * (ACCEPT / DECLINE), her challenge (ACCEPT / DECLINE), an accepted wager to play (rock-paper-scissors asks for a hand, sparring is
 * [FIGHT]), a bet that waits for the run, and the one line a won question wager still needs. Text only.
 */
export function drawPersonalChips(host: HTMLElement, state: CampaignState, reg: Registries, pick: (unitId: string) => boolean, on: PersonalChipHandlers): void {
  host.replaceChildren();
  const nameOf = (id: string): string => (state.squad.find((u) => u.id === id)?.displayName ?? id).toUpperCase();
  const group = (unitId: string, address: string, ctx: Record<string, unknown>, label: string, ...kids: Array<HTMLElement | null>): HTMLElement => {
    const g = h('div', { class: 'alius-chip-group', 'data-personal': unitId },
      h('span', { class: 'alius-chip', ...analyzeAttrs(address, ctx) }, label), ...kids);
    g.style.setProperty('--unit-accent', unitAccent(unitId));
    return g;
  };
  const button = (text: string, action: string, onclick: () => void): HTMLElement =>
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': action, onclick }, text);

  const offer = state.personal?.tokens?.offer;
  if (offer && pick(offer.giverId)) {
    host.append(group(offer.giverId, 'glossary:token', { unitId: offer.giverId }, `${nameOf(offer.giverId)} OFFERS: ${offer.label.toUpperCase()}`,
      button('[ACCEPT]', 'accept', () => on.onAnswerToken(offer.id, true)), button('[DECLINE]', 'decline', () => on.onAnswerToken(offer.id, false))));
  }
  for (const w of state.personal?.wagers?.open ?? []) {
    if (!pick(w.unitId)) continue;
    const game = reg.wagerGames.get(w.gameId);
    const stake = reg.wagerStakes.get(w.stakeId);
    const what = `${String(game?.label ?? w.gameId).toUpperCase()} FOR ${String(stake?.text ?? w.stakeId).toUpperCase()}`;
    const live = { wagerId: w.id, unitId: w.unitId };
    if (w.status === 'offered') {
      host.append(group(w.unitId, 'glossary:wager', live, `${nameOf(w.unitId)} CHALLENGES: ${what}`,
        button('[ACCEPT]', 'accept', () => on.onAnswerWager(w.id, true)), button('[DECLINE]', 'decline', () => on.onAnswerWager(w.id, false))));
    } else if (w.status === 'pending_run') {
      host.append(group(w.unitId, 'glossary:wager', live, `WAGER WITH ${nameOf(w.unitId)}: ${what} — WAITS FOR THE NEXT RUN`));
    } else if (game?.kind === 'rps') {
      host.append(group(w.unitId, 'glossary:wager', live, `WAGER WITH ${nameOf(w.unitId)}: ${what}`, ...HANDS.map((hand) => button(`[${hand.toUpperCase()}]`, `play-${hand}`, () => on.onPlayWager(w.id, hand)))));
    } else {
      host.append(group(w.unitId, 'glossary:wager', live, `WAGER WITH ${nameOf(w.unitId)}: ${what}`, button(game?.kind === 'sparring' ? '[FIGHT]' : '[PLAY]', 'play', () => on.onPlayWager(w.id, undefined))));
    }
  }
  const q = state.personal?.pendingQuestion;
  if (q && pick(q.unitId)) {
    const asks = q.winner === 'commander';
    const input = h('input', { type: 'text', name: 'question', class: 'alius-input', maxlength: '200', autocomplete: 'off', 'aria-label': asks ? 'Your question' : 'Your answer' }) as HTMLInputElement;
    const send = (): void => {
      const text = input.value.replace(/\s+/g, ' ').trim();
      if (text !== '') on.onAnswerQuestion(q.wagerId, text);
    };
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') send(); });
    host.append(group(q.unitId, 'glossary:wager', { unitId: q.unitId }, asks ? `YOU WON A QUESTION: ASK ${nameOf(q.unitId)}` : `${nameOf(q.unitId)} WON A QUESTION: ANSWER TRUTHFULLY`,
      h('span', { class: 'alius-condition' }, input, button(asks ? '[ASK]' : '[ANSWER]', 'question-ok', send))));
  }
}
