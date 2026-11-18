import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { flickersOf, vitalsOf, type HeartBand, type TempBand, type VitalsPattern } from '../../engine/vitals';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { renderTrace } from './trace';

export { tracePoints } from './trace';

/** Illustrative texts per band: fixed words, never a function of stress, Want or a ledger amount (overview P12). */
export const HEART_TEXT: Record<HeartBand, string> = { low: 'HR 48–56', resting: 'HR 60–70', raised: 'HR 85–100', racing: 'HR 120+' };
export const TEMP_TEXT: Record<TempBand, string> = { cool: 'TEMP 35.9°', normal: 'TEMP 36.6°', warm: 'TEMP 37.2°', fever: 'TEMP 38.4°' };
const PATTERN_LABEL: Record<VitalsPattern, string> = { steady: 'STEADY', elevated: 'ELEVATED', spiking: 'SPIKING', flat: 'FLAT LINE', erratic: 'ERRATIC' };

/** `DAY 005 MORNING`, the log's wording. */
const logLine = (day: number, slot: string): string => `DAY ${String(day).padStart(3, '0')} ${slot.toUpperCase()}`;

/** The key of a unit's trace: the same state draws the same line. */
const seedOf = (state: CampaignState, unitId: string): string => `${unitId}|${state.day}|${state.slot}|`;

/**
 * One soldier's VITALS block (SQUAD dossier): the trace, the pattern chip, HR and TEMP, and for a flat unit the log of her
 * flickers. `null` for a grunt or a unit who is gone.
 */
export function renderVitalsBlock(state: CampaignState, reg: Registries, unitId: string, opts: { motion: boolean }): HTMLElement | null {
  const v = vitalsOf(state, reg, unitId);
  if (!v) return null;
  const live = { unitId };
  const chip = (text: string, address = 'glossary:vitals'): HTMLElement => h('span', { class: 'alius-chip', ...analyzeAttrs(address, live) }, text);
  const flat = v.pattern === 'flat';
  const log = flat ? flickersOf(state, unitId) : [];
  return h(
    'div', { class: 'alius-vitals', 'data-pattern': v.pattern, 'data-vitals': unitId },
    h('h4', {}, 'VITALS'),
    renderTrace(v.pattern, seedOf(state, unitId), { motion: opts.motion, flicker: v.flicker, label: `Vitals trace: ${PATTERN_LABEL[v.pattern].toLowerCase()}` }),
    h(
      'p', { class: 'alius-vitals-chips' },
      chip(`VITALS: ${PATTERN_LABEL[v.pattern]}`, flat ? 'glossary:vitals_flat' : 'glossary:vitals'),
      ' ', chip(HEART_TEXT[v.heart]), ' ', chip(TEMP_TEXT[v.temp]),
      v.flicker ? h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:vitals_flicker', live) }, ' FLICKER LOGGED') : null,
    ),
    log.length > 0
      ? h('ul', { class: 'alius-vitals-log', 'aria-label': 'Logged flickers' }, ...log.map((e) => h('li', { class: 'alius-stat', ...analyzeAttrs('glossary:vitals_flicker', live) }, logLine(e.day, e.slot))))
      : null,
  );
}

/** The hub's side strip: one small trace and a name per named living soldier. `null` when nobody qualifies. */
export function renderVitalsStrip(state: CampaignState, reg: Registries, opts: { motion: boolean }): HTMLElement | null {
  const rows = state.squad.flatMap((u) => {
    const v = vitalsOf(state, reg, u.id);
    if (!v) return [];
    return [h(
      'li', { class: 'alius-vitals-row alius-stat', 'data-pattern': v.pattern, ...analyzeAttrs('glossary:vitals', { unitId: u.id }) },
      h('span', { class: 'alius-vitals-name' }, u.displayName),
      renderTrace(v.pattern, seedOf(state, u.id), { motion: opts.motion, flicker: v.flicker, label: `${u.displayName}: ${PATTERN_LABEL[v.pattern].toLowerCase()}` }),
      h('span', { class: 'alius-dim alius-vitals-word' }, PATTERN_LABEL[v.pattern]),
    )];
  });
  if (rows.length === 0) return null;
  return h('section', { class: 'alius-vitals-strip', 'aria-label': 'Squad vitals' }, h('h2', {}, 'VITALS'), h('ul', {}, ...rows));
}
