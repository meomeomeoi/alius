import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { overrideOpen, wardenOf, type WardenOrder } from './state';

/** An order in words, for the chip, the directive and the model's list. No pronoun for the commander. */
export function describeOrder(state: CampaignState, reg: Registries, order: WardenOrder): string {
  const name = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  switch (order.kind) {
    case 'activity': {
      const label = String(reg.activities.get(order.activityId)?.name ?? order.activityId);
      return order.companionId !== undefined ? `${label} with ${name(order.companionId)}` : label;
    }
    case 'roster': return `the active roster: ${order.activeIds.map(name).join(', ') || 'nobody'}`;
    case 'expedition': return `an expedition with ${order.unitIds.map(name).join(', ')}`;
    case 'dilemma': return state.dilemmas?.open?.options?.[order.index]?.label ?? 'the decision';
    case 'combat_order': return String(reg.orders.get(order.orderId)?.name ?? order.orderId);
  }
}

/**
 * What the extraction is told about the warden's open override: its id, the commander's order and what she wants instead, only while the
 * warden is among the participants. Nothing about an expectation she has not shown.
 */
export function overrideInput(state: CampaignState, reg: Registries, participants: string[]): { overrides?: Array<{ id: string; order: string; alternative: string }> } {
  const o = overrideOpen(state);
  const w = wardenOf(state);
  if (!o || !w || !participants.includes(w.unitId) || o.context === 'combat') return {};
  return { overrides: [{ id: o.id, order: describeOrder(state, reg, o.order), alternative: o.altLabel }] };
}
