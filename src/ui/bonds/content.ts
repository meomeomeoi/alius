import type { Registries } from '../../content/types';
import { analyzeNative } from '../analyze/mark';
import { categoryRequires, withRequirements } from '../../engine/bonds/content';
import { h } from '../dom';

export interface ContentSectionCtx {
  /** The ids switched on now. */
  enabled: readonly string[];
  registries: Registries;
  /** The whole new list (registry order) after a toggle. */
  onChange: (enabled: string[]) => void;
  /** The heading; default is the setup copy (SYS has its own, shorter heading). */
  title?: string;
}

/** The heading copy of the setup screen: it is also the consent line, so it is shown whole. */
export const CONTENT_TITLE = 'CONTENT — nothing here appears unless you turn it on. Turning it on is your consent for the story to go there.';

/**
 * The CONTENT section (P9d), shared by the new-campaign setup and SYS: one toggle per content category with its description.
 * Every category is off until the player turns it on. Text only (`h` / `textContent`). A plain meta screen: no fiction voice.
 */
export function renderContentSection(host: HTMLElement, ctx: ContentSectionCtx): void {
  const { registries: reg, enabled } = ctx;
  const categories = [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order));
  host.replaceChildren(h('div', { class: 'alius-content-section' },
    h('h3', {}, ctx.title ?? CONTENT_TITLE),
    categories.length === 0
      ? h('p', { class: 'alius-dim' }, 'This content pack has no content categories.')
      : h('div', { class: 'alius-cards alius-content-categories' }, ...categories.map((c) => {
        const id = String(c.id);
        const on = enabled.includes(id);
        // P15a: a category that needs another is soft-disabled (`aria-disabled`, still analyzable) while that one is off
        const missing = categoryRequires(reg, id).filter((r) => !enabled.includes(r));
        const reason = missing.length > 0 ? `needs ${missing.map((r) => String(reg.contentCategories.get(r)?.label ?? r)).join(', ')}` : '';
        const blocked = !on && reason !== '';
        return h('button', {
          type: 'button', class: 'alius-card alius-option alius-content-category', 'data-category': id, 'aria-pressed': String(on),
          'aria-disabled': blocked ? 'true' : null, title: blocked ? reason : null,
          ...analyzeNative(`contentCategories:${id}`),
          onclick: () => {
            if (blocked) return;
            ctx.onChange(withRequirements(reg, categories.map((x) => String(x.id)).filter((x) => (x === id ? !on : enabled.includes(x)))));
          },
        }, h('strong', {}, String(c.label)), ' ', h('span', { class: 'alius-lock' }, on ? 'ON' : 'OFF'), blocked ? h('span', { class: 'alius-dim' }, ` ${reason}`) : null, h('p', {}, String(c.description)));
      }))));
}
