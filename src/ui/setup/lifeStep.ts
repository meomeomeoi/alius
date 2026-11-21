import type { LifeMode } from '../../engine/state/types';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What each frequency is called and says (AUTHOR TO WRITE: plain meta text, no pronoun for the commander). */
export const LIFE_LABEL: Record<LifeMode, string> = { off: 'OFF', rare: 'RARE', normal: 'NORMAL', often: 'OFTEN' };
const TEXT: Record<LifeMode, string> = {
  off: 'Soldiers have no days off-screen: nothing happens to them between scenes.',
  rare: 'Something happens to a soldier every other week or so, and she tells of it now and then.',
  normal: 'Something happens to a soldier about once a week, and the news reaches the commander a little at a time.',
  often: 'Something happens to a soldier twice a week, and the news comes more often.',
};

/**
 * The LIFE EVENTS section of the WORLD PARAMETERS step (P14c §8): off, rare, normal (the default) or often. The same setting can be changed
 * later in SYS. Redrawn with the screen.
 */
export function renderLifeSection(host: HTMLElement, wizard: Wizard): void {
  const current = wizard.state.lifeEvents;
  const select = h(
    'select', { name: 'lifeEvents', class: 'alius-input' },
    ...(['off', 'rare', 'normal', 'often'] as const).map((m) => h('option', { value: m, selected: m === current }, LIFE_LABEL[m])),
  ) as HTMLSelectElement;
  select.value = current;
  select.addEventListener('change', () => wizard.setLifeEvents(select.value as LifeMode));
  host.append(h('section', { class: 'alius-section alius-life-events' },
    h('h3', {}, 'LIFE EVENTS'),
    h('p', { class: 'alius-hint' }, 'Soldiers have days of their own: hobbies, opinions and things that happen off-screen. Nothing is announced; it reaches the commander through talk, messages and notes.'),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:setting_life_events') }, h('span', { class: 'alius-field-label' }, 'How often'), select),
    h('p', { class: 'alius-dim', 'data-life-text': current }, TEXT[current])));
}
