import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { frequencyDiscovered, syncFrequencyKnowers } from './frequency/discovery';
import { decayFrequency, suspicionOf } from './frequency/leaks';
import { TUNING } from '../tuning';
import { addCommanderStress } from './commanderStress';
import { runConsequences } from './debts/consequences';
import { lapseVisit } from './debts/intel';
import { rollVisit } from './debts/handler';
import { rollNightmare } from './paranoia/nightmares';
import { paranoiaDayStep } from './paranoia/premonitions';
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
  events.push(...lapseVisit(draft, ctx)); // a visit nobody answered lapses as all-withhold
  events.push(...runConsequences(draft, ctx)); // what sold intel brought back, now due
  events.push(...paranoiaDayStep(draft, ctx)); // after P6's loyalty step (this module is imported after `actions/loyalty`)
  return events;
}

/** On `dm_rumors`, after P3b's spread: whoever now knows the hidden fact learns it for good. */
export const specialRumorStep = (draft: CampaignState, ctx: EngineCtx): EngineEvent[] => [
  ...syncFrequencyKnowers(draft, ctx),
  ...rollVisit(draft, ctx), // the handler's visit is queued before `night_check` too
  ...rollNightmare(draft, ctx), // before `night_check`, so a unit who heard it can come to the door tonight
];
