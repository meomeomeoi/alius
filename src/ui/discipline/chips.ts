import { drawSiteReroll, type GenerationUi } from '../generation/surface';
import type { Registries } from '../../content/types';
import { defiesHint, markPick, obeyedBy } from '../personal/obey';
import { canUndo, grantProblem } from '../../engine/discipline';
import type { CampaignState } from '../../engine/state/types';
import { measureLabel } from '../../discipline/directives';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
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
      ? h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-undo': id, onclick: () => onUndo(id) }, '[ UNDO — not what I meant ]')
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

export interface DemandHandlers {
  grant: (demandId: string) => void;
  refuse: (demandId: string) => void;
  /** Absent inside a scene: she is already there. */
  talk?: (demandId: string) => void;
  /** P14: REROLL of the demand's wording before an answer. Absent = none drawn. */
  generation?: GenerationUi;
}

/**
 * Draws her open demands (P9) into `host`, from the state alone: `{NAME} DEMANDS: {text}`, an OWED mark for a favor she
 * did on credit, and `[GRANT] [REFUSE] [TALK]`. `[GRANT]` is soft-disabled (`aria-disabled`, the reason in the title) while
 * the engine would refuse it; `[TALK]` opens a conversation and keeps the demand open. An undelivered demand is not shown yet.
 */
export function drawDemandChips(
  host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, on: DemandHandlers,
): void {
  host.replaceChildren();
  for (const d of state.discipline?.demands ?? []) {
    if (d.status !== 'open' || !pick({ unitId: d.unitId })) continue;
    const name = (state.squad.find((u) => u.id === d.unitId)?.displayName ?? d.unitId).toUpperCase();
    const why = grantProblem(state, reg, d.id);
    // P9d: her own want is answered, not granted or refused
    const desire = reg.demandTemplates.get(d.templateId)?.kind === 'desire';
    const button = (kind: 'grant' | 'refuse' | 'talk', text: string, run: () => void, disabled = false, title?: string): HTMLElement => {
      const b = h('button', {
        type: 'button', class: 'alius-btn alius-tagchip', 'data-demand-answer': kind, 'data-demand': d.id,
        ...(desire ? analyzeNative('glossary:want') : {}),
        ...(disabled ? { 'aria-disabled': 'true', ...(title ? { title } : {}) } : {}),
        onclick: () => { if (b.getAttribute('aria-disabled') !== 'true') run(); },
      }, text);
      return b;
    };
    // P9c: a day the commander obeys her: GRANT is her pick, refusing or putting off defies her
    const obeyed = obeyedBy(state, d.unitId);
    const grant = button('grant', desire ? '[ SATISFY ]' : '[ GRANT ]', () => on.grant(d.id), why !== null, why ?? undefined);
    if (obeyed !== null) markPick(grant);
    host.append(h('div', { class: 'alius-chip-group', 'data-demand-group': d.id },
      h('span', { class: 'alius-chip', 'data-demand': d.id, ...analyzeAttrs(`demandTemplates:${d.templateId}`, { unitId: d.unitId }) }, `${name} DEMANDS: ${d.text}`),
      d.owed ? h('span', { class: 'alius-chip', 'data-owed': d.id, ...analyzeAttrs('glossary:owed_demand') }, 'OWED') : null,
      grant,
      button('refuse', desire ? '[ POSTPONE ]' : '[ REFUSE ]', () => on.refuse(d.id)),
      obeyed !== null ? defiesHint(obeyed) : null,
      on.talk ? button('talk', '[ TALK ]', () => on.talk!(d.id)) : null,
      on.generation ? drawSiteReroll(h('span'), on.generation, 'flavor.demand', d.id) : null));
  }
}
