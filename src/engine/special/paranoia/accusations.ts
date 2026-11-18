import type { EngineCtx, EngineEvent } from '../../dispatch';
import { addRecord } from '../../discipline/record';
import { loyaltyRecord } from '../../loyalty/state';
import { applyEventToUnit } from '../../relations/effects';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { addCommanderStress } from '../commanderStress';
import { paranoiaOf, openPremonition } from './premonitions';

export { preemptBonus } from '../state';

/** What the commander did about a warning: accused her, punished her, filed a Leash request or took her off a mission. */
export type WarningAct = 'accused' | 'punished' | 'leash' | 'removed';

/**
 * The commander acts on a warning about her. Only an open premonition about her matters: without one nothing extra happens. The
 * truth decides what it was:
 *  - **real**: the warning is closed `preempted` and for 5 days a doubt or desertion is easier to talk down (+0.15, her next check
 *    waits 3 days); a mutiny is averted with a draw at 0.5 (her signs are cleared); defiance costs her record −6;
 *  - **false**: an `extreme` insult (`false_accusation`) for an accusation, an `extreme` coercion for the rest, on top of the act's
 *    own deltas, and the commander's stress +5.
 * The event says which act and who, never whether the warning was real; the commander learns it from the consequences.
 */
export function actOnWarning(draft: CampaignState, ctx: EngineCtx, unitId: string, act: WarningAct): EngineEvent[] {
  const open = openPremonition(draft, unitId);
  if (!open) return [];
  const T = TUNING.special.paranoia;
  const events: EngineEvent[] = [{ type: 'premonition_acted', unitId, act }];
  if (open.real) {
    open.acted = 'preempted';
    (paranoiaOf(draft).preempt ??= []).push({ unitId, untilDay: draft.day + T.preemptDays, about: open.about });
    if (open.about === 'doubt' || open.about === 'desertion') {
      const rec = loyaltyRecord(draft, unitId);
      rec.nextCheckDay = Math.max(rec.nextCheckDay ?? 0, draft.day + T.preemptPause);
    } else if (open.about === 'mutiny') {
      if (ctx.rng.chance(T.mutinyAvert)) {
        const rec = draft.disloyalty?.units[unitId];
        if (rec) rec.signs = rec.signs.filter((s) => s.about !== 'mutiny');
      }
    } else {
      events.push(...addRecord(draft, unitId, T.defianceRecord, 'preempt'));
    }
    return events;
  }
  open.acted = 'false';
  events.push(...applyEventToUnit(draft, ctx.registries, unitId, {
    type: act === 'accused' ? 'false_accusation' : 'coerced', actor: 'commander', targets: [unitId], severity: 'extreme', evidence: 'a warning that was not real', confidence: 1,
  }));
  events.push(...addCommanderStress(draft, TUNING.special.commanderStress.falseAlarm, 'false_alarm'));
  return events;
}
