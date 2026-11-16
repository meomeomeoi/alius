import { buildKnowledge } from '../../analysis/knowledge';
import type { BuildStats } from '../../llm/context';
import { memoryConfig } from '../../engine/memory/config';
import type { CampaignState } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';

export type FillPart = 'facts' | 'dossiers' | 'chronicle' | 'memory_tokens' | 'directive_tokens' | 'save_size';

/** The text of one value of the indicator (also what the analysis panel and the tests read). Facts are counted through `Knowledge`: a hidden fact is not there. */
export function fillValue(state: CampaignState, build: BuildStats, settings: AliusSettings, part: FillPart): string {
  const cfg = memoryConfig(state);
  switch (part) {
    case 'facts': {
      const facts = buildKnowledge(state, settings).facts();
      const pinned = facts.filter((f) => f.pinned === true).length;
      return `${facts.length} / ${cfg.factsMax}${pinned > 0 ? ` (${pinned} pinned)` : ''}`;
    }
    case 'dossiers': return String(Object.values(state.memory.dossiers ?? {}).filter((d) => d.own !== '' || d.shared !== '').length);
    case 'chronicle': return String(state.memory.chronicle.length);
    case 'memory_tokens': return `${build.memoryTokens} / ${cfg.memoryTokens}`;
    case 'directive_tokens': return String(build.directiveTokens);
    case 'save_size': return `${(JSON.stringify(state).length / 1024).toFixed(1)} KB`;
  }
}

const ROWS: Array<[FillPart, string]> = [
  ['facts', 'Facts kept'], ['dossiers', 'Dossiers'], ['chronicle', 'Chronicle entries'],
  ['memory_tokens', 'Memory in the last prompt (tokens)'], ['directive_tokens', 'Directives in the last prompt (tokens)'], ['save_size', 'Save size'],
];

/** The fill indicator of SYS › MEMORY: what the squad's memory holds and what the last prompt spent on it. Every value is explainable. */
export function renderFill(host: HTMLElement, state: CampaignState, build: BuildStats, settings: AliusSettings): void {
  host.replaceChildren(h('div', { class: 'alius-memory-fill' }, ...ROWS.map(([part, label]) =>
    h('div', { class: 'alius-memory-row' },
      h('span', { class: 'alius-field-label' }, label),
      h('span', { class: 'alius-stat', 'data-fill': part, ...analyzeAttrs('glossary:memory_fill', { part }) }, fillValue(state, build, settings, part))))));
}
