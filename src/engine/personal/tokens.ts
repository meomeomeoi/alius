import type { Registries } from '../../content/types';
import { checkTokenWear } from '../bonds/rules';
import { bondTierOf } from '../bonds/profile';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { pushMessage } from '../dms';
import { applyRelationDelta } from '../relationGain';
import { assertiveness } from '../power/options';
import type { CampaignState, Token } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { pressureGate, pressureMultOf } from './gates';
import { favourReactions } from './reactions';
import { nextPersonalId, personalOf, unitObeys } from './state';

const unitOf = (state: CampaignState, id: string) => state.squad.find((u) => u.id === id);
const labelOf = (reg: Registries, kindId: string, name: string): string => String(reg.tokenKinds.get(kindId)?.label ?? '{name}\'s token').replaceAll('{name}', name);

/** The tokens the commander wears now (at most two), in the order they were put on. */
export const wornTokens = (state: Pick<CampaignState, 'personal'>): Token[] => (state.personal?.tokens?.owned ?? []).filter((t) => t.worn);

/** The scene line: `The commander wears {label}[ and {label}].`; `null` when nothing is worn. */
export function tokenLine(state: Pick<CampaignState, 'personal'>): string | null {
  const labels = wornTokens(state).map((t) => t.label);
  return labels.length === 0 ? null : `The commander wears ${labels.join(' and ')}.`;
}

/** The kinds her tier allows (a `romantic` kind needs the romantic tier), in registry order. */
export function kindsFor(state: CampaignState, reg: Registries, unitId: string): Array<Record<string, unknown>> {
  const tier = bondTierOf(state, reg, unitId);
  return [...reg.tokenKinds.values()].filter((k) => k.minTier === undefined || k.minTier === tier);
}

/**
 * The day step's roll: one open offer in the squad at a time; each unit passing the `token` gate who never offered one (one
 * per unit, ever) draws once at `0.03 × demandMult × pressureMult`. A hit picks the kind by weight, opens the offer and
 * delivers it as her DM; she is then counted as having given (a declined offer does not come back). Nothing is drawn while
 * nobody is eligible.
 */
export function rollTokenOffer(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  if (draft.personal?.tokens?.offer !== undefined) return [];
  const given = draft.personal?.tokens?.given ?? [];
  for (const u of draft.squad) {
    if (u.kind !== 'named' || given.includes(u.id) || unitObeys(draft, u.id) || pressureGate(draft, reg, u.id, 'token') !== null) continue;
    const chance = TUNING.personal.token.chance * assertiveness(draft, reg).demandMult * pressureMultOf(draft, reg, u.id);
    if (!ctx.rng.chance(chance)) continue;
    const kinds = kindsFor(draft, reg, u.id);
    if (kinds.length === 0) continue;
    let pick = ctx.rng.int(0, kinds.reduce((n, k) => n + Number(k.weight), 0) - 1);
    const kind = kinds.find((k) => (pick -= Number(k.weight)) < 0) ?? kinds[0];
    const label = labelOf(reg, String(kind.id), u.displayName);
    const tokens = (personalOf(draft).tokens ??= { owned: [], given: [] });
    const dm = pushMessage(draft, u.id, { from: u.id, text: String(kind.text).replaceAll('{name}', u.displayName).replaceAll('{label}', label), day: draft.day, slot: draft.slot, read: false, initiated: true });
    tokens.offer = { id: nextPersonalId(draft, 'tk'), giverId: u.id, kindId: String(kind.id), label, day: draft.day, dmId: dm.id };
    tokens.given.push(u.id);
    return [{ type: 'token_offered', offerId: tokens.offer.id, giverId: u.id, kindId: String(kind.id), label }];
  }
  return [];
}

/** A token she gives at once (the wager path: no offer step): stored unworn, and she counts as having given. */
export function giveToken(draft: CampaignState, ctx: EngineCtx, giverId: string, kindId?: string): { token: Token; events: EngineEvent[] } {
  const reg = ctx.registries;
  const unit = unitOf(draft, giverId);
  if (!unit) throw new Error('There is no such soldier.');
  const kinds = kindsFor(draft, reg, giverId);
  const kind = (kindId !== undefined ? reg.tokenKinds.get(kindId) : undefined) ?? kinds[ctx.rng.int(0, Math.max(0, kinds.length - 1))] ?? [...reg.tokenKinds.values()][0];
  if (!kind) throw new Error('There is no token to give.');
  const tokens = (personalOf(draft).tokens ??= { owned: [], given: [] });
  const token: Token = { id: nextPersonalId(draft, 'tk'), giverId, kindId: String(kind.id), label: labelOf(reg, String(kind.id), unit.displayName), day: draft.day, worn: false };
  tokens.owned.push(token);
  if (!tokens.given.includes(giverId)) tokens.given.push(giverId);
  return { token, events: [{ type: 'token_accepted', tokenId: token.id, giverId, label: token.label }] };
}

/** The commander answers the open offer: accept stores it unworn; decline is `rejected_advance` (minor) on her. */
export function answerOffer(draft: CampaignState, ctx: EngineCtx, offerId: string, accept: boolean, opts: { expired?: boolean } = {}): EngineEvent[] {
  const tokens = draft.personal?.tokens;
  const offer = tokens?.offer;
  if (!tokens || !offer || offer.id !== offerId) throw new Error('That offer is not open.');
  delete tokens.offer;
  if (accept) {
    const token: Token = { id: nextPersonalId(draft, 'tk'), giverId: offer.giverId, kindId: offer.kindId, label: offer.label, day: draft.day, worn: false };
    tokens.owned.push(token);
    return [{ type: 'token_accepted', tokenId: token.id, giverId: offer.giverId, label: token.label }];
  }
  const events: EngineEvent[] = [{ type: 'token_declined', offerId, giverId: offer.giverId, ...(opts.expired ? { expired: true } : {}) }];
  if (unitOf(draft, offer.giverId) && isLiving(unitOf(draft, offer.giverId)!)) events.push(...hitHer(draft, ctx.registries, offer.giverId, 'rejected_advance', 'minor', 'declined her token'));
  return events;
}

/** Why this token cannot be put on now (the engine's own message, which the dossier shows), or `null`. */
export function wearProblem(state: Pick<CampaignState, 'personal'>, tokenId: string): string | null {
  const token = state.personal?.tokens?.owned.find((t) => t.id === tokenId);
  if (!token) return 'There is no such token.';
  if (token.worn) return 'It is already worn.';
  if (wornTokens(state).length >= TUNING.personal.token.maxWorn) return `You already wear ${TUNING.personal.token.maxWorn === 2 ? 'two' : TUNING.personal.token.maxWorn} tokens: take one off first.`;
  return null;
}

/**
 * The commander puts a token on (at most `maxWorn`). While the giver is with the squad the others react (a romantic rival
 * `rival_favoured` moderate, a close friend `bond_shown`) and every active `no_other_tokens` rule of someone else is broken by
 * check. A token whose giver is gone can be worn and does nothing.
 */
export function wearToken(draft: CampaignState, ctx: EngineCtx, tokenId: string): EngineEvent[] {
  const reg = ctx.registries;
  const problem = wearProblem(draft, tokenId);
  if (problem !== null) throw new Error(problem);
  const token = draft.personal!.tokens!.owned.find((t) => t.id === tokenId)!;
  token.worn = true;
  delete token.removedDay;
  const giver = unitOf(draft, token.giverId);
  const events: EngineEvent[] = [];
  let reactions: Array<{ unitId: string; kind: 'rival' | 'respect' }> = [];
  if (giver && isLiving(giver)) {
    const r = favourReactions(draft, reg, token.giverId, 'moderate');
    reactions = r.reactions;
    events.push(...r.events, ...checkTokenWear(draft, ctx, token.giverId));
  }
  return [{ type: 'token_worn', tokenId, giverId: token.giverId, reactions }, ...events];
}

/** The commander takes a worn token off: `token_removed` (moderate, × her `pressureMult`) on the giver, and a broken promise when it was locked. */
export function removeToken(draft: CampaignState, ctx: EngineCtx, tokenId: string): EngineEvent[] {
  const reg = ctx.registries;
  const token = draft.personal?.tokens?.owned.find((t) => t.id === tokenId);
  if (!token || !token.worn) throw new Error('That token is not worn.');
  token.worn = false;
  token.removedDay = draft.day;
  const events: EngineEvent[] = [{ type: 'token_taken_off', tokenId, giverId: token.giverId }];
  const giver = unitOf(draft, token.giverId);
  if (giver && isLiving(giver)) {
    if (token.lockedUntil !== undefined && token.lockedUntil > draft.day) {
      events.push(...hitHer(draft, reg, token.giverId, 'broke_promise', 'moderate', 'took off a token she was promised would stay'));
    }
    events.push(...hitHer(draft, reg, token.giverId, 'token_removed', 'moderate', 'took off her token', { amplified: true }));
  }
  delete token.lockedUntil;
  return events;
}

/** The day step's token part: an offer older than `offerDays` is declined; each giver of a worn token gains Affinity 1 (once a day). */
export function tokenDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const tokens = draft.personal?.tokens;
  const events: EngineEvent[] = [];
  if (tokens?.offer && draft.day >= tokens.offer.day + TUNING.personal.token.offerDays) events.push(...answerOffer(draft, ctx, tokens.offer.id, false, { expired: true }));
  for (const giverId of new Set(wornTokens(draft).map((t) => t.giverId))) {
    const giver = unitOf(draft, giverId);
    if (!giver || !isLiving(giver) || !draft.relations[giverId]) continue;
    const applied = applyRelationDelta(draft, giverId, 'affinity', TUNING.personal.token.giverAffinityPerDay, 'token');
    if (applied !== 0) events.push({ type: 'relation_changed', unitId: giverId, axis: 'affinity', delta: applied, applied });
  }
  events.push(...rollTokenOffer(draft, ctx));
  return events;
}

/** Takes a token off with no deltas (a won wager made room for another): not the commander's choice, so nobody takes offence. */
export function removeTokenQuietly(token: Token): void {
  token.worn = false;
  delete token.lockedUntil;
}
