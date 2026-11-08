import { runActivity } from '../activities';
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

registerAction('activity/do', (draft, payload, ctx) => runActivity(draft, ctx, payload));

/** P4 hook (Commander Crisis): blocks `train` and `work` for `days`; units in lover/devoted/dependent states react in P3. */
registerAction('commander/injure', (draft, payload) => {
  const days = isObj(payload) ? payload.days : undefined;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) throw new Error('commander/injure: days must be a positive integer');
  const until = Math.max(draft.commander.injuredUntilDay ?? 0, draft.day + days);
  draft.commander.injuredUntilDay = until;
  return [{ type: 'commander_injured', days, until }];
});
