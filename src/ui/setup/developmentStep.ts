import type { DevelopmentMode } from '../../engine/state/types';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What each mode is called and says (AUTHOR TO WRITE: plain meta text, no pronoun for the commander). */
export const DEVELOPMENT_LABEL: Record<DevelopmentMode, string> = { off: 'OFF', slow: 'SLOW', normal: 'NORMAL' };
const TEXT: Record<DevelopmentMode, string> = {
  off: 'Soldiers stay as their cards say.',
  slow: 'Soldiers change slowly from what they live through, at half the pace.',
  normal: 'Soldiers change slowly from what they live through.',
};

/**
 * The CHARACTER DEVELOPMENT section of the WORLD PARAMETERS step (P14b §8): off, slow or normal (the default). The same setting can be
 * changed later in SYS. Redrawn with the screen.
 */
export function renderDevelopmentSection(host: HTMLElement, wizard: Wizard): void {
  const current = wizard.state.development;
  const select = h(
    'select', { name: 'characterDevelopment', class: 'alius-input' },
    ...(['off', 'slow', 'normal'] as const).map((m) => h('option', { value: m, selected: m === current }, DEVELOPMENT_LABEL[m])),
  ) as HTMLSelectElement;
  select.value = current;
  select.addEventListener('change', () => wizard.setDevelopment(select.value as DevelopmentMode));
  host.append(h('section', { class: 'alius-section alius-character-development' },
    h('h3', {}, 'CHARACTER DEVELOPMENT'),
    h('p', { class: 'alius-hint' }, 'Nothing is announced when a soldier changes: it shows in how she acts, and her file records it afterwards. Her card and her own limits never change.'),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:character_development') }, h('span', { class: 'alius-field-label' }, 'Pace'), select),
    h('p', { class: 'alius-dim', 'data-development-text': current }, TEXT[current])));
}
