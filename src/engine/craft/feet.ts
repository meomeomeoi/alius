/**
 * Her feet (P16b, plan Task 14; spec section 8, rulings 16 and 17). Nothing here is stored but what the commander did for them:
 *
 * - `feetOfDay`: the state of her feet today, derived from where she was (a run today or yesterday, her quarters in the evening, a training, a wet day, a hash). The
 *   directive of Task 16 reads it. No draw: a hash.
 * - `careOfFeet`: a combat passive for a craft-live holder: her form is a little better after a foot or shoe service that pleased her since her last run, and a little worse
 *   when her feet are sore and nothing was done. The other combat entries are unchanged.
 * - Her foot language, as the instrument reports it (`noteFootSignal`): she names a motion once (`foot_signal_given`), an answered one is practice of the commander's memory
 *   (`craft_xp`), a missed one is `foot_signal_missed` and a slip that waits for her discipline (no offence here: her correction by presence is the instrument's).
 *
 * Draws nothing. Every writer is a no-op unless the holder is craft-live.
 */
import type { Registries } from '../../content/types';
import type { EffectSpec } from '../combat/types';
import type { EngineEvent } from '../dispatch';
import { fnv1a, whereaboutAt } from '../hub';
import { isPrivateRoom } from '../life/places';
import { footwearOf, trainedToday, wetDay, type Footwear } from '../physics/footwear';
import { signalsOf } from '../physics/service';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addCraftXp } from './book';
import { craftLive } from './gate';

export type FeetState = 'fresh' | 'worn' | 'hot' | 'sore' | 'bare';

/** Did she go on a run launched today or yesterday (the report's `day` is the launch)? */
function ranRecently(state: Pick<CampaignState, 'day' | 'lastExpedition'>, unitId: string): boolean {
  const run = state.lastExpedition;
  return run !== undefined && run.party.includes(unitId) && (run.day === state.day || run.day === state.day - 1);
}

/**
 * The day of her feet: `sore` the day of a run she was in and the day after; `bare` in her quarters in the evening (her whereabouts now); `hot` after a training today; `worn`
 * on a wet day or by a hash (`hot` too, by its own share); else `fresh`. Derived from the state; nothing is stored and nothing is drawn.
 */
export function feetOfDay(state: CampaignState, reg: Registries, unitId: string): { footwear: Footwear; state: FeetState } {
  const footwear = footwearOf(state, reg, unitId);
  const T = TUNING.craft.feet;
  if (ranRecently(state, unitId)) return { footwear, state: 'sore' };
  if (state.slot === 'evening') {
    const room = whereaboutAt(state, reg, unitId, state.day, state.slot).roomId;
    if (room !== null && isPrivateRoom(reg, room)) return { footwear, state: 'bare' };
  }
  if (trainedToday(state, reg, unitId)) return { footwear, state: 'hot' };
  const roll = (fnv1a(`feet|${state.day}|${unitId}`) % 1000) / 1000;
  if (wetDay(state) || roll < T.wornShare) return { footwear, state: 'worn' };
  if (roll < T.wornShare + T.hotShare) return { footwear, state: 'hot' };
  return { footwear, state: 'fresh' };
}

/** Did a foot or shoe service please her since her last run (and within `careDays`)? */
export function caredForFeet(state: Pick<CampaignState, 'day' | 'lastExpedition' | 'relations'>, unitId: string): boolean {
  const care = state.relations[unitId]?.craft?.footCare;
  if (care === undefined || state.day - care.day > TUNING.craft.feet.careDays) return false;
  const run = state.lastExpedition;
  return run === undefined || !run.party.includes(unitId) || care.day > run.day;
}

/** Her combat form (the shape of `combatEffects`): +`combatPct` after care, -`combatPct` when she is sore and nothing was done, else nothing; only for a craft-live holder. */
export function careOfFeet(state: CampaignState, reg: Registries, unitId: string): EffectSpec[] {
  if (!craftLive(state, reg, unitId)) return [];
  const pct = TUNING.craft.feet.combatPct;
  if (caredForFeet(state, unitId)) return [{ type: 'outgoing', pct }, { type: 'incoming', pct: -pct }];
  if (feetOfDay(state, reg, unitId).state === 'sore') return [{ type: 'outgoing', pct: -pct }, { type: 'incoming', pct }];
  return [];
}

/** A verdict on a service (foot or shoe) landed: a pleased one cares for her feet until her next run. Quiet. */
export function noteServiceVerdict(draft: CampaignState, reg: Registries, holderId: string, verdict: string): EngineEvent[] {
  if (verdict !== 'pleased' || !craftLive(draft, reg, holderId)) return [];
  const rel = draft.relations[holderId];
  if (rel === undefined) return [];
  (rel.craft ??= {}).footCare = { day: draft.day };
  return [];
}

/** The motions she has: the engine's pairs of the holder (the instrument's `signalsOf`). */
export const motionsOf = (state: Pick<CampaignState, 'squad'>, holderId: string): string[] => signalsOf(state, holderId).map((s) => s.motion);

/**
 * One bout of her foot language, as the instrument reports it: `answered` or not. She names a motion once (`foot_signal_given`); an answered one counts and is practice of the
 * commander's `memory`; a missed one is `foot_signal_missed` and a slip that waits for her punishment in this scene. A motion she does not have is ignored. Writes only for a
 * craft-live holder; draws nothing.
 */
export function noteFootSignal(draft: CampaignState, reg: Registries, holderId: string, motion: string, answered: boolean): EngineEvent[] {
  const rel = draft.relations[holderId];
  if (rel === undefined || !craftLive(draft, reg, holderId) || !motionsOf(draft, holderId).includes(motion)) return [];
  const book = ((rel.craft ??= {}).signals ??= {});
  const row = (book[motion] ??= { named: false, answered: 0, day: draft.day });
  const events: EngineEvent[] = [];
  if (!row.named) {
    row.named = true;
    events.push({ type: 'foot_signal_given', unitId: holderId, motion });
  }
  row.day = draft.day;
  delete row.decayedDay;
  if (answered) {
    row.answered += 1;
    events.push(...addCraftXp(draft, reg, 'memory', TUNING.craft.xp.knowledge, 'foot_signal'));
  } else {
    events.push({ type: 'foot_signal_missed', unitId: holderId, motion });
    const scene = draft.scene;
    if (scene !== undefined) (rel.craft!.slips ??= []).push({ key: 'memory', scene: scene.id, day: draft.day });
  }
  return events;
}
