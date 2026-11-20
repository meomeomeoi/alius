import type { Registries } from '../content/types';
import { courtshipChips } from '../engine/personal/courtship';
import type { ProposalAnswer } from '../engine/relations/proposals';
import type { CampaignState, PendingProposal } from '../engine/state/types';
import { analyzeAttrs } from './analyze/mark';
import { defiesHint, markPick, obeyedBy } from './personal/obey';
import { h } from './dom';

export const kindLabel = (s: string): string => s.replace(/_/g, ' ').toUpperCase();

/** How long a condition may be (the engine's limit). */
const CONDITION_MAX = 160;

/**
 * Draws the chips of the open proposals `pick` accepts into `host`: [ACCEPT] [DECLINE] [NOT NOW] for her proposals,
 * [OPENLY] [SECRETLY] [NOT NOW] when a second romance asks for disclosure. With the registries (P9c), the proposal of a unit who
 * courts the commander gets [ACCEPT] [DEFLECT] [SET A CONDITION] instead; SET A CONDITION opens a one-line input and answers
 * `accept_condition` with its text.
 */
export function drawProposalChips(
  host: HTMLElement, state: CampaignState, pick: (p: PendingProposal) => boolean,
  onAnswer: (proposalId: string, answer: ProposalAnswer, condition?: string) => void, reg?: Registries,
): void {
  host.replaceChildren();
  for (const p of state.proposals ?? []) {
    if (!pick(p)) continue;
    const name = (state.squad.find((u) => u.id === p.unitId)?.displayName ?? p.unitId).toUpperCase();
    const label = h('span', { class: 'alius-chip-label' }, p.from === 'unit' ? `${name} PROPOSES: ${kindLabel(p.kind)}` : `${name}: ${kindLabel(p.kind)} — OPENLY OR SECRETLY?`);
    if (reg && courtshipChips(state, reg, p)) {
      const group = courtingGroup(p, label, onAnswer);
      pickForObedience(state, p, group);
      host.append(group);
      continue;
    }
    const buttons: Array<[string, ProposalAnswer]> = p.needsDisclosure
      ? [['[ OPENLY ]', 'accept'], ['[ SECRETLY ]', 'accept_secret'], ['[ NOT NOW ]', 'not_now']]
      : p.from === 'commander' ? [['[ NOT NOW ]', 'not_now']] : [['[ ACCEPT ]', 'accept'], ['[ DECLINE ]', 'decline'], ['[ NOT NOW ]', 'not_now']];
    const group = h('div', { class: 'alius-chip-group', 'data-proposal': p.id }, label,
      ...buttons.map(([text, answer]) => h('button', { type: 'button', class: 'alius-btn alius-tagchip', onclick: () => onAnswer(p.id, answer) }, text)));
    pickForObedience(state, p, group);
    host.append(group);
  }
}

/** The three chips of a courting unit's proposal, and the one-line condition that SET A CONDITION opens. */
function courtingGroup(p: PendingProposal, label: HTMLElement, onAnswer: (id: string, answer: ProposalAnswer, condition?: string) => void): HTMLElement {
  const group = h('div', { class: 'alius-chip-group', 'data-proposal': p.id });
  const badge = h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:courtship', { unitId: p.unitId }) }, 'COURTING');
  const draw = (): void => {
    group.replaceChildren(label, badge,
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', onclick: () => onAnswer(p.id, 'accept') }, '[ ACCEPT ]'),
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', onclick: () => onAnswer(p.id, 'deflect') }, '[ DEFLECT ]'),
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', onclick: drawCondition }, '[ SET A CONDITION ]'));
  };
  function drawCondition(): void {
    const input = h('input', { type: 'text', name: 'condition', class: 'alius-input', maxlength: String(CONDITION_MAX), autocomplete: 'off', 'aria-label': 'Your condition' }) as HTMLInputElement;
    const confirm = (): void => {
      const text = input.value.replace(/\s+/g, ' ').trim();
      if (text !== '') onAnswer(p.id, 'accept_condition', text);
    };
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') confirm(); });
    group.replaceChildren(label, badge, h('span', { class: 'alius-condition' }, input,
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'condition-ok', onclick: confirm }, '[ ACCEPT ON THIS ]'),
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'condition-back', onclick: draw }, '[ BACK ]')));
    input.focus();
  }
  draw();
  return group;
}

/** P9c: a day the commander obeys her: her own proposal's ACCEPT is her pick; every other answer defies her. */
function pickForObedience(state: CampaignState, p: PendingProposal, group: HTMLElement): void {
  const obeyed = p.from === 'unit' ? obeyedBy(state, p.unitId) : null;
  if (obeyed === null) return;
  for (const b of group.querySelectorAll<HTMLElement>('button')) {
    if (b.textContent === '[ ACCEPT ]') markPick(b);
  }
  group.append(defiesHint(obeyed));
}
