import type { Registries } from '../../content/types';
import { stepsOf } from '../onboarding/prologue';
import type { CampaignState } from '../state/types';
import { wardenOf } from './state';

/**
 * Is the one-time WARDEN ASSIGNED notice due (P13 §1)? Only in the mode, while she holds the leash and the commander has not
 * acknowledged it. The prologue's own `warden_reveal` scene covers it: while that step is still ahead, or once it was played,
 * nothing is due; a skipped step (or no prologue, or a prologue without the step) leaves the notice to the hub.
 */
export function revealPending(state: CampaignState, reg: Registries): boolean {
  const ls = state.leashswap;
  if (!ls || ls.revealed === true || wardenOf(state) === null) return false;
  const o = state.onboarding;
  const entry = o ? reg.prologues.get(o.prologueId) : undefined;
  const step = entry ? stepsOf(entry).find((st) => st.participants === 'warden') : undefined;
  if (!o || !step) return true;
  if (o.completed.includes(step.id)) return false;
  if (o.skipped.includes(step.id)) return true;
  return o.done; // the prologue ended without reaching it (never expected): show the notice rather than lose it
}
