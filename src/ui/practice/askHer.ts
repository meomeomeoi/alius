import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { choiceOpen, herChooser, herPickFor, preselects, type AskedContext, type AskedIndex } from '../../engine/practice/askHer';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What a choice card knows of her pick: who is asked, whether she was, her pick (`undefined` before she is asked) and whether she pre-selects (frame `rule` with the command). */
export interface AskHerView {
  holderId: string;
  name: string;
  context: AskedContext;
  ref: string;
  asked: boolean;
  index?: AskedIndex;
  preselected: boolean;
}

/**
 * The view of ASK HER for the card that is open (P16, plan R22, R24): the one who holds the commander most, her pick when the commander asked her (read from `practices.asked`) or when she pre-selects (computed now: the
 * engine keeps no record until a choice is made). `null` while nothing is open, the dynamic is off or nobody holds the commander: the card is drawn as it always was. Reads only.
 */
export function askHerView(state: CampaignState, reg: Registries, context: AskedContext, ref: string): AskHerView | null {
  if (!dynamicOn(state, reg) || !choiceOpen(state, context, ref)) return null;
  const holderId = herChooser(state, reg);
  if (holderId === null) return null;
  const name = state.squad.find((u) => u.id === holderId)?.displayName ?? holderId;
  const rec = state.practices?.asked;
  if (rec !== undefined && rec.context === context && rec.ref === ref) return { holderId, name, context, ref, asked: true, index: rec.index, preselected: rec.preselected === true };
  if (preselects(state, reg, holderId)) return { holderId, name, context, ref, asked: false, index: herPickFor(state, reg, holderId, context, ref), preselected: true };
  return { holderId, name, context, ref, asked: false, preselected: false };
}

/** Her pick as an option index of a card (a vote's `for` / `against` is read by the vote panel); `null` while there is none. */
export const pickIndex = (view: AskHerView | null | undefined): number | null => (view !== null && view !== undefined && (view.asked || view.preselected) && typeof view.index === 'number' ? view.index : null);

/** What the note under the chip says once she was asked. */
export function askHerNote(view: AskHerView): string | null {
  if (!view.asked && !view.preselected) return null;
  if (view.index === null) return 'She leaves it to the commander.';
  if (view.index === 'for') return 'She would carry it out.';
  if (view.index === 'against') return 'She would drop it.';
  return view.index === undefined ? null : 'Her pick is marked.';
}

/** The chip `[ ASK HER ]` (before she is asked and when she does not pre-select) and, after, one line of what she answered. Nothing for no view. */
export function drawAskHer(host: HTMLElement, view: AskHerView | null | undefined, onAsk: (() => void) | undefined): void {
  host.replaceChildren();
  if (view === null || view === undefined) return;
  const live = { unitId: view.holderId };
  if (!view.asked && !view.preselected && onAsk !== undefined) {
    host.append(h('button', { type: 'button', class: 'alius-btn alius-chip', 'data-action': 'ask-her', 'data-unit': view.holderId, ...analyzeNative('glossary:ask_her', live), onclick: () => onAsk() }, '[ ASK HER ]'));
    return;
  }
  const note = askHerNote(view);
  if (note !== null) host.append(h('p', { class: 'alius-askher-note alius-dim', 'data-askher-note': '', ...analyzeAttrs('glossary:ask_her', live) }, note));
}

/**
 * She pre-selects (frame `rule` with the command): the card shows only her pick, with `[ CONFIRM ]` and `[ DEFY ]`. CONFIRM chooses it; DEFY opens the other options (choosing one of them costs what
 * defying her costs). Returns the element for the card to place.
 */
export function renderPreselected(view: AskHerView, label: string, handlers: { onConfirm: () => void; onDefy: () => void }): HTMLElement {
  const live = { unitId: view.holderId };
  return h('div', { class: 'alius-askher-preselected', 'data-askher-preselected': view.holderId },
    h('p', { class: 'alius-askher-choice' }, `${view.name} has chosen: ${label}`),
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'confirm-her', ...analyzeNative('glossary:ask_her', live), onclick: () => handlers.onConfirm() }, '[ CONFIRM ]'),
    h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'defy-her', ...analyzeNative('glossary:ask_her', live), onclick: () => handlers.onDefy() }, '[ DEFY ]'));
}
