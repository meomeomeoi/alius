import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { decayFrequency } from './frequency/leaks';

/**
 * The special day step (P12), on `director_tick`. It draws nothing on its own account: suspicion decays, and the later tasks add
 * what each system does at the day's end. Without the special state it changes nothing.
 */
export function specialDayStep(draft: CampaignState, _ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  decayFrequency(draft);
  return events;
}
