/**
 * Her offences (P16, plan R8). THIS IS A STUB until the discipline is built (Task 12 replaces the body): `noteOffence` is the one place a broken task, a refusal at
 * `role`, a slip or a false report is entered against the commander. For now it only counts the day, so the repeat rule has its input; it opens no punishment and
 * returns no event. Draws nothing.
 */
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { ensurePractices } from './gate';
import type { Offence } from './state';

/** Enters an offence against the commander for this holder. Returns the engine events it caused (none until the discipline is built). */
export function noteOffence(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, holderId: string, offence: Offence): EngineEvent[] {
  (ensurePractices(draft).offences[holderId] ??= []).push(offence.day);
  return [];
}
