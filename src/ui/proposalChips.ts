import type { ProposalAnswer } from '../engine/relations/proposals';
import type { CampaignState, PendingProposal } from '../engine/state/types';
import { h } from './dom';

export const kindLabel = (s: string): string => s.replace(/_/g, ' ').toUpperCase();

/**
 * Draws the chips of the open proposals `pick` accepts into `host`: [ACCEPT] [DECLINE] [NOT NOW] for her proposals,
 * [OPENLY] [SECRETLY] [NOT NOW] when a second romance asks for disclosure.
 */
export function drawProposalChips(
  host: HTMLElement, state: CampaignState, pick: (p: PendingProposal) => boolean, onAnswer: (proposalId: string, answer: ProposalAnswer) => void,
): void {
  host.replaceChildren();
  for (const p of state.proposals ?? []) {
    if (!pick(p)) continue;
    const name = (state.squad.find((u) => u.id === p.unitId)?.displayName ?? p.unitId).toUpperCase();
    const buttons: Array<[string, ProposalAnswer]> = p.needsDisclosure
      ? [['[OPENLY]', 'accept'], ['[SECRETLY]', 'accept_secret'], ['[NOT NOW]', 'not_now']]
      : p.from === 'commander' ? [['[NOT NOW]', 'not_now']] : [['[ACCEPT]', 'accept'], ['[DECLINE]', 'decline'], ['[NOT NOW]', 'not_now']];
    host.append(h('div', { class: 'alius-chip-group', 'data-proposal': p.id },
      h('span', { class: 'alius-chip-label' }, p.from === 'unit' ? `${name} PROPOSES: ${kindLabel(p.kind)}` : `${name}: ${kindLabel(p.kind)} — OPENLY OR SECRETLY?`),
      ...buttons.map(([text, answer]) => h('button', { type: 'button', class: 'alius-btn alius-tagchip', onclick: () => onAnswer(p.id, answer) }, text))));
  }
}
