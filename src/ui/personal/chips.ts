import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { unitAccent } from '../voice/voiceCard';

/** A DM edit that waits for KEEP or REVERT (what `PersonalController.pendingEdit` returns). */
export interface EditView {
  id: string;
  editorId: string;
  toUnitId: string;
  original: string;
  edited: string;
}

/** `EDITED BY {NAME}` with [KEEP] and [REVERT]: the commander keeps the edit (it is sent) or reverts it (defiance toward her). Text only. */
export function editChip(edit: EditView, name: string, onKeep: () => void, onRevert: () => void): HTMLElement {
  const group = h('div', { class: 'alius-edit alius-chip-group', 'data-edit': edit.id },
    h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:device_access', { unitId: edit.editorId }) }, `EDITED BY ${name.toUpperCase()}`),
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'keep', onclick: onKeep }, '[KEEP]'),
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'revert', onclick: onRevert }, '[REVERT]'));
  group.style.setProperty('--unit-accent', unitAccent(edit.editorId));
  return group;
}
