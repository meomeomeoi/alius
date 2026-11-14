import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { decayRecords, lapseThreat, settleDefiance } from './record';

/**
 * The day-end step of discipline (P9), after the loyalty step. In this order: held defiance settles (the ones that belong
 * to no scene, and those whose scene is gone), threats whose deadline is today lapse into a yield, records decay.
 * Later tasks append sabotage, restrictions, demands and reputation.
 */
export function disciplineDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  events.push(...settleDefiance(draft, ctx, {}));
  for (const sceneId of new Set((draft.discipline?.defiance ?? []).map((d) => d.sceneId))) {
    if (sceneId !== undefined && draft.scene?.id !== sceneId) events.push(...settleDefiance(draft, ctx, { sceneId }));
  }
  for (const threat of [...(draft.discipline?.threats ?? [])]) {
    if (threat.deadlineDay > draft.day) continue;
    const unit = draft.squad.find((u) => u.id === threat.unitId);
    if (!unit || !isLiving(unit)) {
      draft.discipline!.threats = draft.discipline!.threats.filter((t) => t.id !== threat.id);
      continue;
    }
    events.push(...lapseThreat(draft, ctx, threat));
  }
  decayRecords(draft);
  return events;
}
