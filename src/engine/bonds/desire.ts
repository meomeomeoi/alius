import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { openDemand } from '../discipline/demands';
import { wantBandOf } from './want';

/**
 * From the `restless` band her unmet want arrives as a demand of kind `desire` (SATISFY / POSTPONE / TALK in the UI), at most
 * once every `TUNING.bonds.want.demandEveryDays` days for each unit, and only while she has no demand open. The template is the
 * usual seeded weighted pick (one draw) among the desire templates that are allowed for her. Nothing is rolled for a unit whose
 * Want is not at the band.
 */
export function openDesireDemands(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    if (unit.kind !== 'named' || !isLiving(unit) || wantBandOf(draft, reg, unit.id) === 'calm') continue;
    const last = (draft.discipline?.demandLog ?? [])
      .filter((e) => e.unitId === unit.id && reg.demandTemplates.get(e.templateId ?? '')?.kind === 'desire')
      .reduce((n, e) => Math.max(n, e.day), -Infinity);
    if (draft.day - last < TUNING.bonds.want.demandEveryDays) continue;
    const opened = openDemand(draft, ctx, unit.id, { desire: true });
    if (opened) events.push(...opened.events);
  }
  return events;
}
