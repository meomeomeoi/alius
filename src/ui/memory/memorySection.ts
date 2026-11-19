import { MEMORY_NUMERIC_FIELDS, memoryConfig, MEMORY_RANGES, OWN_MEMORY_FIELDS, type MemoryNumericField } from '../../engine/memory/config';
import type { CampaignState, MemoryPreset } from '../../engine/state/types';
import type { BuildStats } from '../../llm/context';
import type { AliusSettings } from '../../settings';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { renderFill } from './fill';

export interface MemorySectionCtx {
  state: CampaignState;
  settings: AliusSettings;
  dispatch: (action: { type: string; payload?: unknown }) => Array<{ type: string; [k: string]: unknown }>;
  lastBuild: () => BuildStats;
  /** Called after the engine took a change (the SYS tab draws the section again). */
  onChanged?: () => void;
  toast?: (kind: 'warn', text: string) => void;
}

const PRESETS: MemoryPreset[] = ['short', 'normal', 'long', 'custom'];
const LABEL: Record<MemoryNumericField, string> = {
  factsMax: 'Facts kept before the fold', foldAfterDays: 'A fact may be folded after (days)', recencyBase: 'How fast old facts fade (0.5–0.95)',
  retrievalK: 'Facts told per scene', memoryTokens: 'Memory share of the prompt (tokens)', journalLines: 'Lines of her story with the commander',
  dmLines: 'Recent messages told in a private scene', chronicleDays: 'Days of the chronicle told', hideScenesAfter: 'Hide scenes older than the last N (0 = off)',
  factTextMax: 'Longest text of a fact (characters)',
};
const GLOSSARY: Partial<Record<MemoryNumericField, string>> = { memoryTokens: 'memory_budget', hideScenesAfter: 'hidden_scenes', factTextMax: 'fact_length' };

/**
 * SYS › MEMORY (P3b): the preset, the player's own choices (rumor mode, hiding old scenes), every number of the preset (locked while the
 * mechanics edit lock is on: a number edited from here makes the preset `custom`), a warning when the memory share is over half of the
 * context cap, and the fill indicator. Text only; every value explainable.
 */
export function renderMemorySection(host: HTMLElement, ctx: MemorySectionCtx): void {
  const cfg = memoryConfig(ctx.state);
  const locked = ctx.settings.editLock;
  const send = (payload: Record<string, unknown>): void => {
    const err = ctx.dispatch({ type: 'memory/configure', payload }).find((e) => e.type === 'error');
    if (err) ctx.toast?.('warn', String(err.message ?? 'The memory setting could not be changed.'));
    ctx.onChanged?.();
  };

  const presetButtons = PRESETS.map((p) => h('button', {
    type: 'button', class: 'alius-btn alius-option', 'data-preset': p, 'aria-pressed': String(cfg.preset === p), ...analyzeNative('glossary:memory_preset'),
    onclick: () => send({ preset: p }),
  }, p.toUpperCase()));

  const numberField = (field: MemoryNumericField): HTMLElement => {
    const own = (OWN_MEMORY_FIELDS as readonly string[]).includes(field); // the player's own choice, not a tuning number: never locked
    const [min, max] = MEMORY_RANGES[field];
    const el = h('input', {
      type: 'number', name: `memory:${field}`, class: 'alius-input alius-num', min: String(min), max: String(max), step: field === 'recencyBase' ? '0.05' : '1', value: String(cfg[field]),
      ...(!own && locked ? { 'aria-disabled': 'true' } : {}),
    }) as HTMLInputElement;
    if (!own && locked) el.readOnly = true;
    el.addEventListener('change', () => {
      const n = Number(el.value);
      if ((!own && locked) || !Number.isFinite(n)) {
        el.value = String(cfg[field]);
        return;
      }
      send(own ? { preset: cfg.preset, [field]: n } : { preset: 'custom', [field]: n });
    });
    return h('label', { class: 'alius-field alius-option', ...analyzeNative(`glossary:${GLOSSARY[field] ?? 'memory'}`) }, h('span', { class: 'alius-field-label' }, LABEL[field]), el);
  };

  const mode = h('select', { name: 'memory:rumorMode', class: 'alius-input' },
    h('option', { value: 'plain' }, 'told as it was'), h('option', { value: 'model' }, 'retold by the mechanic model')) as HTMLSelectElement;
  mode.value = cfg.rumorMode;
  mode.addEventListener('change', () => send({ preset: cfg.preset, rumorMode: mode.value }));

  const fillHost = h('div', { class: 'alius-memory-fill-host' });
  renderFill(fillHost, ctx.state, ctx.lastBuild(), ctx.settings);

  host.replaceChildren(h('section', { class: 'alius-section alius-memory' },
    h('h2', {}, '[ MEMORY ]'),
    h('div', { class: 'alius-row alius-memory-presets' }, ...presetButtons),
    ...(cfg.memoryTokens > ctx.settings.contextTokenCap / 2
      ? [h('p', { class: 'alius-dim', 'data-memory-warning': 'true' }, `The memory share (${cfg.memoryTokens} tokens) is more than half of the context cap (${ctx.settings.contextTokenCap}): the rest of the prompt has to fit in what is left.`)]
      : []),
    h('label', { class: 'alius-field alius-option', ...analyzeNative('glossary:squad_rumor') }, h('span', { class: 'alius-field-label' }, 'Rumors'), mode),
    ...OWN_MEMORY_FIELDS.map(numberField),
    h('h3', {}, 'Numbers of the preset'),
    h('div', { class: 'alius-grid' }, ...MEMORY_NUMERIC_FIELDS.filter((f) => !(OWN_MEMORY_FIELDS as readonly string[]).includes(f)).map(numberField)),
    ...(locked ? [h('p', { class: 'alius-dim' }, 'The numbers change with the mechanics edit lock off (Developer).')] : []),
    h('h3', {}, 'Fill'),
    fillHost,
  ));
}
