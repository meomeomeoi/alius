import type { Registries } from '../../content/types';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface WorldParamsCtx {
  wizard: Wizard;
  registries: Registries;
}

/**
 * The WORLD PARAMETERS step (P8 §4): options grouped by their `group`, a choice card per choice, preset buttons, a lock
 * marker on every option and a "What this changes" list built from the descriptions, never from numbers. It is a meta
 * screen: plain labels, no fiction voice.
 */
export function renderWorldParams(host: HTMLElement, ctx: WorldParamsCtx): void {
  const { wizard, registries: reg } = ctx;
  const world = wizard.state.world;
  host.replaceChildren();

  const options = [...reg.worldOptions.values()];
  const groups: string[] = [];
  for (const o of options) if (!groups.includes(String(o.group))) groups.push(String(o.group));

  const optionBlock = (o: (typeof options)[number]): HTMLElement => {
    const live = o.live === true;
    const chosen = world.options[o.id] ?? String(o.default);
    return h('div', { class: 'alius-world-option', 'data-option': o.id },
      h('div', { class: 'alius-world-head' },
        h('h4', {}, String(o.label)),
        h('span', { class: 'alius-lock', 'data-live': String(live), title: live ? 'This option can be changed during the campaign.' : 'This option is fixed when the campaign starts.' },
          live ? 'CHANGEABLE LATER' : 'LOCKED AT START')),
      h('p', { class: 'alius-dim' }, String(o.description)),
      h('div', { class: 'alius-cards' }, ...(o.choices as Array<{ id: string; label: string; description: string }>).map((c) =>
        h('button', {
          type: 'button', class: 'alius-card alius-option alius-world-choice', 'data-option': o.id, 'data-id': c.id,
          'aria-pressed': String(chosen === c.id), ...analyzeNative(`worldOptions:${o.id}`, { choice: c.id }),
          onclick: () => wizard.setWorldOption(o.id, c.id),
        }, h('strong', {}, c.label), h('p', {}, c.description)))));
  };

  const summary = wizard.worldSummary();
  host.append(h('div', { class: 'alius-setup-body alius-world' },
    h('h3', {}, 'WORLD PARAMETERS'),
    h('p', { class: 'alius-hint' }, 'Set the world before the campaign starts. Locked options cannot be changed afterwards. Pick a preset and adjust any option.'),
    h('div', { class: 'alius-presets' }, ...[...reg.worldPresets.values()].map((p) =>
      h('button', {
        type: 'button', class: 'alius-btn alius-option alius-world-preset', 'data-id': p.id, 'aria-pressed': String(world.preset === p.id),
        title: String(p.description), ...analyzeNative(`worldPresets:${p.id}`), onclick: () => wizard.applyPreset(String(p.id)),
      }, String(p.name)))),
    ...groups.flatMap((g) => [
      h('h3', {}, g.toUpperCase()),
      ...options.filter((o) => String(o.group) === g).map(optionBlock),
    ]),
    h('section', { class: 'alius-section alius-world-summary' },
      h('h3', {}, 'WHAT THIS CHANGES'),
      summary.length === 0
        ? h('p', { class: 'alius-dim' }, 'Nothing differs from the default world.')
        : h('ul', {}, ...summary.map((line) => h('li', {}, line))))));
}
