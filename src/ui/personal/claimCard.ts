import type { Registries } from '../../content/types';
import { contentAllowed } from '../../engine/bonds/content';
import { HUMILIATION_TAG } from '../../engine/personal/courtship';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { unitAccent } from '../voice/voiceCard';

export interface ClaimHandlers {
  onLetStand(unitId: string): void;
  onRefuse(unitId: string): void;
}

/**
 * The card the commander answers when a soldier claims the commander in public (P9c §3): [LET IT STAND] always, [REFUSE PUBLICLY]
 * only while `public_humiliation` is on and not one of her own limits. Text only.
 */
export function renderClaimCard(state: CampaignState, reg: Registries, claim: { unitId: string; day: number }, handlers: ClaimHandlers): HTMLElement {
  const name = state.squad.find((u) => u.id === claim.unitId)?.displayName ?? claim.unitId;
  const chip = h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:claimed', { unitId: claim.unitId }) }, 'CLAIMED');
  chip.style.setProperty('--unit-accent', unitAccent(claim.unitId));
  const refusable = contentAllowed(state, reg, { contentTags: [HUMILIATION_TAG] }, claim.unitId);
  return h('div', { class: 'alius-claim', 'data-claim': claim.unitId },
    h('p', {}, chip, ` ${name.toUpperCase()} HAS TOLD EVERYONE THE COMMANDER IS HERS.`),
    h('div', { class: 'alius-claim-actions' },
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'stand', onclick: () => handlers.onLetStand(claim.unitId) }, '[LET IT STAND]'),
      refusable ? h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'refuse', onclick: () => handlers.onRefuse(claim.unitId) }, '[REFUSE PUBLICLY]') : null));
}
