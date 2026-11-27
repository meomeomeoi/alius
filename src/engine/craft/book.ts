/**
 * The commander's book of the craft (P16b, plan Task 1): the level of a discipline, the one writer of its xp, the words and the capacity.
 * Two books: `Commander.endurance` (P15a's, read only through `commanderSkill`) holds the endurance of each physics and `Commander.craft`
 * the other disciplines and the decay's day of every key. Nothing is written unless some holder is craft-live (`craftOn`). Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { addEnduranceXp, commanderSkill, levelForXp } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { craftOn } from './gate';
import { craftWord, enduranceOf, type CraftEntry, type CraftKey } from './state';

/** The level (0-5) of a key: the endurance of a physics reads `commanderSkill`, the rest `Commander.craft`. */
export function craftLevel(state: Pick<CampaignState, 'commander'>, key: CraftKey | string): number {
  const physics = enduranceOf(key);
  if (physics !== null) return commanderSkill(state, physics);
  return state.commander.craft?.[key]?.level ?? 0;
}

/** The word of a key's level. */
export const craftWordOf = (state: Pick<CampaignState, 'commander'>, key: CraftKey | string): string => craftWord(craftLevel(state, key));

/** The xp of a discipline kept in `Commander.craft` (0 for an `endurance:*` key: its xp is in `Commander.endurance`). Used by the decay and the raw-values view only. */
export function craftXp(state: Pick<CampaignState, 'commander'>, key: CraftKey | string): number {
  const physics = enduranceOf(key);
  if (physics !== null) return state.commander.endurance?.[physics]?.xp ?? 0;
  return state.commander.craft?.[key]?.xp ?? 0;
}

/** The decay's day of a key (the last day it was used), or `undefined` when none was written. */
export const craftLastDay = (state: Pick<CampaignState, 'commander'>, key: CraftKey | string): number | undefined => state.commander.craft?.[key]?.lastDay;

/** Stamps the day a key was used (the decay's clock). For `endurance:*` only this is kept in `Commander.craft`. */
export function touchCraft(draft: CampaignState, key: CraftKey | string): CraftEntry {
  const book = (draft.commander.craft ??= {});
  const row = (book[key] ??= { xp: 0, level: 0, lastDay: draft.day });
  row.lastDay = draft.day;
  return row;
}

/**
 * The one writer of a discipline's xp. Adds `xp` to the key and stamps its day. `craft_level` fires on a level up (thresholds are
 * `TUNING.physics.endurance.thresholds`, as P15a's). For `endurance:<physics>` it goes through `addEnduranceXp` (so `Commander.endurance`
 * keeps its shape and its numbers). A no-op returning `[]` unless some holder is craft-live, or when `xp` is not positive.
 */
export function addCraftXp(draft: CampaignState, reg: Registries, key: CraftKey | string, xp: number, cause: string): EngineEvent[] {
  if (!(xp > 0) || !craftOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  const physics = enduranceOf(key);
  let level: number;
  let rose: boolean;
  if (physics !== null) {
    const done = addEnduranceXp(draft, physics, xp);
    events.push(done);
    level = Number((done as { level?: unknown }).level);
    rose = (done as { leveledUp?: unknown }).leveledUp === true;
    touchCraft(draft, key);
  } else {
    const row = touchCraft(draft, key);
    const before = row.level;
    row.xp += xp;
    row.level = levelForXp(row.xp);
    level = row.level;
    rose = row.level > before;
  }
  events.push({ type: 'craft_xp', key, gained: xp, cause });
  if (rose) events.push({ type: 'craft_level', key, level, word: craftWord(level) });
  return events;
}

/**
 * What a discipline can bear: its level, plus, for `posture` and `pain` only, the P7 body route (ruling 9): the commander's `endurance`
 * stat adds `bodyPerPoint` level-equivalents for each point above `bodyFrom` (3, the default), never a malus, so a frail commander gets there by practice.
 * The endurance disciplines keep P15a's numbers and their practice route.
 */
export function craftCapacity(state: Pick<CampaignState, 'commander'>, key: CraftKey | string): number {
  const level = craftLevel(state, key);
  if (key !== 'posture' && key !== 'pain') return level;
  const stat = state.commander.body?.endurance ?? TUNING.commander.defaults.body.endurance;
  return level + Math.max(0, stat - TUNING.craft.capacity.bodyFrom) * TUNING.craft.capacity.bodyPerPoint;
}
