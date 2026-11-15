import type { Registries } from '../../content/types';
import { countermandOpen } from '../../engine/power/leader';
import type { CampaignState } from '../../engine/state/types';
import type { Mission } from '../../engine/world/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/**
 * The squad leader's countermand (P9b): while one waits for an answer, a line says who countermanded what and with whom, and
 * [ACCEPT] [OVERRULE] answer it through the app (`power/countermand`). Nothing is drawn without an open countermand or once its slot
 * has passed. Replaces whatever is in `host`. Text only.
 */
export function drawCountermandChips(host: HTMLElement, state: CampaignState, reg: Registries, onAnswer: (answer: 'accept' | 'overrule') => void): void {
  host.replaceChildren();
  const c = countermandOpen(state);
  if (!c) return;
  const nameOf = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  const activityId = (c.payload as { activityId?: unknown } | null)?.activityId;
  const activity = typeof activityId === 'string' ? String(reg.activities.get(activityId)?.name ?? activityId) : 'the order';
  host.append(h('p', { class: 'alius-countermand', 'data-countermand-line': '' },
    h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:countermand') }, `${nameOf(c.leaderId)} COUNTERMANDS`),
    ` ${activity} with ${nameOf(c.unitId)}. `,
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-countermand': 'accept', ...analyzeNative('glossary:countermand'), onclick: () => onAnswer('accept') }, '[ACCEPT]'), ' ',
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-countermand': 'overrule', ...analyzeNative('glossary:countermand'), onclick: () => onAnswer('overrule') }, '[OVERRULE]')));
}

/** `ON HER CALL: {Name}` while a soldier's her-call mark stands on the mission (a squad vote's mark shows nothing). */
export function herCallChip(state: CampaignState, mission: Mission): HTMLElement | null {
  const by = mission.decidedBy;
  if (by?.source !== 'her_call') return null;
  const name = state.squad.find((u) => u.id === by.unitId)?.displayName ?? by.unitId;
  return h('span', { class: 'alius-chip', 'data-her-call-chip': mission.id, ...analyzeAttrs('glossary:her_call', { unitId: by.unitId, missionId: mission.id }) }, `ON HER CALL: ${name}`);
}
