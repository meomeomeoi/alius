import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { overrideOpen, wardenOf, type WardenOrder } from './state';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

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

/** The order an out-of-combat action stands for, or null for any other action (a combat order never goes to the judge). */
export function orderOfAction(action: { type: string; payload?: unknown }): WardenOrder | null {
  const p = isObj(action.payload) ? action.payload : {};
  switch (action.type) {
    case 'activity/do':
      return typeof p.activityId === 'string'
        ? { kind: 'activity', activityId: p.activityId, ...(typeof p.companionId === 'string' ? { companionId: p.companionId } : {}), ...(Array.isArray(p.unitIds) ? { unitIds: strs(p.unitIds) } : {}) }
        : null;
    case 'roster/set_active': return { kind: 'roster', activeIds: strs(p.activeIds) };
    case 'expedition/start': return { kind: 'expedition', ...(typeof p.missionId === 'string' ? { missionId: p.missionId } : {}), unitIds: strs(p.unitIds) };
    case 'dilemma/choose': return typeof p.index === 'number' ? { kind: 'dilemma', index: p.index } : null;
    default: return null;
  }
}

/**
 * What the extraction is told about her expectations while she is among the participants: each id with its text (a personal one's own
 * words, else the registry's description of its kind). She knows her own mind, so unknown ones are listed too; this goes to the model
 * only and never reaches an event, a toast or a panel.
 */
export function expectationInput(state: CampaignState, reg: Registries, participants: string[]): { expectations?: Array<{ id: string; text: string }> } {
  const w = wardenOf(state);
  if (!w || !participants.includes(w.unitId) || w.expectations.length === 0) return {};
  const textOf = (x: (typeof w.expectations)[number]): string =>
    x.kind === 'personal' ? x.text ?? '' : String([...reg.wardenExpectations.values()].find((e) => e.kind === x.kind)?.description ?? x.kind);
  return { expectations: w.expectations.map((x) => ({ id: x.id, text: textOf(x) })) };
}
