/**
 * Requests and issuing (P16, plan R5): the engine decides that a practice comes and of what kind (`requestPractice`, an event for the controller to
 * generate its words), and writes the practice from the validated card or from the fallback (`issuePractice`). The per-kind writers are in `WRITERS`;
 * only the kinds that have one can be requested by the day step. Draws nothing (`practiceRoll`). The engine never reads a practice's `text`.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { fallbackLine, pickSeeds, plainSummary, seedPool, stakesCeilingOf } from './seeds';
import { validatePracticeOutput } from './validate';
import { stakeRank, type AcceptForm, type PracticeKind, type PracticeRequest, type Stake, type Task, type ValidOutput } from './state';

/** What a writer is given: the request that is closing, the card (validated, or built from a seed), and whether it is the plain fallback. */
export type Writer = (draft: CampaignState, ctx: EngineCtx, request: PracticeRequest, output: ValidOutput, plain: boolean) => EngineEvent[];

/** How the commander accepts a task by what it weighs (R6, the consent ladder): a sealed one is one button, a trivial one a button, a minor one a button that shows its cost, a major one words, a severe one words and a signature. */
export function acceptFormOf(stakes: Stake, sealed: boolean | undefined): AcceptForm {
  if (sealed === true) return 'sealed';
  return (['button', 'button_cost', 'words', 'signed'] as const)[stakeRank(stakes)];
}

const ROSTER_CHECKS: readonly string[] = ['on_roster', 'not_on_roster'];

/** A task of hers, from a card (R5, R6). `field` only with the roster checks, a deadline from the card's days (kept even when no duration is shown), the chain from the request. */
const writeTask: Writer = (draft, _ctx, request, out, plain) => {
  const p = ensurePractices(draft);
  const id = nextPracticeId(draft, 'pt');
  const chainId = request.chainOf;
  const step = chainId === undefined ? undefined : p.tasks.filter((t) => t.chainId === chainId).reduce((m, t) => Math.max(m, t.step ?? 1), 1) + 1;
  const task: Task = {
    id, holderId: request.holderId, kind: 'task', ...(out.seedId !== undefined ? { seedId: out.seedId } : {}), tags: [...out.tags], track: out.track, tier: out.tier,
    stakes: out.stakes, check: out.check, ...(out.checkArg !== undefined ? { checkArg: out.checkArg } : {}), proof: out.proof,
    ...(out.deadline !== undefined ? { deadline: { day: draft.day + out.deadline.days, ...(out.deadline.slot !== undefined ? { slot: out.deadline.slot } : {}) } } : {}),
    ...(request.noDuration === true ? { noDuration: true as const } : {}), ...(out.audienceIds !== undefined && out.audienceIds.length > 0 ? { audienceIds: [...out.audienceIds] } : {}),
    text: out.text, summary: out.summary, ...(plain ? { plain: true as const } : {}), ...(chainId !== undefined ? { chainId, step } : {}), status: 'offered',
    ...(request.targetUnitId !== undefined ? { targetUnitId: request.targetUnitId } : {}), ...(ROSTER_CHECKS.includes(out.check) ? { field: true as const } : {}),
    ...(request.sealed === true ? { sealed: true as const } : {}), acceptForm: acceptFormOf(out.stakes, request.sealed), day: draft.day,
  };
  p.tasks.push(task);
  return [{ type: 'task_issued', taskId: id, holderId: request.holderId, kind: 'task', requestId: request.id, ...(plain ? { plain: true } : {}), ...(request.sealed === true ? { sealed: true } : {}) }];
};

/**
 * The writer of each kind that can be issued. The day step offers only these kinds, so a campaign between tasks never asks for a kind nobody can write. Later tasks add
 * punishment (12), demonstration (19), protocol (21), denial (23) and hold (25).
 */
export const WRITERS: Partial<Record<PracticeKind, Writer>> = { task: writeTask };

/** The card the fallback writes for a request: its first seed that is still allowed, with the template line and the gist, within the frame's stakes. `null` when none stands. */
export function fallbackOutput(state: CampaignState, reg: Registries, request: PracticeRequest): ValidOutput | null {
  const pool = seedPool(state, reg, request.holderId, request.kind);
  const seed = request.seedIds.map((id) => pool.find((s) => s.id === id)).find((s) => s !== undefined);
  if (seed === undefined) return null;
  const ceiling = stakesCeilingOf(state, request.holderId);
  return {
    kind: request.kind, seedId: seed.id, tags: [...seed.contentTags], track: seed.track, tier: seed.tier as ValidOutput['tier'], stakes: stakeRank(seed.stakes) > stakeRank(ceiling) ? ceiling : seed.stakes,
    check: seed.check ?? 'model', proof: seed.proof ?? 'none', text: fallbackLine(request.kind, seed.gist), summary: plainSummary(seed),
  };
}

/**
 * Writes a request: the seeds are picked now (gated, 3 to 6), the id is taken and `practice_requested` tells the controller to ask for the words. Nothing is written for a
 * holder who is not live, or when no seed stands (a request with no candidate has no fallback either), except an offence's punishment, which has its own entry. A chain's request
 * raises the tier floor to the last tier of the chain.
 */
export function requestPractice(draft: CampaignState, ctx: EngineCtx, holderId: string, kind: PracticeKind, extra: Partial<PracticeRequest> = {}): EngineEvent[] {
  if (!practiceLive(draft, ctx.registries, holderId)) return [];
  const reg = ctx.registries;
  const last = extra.chainOf === undefined ? undefined : draft.practices?.tasks.filter((t) => t.chainId === extra.chainOf).at(-1);
  const seedIds = pickSeeds(draft, reg, holderId, kind, last === undefined ? {} : { minTier: last.tier });
  if (seedIds.length === 0 && extra.offence === undefined) return [];
  const id = nextPracticeId(draft, 'pq');
  ensurePractices(draft).requests.push({ ...extra, id, holderId, kind, day: draft.day, seedIds });
  return [{ type: 'practice_requested', requestId: id, holderId, kind }];
}

/**
 * The request a key names: the one still waiting, or, when a card written for it is still `offered`, a request rebuilt from that card (its kind, chain and flags, its
 * seed and fresh ones) so that a reroll can ask again. `replaced` is that card. Undefined when the key is gone (the card was answered, the holder left).
 */
export function requestOf(state: CampaignState, reg: Registries, requestId: string): { request: PracticeRequest; replaced?: Task } | undefined {
  const p = state.practices;
  const waiting = p?.requests.find((r) => r.id === requestId);
  if (waiting !== undefined) return { request: waiting };
  const old = p?.tasks.find((t) => t.requestId === requestId && t.status === 'offered');
  if (old === undefined) return undefined;
  const kind = old.kind as PracticeKind;
  const seedIds = [...new Set([...(old.seedId !== undefined ? [old.seedId] : []), ...pickSeeds(state, reg, old.holderId, kind)])];
  return {
    replaced: old,
    request: {
      id: requestId, holderId: old.holderId, kind, day: old.day, seedIds,
      ...(old.chainId !== undefined ? { chainOf: old.chainId } : {}), ...(old.targetUnitId !== undefined ? { targetUnitId: old.targetUnitId } : {}),
      ...(old.sealed === true ? { sealed: true as const } : {}), ...(old.noDuration === true ? { noDuration: true as const } : {}),
    },
  };
}

/**
 * Writes the practice of a request from its card, or from the fallback (`'fallback'`: the first allowed seed's template line and gist, `plain: true`), and closes the
 * request. A card is read again by `validatePracticeOutput` (the state may have moved since the controller parsed it). A request that is gone is refused, unless a
 * card written for it is still `offered`: then the new card replaces it in place (a reroll before the commander answered; the fallback never does). A card of another
 * kind or one that does not fit is refused; a request whose fallback has no seed left is dropped with no practice. Draws nothing.
 */
export function issuePractice(draft: CampaignState, ctx: EngineCtx, requestId: string, output: ValidOutput | 'fallback'): EngineEvent[] {
  const p = draft.practices;
  const found = requestOf(draft, ctx.registries, requestId);
  if (p === undefined || found === undefined || (found.replaced !== undefined && output === 'fallback')) throw new Error('That request is gone.');
  const { request, replaced } = found;
  if (!practiceLive(draft, ctx.registries, request.holderId)) throw new Error('She is not holding now.');
  const write = WRITERS[request.kind];
  if (write === undefined) throw new Error(`A ${request.kind} cannot be issued yet.`);
  const plain = output === 'fallback';
  if (!plain && output.kind !== request.kind) throw new Error('That card is for another kind of practice.');
  const card = plain ? fallbackOutput(draft, ctx.registries, request) : (validatePracticeOutput(draft, ctx.registries, request, output)?.output ?? null);
  if (!plain && card === null) throw new Error('That card does not fit.');
  p.requests = p.requests.filter((r) => r.id !== requestId);
  if (card === null) return [];
  const events = write(draft, ctx, request, card, plain);
  const written = p.tasks.at(-1);
  if (written !== undefined) {
    written.requestId = requestId;
    if (replaced !== undefined) {
      p.tasks = p.tasks.filter((t) => t !== replaced);
      written.id = replaced.id;
      for (const e of events) if (e.type === 'task_issued') { e.taskId = replaced.id; e.rerolled = true; }
    }
  }
  return events;
}
