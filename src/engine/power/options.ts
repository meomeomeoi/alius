import type { Registries } from '../../content/types';
import { worldEffects, type WorldHolder } from '../worldOptions/options';

/**
 * The squad's world options (P9b), read BY EFFECT TYPE, never by option or choice id. A save, a wizard or a pack without
 * the options reads the neutral values: normal assertiveness, voting off.
 */

export interface Assertiveness { privilegeMult: number; demandMult: number; commanderVoteMult: number; soldierVoteMult: number }

const NEUTRAL: Assertiveness = { privilegeMult: 1, demandMult: 1, commanderVoteMult: 1, soldierVoteMult: 1 };

/** The product of the `squad_power` effects of the current choices (no such effect: all 1). */
export function assertiveness(state: WorldHolder, reg: Registries): Assertiveness {
  return worldEffects(state, reg, 'squad_power').reduce<Assertiveness>((acc, e) => ({
    privilegeMult: acc.privilegeMult * e.privilegeMult,
    demandMult: acc.demandMult * e.demandMult,
    commanderVoteMult: acc.commanderVoteMult * e.commanderVoteMult,
    soldierVoteMult: acc.soldierVoteMult * (e.soldierVoteMult ?? 1),
  }), NEUTRAL);
}

/** Some `voting` effect is present: the squad votes on the decisions the `voteKinds` registry lists. */
export function votingOn(state: WorldHolder, reg: Registries): boolean {
  return worldEffects(state, reg, 'voting').length > 0;
}
