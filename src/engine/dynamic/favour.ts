/**
 * Her favour (P15, R7): a leaf, so that `regard.ts` (which must not import `hold.ts`) and `drawn.ts` can move it. `hold.ts` re-exports `addFavour`.
 */
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOf } from './state';

/** Her favour moves by `n`, clamped to ±`TUNING.dynamic.favour.max`. A unit with no dynamic has none: nothing happens. */
export function addFavour(draft: CampaignState, unitId: string, n: number): void {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return;
  const max = TUNING.dynamic.favour.max;
  dyn.favour = Math.min(max, Math.max(-max, dyn.favour + n));
}
