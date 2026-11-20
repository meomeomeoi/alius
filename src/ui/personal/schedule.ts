import type { Registries } from '../../content/types';
import type { Booking, CampaignState, Slot } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { defiesHint, obeyedBy } from './obey';
import { unitAccent } from '../voice/voiceCard';
import { SLOT_WORD } from './deviceBlock';

export interface ScheduleHandlers {
  onCancel(bookingId: string): void;
  /** KEEP HERS: this booking stays, the others of the slot are cancelled. */
  onKeep(bookingId: string): void;
  /** LET THEM SETTLE IT: the winner is read from the bond profiles. */
  onSettle(day: number, slot: Slot): void;
}

/** How many days ahead the schedule looks (today and the next two). */
export const SCHEDULE_DAYS = 3;
const SLOT_ORDER: readonly Slot[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * The SCHEDULE of the OPS tab (P9c): the bookings of today and the next two days, each with her name and accent and [CANCEL]; two
 * of one slot are marked and offer [KEEP HERS] on each and one [LET THEM SETTLE IT]. `null` when nothing is booked. Text only.
 */
export function renderSchedule(state: CampaignState, reg: Registries, handlers: ScheduleHandlers): HTMLElement | null {
  const upcoming = (state.personal?.bookings ?? []).filter((b) => b.status === 'booked' && b.day >= state.day && b.day < state.day + SCHEDULE_DAYS
    && state.squad.some((u) => u.id === b.unitId && u.kind === 'named'));
  if (upcoming.length === 0) return null;
  const section = h('section', { class: 'alius-section alius-schedule' }, h('h2', {}, 'SCHEDULE'));
  const days = [...new Set(upcoming.map((b) => b.day))].sort((a, b) => a - b);
  for (const day of days) {
    section.append(h('p', { class: 'alius-schedule-day' }, `DAY ${day}${day === state.day ? ' — TODAY' : day === state.day + 1 ? ' — TOMORROW' : ''}`));
    const rows = upcoming.filter((b) => b.day === day).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const settled = new Set<string>();
    for (const b of rows) {
      section.append(row(state, reg, b, handlers));
      const key = `${b.day}|${b.slot}`;
      if (b.conflict && !settled.has(key) && rows.filter((x) => x.slot === b.slot && x.conflict).at(-1) === b) {
        settled.add(key);
        section.append(h('p', { class: 'alius-schedule-row' },
          h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'settle', ...analyzeNative('glossary:booking', { bookingId: b.id }), onclick: () => handlers.onSettle(b.day, b.slot) }, '[ LET THEM SETTLE IT ]')));
      }
    }
  }
  return section;
}

function row(state: CampaignState, reg: Registries, b: Booking, handlers: ScheduleHandlers): HTMLElement {
  const name = state.squad.find((u) => u.id === b.unitId)?.displayName ?? b.unitId;
  const chip = h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:booking', { bookingId: b.id, unitId: b.unitId }) }, `${name.toUpperCase()} · ${SLOT_WORD[b.slot]}`);
  chip.style.setProperty('--unit-accent', unitAccent(b.unitId));
  const keep = b.conflict
    ? h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'keep', ...analyzeNative('glossary:booking', { bookingId: b.id }), onclick: () => handlers.onKeep(b.id) }, '[ KEEP HERS ]')
    : null;
  return h('div', { class: 'alius-schedule-row', 'data-booking': b.id, ...(b.conflict ? { 'data-conflict': 'true' } : {}) },
    chip, h('span', { class: 'alius-dim' }, String(reg.bookingKinds.get(b.kindId)?.label ?? b.kindId)), keep,
    h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'cancel', ...analyzeNative('glossary:booking', { bookingId: b.id }), onclick: () => handlers.onCancel(b.id) }, '[ CANCEL ]'),
    obeyedBy(state, b.unitId) !== null ? defiesHint(obeyedBy(state, b.unitId)!) : null); // P9c: a day the commander obeys her: cancelling defies her
}
