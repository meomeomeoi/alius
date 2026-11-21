/**
 * P15a: the commander's endurance (plan R12): xp per contact physics, levels 0–5 at the thresholds of `TUNING.physics.endurance`. The level
 * raises the capacity of the gauge of a physics with `skill: true`; it never widens an opening. `commanderSkill` is the only reader.
 */
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

export const levelForXp = (xp: number): number => TUNING.physics.endurance.thresholds.filter((t) => xp >= t).length;

/** The commander's endurance level (0–5) for a contact physics. */
export function commanderSkill(state: Pick<CampaignState, 'commander'>, physicsId: string): number {
  return state.commander.endurance?.[physicsId]?.level ?? 0;
}
