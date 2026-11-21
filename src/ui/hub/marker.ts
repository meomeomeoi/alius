import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../../engine/state/types';
import { hubLine } from '../../engine/life/known';
import { analyzeAttrs } from '../analyze/mark';
import { h } from '../dom';
import { markerTone, TONE_GLYPH, TONE_LABEL } from './model';

/** Two letters for a named unit (`GR` for a grunt): the first letters of two words, or the first two letters of one. */
export function initialsOf(unit: Unit): string {
  if (unit.kind === 'grunt') return 'GR';
  const words = unit.displayName.trim().split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/**
 * A unit on the hub: a ring in the tone's colour around her initials, followed by her state glyph and the tone glyph, so
 * the colour never carries the meaning alone. Long-press or hover analyzes her relationship state.
 */
export function renderMarker(state: CampaignState, reg: Registries, unit: Unit): HTMLElement {
  const tone = markerTone(state, reg, unit);
  const rel = state.relations[unit.id];
  const st = unit.kind === 'named' && rel ? reg.relationshipStates.get(rel.stateId) : undefined;
  const glyphs = [st ? String(st.glyph) : '', TONE_GLYPH[tone]].filter(Boolean).join(' ');
  const analyze = st && rel
    ? analyzeAttrs(`relationshipStates:${rel.stateId}`, { unitId: unit.id })
    : analyzeAttrs('glossary:whereabouts');
  // P14c: the line under her name (what she is doing today), shown by CSS on hover or focus; nothing with life off or for what she keeps to herself
  const life = unit.kind === 'named' ? hubLine(state, reg, unit.id) : null;
  return h(
    'span',
    {
      class: 'alius-marker alius-chip', 'data-unit': unit.id, 'data-tone': tone,
      'aria-label': `${unit.displayName}${st ? `, ${String(st.name)}` : ''}, ${TONE_LABEL[tone]}${life ? `, ${life.text}` : ''}`,
      ...(life ? { 'data-life-line': life.text } : {}),
      ...analyze,
    },
    h('span', { class: 'alius-marker-ring', 'aria-hidden': 'true' }, initialsOf(unit)),
    h('span', { class: 'alius-marker-glyphs', 'aria-hidden': 'true' }, glyphs),
  );
}
