import type { Registries } from '../../content/types';
import type { CampaignState, SceneRecord } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { drawSiteReroll, type GenerationUi } from '../generation/surface';

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
    }, '[ REGENERATE ]'));
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
    chip('follow', '[ FOLLOW ]', () => handlers.follow(), scene.followed === true),
    chip('ask', '[ ASK ]', () => handlers.ask()),
    chip('limit', '[ SET A LIMIT ]', () => { field.open = !field.open; redraw(); }));
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
  host.append(h('div', { class: 'alius-lead-limit' }, input, ' ', chip('limit-set', '[ SET ]', send)));
}

export interface RuleChipHandlers {
  accept(ruleId: string): void;
  negotiate(ruleId: string): void;
  refuse(ruleId: string): void;
  /** P14: REROLL of the rule's wording before an answer. Absent = none drawn. */
  generation?: GenerationUi;
}

/**
 * The proposals of leading partners waiting for an answer (P9d): `{NAME} PROPOSES A RULE: text` with [ACCEPT] [NEGOTIATE] [REFUSE].
 * Drawn from the state alone, only for delivered proposals of the units `pick` accepts. [ACCEPT] is soft-disabled (`aria-disabled`)
 * while she already holds the most rules a unit may. Text only.
 */
export function drawRuleChips(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, on: RuleChipHandlers): void {
  host.replaceChildren();
  for (const rule of state.bonds?.rules ?? []) {
    if (rule.status !== 'proposed' || rule.delivered !== true || !pick({ unitId: rule.unitId })) continue;
    const name = (state.squad.find((u) => u.id === rule.unitId)?.displayName ?? rule.unitId).toUpperCase();
    const full = state.bonds!.rules.filter((r) => r.unitId === rule.unitId && r.status === 'active').length >= TUNING.bonds.rules.maxActive;
    const button = (kind: 'accept' | 'negotiate' | 'refuse', text: string, run: () => void, soft = false): HTMLElement => {
      const b = h('button', {
        type: 'button', class: 'alius-btn alius-tagchip', 'data-rule-answer': kind, 'data-rule': rule.id,
        ...(soft ? { 'aria-disabled': 'true', title: `She holds ${TUNING.bonds.rules.maxActive} rules already.` } : {}), ...analyzeNative('glossary:relationship_rules'),
        onclick: () => { if (b.getAttribute('aria-disabled') !== 'true') run(); },
      }, text);
      return b;
    };
    host.append(h('div', { class: 'alius-chip-group', 'data-rule-group': rule.id },
      h('span', { class: 'alius-chip', 'data-rule': rule.id, ...analyzeAttrs(`relationshipRuleTemplates:${rule.templateId}`, { unitId: rule.unitId, ruleId: rule.id }) }, `${name} PROPOSES A RULE: ${rule.text}`),
      button('accept', '[ ACCEPT ]', () => on.accept(rule.id), full),
      button('negotiate', '[ NEGOTIATE ]', () => on.negotiate(rule.id)),
      button('refuse', '[ REFUSE ]', () => on.refuse(rule.id)),
      on.generation ? drawSiteReroll(h('span'), on.generation, 'flavor.rule', rule.id) : null));
  }
}
