import type { Registries } from '../../content/types';
import { holderAgenda } from '../../engine/dynamic/command';
import { argueAvailable, openOverrideOf, wardenOf, wardenOverrideOpen, type Expectation } from '../../engine/warden';
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
 * A holder's override (P15): `{NAME} OVERRIDES — {what she wants instead}` and [COMPLY] [ARGUE] [DEFY]. Names what she expects when the agenda she
 * has still holds the expectation cited. There is no compulsion for a holder, so only ARGUE can be closed (once she has heard the commander out, in a
 * run, or when a scene cannot open): `aria-disabled`, never removed.
 */
function renderHolderChip(host: HTMLElement, state: CampaignState, reg: Registries, o: NonNullable<ReturnType<typeof openOverrideOf>>, onAnswer: (answer: OverrideAnswer) => void): void {
  const name = state.squad.find((u) => u.id === o.unitId)?.displayName ?? 'She';
  const live = { unitId: o.unitId };
  const cited = holderAgenda(state, reg, o.unitId).find((x) => x.id === o.expectationId);
  const canArgue = o.context === 'combat' ? true : argueAvailable(state);
  const button = (answer: OverrideAnswer, label: string, open: boolean): HTMLElement =>
    h('button', {
      type: 'button', class: 'alius-btn alius-option alius-override-answer', 'data-action': `override-${answer}`, 'aria-disabled': open ? null : 'true',
      title: open ? null : 'There is nothing left to argue here.', ...analyzeNative('glossary:holder_override', live),
      onclick: () => { if (open) onAnswer(answer); },
    }, label);
  host.append(h('div', { class: 'alius-chips alius-warden-override alius-holder-override', 'data-override': o.id },
    h('span', { class: 'alius-chip alius-stat', ...analyzeAttrs('glossary:holder_override', live) }, `${name.toUpperCase()} OVERRIDES — ${o.altLabel}`),
    cited ? h('span', { class: 'alius-dim alius-override-cause' }, `She expects: ${expectationLabel(reg, cited)}`) : null,
    h('span', { class: 'alius-row' }, button('comply', '[ COMPLY ]', true), button('argue', '[ ARGUE ]', canArgue), button('defy', '[ DEFY ]', true))));
}

/**
 * The open override as a chip. The warden's: `WARDEN OVERRIDE — {what she wants instead}` and [COMPLY] [ARGUE] [DEFY]. It names the expectation
 * she cited (an override teaches it). While the commander is compelled only COMPLY is open; ARGUE is also closed once she has heard
 * the commander out, in a run, and when a scene cannot open. A closed button is `aria-disabled`, never removed. Appends nothing when
 * no override is open.
 */
export function renderOverrideChip(host: HTMLElement, state: CampaignState, reg: Registries, onAnswer: (answer: OverrideAnswer) => void): void {
  const open = openOverrideOf(state);
  if (open !== null && open.source === 'holder') {
    renderHolderChip(host, state, reg, open, onAnswer);
    return;
  }
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
