import type { Registries } from '../../content/types';
import { fallbackFragment } from '../../engine/special/frequency/fragments';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

/**
 * `FREQ ▸ "<text>" (unverified)` (P12): the newest fragment the frequency caught about this unit, appended to `host`. It is drawn
 * the same for a true and a false fragment (the state's truth flag is never read here). Nothing after the implant is burned.
 */
export function renderFreqChip(host: HTMLElement, state: CampaignState, reg: Registries, unitId: string): void {
  const f = state.special?.frequency;
  if (!f || f.burnedDay !== undefined) return;
  const x = [...f.intercepts].reverse().find((y) => y.unitId === unitId);
  if (!x) return;
  const name = state.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  const text = x.text ?? fallbackFragment(reg, x, name);
  host.append(h('span', { class: 'alius-chip alius-freq-chip', 'data-freq-unit': unitId, ...analyzeAttrs('glossary:frequency_intercept') }, `FREQ ▸ "${text}" (unverified)`));
}
