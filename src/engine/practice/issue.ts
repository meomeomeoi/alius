/**
 * Requests and issuing (P16, plan R5): the engine decides that a practice comes and of what kind (`requestPractice`, an event for the controller to
 * generate its words), and writes the practice from the validated card or from the fallback (`issuePractice`). The per-kind writers are in `WRITERS`;
 * only the kinds that have one can be requested by the day step. Draws nothing (`practiceRoll`). The engine never reads a practice's `text`.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { fallbackLine, plainSummary, seedPool, stakesCeilingOf } from './seeds';
import { punishmentEntryFor, severityOfEntry } from './offences';
import { stakeRank, type OpenPunishment, type PracticeCard, type PracticeKind, type PracticeRequest, type ValidOutput } from './state';
import { allCards, requestOf } from './request';
import { TUNING } from '../tuning';
import { acceptFormOf, writeTask, type Writer } from './tasks';
import { validatePracticeOutput } from './validate';

export { acceptFormOf, type Writer };
export { allCards, cardOf, practiceKindOf, requestOf, requestPractice } from './request';

/**
 * Her punishment, from a card: the engine owns the entry and the weight (picked when the offence was noted; picked again now when the entry can no longer be carried out; nothing that stands: no punishment), the model's
 * words are the text and the summary. `offered` until the commander answers. A plain (fallback) card says the entry's label. `punishment_issued` is a threat source (R18).
 */
function writePunishment(draft: CampaignState, ctx: EngineCtx, request: PracticeRequest, out: ValidOutput, plain: boolean): EngineEvent[] {
  const reg = ctx.registries;
  const p = ensurePractices(draft);
  const entryId = punishmentEntryFor(draft, reg, request);
  if (entryId === null) return [];
  const entry = reg.holderPunishments.get(entryId)!;
  const severity = severityOfEntry(reg, entryId) ?? 1;
  const offence = request.offence ?? { kind: 'refusal' as const, stakes: 'minor' as const, day: draft.day };
  const id = nextPracticeId(draft, 'pp');
  const punishment: OpenPunishment = {
    id, holderId: request.holderId, entryId, severity, offence, text: out.text, summary: out.summary, ...(plain ? { plain: true as const } : {}), status: 'offered',
    ...(entry.public === true ? { public: true as const } : {}), ...(request.sealed === true ? { sealed: true as const } : {}), ...(request.escalated === true ? { escalated: true as const } : {}),
    ...(request.forUnitId !== undefined ? { forUnitId: request.forUnitId } : {}), day: draft.day, ...(draft.scene !== undefined ? { sceneId: draft.scene.id } : {}), requestId: request.id,
  };
  p.punishments.push(punishment);
  return [{
    type: 'punishment_issued', punishmentId: id, holderId: request.holderId, unitId: request.holderId, severity, offence: offence.kind, ...(offence.unfair === true ? { unfair: true } : {}),
    ...(request.escalated === true ? { escalated: true } : {}), ...(plain ? { plain: true } : {}),
  }];
}

/**
 * The writer of each kind that can be issued. The day step offers only these kinds, so a campaign between tasks never asks for a kind nobody can write. Later tasks add
 * demonstration (19), protocol (21), denial (23) and hold (25).
 */
export const WRITERS: Partial<Record<PracticeKind, Writer>> = { task: writeTask, punishment: writePunishment };

/** The card the fallback writes for a request: its first seed that is still allowed, with the template line and the gist, within the frame's stakes. `null` when none stands. */
export function fallbackOutput(state: CampaignState, reg: Registries, request: PracticeRequest): ValidOutput | null {
  if (request.kind === 'punishment') {
    // her discipline has its own entry: the line says what the entry is, not an example seed
    const entryId = punishmentEntryFor(state, reg, request);
    const entry = entryId === null ? undefined : reg.holderPunishments.get(entryId);
    if (entry === undefined) return null;
    const label = String(entry.label);
    return { kind: 'punishment', tags: [], track: 'discipline', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: fallbackLine('punishment', label), summary: label };
  }
  const pool = seedPool(state, reg, request.holderId, request.kind);
  const seed = request.seedIds.map((id) => pool.find((s) => s.id === id)).find((s) => s !== undefined);
  if (seed === undefined) return null;
  const ceiling = stakesCeilingOf(state, request.holderId);
  return {
    kind: request.kind, seedId: seed.id, tags: [...seed.contentTags], track: seed.track, tier: seed.tier as ValidOutput['tier'], stakes: stakeRank(seed.stakes) > stakeRank(ceiling) ? ceiling : seed.stakes,
    check: seed.check ?? 'model', proof: seed.proof ?? 'none', deadline: { days: seed.days ?? TUNING.practice.defaultDeadlineDays }, text: fallbackLine(request.kind, seed.gist), summary: plainSummary(seed),
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
  if (replaced === undefined) return events;
  // a reroll: the new card (it carries the request's id: every writer stamps it) takes the place and the id of the one it replaces
  const written = allCards(draft).find((c) => c.requestId === requestId && c !== replaced);
  if (written === undefined) return events; // nothing stands now: the card that was there stays as it was
  const lists: Array<Array<PracticeCard>> = [p.tasks, p.punishments, p.demonstrations];
  const from = lists.find((l) => l.includes(replaced))!;
  const to = lists.find((l) => l.includes(written))!;
  const at = from.indexOf(replaced);
  to.splice(to.indexOf(written), 1);
  from.splice(at, 1, written);
  written.id = replaced.id;
  for (const e of events) {
    const key = REISSUED[e.type];
    if (key !== undefined) { e[key] = replaced.id; e.rerolled = true; }
  }
  return events;
}

/** The event a writer says its card with, and the field that names the card: a reroll keeps the id of the card it replaced. */
const REISSUED: Readonly<Record<string, string>> = { task_issued: 'taskId', punishment_issued: 'punishmentId', demonstration_staged: 'demonstrationId' };
