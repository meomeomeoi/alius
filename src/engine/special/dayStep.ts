import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { frequencyDiscovered, syncFrequencyKnowers } from './frequency/discovery';
import { decayFrequency, suspicionOf } from './frequency/leaks';
import { TUNING } from '../tuning';
import { addCommanderStress } from './commanderStress';
import { forgetSpecial, holdsSpecial } from './state';

/**
 * The special day step (P12), on `director_tick`. It draws nothing: what a unit who is no longer living held is dropped, a unit whose
 * suspicion reached 100 finds out, and suspicion decays. Without the special state it changes nothing.
 */
export function specialDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  // the commander's own stress eases a little every day, in every campaign; it draws nothing and moves nothing at 0
  const events: EngineEvent[] = addCommanderStress(draft, -TUNING.special.commanderStress.dayRelief, 'day');
  for (const u of draft.squad) if (!isLiving(u) && holdsSpecial(draft, u.id)) forgetSpecial(draft, u.id);
  for (const u of draft.squad) {
    if (u.kind === 'named' && isLiving(u) && suspicionOf(draft, u.id) >= 100) events.push(...frequencyDiscovered(draft, ctx, u.id));
  }
  decayFrequency(draft);
  return events;
}

/** On `dm_rumors`, after P3b's spread: whoever now knows the hidden fact learns it for good. */
export const specialRumorStep = (draft: CampaignState, ctx: EngineCtx): EngineEvent[] => syncFrequencyKnowers(draft, ctx);
