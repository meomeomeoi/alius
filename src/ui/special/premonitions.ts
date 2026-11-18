import type { Registries } from '../../content/types';
import { premonitionLine } from '../../engine/special/paranoia/premonitions';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

/**
 * The PREMONITIONS list of the CMDR dossier (P12): the warnings still open (not acted on, not past their last day), from the last
 * 14 days, newest first. Each row is the day, her name, the notice and a PREMONITION chip. It is drawn the same for a real and a
 * false warning (the state's `real` flag is never read here), and acting on a warning closes either kind alike.
 */
export function renderPremonitions(host: HTMLElement, state: CampaignState, reg: Registries): void {
  const p = state.special?.paranoia;
  if (!p) return;
  const open = [...p.premonitions]
    .filter((x) => x.acted === undefined && x.expiresDay >= state.day && x.day >= state.day - TUNING.special.paranoia.keepDays)
    .reverse();
  const rows = open.map((x) => {
    const name = state.squad.find((u) => u.id === x.unitId)?.displayName ?? x.unitId;
    return h('li', { 'data-premonition': x.id },
      `Day ${x.day} — ${name}: ${premonitionLine(reg, x, name)} `,
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:premonition') }, 'PREMONITION'));
  });
  host.append(h('section', { class: 'alius-premonitions' },
    h('h4', {}, 'PREMONITIONS'),
    rows.length === 0 ? h('p', { class: 'alius-dim' }, 'NOTHING OPEN') : h('ul', {}, ...rows)));
}
