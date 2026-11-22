/**
 * The gate of the practices (P16, plan R2): when a holder's practices run, the one creator of `state.practices` and the id counter.
 * Everything else of P16 asks `practiceLive` first; while it is false for everyone nothing is written (`practices` stays absent), no
 * directive, chip or card exists and every reader answers null. Reads only; draws nothing.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { dynamicOn, herPracticeLive } from '../dynamic/gate';
import { dynamicOf } from '../dynamic/state';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { blankPractices, type PracticeIdPrefix, type PracticeState } from './state';

/**
 * Do her practices run now? The dynamic is on (`dynamicOn`), she practises something that is switched on and is not among her limits
 * (`herPracticeLive`), she is a living named soldier, her frame is `play` or beyond and no aftermath of hers is running.
 */
export function practiceLive(state: CampaignState, reg: Registries, holderId: string): boolean {
  if (!dynamicOn(state, reg)) return false;
  const unit = state.squad.find((u) => u.id === holderId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return false;
  const dyn = dynamicOf(state, holderId);
  if (dyn === undefined || frameRank(dyn.frame) < frameRank('play') || dyn.aftermath !== undefined) return false;
  return herPracticeLive(state, holderId);
}

/** The live holders, in squad order. */
export function practiceHolders(state: CampaignState, reg: Registries): string[] {
  return state.squad.filter((u) => practiceLive(state, reg, u.id)).map((u) => u.id);
}

/** Is some unit live? While this is false nothing of P16 is written, shown or offered. */
export function practicesOn(state: CampaignState, reg: Registries): boolean {
  return state.squad.some((u) => practiceLive(state, reg, u.id));
}

/** What the campaign keeps of the practices, `undefined` while there is none. */
export function practicesOf(state: Pick<CampaignState, 'practices'>): PracticeState | undefined {
  return state.practices;
}

/** The one creator of `state.practices` (the first write creates it). Call only after `practiceLive` said yes for someone. */
export function ensurePractices(draft: CampaignState): PracticeState {
  return (draft.practices ??= blankPractices());
}

/** The next id of a kind: `<prefix><n>` from one counter shared by every prefix (`pq`, `pt`, `pp`, `pd`, `pa`, `ps`, `pc`, `ph`). */
export function nextPracticeId(draft: CampaignState, prefix: PracticeIdPrefix): string {
  return `${prefix}${ensurePractices(draft).seq++}`;
}

/**
 * Are her open practices frozen? True while she is not live (a frame that fell back to `equal`, her aftermath, a profile that no longer
 * practises anything on): no new request, no check, no deadline and no punishment runs for her, and nothing of hers is dropped; it all
 * resumes when she is live again. (A hold that is open when she stops being live ends at once: the hold's own rule, R11.)
 */
export function freezeOf(state: CampaignState, reg: Registries, holderId: string): boolean {
  return !practiceLive(state, reg, holderId);
}
