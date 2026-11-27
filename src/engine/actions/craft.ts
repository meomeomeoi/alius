import { registerAfterAction } from '../dispatch';
import { registerDayEndStep } from '../calendar';
import { decayCraft } from '../craft/decay';
import { touchCraft } from '../craft/book';
import { craftOn } from '../craft/gate';

// Importing this module registers what keeps the craft in step with the rest of the engine (P16b). It must come after `actions/practice`
// (the order of the day-end steps follows the order the action modules are evaluated).

/**
 * Every xp the physics layer gives (a held hold, a streak, a drill) is a use of that endurance: the decay's day is stamped, so a key used
 * within `decay.days` is never touched. Writes only while some holder is craft-live; draws nothing.
 */
registerAfterAction((draft, ctx, events) => {
  if (!events.some((e) => e.type === 'endurance_gained') || !craftOn(draft, ctx.registries)) return [];
  for (const e of events) if (e.type === 'endurance_gained') touchCraft(draft, `endurance:${String((e as { physicsId?: unknown }).physicsId)}`);
  return [];
});

/** The day-end decay: a discipline unused for `decay.days` loses a level step, the pair's knowledge after `pairDays` (nothing runs while nothing is written). */
registerDayEndStep('director_tick', (draft, ctx) => decayCraft(draft, ctx.registries));
