import type { Registries } from '../../content/types';
import { fallbackFragment } from '../../engine/special/frequency/fragments';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

/**
 * The INTERCEPTS log of the CMDR dossier (P12): day, name and fragment, newest first, every line suffixed `(unverified)`. It never
 * marks which fragment was true; that flag is not read here. Nothing is drawn for a campaign without the frequency.
 */
export function renderInterceptLog(host: HTMLElement, state: CampaignState, reg: Registries): void {
  const f = state.special?.frequency;
  if (!f) return;
  const rows = [...f.intercepts].reverse().map((x) => {
    const name = state.squad.find((u) => u.id === x.unitId)?.displayName ?? x.unitId;
    return h('li', { 'data-intercept': x.id }, `Day ${x.day} — ${name}: "${x.text ?? fallbackFragment(reg, x, name)}" (unverified)`);
  });
  host.append(h('section', { class: 'alius-intercepts' },
    h('h4', { ...analyzeAttrs('glossary:frequency_intercept') }, 'INTERCEPTS'),
    rows.length === 0 ? h('p', { class: 'alius-dim' }, 'NO FRAGMENTS CAUGHT') : h('ul', {}, ...rows)));
}
