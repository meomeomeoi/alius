import type { Registries } from '../../content/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** The labels of flagged category ids (an id the registry no longer has shows as itself, as text). */
export function violationLabels(reg: Registries, ids: readonly string[]): string[] {
  return ids.map((id) => String(reg.contentCategories.get(id)?.label ?? id));
}

/**
 * The mark on a reply that depicts content that is switched off (P9d): `⚠ CONTENT` with the category labels and, when the
 * reply can be regenerated, a [REGENERATE] button (`disabled` while a send is pending). Text only (`textContent` / `h`). Appends to `host` and returns the chip.
 */
export function drawViolation(host: HTMLElement, labels: readonly string[], onRegenerate?: () => void, disabled = false): HTMLElement {
  const chip = h('span', { class: 'alius-chip alius-violation', 'data-violation': labels.join(','), role: 'note', ...analyzeAttrs('glossary:content_categories') });
  chip.append(h('span', { class: 'alius-violation-text' }, `⚠ CONTENT: ${labels.join(', ')}`));
  if (onRegenerate) {
    chip.append(' ', h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': 'regenerate-violation', 'aria-label': 'Regenerate this reply',
      disabled, ...analyzeNative('glossary:content_categories'), onclick: onRegenerate,
    }, '[REGENERATE]'));
  }
  host.append(chip);
  return chip;
}
