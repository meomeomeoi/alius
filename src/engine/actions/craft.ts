import { registerAfterAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { decayCraft } from '../craft/decay';
import { noteHoldEvents } from '../craft/records';
import { touchCraft } from '../craft/book';
import { craftOn } from '../craft/gate';

// Importing this module registers what keeps the craft in step with the rest of the engine (P16b). It must come after `actions/practice`
// (the order of the day-end steps follows the order the action modules are evaluated).

/**
 * Every xp the physics layer gives (a held hold, a streak, a drill) is a use of that endurance: the decay's day is stamped, so a key used
 * within `decay.days` is never touched. Writes only while some holder is craft-live; draws nothing.
 */
registerAfterAction((draft, ctx, events) => {
  if (!craftOn(draft, ctx.registries)) return [];
  for (const e of events) if (e.type === 'endurance_gained') touchCraft(draft, `endurance:${String((e as { physicsId?: unknown }).physicsId)}`);
  return [];
});

/**
 * A clean segment of a hold pays the endurance of its physics, and a finished run (or marathon) sets the pair's records in fiction time and keeps her
 * settling-in count (`craft/records.ts`). Reads only the events of the action; writes only for a craft-live holder; draws nothing.
 */
registerAfterAction((draft, ctx, events) => (events.some((e) => e.type === 'physics_segment' || e.type === 'physics_outcome') ? noteHoldEvents(draft, ctx, events) : []));

/** The day-end decay: a discipline unused for `decay.days` loses a level step, the pair's knowledge after `pairDays` (nothing runs while nothing is written). */
registerDayEndStep('director_tick', (draft, ctx) => decayCraft(draft, ctx.registries));
