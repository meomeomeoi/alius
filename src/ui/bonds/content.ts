import type { Registries } from '../../content/types';
import { analyzeNative } from '../analyze/mark';
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
        return h('button', {
          type: 'button', class: 'alius-card alius-option alius-content-category', 'data-category': id, 'aria-pressed': String(on),
          ...analyzeNative(`contentCategories:${id}`),
          onclick: () => ctx.onChange(categories.map((x) => String(x.id)).filter((x) => (x === id ? !on : enabled.includes(x)))),
        }, h('strong', {}, String(c.label)), ' ', h('span', { class: 'alius-lock' }, on ? 'ON' : 'OFF'), h('p', {}, String(c.description)));
      }))));
}
