/**
 * Writing a request (P16, plan R5): the engine decides that a practice comes and of what kind. Split from `issue.ts` so that her discipline (`offences.ts`, `tasks.ts`)
 * can ask for a practice without importing the writers (which import the tasks). Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { pickSeeds } from './seeds';
import type { OpenPunishment, PracticeCard, PracticeKind, PracticeRequest, Task } from './state';

/** Every card written for a request, in the order of the lists: tasks, punishments, demonstrations. */
export const allCards = (state: Pick<CampaignState, 'practices'>): PracticeCard[] => {
  const p = state.practices;
  return p === undefined ? [] : [...p.tasks, ...p.punishments, ...p.demonstrations];
};

/**
 * The card written for a request, whichever list it is in, with its kind and status (a punishment of hers that has no request, an order about a soldier, has none and is never found).
 * `undefined` when no card carries the key.
 */
export function cardOf(state: Pick<CampaignState, 'practices'>, requestId: string): { kind: PracticeKind; list: 'tasks' | 'punishments' | 'demonstrations'; card: PracticeCard; status: string } | undefined {
  const p = state.practices;
  if (p === undefined) return undefined;
  const task = p.tasks.find((t) => t.requestId === requestId);
  if (task !== undefined) return { kind: task.kind, list: 'tasks', card: task, status: task.status };
  const punishment = p.punishments.find((x) => x.requestId === requestId);
  if (punishment !== undefined) return { kind: 'punishment', list: 'punishments', card: punishment, status: punishment.status };
  const demonstration = p.demonstrations.find((x) => x.requestId === requestId);
  return demonstration === undefined ? undefined : { kind: 'demonstration', list: 'demonstrations', card: demonstration, status: demonstration.status };
}

/** The kind a request key stands for: the waiting request's, else the card written for it (the name of its site). */
export function practiceKindOf(state: Pick<CampaignState, 'practices'>, requestId: string): PracticeKind | undefined {
  return state.practices?.requests.find((r) => r.id === requestId)?.kind ?? cardOf(state, requestId)?.kind;
}

/**
 * The request a key names: the one still waiting, or, when a card written for it is still `offered`, a request rebuilt from that card (its kind and what it carried: a task's chain,
 * seed and flags, a punishment's offence, weight and entry; the seeds are picked again) so that a reroll can ask again. `replaced` is that card. Undefined when the key is gone
 * (the card was answered, the holder left).
 */
export function requestOf(state: CampaignState, reg: Registries, requestId: string): { request: PracticeRequest; replaced?: PracticeCard } | undefined {
  const waiting = state.practices?.requests.find((r) => r.id === requestId);
  if (waiting !== undefined) return { request: waiting };
  const found = cardOf(state, requestId);
  if (found === undefined || found.status !== 'offered') return undefined;
  const card = found.card;
  const base = { id: requestId, holderId: card.holderId, kind: found.kind, day: card.day };
  if (found.list === 'punishments') {
    const p = card as OpenPunishment;
    return {
      replaced: card,
      request: { ...base, seedIds: [], offence: p.offence, severity: p.severity, entryId: p.entryId, ...(p.escalated === true ? { escalated: true as const } : {}), ...(p.sealed === true ? { sealed: true as const } : {}) },
    };
  }
  const seedId = found.list === 'tasks' ? (card as Task).seedId : undefined;
  const seedIds = [...new Set([...(seedId !== undefined ? [seedId] : []), ...pickSeeds(state, reg, card.holderId, found.kind)])];
  const t = found.list === 'tasks' ? (card as Task) : undefined;
  return {
    replaced: card,
    request: {
      ...base, seedIds,
      ...(t?.chainId !== undefined ? { chainOf: t.chainId } : {}), ...(t?.targetUnitId !== undefined ? { targetUnitId: t.targetUnitId } : {}),
      ...(t?.sealed === true ? { sealed: true as const } : {}), ...(t?.noDuration === true ? { noDuration: true as const } : {}),
    },
  };
}

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

