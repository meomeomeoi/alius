/**
 * What a woman does once she knows of a dynamic (P15, plan R14, spec §8): by her own profile. She is `drawn` (her own hold rises a step, if she may
 * hold), `indifferent` (nothing beyond the fact that she knows), or `dislikes` it (her Impunity term and the holder's standing follow from the state, see
 * `witness.ts`; and on one day in `demandOneIn`, hashed, she asks the commander about it). A woman who holds a dynamic of her own takes it as a rival:
 * `ritual` and `cold` respect the claim (a fact), `possessive` and `cruel` compete for a domain of the other's that they could claim (R12). The leader weighs it against her own
 * standing (a fact). Called by the knowledge when she reaches `knows_dynamic`. Draws nothing: the demand's pick and chance are hashed.
 */
import type { Registries } from '../../content/types';
import { openDemand } from '../discipline/demands';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory/facts';
import { leaderOf } from '../power/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { bandMin, domainEntry, standing } from './capabilities';
import { meets, settleDomainConflict } from './domains';
import { dynamicOn } from './gate';
import { addHold } from './hold';
import { dynamicOf } from './state';
import { DYNAMIC_KNOWLEDGE_TAG } from './types';
import { dynamicRoll, reactionOf } from './witness';

export { dynamicTerm, standingMalus } from './witness';

type Ctx = Pick<EngineCtx, 'registries'>;

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** A fact of her reaction: hers, hidden from the commander until she shows it (the same rule as what she knows). No pronoun for the commander. */
function reactionFact(draft: CampaignState, observerId: string, holderId: string, text: string): void {
  addFact(draft, { about: [observerId, holderId], text, tags: [DYNAMIC_KNOWLEDGE_TAG, 'reaction'], importance: 2, day: draft.day, knownBy: [observerId], hiddenFromCommander: true });
}

/**
 * The domain a rival may contest (R12, review I5): one the holder holds today that can be claimed (`claim: 'demand'`) and that the rival's own frame
 * and band meet, the same predicate as a claim of hers (`meets`). The highest band first, then the first on her list. `undefined` when there is none:
 * a domain only a milestone hands over (the command) is never taken this way.
 */
function contestableDomain(draft: CampaignState, reg: Registries, rivalId: string, holderId: string): string | undefined {
  const rival = dynamicOf(draft, rivalId);
  if (rival === undefined) return undefined;
  const rows = (dynamicOf(draft, holderId)?.domains ?? []).filter((d) => standing(d, draft.day))
    .map((d) => ({ id: d.id, entry: domainEntry(reg, d.id) })).filter((r): r is { id: string; entry: NonNullable<ReturnType<typeof domainEntry>> } => r.entry !== undefined)
    .filter((r) => r.entry.claim === 'demand' && meets(reg, rival, r.entry));
  let best: (typeof rows)[number] | undefined;
  for (const r of rows) if (best === undefined || bandMin(reg, r.entry) > bandMin(reg, best.entry)) best = r;
  return best?.id;
}

/**
 * `openDemand` picks a template with one `rng.float()`; this hands it the hashed number instead, so the real rng is never drawn (the one place the
 * discipline layer's picker is reused for a chance that is not the spec's roll).
 */
export const hashedCtx = (ctx: Ctx & Partial<EngineCtx>, roll: number): EngineCtx => ({ ...ctx, rng: { float: () => roll } as unknown as EngineCtx['rng'] } as EngineCtx);

/** She asks the commander about it: an interpersonal demand, hashed (one day in `demandOneIn`). Nothing when she has one open or cannot be asked. */
function askAbout(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string): EngineEvent[] {
  if (dynamicRoll(draft, observerId, `dislikes:${holderId}`) >= 1 / TUNING.squadKnowledge.reaction.demandOneIn) return [];
  return openDemand(draft, hashedCtx(ctx, dynamicRoll(draft, observerId, `pick:${holderId}`)), observerId, { only: 'interpersonal' })?.events ?? [];
}

/**
 * Her reaction to what she now knows (`knows_dynamic`). The effects that are readings (the Impunity term, the holder's standing) are not written: they
 * follow from the knowledge row and her profile (`dynamicTerm`, `standingMalus`).
 */
export function reactToDynamic(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string): EngineEvent[] {
  const reg = ctx.registries;
  const observer = draft.squad.find((u) => u.id === observerId);
  if (!dynamicOn(draft, reg) || observerId === holderId || observer === undefined || observer.kind !== 'named' || !isLiving(observer)) return [];
  const events: EngineEvent[] = [];
  const reaction = reactionOf(draft, reg, observerId, holderId);
  const holder = nameOf(draft, holderId);
  if (reaction === 'drawn') events.push(...addHold(draft, ctx, observerId, TUNING.dynamic.gains.witness_drawn, 'witness_drawn'));
  else if (reaction === 'dislikes') events.push(...askAbout(draft, ctx, observerId, holderId));
  else if (reaction === 'respects') reactionFact(draft, observerId, holderId, `${observer.displayName} respects what ${holder} holds and keeps out of its way.`);
  else if (reaction === 'competes') {
    const domainId = contestableDomain(draft, reg, observerId, holderId);
    reactionFact(draft, observerId, holderId, `${observer.displayName} wants what ${holder} holds and means to take it.`);
    if (domainId !== undefined && dynamicOf(draft, observerId) !== undefined) events.push(...settleDomainConflict(draft, ctx, observerId, holderId, domainId));
  }
  if (leaderOf(draft)?.id === observerId) reactionFact(draft, observerId, holderId, `${observer.displayName} weighs what ${holder} holds against her own standing.`);
  return events;
}
