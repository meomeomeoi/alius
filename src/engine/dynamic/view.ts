/**
 * What the commander may read of the dynamic (P15, plan R25), as plain data. These are the engine-side readers the UI and `Knowledge.dynamic` build on: they read the
 * state, never write it, never draw, and answer nothing while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { standing } from './capabilities';
import { dynamicOn } from './gate';
import { dynamicOf } from './state';

/** A holder and the ids of the domains she holds today. */
export interface HolderLine { unitId: string; domains: string[] }

/**
 * Who holds something over the commander, for the CMDR card: every named living woman at `play` or beyond, in squad order, with the domains she holds today (a domain
 * given up in part still counts while it stands). Empty while the dynamic is off.
 */
export function heldBy(state: CampaignState, reg: Registries): HolderLine[] {
  if (!dynamicOn(state, reg)) return [];
  return state.squad
    .filter((u) => u.kind === 'named' && isLiving(u) && frameRank(dynamicOf(state, u.id)?.frame ?? 'equal') >= frameRank('play'))
    .map((u) => ({ unitId: u.id, domains: dynamicOf(state, u.id)!.domains.filter((d) => standing(d, state.day)).map((d) => d.id) }));
}
