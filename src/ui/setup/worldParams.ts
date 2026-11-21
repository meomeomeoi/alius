import type { Registries } from '../../content/types';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { renderContentSection } from '../bonds/content';
import { renderModeSection } from '../warden/modeSection';
import { renderDevelopmentSection } from './developmentStep';
import { renderLifeSection } from './lifeStep';
import { renderHeadStartSection } from './headStart';
import { h } from '../dom';

/** More choices than this are drawn as a slider instead of cards. */
const MAX_CARDS = 6;

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

  /** A long scale (more than `MAX_CARDS` choices) is one slider over the choices, in order. */
  const scale = (o: (typeof options)[number], chosen: string): HTMLElement => {
    const choices = o.choices as Array<{ id: string; label: string }>;
    const at = Math.max(0, choices.findIndex((c) => c.id === chosen));
    const shown = h('span', { class: 'alius-slider-value', 'data-option-value': o.id }, choices[at].label);
    const input = h('input', { type: 'range', min: '0', max: String(choices.length - 1), step: '1', value: String(at), 'data-option': o.id }) as HTMLInputElement;
    input.addEventListener('input', () => (shown.textContent = choices[Math.round(Number(input.value))]?.label ?? '')); // live label while dragging
    input.addEventListener('change', () => wizard.setWorldOption(o.id, choices[Math.round(Number(input.value))].id)); // commit on release / key step
    return h('label', { class: 'alius-slider alius-option', 'data-option': o.id, ...analyzeNative(`worldOptions:${o.id}`, { choice: chosen }) },
      h('span', { class: 'alius-slider-label' }, String(o.label)), input, shown);
  };

  const optionBlock = (o: (typeof options)[number]): HTMLElement => {
    const live = o.live === true;
    const chosen = world.options[o.id] ?? String(o.default);
    return h('div', { class: 'alius-world-option', 'data-option': o.id },
      h('div', { class: 'alius-world-head' },
        h('h4', {}, String(o.label)),
        h('span', { class: 'alius-lock', 'data-live': String(live), title: live ? 'This option can be changed during the campaign.' : 'This option is fixed when the campaign starts.' },
          live ? 'CHANGEABLE LATER' : 'LOCKED AT START')),
      h('p', { class: 'alius-dim' }, String(o.description)),
      (o.choices as unknown[]).length > MAX_CARDS ? scale(o, chosen) : h('div', { class: 'alius-cards' }, ...(o.choices as Array<{ id: string; label: string; description: string }>).map((c) =>
        h('button', {
          type: 'button', class: 'alius-card alius-option alius-world-choice', 'data-option': o.id, 'data-id': c.id,
          'aria-pressed': String(chosen === c.id), ...analyzeNative(`worldOptions:${o.id}`, { choice: c.id }),
          onclick: () => wizard.setWorldOption(o.id, c.id),
        }, h('strong', {}, c.label), h('p', {}, c.description)))));
  };

  const modeHost = h('div', { class: 'alius-world-mode' });
  renderModeSection(modeHost, wizard); // P13: DEFAULT or LEASHSWAP
  const headStartHost = h('div', { class: 'alius-world-head-start' });
  renderHeadStartSection(headStartHost, wizard); // P11b: how long the squad has known the commander
  const developmentHost = h('div', { class: 'alius-world-development' });
  renderDevelopmentSection(developmentHost, wizard); // P14b: how fast soldiers change
  const lifeHost = h('div', { class: 'alius-world-life' });
  renderLifeSection(lifeHost, wizard); // P14c: how often her days off-screen bring something
  const contentHost = h('div', { class: 'alius-section alius-world-content' });
  renderContentSection(contentHost, { enabled: wizard.state.content.enabled, registries: reg, onChange: (enabled) => wizard.setContent(enabled) });
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
    modeHost,
    headStartHost,
    developmentHost,
    lifeHost,
    contentHost,
    h('section', { class: 'alius-section alius-world-summary' },
      h('h3', {}, 'WHAT THIS CHANGES'),
      summary.length === 0
        ? h('p', { class: 'alius-dim' }, 'Nothing differs from the default world.')
        : h('ul', {}, ...summary.map((line) => h('li', {}, line))))));
}
