import type { Registries } from '../../content/types';
import type { SceneRecord } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
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

export interface LeadChipHandlers {
  follow(): void;
  ask(): void;
  limit(text: string): void;
}

/** Whether the SET A LIMIT field is open and what is typed in it, per chip row (a redraw must not close or empty it). */
const limitField = new WeakMap<HTMLElement, { open: boolean; text: string }>();

/**
 * The quick chips of a scene that has a lead (P9d §3): [FOLLOW] [ASK] [SET A LIMIT]. They show only while `scene.lead` exists;
 * FOLLOW is soft-disabled (`aria-disabled`, still analyzable) once used in the scene; SET A LIMIT opens a text field of at most
 * 160 characters. `disabled` locks every button while a send is pending. Text only.
 */
export function drawLeadChips(host: HTMLElement, scene: Pick<SceneRecord, 'lead' | 'followed'> | undefined, handlers: LeadChipHandlers, disabled = false): void {
  host.replaceChildren();
  if (!scene?.lead) {
    limitField.delete(host);
    return;
  }
  const field = limitField.get(host) ?? { open: false, text: '' };
  limitField.set(host, field);
  const redraw = () => drawLeadChips(host, scene, handlers, disabled);
  const chip = (kind: string, label: string, onclick: () => void, soft = false) => h('button', {
    type: 'button', class: 'alius-btn alius-option', 'data-lead-chip': kind, 'data-action': `lead-${kind}`, disabled,
    'aria-disabled': soft ? 'true' : null, ...analyzeNative('glossary:lead'), onclick: () => { if (!soft) onclick(); },
  }, label);
  const row = h('div', { class: 'alius-lead-chips' },
    chip('follow', '[FOLLOW]', () => handlers.follow(), scene.followed === true),
    chip('ask', '[ASK]', () => handlers.ask()),
    chip('limit', '[SET A LIMIT]', () => { field.open = !field.open; redraw(); }));
  host.append(row);
  if (!field.open) return;
  const input = h('input', { type: 'text', class: 'alius-input', 'data-key': 'lead-limit', maxlength: String(TUNING.bonds.limits.sceneLimitMax), 'aria-label': 'A boundary for this scene', disabled }) as HTMLInputElement;
  input.value = field.text;
  input.addEventListener('input', () => { field.text = input.value; });
  input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); send(); } });
  const send = (): void => {
    const text = input.value.trim();
    if (text === '') return;
    field.open = false;
    field.text = '';
    handlers.limit(text);
    redraw();
  };
  host.append(h('div', { class: 'alius-lead-limit' }, input, ' ', chip('limit-set', '[SET]', send)));
}
