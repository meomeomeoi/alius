import type { Registries } from '../content/types';
import { bondOf, enabledCategories } from '../engine/bonds';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';

// The non-engine layer of P9d (like `src/discipline/`): it turns engine state into the lines the main model reads.
// Directive ids owned here: `content` (manual), `limits:<unitId>` (scene). Later tasks add `lead`, `want:`, `rule:`,
// `publicity:` and `co_command:`, each cleared by the function that sets it.

/** The one category id the directive reads by name: the old single "explicit scenes" switch became this category. */
export const EXPLICIT_CATEGORY = 'explicit_scenes';

const orderedCategories = (reg: Registries) => [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order));
const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * What every main-model generation is told about content: the categories that are off (never to appear) and what is said
 * about explicit scenes. Empty when nothing is excluded and `explicit_scenes` is not enabled. With no campaign: empty.
 */
export function contentLine(state: Pick<CampaignState, 'content'> | null, reg: Registries): string {
  if (state === null) return '';
  const on = enabledCategories(state);
  const off = orderedCategories(reg).filter((c) => !on.includes(String(c.id)));
  const parts: string[] = [];
  if (off.length > 0) parts.push(`Content excluded from this story — never depict, imply or describe: ${off.map((c) => String(c.label)).join(', ')}.`);
  if (on.includes(EXPLICIT_CATEGORY)) parts.push('Explicit intimate scenes are allowed when the story leads there.');
  else if (reg.contentCategories.has(EXPLICIT_CATEGORY)) parts.push('Fade out intimate moments.');
  return parts.join(' ');
}

/**
 * Sets or clears the directives this layer owns from the state; the app calls it with every `applyContext()`, so a change
 * of categories reaches the next generation. With no campaign (`null`) it clears them all.
 */
export function bondsDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith('limits:'));
  const line = contentLine(state, reg);
  if (line === '' || state === null) builder.clearDirective('content');
  else builder.setDirective({ id: 'content', expiresAfter: 'manual', text: line });
  if (state === null || !state.scene) return;

  // her own limits: from her card, they hold whether or not the category is switched on
  const labelOf = (id: string) => String(reg.contentCategories.get(id)?.label ?? id);
  for (const id of state.scene.participants) {
    const unit = state.squad.find((u) => u.id === id);
    const bond = unit ? bondOf(unit) : null;
    if (!unit || !bond) continue;
    const categories = [...new Set(bond.ownLimits.categories)].filter((c) => reg.contentCategories.has(c));
    const ordered = orderedCategories(reg).map((c) => String(c.id)).filter((c) => categories.includes(c));
    const note = clean(bond.ownLimits.note ?? '');
    if (ordered.length === 0 && note === '') continue;
    const text = ordered.length > 0
      ? `${unit.displayName} will not take part in: ${ordered.map(labelOf).join(', ')}.${note !== '' ? ` ${note}` : ''}`
      : `${unit.displayName} has a personal limit: ${note}`;
    builder.setDirective({ id: `limits:${id}`, expiresAfter: 'scene', text });
  }
}
