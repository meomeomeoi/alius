import type { Registries } from '../../content/types';
import { pressureBand } from '../../engine/special/debts/handler';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

const ENDED: Record<string, string> = { leaked: 'The handler leaked it to the squad.', confessed: 'The commander confessed.', fled: 'The commander fled to the rival corporation.' };

/**
 * The DEBTS block of the CMDR dossier (P12): who the handler is, the corporation, the last visit, how many items went across and the
 * handler's pressure as a band (calm, pressing, threatening). The handler's suspicion and oversight's are never shown, not even here.
 */
export function renderDebtsBlock(host: HTMLElement, state: CampaignState, reg: Registries): void {
  const d = state.special?.debts;
  if (!d) return;
  const handler = String(reg.debtHandlers.get(d.handlerId)?.name ?? 'Unknown');
  const corp = String(reg.corporations.get(d.corporationId)?.name ?? d.corporationId);
  const sold = d.answered.length;
  host.append(h('section', { class: 'alius-debts' },
    h('h4', {}, 'DEBTS'),
    h('p', {}, `HANDLER: ${handler} — ${corp}`),
    h('p', {}, `LAST VISIT: ${d.lastVisitDay === undefined ? 'NONE YET' : `Day ${d.lastVisitDay}`} · INTEL: ${sold} ${sold === 1 ? 'item' : 'items'}`),
    d.ended === undefined
      ? h('p', {}, h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:handler_pressure') }, `PRESSURE: ${pressureBand(d.handlerPressure)}`))
      : h('p', { class: 'alius-dim' }, `ENDED — ${ENDED[d.ended] ?? ''}`)));
}
