import { registerAfterAction } from '../dispatch';
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
