/**
 * The holder's cover (P15, plan R19): what a holder who is high enough in the commander's life takes off the suspicion the commander draws,
 * so the noise of the commander's hand against the warden (P13), the oversight the Web of Debts raises (P12) and the pace of oversight's own
 * inquiry (P15) are all a little slower. One reader, called at those three sites. `role` takes `TUNING.dynamic.cover.role` off, `rule` takes
 * `.rule` off, and a holder whose primary style is `cruel` gives half of that; the strongest holder counts. A leaf of the dynamic: it imports
 * only the gate, the state and the profile.
 */
import type { Registries } from '../../content/types';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn } from './gate';
import { styleOf } from './profile';
import { dynamicOf } from './state';

/** The cover of one frame: nothing below `role`. */
const coverOf = (frame: string): number => (frame === 'role' ? TUNING.dynamic.cover.role : frame === 'rule' ? TUNING.dynamic.cover.rule : 0);

/** `1 - the strongest holder's cover`: 1 with nobody holding (or the dynamic off). Pure; draws nothing. */
export function coverMult(state: CampaignState, reg: Registries): number {
  if (!dynamicOn(state, reg)) return 1;
  let best = 0;
  for (const u of state.squad) {
    const dyn = u.kind === 'named' && isLiving(u) ? dynamicOf(state, u.id) : undefined;
    if (dyn === undefined) continue;
    const base = coverOf(dyn.frame);
    best = Math.max(best, styleOf(u)?.primary === 'cruel' ? base * TUNING.dynamic.cover.cruelHalf : base);
  }
  return 1 - best;
}
