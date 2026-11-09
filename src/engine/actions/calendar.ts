import { runActivity } from '../activities';
import { consumeSlots, injureCommander, slotsLeftToday } from '../calendar';
import { registerAction } from '../dispatch';

// Importing this module registers the calendar actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** For P3 (`reason: 'scene_end'`, 1 slot) and P5 (expedition: 2 or 3). While a talk is open only `scene_end` is accepted. */
registerAction('calendar/consume_slot', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  const slots = p.slots ?? 1;
  if (typeof slots !== 'number' || !Number.isInteger(slots) || slots < 1) {
    throw new Error('calendar/consume_slot: slots must be a positive integer');
  }
  if (draft.calendar.pendingScene) {
    if (p.reason !== 'scene_end') throw new Error('A conversation is still open; only its end can consume the slot.');
    if (slots !== 1) throw new Error('calendar/consume_slot: a scene takes exactly one slot');
    delete draft.calendar.pendingScene;
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
  return injureCommander(draft, days);
});

/** Drops an open conversation without spending its slot (the player backed out, or no scene module is installed). */
registerAction('calendar/cancel_scene', (draft) => {
  const scene = draft.calendar.pendingScene;
  if (!scene) throw new Error('calendar/cancel_scene: no conversation is open');
  delete draft.calendar.pendingScene;
  return [{ type: 'scene_cancelled', unitId: scene.unitId }];
});
