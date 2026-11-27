/**
 * Stillness under provocation (P16b, plan Task 25; spec section 6.1, gate G2), the engine's half. It is an inner game of her activity's frame: she touches, tickles, whispers
 * and feints while the commander kneels, and any reaction is a slip she feels at once. Whether the game plays is decided here (`provocationOpen`, read by the frame's instrument
 * and by nothing else): the game is switched on (`physicsInteractions.provocation`), she runs the craft (`craftLive`), restraint is on and within her limits, she is awake and
 * the frame carries no weight. What it teaches is `stillness`: each stimulus that went by with no reaction (`physics_endured`, reported by the instrument through
 * `physics/relief` `endure`) pays `TUNING.craft.xp.endure` to it, for a craft-live holder. A reaction is `physics/relief` `react` (`physics/segment.ts`: she always feels it, no draw).
 * Memory: nothing new (a reaction is a caught cheat, `physics_caught`, remembered as any; an endured stimulus is bookkeeping). Draws nothing.
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { sceneSettingsOf } from '../moments/settings';
import { frameOf } from '../physics/presence';
import type { PhysicsRun } from '../physics/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addCraftXp } from './book';
import { craftLive } from './gate';

/** The content the game needs on: being kept from reacting is restraint. */
export const PROVOCATION_CONTENT = ['restraint'] as const;

/**
 * Does stillness under provocation play in this run of her frame? Her activity's frame (`passive` physics from an activity) with no second physics inside, her legs not asleep, the
 * game on, the holder craft-live, and restraint on and within her own limits. Reads by field; the view (the commander on the floor) is the instrument's.
 */
export function provocationOpen(state: CampaignState, reg: Registries, run: PhysicsRun): boolean {
  if (run.sourceKind !== 'activity' || run.second !== undefined || run.forgotten === true) return false;
  if (!sceneSettingsOf(state).physicsInteractions.provocation) return false;
  const frame = frameOf(reg.blockingActivities.get(run.sourceId));
  if (frame === null || frame.legs === 'asleep') return false;
  return craftLive(state, reg, run.holderId) && contentAllowed(state, reg, { contentTags: [...PROVOCATION_CONTENT] }, run.holderId);
}

/** Pays `stillness` for each stimulus a craft-live holder's commander let go by (`physics_endured`). Writes only for a craft-live holder; draws nothing. */
export function noteProvocation(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'physics_endured' || typeof e.holderId !== 'string' || !craftLive(draft, ctx.registries, e.holderId)) continue;
    out.push(...addCraftXp(draft, ctx.registries, 'stillness', TUNING.craft.xp.endure, 'provocation'));
  }
  return out;
}
