/**
 * `[ CARE ]` (P16b, plan Task 15; PDA surface): what the commander may do for her unasked, as a menu of the cares there are (`careKinds`: the commander's dynamic rows with a `care` field).
 * Each option spends one slot (`care/unasked`) and says nothing of whether she noticed: that waits until she shows it. Drawn only toward a woman care is open for (`careOpen`); an option that
 * cannot be done now is `aria-disabled` with the reason beside it. Every chip carries `data-analyze`. No pronoun for the commander.
 */
import type { Registries } from '../../content/types';
import { careKinds, careReason } from '../../engine/craft/care';
import { careOpen } from '../../engine/craft/gate';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { endSlotBlock } from '../hub/model';

/** Why the commander cannot do this care for her now (the engine's reasons, then whatever stops the slot from being spent), or `null`. */
export function careBlock(state: CampaignState, reg: Registries, unitId: string, careId: string): string | null {
  return careReason(state, reg, unitId, careId) ?? endSlotBlock(state, reg);
}

/** The menu for one woman, or `null` while care is not open toward her. `onCare` is the app's: it dispatches `care/unasked`. */
export function renderCareMenu(state: CampaignState, reg: Registries, unitId: string, onCare: (unitId: string, careId: string) => void): HTMLElement | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !careOpen(state, reg, unitId)) return null;
  const items = careKinds(reg).map((row) => {
    const why = careBlock(state, reg, unitId, row.id);
    return h('li', { class: 'alius-care-item' },
      h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-care': row.id, ...(why !== null ? { 'aria-disabled': 'true' } : {}), ...analyzeNative(`blockingActivities:${row.id}`),
        onclick: () => { if (why === null) onCare(unitId, row.id); },
      }, row.label.toUpperCase()),
      why !== null ? h('span', { class: 'alius-dim alius-reason' }, why) : null);
  });
  return h('details', { class: 'alius-care', 'data-care-menu': unitId },
    h('summary', { class: 'alius-btn alius-option', ...analyzeAttrs('glossary:craft_care') }, '[ CARE ]'),
    h('p', { class: 'alius-dim' }, `A slot spent on ${unit.displayName} without her asking. Whether she saw it is not told.`),
    h('ul', { class: 'alius-care-list' }, ...items));
}
