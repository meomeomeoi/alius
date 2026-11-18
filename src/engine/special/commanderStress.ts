import type { EngineEvent } from '../dispatch';
import { stressBand, type StressBand } from '../relations/bands';
import type { CampaignState } from '../state/types';

/**
 * The commander's own stress (P12): 0–100, absent = 0, in every campaign. Its sources are the nightmares, a false alarm acted on
 * and being downed in combat; it eases by 5 a day, by 15 with a quiet night slept through and by 20 with the medbay. At 70 or more
 * Empathy is one rank lower (`socialRank` reads it directly). Nothing here draws.
 */

export const commanderStress = (state: CampaignState): number => state.commander.stress ?? 0;

/** The same bands as a unit's stress: calm < 25, tense < 50, strained < 80, breaking. */
export const commanderStressBand = (state: CampaignState): StressBand => stressBand(commanderStress(state));

/** Moves the stress, clamped to 0–100. Emits `commander_stress_changed { delta, source }` only when it moved. */
export function addCommanderStress(draft: CampaignState, amount: number, source: string): EngineEvent[] {
  const before = commanderStress(draft);
  const next = Math.min(100, Math.max(0, before + amount));
  if (next === before) return [];
  draft.commander.stress = next;
  return [{ type: 'commander_stress_changed', delta: next - before, source }];
}
