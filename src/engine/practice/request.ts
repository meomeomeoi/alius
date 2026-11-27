/**
 * Writing a request (P16, plan R5): the engine decides that a practice comes and of what kind. Split from `issue.ts` so that her discipline (`offences.ts`, `tasks.ts`)
 * can ask for a practice without importing the writers (which import the tasks). Draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { bendBy, mannerOf } from '../dynamic/manner';
import type { CampaignState } from '../state/types';
import { ensurePractices, nextPracticeId, peekPracticeId, practiceLive } from './gate';
import { hasFreshSeeds, pickSeeds } from './seeds';
import { practiceRoll, type OpenPunishment, type PracticeCard, type PracticeKind, type PracticeRequest, type Task } from './state';
import { TUNING } from '../tuning';

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
      request: { ...base, seedIds: [], offence: p.offence, severity: p.severity, entryId: p.entryId, ...(p.escalated === true ? { escalated: true as const } : {}), ...(p.sealed === true ? { sealed: true as const } : {}), ...(p.hiddenCount === true ? { noDuration: true as const } : {}) },
    };
  }
  const seedId = found.list === 'tasks' ? (card as Task).seedId : undefined;
  const fresh = wantsFresh(state, reg, card.holderId, requestId) && hasFreshSeeds(state, reg, card.holderId, found.kind); // the same key, so the same answer as when it was first asked
  const seedIds = [...new Set([...(seedId !== undefined ? [seedId] : []), ...pickSeeds(state, reg, card.holderId, found.kind, fresh ? { fresh: true } : {})])];
  const t = found.list === 'tasks' ? (card as Task) : undefined;
  return {
    replaced: card,
    request: {
      ...base, seedIds, ...(fresh ? { fresh: true as const } : {}),
      ...(t?.chainId !== undefined ? { chainOf: t.chainId } : {}), ...(t?.targetUnitId !== undefined ? { targetUnitId: t.targetUnitId } : {}),
      ...(t?.sealed === true ? { sealed: true as const } : {}), ...(t?.noDuration === true ? { noDuration: true as const } : {}),
    },
  };
}

/** The kinds that may come sealed (a task, a hold, a punishment: R16) and the kinds that may run "until I decide" (the same three: R16). A protocol, a denial rule and a demonstration are neither. */
const SEALABLE: readonly PracticeKind[] = ['task', 'hold', 'punishment'];

/** Her share of sealed practices by her primary style (R16, R.12; a style the table does not list takes `base` of nothing: 0.05, the "others" row). */
export function sealedShare(state: CampaignState, reg: Registries, holderId: string): number {
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const base = (style === undefined ? undefined : (TUNING.practice.sealedShare as Readonly<Record<string, number>>)[style]) ?? 0.05;
  // P15b: curiosity up and order down raise it by shift (never below 0; no manner: the base)
  const T = TUNING.manner.sealed;
  return Math.max(0, bendBy(state, reg, holderId, 'order', bendBy(state, reg, holderId, 'curiosity', base, { shift: T.curiosity }), { shift: -T.orderDown }));
}

/** Her share of practices that run with no duration by her primary style (R16, R.12: `ritual` and `drill` 0). */
export function noDurationShare(state: CampaignState, reg: Registries, holderId: string): number {
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const base = (style === undefined ? undefined : (TUNING.practice.noDurationShare as Readonly<Record<string, number>>)[style]) ?? 0.1;
  // P15b: order down raises it by shift, never by scale (`ritual` and `drill` are 0 and a scale would keep them there); a high order never takes it below 0
  return Math.max(0, bendBy(state, reg, holderId, 'order', base, { shift: -TUNING.manner.noDuration.orderDown }));
}

/** Does the request with this key come sealed? `practiceRoll(holderId, 'sealed:' + key) < her share`; hashed, no draw. */
export const rollSealed = (state: CampaignState, reg: Registries, holderId: string, key: string): boolean => practiceRoll(state, holderId, `sealed:${key}`) < sealedShare(state, reg, holderId);

/** Does the request with this key run with no duration? `practiceRoll(holderId, 'noduration:' + key) < her share`; hashed, no draw. A share of 0 never hits. */
export const rollNoDuration = (state: CampaignState, reg: Registries, holderId: string, key: string): boolean => practiceRoll(state, holderId, `noduration:${key}`) < noDurationShare(state, reg, holderId);

/**
 * P15b: does the request with this key ask for something new? With her `curiosity` above 0 a hashed share (`TUNING.manner.fresh`: +1 0.2, +2 0.4) of requests do:
 * `practiceRoll(holderId, 'new:' + key) < share`. At 0 and below, or with no manner, never (and nothing is rolled). No draw.
 */
export function wantsFresh(state: CampaignState, reg: Registries, holderId: string, key: string): boolean {
  const step = mannerOf(state, reg, holderId)?.axes.curiosity ?? 0;
  const share = (TUNING.manner.fresh as Readonly<Record<string, number>>)[String(step)] ?? 0;
  return share > 0 && practiceRoll(state, holderId, `new:${key}`) < share;
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
  // P15b: the key is made (not taken) before the pick, so that her curiosity can hash it; a request that comes to nothing still takes no id
  const tier = last === undefined ? {} : { minTier: last.tier };
  const fresh = wantsFresh(draft, reg, holderId, peekPracticeId(draft, 'pq')) && hasFreshSeeds(draft, reg, holderId, kind, tier);
  const seedIds = pickSeeds(draft, reg, holderId, kind, { ...tier, ...(fresh ? { fresh: true } : {}), ...(extra.echo !== undefined ? { echo: extra.echo } : {}) });
  if (seedIds.length === 0 && extra.offence === undefined) return [];
  const id = nextPracticeId(draft, 'pq');
  // R16: a task, a hold or a punishment may come sealed, and may run until she decides; what the commander asked for is never sealed. Hashed from the request's own id: no draw.
  const sealed = extra.sealed === true || (SEALABLE.includes(kind) && extra.asked !== true && rollSealed(draft, reg, holderId, id));
  const noDuration = extra.noDuration === true || (SEALABLE.includes(kind) && rollNoDuration(draft, reg, holderId, id));
  ensurePractices(draft).requests.push({ ...extra, id, holderId, kind, day: draft.day, seedIds, ...(fresh ? { fresh: true as const } : {}), ...(sealed ? { sealed: true as const } : {}), ...(noDuration ? { noDuration: true as const } : {}) });
  return [{ type: 'practice_requested', requestId: id, holderId, kind }];
}

