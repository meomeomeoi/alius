import type { Registries } from '../../content/types';
import { canUndo } from '../../engine/discipline';
import type { CampaignState } from '../../engine/state/types';
import { measureLabel } from '../../discipline/directives';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

export interface ChipSource {
  channel: string;
  unitId: string;
  sceneId?: string;
}

/**
 * Draws what the game understood of the commander's words (P9), into `host`, from the state alone (so a reload draws it
 * again): `DISCIPLINE LOGGED — {label} ({Name})` for a punishment read from dialogue (today's only), and
 * `THREAT REGISTERED — {label} ({Name}) · She believes it / She doesn't buy it` for a pending threat. Each carries
 * `[UNDO — not what I meant]` while the engine would accept it. Always shown, whatever "show raw values" says: the player must
 * know whether the threat was understood. A menu punishment is the player's own click and draws nothing. `pick` chooses the
 * chips of this place (a scene, a thread).
 */
export function drawDisciplineChips(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: ChipSource) => boolean, onUndo: (id: string) => void,
): void {
  host.replaceChildren();
  const name = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  const group = (id: string, unitId: string, address: string, text: string): HTMLElement => h('div', { class: 'alius-chip-group', 'data-discipline': id },
    h('span', { class: 'alius-chip', 'data-chip-unit': unitId, ...analyzeAttrs(address, { unitId }) }, text),
    canUndo(state, id) === null
      ? h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-undo': id, onclick: () => onUndo(id) }, '[UNDO — not what I meant]')
      : null);
  for (const a of state.discipline?.applications ?? []) {
    if (a.source !== 'dialogue' || a.day !== state.day || !pick({ channel: a.channel, unitId: a.unitId, ...(a.sceneId !== undefined ? { sceneId: a.sceneId } : {}) })) continue;
    host.append(group(a.id, a.unitId, 'glossary:discipline_logged', `DISCIPLINE LOGGED — ${measureLabel(reg, a.measure)} (${name(a.unitId)})`));
  }
  for (const t of state.discipline?.threats ?? []) {
    if (!pick({ channel: t.channel, unitId: t.unitId, ...(t.sceneId !== undefined ? { sceneId: t.sceneId } : {}) })) continue;
    host.append(group(t.id, t.unitId, 'glossary:threat',
      `THREAT REGISTERED — ${measureLabel(reg, t.measure)} (${name(t.unitId)}) · ${t.believed ? 'She believes it' : "She doesn't buy it"}`));
  }
}
