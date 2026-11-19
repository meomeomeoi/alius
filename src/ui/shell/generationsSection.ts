import type { CampaignState } from '../../engine/state/types';
import type { LlmLogEntry } from '../../llm/log';
import { fullOpenRecords, generationSite } from '../../llm/sites';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { drawRecordChip, type GenerationUi } from '../generation/surface';

export interface GenerationsSectionCtx {
  state: CampaignState | null;
  /** Carries the envelope, the modal, the settings and the redraw. */
  ui: GenerationUi;
  /** In debug mode a record row shows the raw answer of its log entry (matched by `at` and call type). */
  debugLog?: LlmLogEntry[];
}

/** The number the SYS tab badge shows: open records of sites that record `full`. */
export const generationBadge = (state: CampaignState | null): number => (state ? fullOpenRecords(state).length : 0);

/**
 * SYS › GENERATIONS (P14 §4): every open and expired record of the campaign, newest first, with RETRY, the menu and DROP; background
 * (`quiet`) records are listed but do not count for the badge. A standing line says so while there is no mechanic profile to call.
 * In debug mode a row also shows the raw text of its log entry. Text only.
 */
export function renderGenerationsSection(host: HTMLElement, ctx: GenerationsSectionCtx): void {
  const { ui, state } = ctx;
  const settings = ui.settings();
  host.replaceChildren();
  const section = h('div', { class: 'alius-generations' },
    h('h3', {}, h('span', { class: 'alius-stat', ...analyzeAttrs('glossary:generation_record') }, 'Generations')));
  // no profile and no fallback to the main model: mechanic calls are not made, and no record would say so
  if (settings.mechanicProfileId === '' && !settings.mechanicFallbackToMain) {
    section.append(h('p', { class: 'alius-chip alius-generations-standing', ...analyzeAttrs('glossary:generation_reasons') },
      'No mechanic profile is selected: model calls for the mechanics are not made.'));
  }
  const records = [...(state?.generations?.records ?? [])].reverse();
  if (!state || records.length === 0) {
    section.append(h('p', { class: 'alius-dim' }, 'No failed generations.'));
  } else {
    const list = h('ul', { class: 'alius-generations-list' });
    for (const rec of records) {
      const site = generationSite(rec.siteId);
      const row = h('li', { class: 'alius-generations-row', 'data-record': rec.id });
      drawRecordChip(row, ui, state, rec, { showDrop: true });
      row.append(h('span', { class: 'alius-dim' }, ` Day ${rec.day}, ${rec.slot} · ${rec.attempts} ${rec.attempts === 1 ? 'try' : 'tries'}${site?.record === 'quiet' ? ' · background' : ''}`));
      const entry = settings.debug ? ctx.debugLog?.find((e) => e.at === rec.at && e.callType === site?.callType) : undefined;
      if (entry) row.append(h('pre', { class: 'alius-generations-raw', 'data-raw': '' }, entry.raw === '' ? '(no text)' : entry.raw));
      list.append(row);
    }
    section.append(list);
  }
  host.append(section);
}
