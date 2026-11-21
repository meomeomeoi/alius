import type { Registries } from '../../content/types';
import { TUNING } from '../tuning';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, HobbyState } from '../state/types';
import { lifeHash, lifeMode } from './state';
import type { HobbyEntry } from './types';

/**
 * Her hobbies (P14c): the thresholds of a hobby's four milestones and the skill a hobby starts at. Everything is a hash of the life salt
 * (never the rng), so the same salt gives the same numbers and two women never share a ladder.
 */

/**
 * Where the `n`-th (0..3) milestone of a hobby sits for her: 10, 30, 60 and 100, each moved by up to 15 percent either way
 * (`TUNING.life.milestoneShift`) by a hash of the salt, her id and the hobby. The fourth never passes 100.
 */
export function milestoneAt(salt: number, unitId: string, hobbyId: string, n: 0 | 1 | 2 | 3): number {
  const t = TUNING.life;
  const spread = Math.round(t.milestoneShift * 1000); // ±150 thousandths
  const shift = (lifeHash({ salt }, `${unitId}|hobby|${hobbyId}|${n}`) % (2 * spread + 1)) - spread;
  return Math.min(100, Math.round(t.milestones[n] * (1 + shift / 1000)));
}

/** A new hobby as she takes it up: skill 0, the novelty interest, active, and no milestone reached. */
export function newHobby(id: string, day: number): HobbyState {
  return { id, skill: 0, interest: TUNING.life.interest.start, state: 'active', since: day, milestones: [] };
}

/**
 * Gives each starting hobby (skill 0, no milestone) the skill she brings: a hash of the salt, her id and the hobby, below her second
 * milestone, with the milestones already passed granted silently (no fact, no queue). A no-op while life is off; running it again changes
 * nothing, because a hobby that has any skill or milestone is left alone.
 */
export function seedLife(draft: Pick<CampaignState, 'settings' | 'life' | 'squad'>, reg: Pick<Registries, 'hobbies'>): EngineEvent[] {
  if (lifeMode(draft) === 'off' || !draft.life) return [];
  const salt = draft.life.salt;
  for (const unit of draft.squad) {
    if (unit.kind !== 'named') continue;
    for (const h of unit.hobbies ?? []) {
      if (h.skill !== 0 || h.milestones.length > 0 || !reg.hobbies.has(h.id)) continue;
      const entry = reg.hobbies.get(h.id) as HobbyEntry;
      h.skill = lifeHash({ salt }, `${unit.id}|hobby|${h.id}`) % milestoneAt(salt, unit.id, h.id, 1);
      for (const [i, m] of entry.milestones.entries()) {
        if (i < 2 && milestoneAt(salt, unit.id, h.id, i as 0 | 1) <= h.skill) h.milestones.push(m.id);
      }
    }
  }
  return [];
}
