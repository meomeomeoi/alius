import type { Registries } from '../../content/types';
import { argueAvailable, wardenOf, wardenOverrideOpen, type Expectation } from '../../engine/warden';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export type OverrideAnswer = 'comply' | 'argue' | 'defy';

/** What she expects, in words: a personal expectation's own text, else the registry's label for its kind. Read by kind, never by id. */
export function expectationLabel(reg: Registries, x: Expectation): string {
  if (x.kind === 'personal') return x.text ?? 'Something personal';
  return String([...reg.wardenExpectations.values()].find((e) => e.kind === x.kind)?.label ?? x.kind);
}

/**
 * The warden's override as a chip: `WARDEN OVERRIDE — {what she wants instead}` and [COMPLY] [ARGUE] [DEFY]. It names the expectation
 * she cited (an override teaches it). While the commander is compelled only COMPLY is open; ARGUE is also closed once she has heard
 * the commander out, in a run, and when a scene cannot open. A closed button is `aria-disabled`, never removed. Appends nothing when
 * no override is open.
 */
export function renderOverrideChip(host: HTMLElement, state: CampaignState, reg: Registries, onAnswer: (answer: OverrideAnswer) => void): void {
  const o = wardenOverrideOpen(state);
  const w = wardenOf(state);
  if (!o || !w) return;
  const cited = w.expectations.find((x) => x.id === o.expectationId);
  const compelled = w.compelled === true;
  const canArgue = !compelled && (o.context === 'combat' ? true : argueAvailable(state));
  const button = (answer: OverrideAnswer, label: string, open: boolean, why: string): HTMLElement =>
    h('button', {
      type: 'button', class: 'alius-btn alius-option alius-override-answer', 'data-action': `override-${answer}`, 'aria-disabled': open ? null : 'true',
      title: open ? null : why, ...analyzeNative('glossary:warden_override'),
      onclick: () => { if (open) onAnswer(answer); },
    }, label);
  host.append(h('div', { class: 'alius-chips alius-warden-override', 'data-override': o.id },
    h('span', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:warden_override') }, `WARDEN OVERRIDE — ${o.altLabel}`),
    cited ? h('span', { class: 'alius-dim alius-override-cause' }, `She expects: ${expectationLabel(reg, cited)}`) : null,
    h('span', { class: 'alius-row' },
      button('comply', '[ COMPLY ]', true, ''),
      button('argue', '[ ARGUE ]', canArgue, compelled ? 'The commander is compelled: only COMPLY is open.' : 'There is nothing left to argue here.'),
      button('defy', '[ DEFY ]', !compelled, 'The commander is compelled: only COMPLY is open.'))));
}
