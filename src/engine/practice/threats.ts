/**
 * Her threats (P16, plan R18): what a holder does to the commander that the reading of the commander takes as a threat (a punishment issued or answered, a slap dealt, a threat voiced,
 * a hold that is a punishment), kept so that a yield right after it reads as fear (`threatNear` in the dynamic's reading asks `practices.lastThreat`). `noteThreat` is the after-action
 * that writes it; `voiceThreat` is the handler of the intent `threat_voiced` (she threatened the commander in words). Nothing here draws.
 */
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isThreat } from '../dynamic/reading';
import { hitHer } from '../personal/events';
import type { CampaignState } from '../state/types';
import { ensurePractices, practiceLive } from './gate';

/** The event types of the practices that are threats (the dynamic's own two are not hers). */
const PRACTICE_THREATS: readonly string[] = ['punishment_issued', 'punishment_answered', 'slap_dealt', 'threat_voiced', 'hold_started'];
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** After every action: a threat event of a live holder is remembered (`practices.lastThreat`: her, the scene and its exchange, the day). Returns no event. */
export function noteThreat(draft: CampaignState, ctx: EngineCtx, events: readonly EngineEvent[]): EngineEvent[] {
  for (const e of events) {
    if (!PRACTICE_THREATS.includes(e.type) || !isThreat(e)) continue;
    const unitId = str(e.holderId) ?? str(e.unitId);
    if (unitId === undefined || !practiceLive(draft, ctx.registries, unitId)) continue;
    ensurePractices(draft).lastThreat = { unitId, ...(draft.scene !== undefined ? { sceneId: draft.scene.id } : {}), exchange: draft.scene?.exchanges ?? 0, day: draft.day };
  }
  return [];
}

/**
 * The model reported that she threatened the commander (`threat_voiced { unitId }`, offered while a holder is in the room or the DM partner): the engine event, and the history line the
 * journal reads (its row is zero). It is applied before the dynamic's intents of the same batch (`relations/apply.ts`), so a yield in the batch reads as fear. Nothing for a holder who is not live.
 */
export function voiceThreat(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string): EngineEvent[] {
  if (!practiceLive(draft, ctx.registries, unitId)) return [];
  return [{ type: 'threat_voiced', unitId, holderId: unitId }, ...hitHer(draft, ctx.registries, unitId, 'threat_voiced', 'minor', 'threatened the commander')];
}
