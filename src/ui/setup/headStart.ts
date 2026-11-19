import type { HeadStartDays } from '../../engine/setup';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What each head start is called in the wizard (AUTHOR TO WRITE: plain meta text, no pronoun for the commander). */
export const HEAD_START_LABEL: Record<HeadStartDays, string> = { 0: 'ARRIVAL', 7: 'ONE WEEK', 14: 'TWO WEEKS', 30: 'ONE MONTH' };
const TEXT: Record<HeadStartDays, string> = {
  0: 'Day 1 is the first meeting: everyone meets the commander today.',
  7: 'The squad has known the commander for seven days.',
  14: 'The squad has known the commander for two weeks.',
  30: 'The squad has known the commander for a month.',
};
const DAYS: HeadStartDays[] = [0, 7, 14, 30];

/**
 * The HEAD START section of the WORLD PARAMETERS step (P11b §1): arrival, one week, two weeks or one month. Present in both wizard
 * modes. Redrawn with the screen.
 */
export function renderHeadStartSection(host: HTMLElement, wizard: Wizard): void {
  const current = wizard.state.headStart.days;
  host.append(h('section', { class: 'alius-section alius-head-start' },
    h('h3', {}, 'HEAD START'),
    h('p', { class: 'alius-hint' }, 'The squad has already met the commander: first impressions have settled, a few remember moments, some may know the crime. No missions, time or progress are skipped.'),
    h('div', { class: 'alius-cards' }, ...DAYS.map((d) =>
      h('button', {
        type: 'button', class: 'alius-card alius-option alius-head-start-choice', 'data-days': String(d), 'aria-pressed': String(current === d),
        ...analyzeNative('glossary:head_start'), onclick: () => wizard.setHeadStart(d),
      }, h('strong', {}, HEAD_START_LABEL[d]), h('p', {}, TEXT[d]))))));
}

/** The NEW ARRIVAL toggles of the UNITS step: one per chosen unit, only while a head start is set. */
export function renderNewArrivals(host: HTMLElement, wizard: Wizard): void {
  const s = wizard.state;
  if (s.headStart.days === 0 || s.units.length === 0) return;
  host.append(h('section', { class: 'alius-section alius-new-arrivals' },
    h('h4', {}, 'NEW ARRIVAL'),
    h('p', { class: 'alius-dim' }, 'A new arrival reaches the base today and meets the commander for the first time. At least one soldier must already know the commander.'),
    h('div', { class: 'alius-row' }, ...s.units.map((u) =>
      h('button', {
        type: 'button', class: 'alius-btn alius-option alius-new-arrival', 'data-avatar': u.avatar, 'aria-pressed': String(s.headStart.newArrivals.includes(u.avatar)),
        ...analyzeNative('glossary:new_arrival'), onclick: () => wizard.toggleNewArrival(u.avatar),
      }, u.displayName)))));
}
