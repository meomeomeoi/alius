import { registerAfterAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { decayCraft } from '../craft/decay';
import { installCraftHooks } from '../craft/hooks';
import { noteSlips } from '../craft/lesson';
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

/**
 * A slip of a craft-live holder teaches when her punishment or her named point follows it in the same scene (`craft/lesson.ts`): half the xp of a clean phase, once
 * per slip. Her point is kept for the reply that follows (`Relation.craft.lesson`, hidden until she says it). Draws nothing.
 */
registerAfterAction((draft, ctx, events) => craftOn(draft, ctx.registries) ? noteSlips(draft, ctx, events) : []);

// the physics layer reads the commander's stillness and her rhythm through these (0 until learnt)
installCraftHooks();
