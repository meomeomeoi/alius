/**
 * What a practice tells her about the commander (P16, plan R6): one answer into her reading (`updateReading`, weight `alpha.practice`). A kept task is a yield, a broken one
 * a resistance; a yield right after a threat in the same batch reads as fear. Deterministic, draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { updateReading } from '../dynamic/reading';
import { dynamicOf } from '../dynamic/state';
import { physicsStyleOf } from '../physics/style';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/** Feeds one answer into her reading and returns the position change, if the hysteresis let one through. Nothing for a unit with no dynamic. */
export function practiceSample(draft: CampaignState, reg: Registries, unitId: string, response: 'yielded' | 'resisted', opts: { afterThreat?: boolean } = {}): EngineEvent[] {
  const dyn = dynamicOf(draft, unitId);
  const unit = draft.squad.find((u) => u.id === unitId);
  if (dyn === undefined || unit === undefined) return [];
  const region = updateReading(dyn, { response, ...(opts.afterThreat === true ? { afterThreat: true } : {}) }, TUNING.position.alpha.practice, physicsStyleOf(draft, unitId, reg), unit.insight ?? 'mid').region;
  return region === undefined ? [] : [{ type: 'position_shifted', unitId, from: region.from, to: region.to }];
}
