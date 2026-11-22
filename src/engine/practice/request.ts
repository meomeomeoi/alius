/**
 * Writing a request (P16, plan R5): the engine decides that a practice comes and of what kind. Split from `issue.ts` so that her discipline (`offences.ts`, `tasks.ts`)
 * can ask for a practice without importing the writers (which import the tasks). Draws nothing.
 */
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { pickSeeds } from './seeds';
import type { PracticeKind, PracticeRequest } from './state';

/**
 * Writes a request: the seeds are picked now (gated, 3 to 6), the id is taken and `practice_requested` tells the controller to ask for the words. Nothing is written for a
 * holder who is not live, or when no seed stands (a request with no candidate has no fallback either), except an offence's punishment, which has its own entry. A chain's request
 * raises the tier floor to the last tier of the chain.
 */
export function requestPractice<C extends Pick<EngineCtx, 'registries'>>(draft: CampaignState, ctx: C, holderId: string, kind: PracticeKind, extra: Partial<PracticeRequest> = {}): EngineEvent[] {
  if (!practiceLive(draft, ctx.registries, holderId)) return [];
  const reg = ctx.registries;
  const last = extra.chainOf === undefined ? undefined : draft.practices?.tasks.filter((t) => t.chainId === extra.chainOf).at(-1);
  const seedIds = pickSeeds(draft, reg, holderId, kind, last === undefined ? {} : { minTier: last.tier });
  if (seedIds.length === 0 && extra.offence === undefined) return [];
  const id = nextPracticeId(draft, 'pq');
  ensurePractices(draft).requests.push({ ...extra, id, holderId, kind, day: draft.day, seedIds });
  return [{ type: 'practice_requested', requestId: id, holderId, kind }];
}

