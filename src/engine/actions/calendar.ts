import { consumeSlots, slotsLeftToday } from '../calendar';
import { registerAction } from '../dispatch';

// Importing this module registers the calendar actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** For P3 (scene end: 1) and P5 (expedition: 2 or 3). */
registerAction('calendar/consume_slot', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  const slots = p.slots ?? 1;
  if (typeof slots !== 'number' || !Number.isInteger(slots) || slots < 1) {
    throw new Error('calendar/consume_slot: slots must be a positive integer');
  }
  const left = slotsLeftToday(draft.slot);
  if (slots > left) throw new Error(`calendar/consume_slot: ${slots} slot(s) requested but only ${left} left in the ${draft.slot}`);
  return consumeSlots(draft, slots, ctx);
});
