/**
 * Domains and capabilities (P15, plan R12, spec §5): what a holder claims of the commander's life, and the readers that turn it into what she
 * may do. A holder claims a domain she is due (her frame and hold band meet it) at day end, with one chance; the commander yields, refuses or
 * talks (a compromise yields it for a week). A domain is lost when her hold falls below its band, at an exit, by force, or to another holder
 * (one domain, one holder: the rivals' order is P9c's). Code reads a domain by what it grants (`capabilitiesOf`), never by its id.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { settleOrder } from '../personal/bookings';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { bandMin, capabilitiesOf, domainEntry, domainRows, dropVoidOverride, hasCapability, holderWith, standing } from './capabilities';
import { dynamicOn } from './gate';
import { addHold } from './hold';
import { refusalCost } from './milestones';
import { keptByStruggle } from './struggle';
import { dynamicOf, type DynamicRelation } from './state';
import type { Capability, DynamicDomainEntry } from './types';

type Ctx = Pick<EngineCtx, 'registries' | 'rng'>;

// The readers (capabilitiesOf, hasCapability, holderWith) live in `capabilities.ts`, a leaf the personal, hub, rules and power layers can import without a cycle.
export { capabilitiesOf, hasCapability, holderWith };

/** The unit (other than `except`) that holds a domain today, in squad order. Reads the id: this is the domain being claimed, not a capability. */
function holderOfDomain(state: CampaignState, domainId: string, except: string): string | null {
  return state.squad.find((u) => u.id !== except && u.kind === 'named' && isLiving(u)
    && dynamicOf(state, u.id)?.domains.some((d) => d.id === domainId && standing(d, state.day)) === true)?.id ?? null;
}

/** Whether her frame and her hold meet a domain's `requires`. */
const meets = (reg: Registries, dyn: DynamicRelation, entry: DynamicDomainEntry): boolean =>
  frameRank(dyn.frame) >= frameRank(entry.requires.frame) && dyn.hold >= bandMin(reg, entry);

/** Removes a domain from her list (no hold change) and says why. */
export function loseDomain(draft: CampaignState, unitId: string, domainId: string, reason: 'band' | 'exit' | 'force' | 'contest'): EngineEvent {
  const dyn = dynamicOf(draft, unitId);
  if (dyn !== undefined) dyn.domains = dyn.domains.filter((d) => d.id !== domainId);
  return { type: 'domain_lost', unitId, domainId, reason };
}

/**
 * After her hold moved (called by `addHold`): a domain whose band she has fallen below is lost at once (`domain_lost { reason: 'band' }`), and an
 * open claim of a domain she no longer meets is withdrawn. Nothing for a unit with no dynamic. Draws nothing.
 */
export function reconcileDomains(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return [];
  const events: EngineEvent[] = [];
  for (const d of [...dyn.domains]) {
    const entry = domainEntry(reg, d.id);
    if (entry !== undefined && dyn.hold < bandMin(reg, entry) && !keptByStruggle(dyn, entry)) events.push(loseDomain(draft, unitId, d.id, 'band')); // the command kept through a struggle is not a matter of her band
  }
  dropVoidOverride(draft, reg, unitId);
  const x = draft.dynamic;
  if (x !== undefined) {
    x.open.claims = x.open.claims.filter((c) => {
      if (c.unitId !== unitId || c.domainId === undefined) return true;
      const entry = domainEntry(reg, c.domainId);
      return entry !== undefined && meets(reg, dyn, entry);
    });
  }
  return events;
}

/** The first domain she is due to claim: a `demand` domain her frame and band meet that she does not hold, off cooldown. */
function dueDomain(state: CampaignState, reg: Registries, dyn: DynamicRelation): DynamicDomainEntry | undefined {
  return domainRows(reg).find((e) => e.claim === 'demand' && meets(reg, dyn, e) && state.day >= (dyn.cooldowns[e.id] ?? -Infinity)
    && !dyn.domains.some((d) => d.id === e.id && standing(d, state.day)));
}

/**
 * Day end: each holder who is due a domain (frame and band meet a `demand` domain she does not hold, off cooldown, no claim of hers open, not
 * in an aftermath) draws once at `claimChance x frequency` (no due domain, no draw). A hit opens her claim (`domain_claimed`); of a domain that
 * another holder has it is a conflict, settled at once between the two (`settleDomainConflict`) with no card. At most one claim open per unit.
 */
export function claimsDue(draft: CampaignState, ctx: Ctx): EngineEvent[] {
  const reg = ctx.registries;
  const x = draft.dynamic;
  if (x === undefined || !dynamicOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const dyn = unit.kind === 'named' && isLiving(unit) ? dynamicOf(draft, unit.id) : undefined;
    if (dyn === undefined || dyn.aftermath !== undefined || x.open.claims.some((c) => c.unitId === unit.id)) continue;
    const entry = dueDomain(draft, reg, dyn);
    if (entry === undefined || !ctx.rng.chance(TUNING.dynamic.claimChance * TUNING.dynamic.frequency[x.setup.frequency])) continue;
    const rival = holderOfDomain(draft, entry.id, unit.id);
    if (rival !== null) {
      events.push(...settleDomainConflict(draft, ctx, unit.id, rival, entry.id));
      continue;
    }
    const claimId = `dc${x.seq++}`;
    x.open.claims.push({ id: claimId, unitId: unit.id, domainId: entry.id, day: draft.day });
    events.push({ type: 'domain_claimed', unitId: unit.id, claimId, domainId: entry.id });
  }
  return events;
}

/**
 * A milestone hands her a capability outright (the command at the handover): the first domain whose `grants` carry it is hers, with the same
 * events as a yielded claim (`domain_yielded`, no claim id). Nothing when she already has the capability or the pack has no such domain; a rival
 * holder of that domain makes it a conflict instead (no yield). Draws nothing.
 */
export function grantCapability(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, cap: Capability): EngineEvent[] {
  const reg = ctx.registries;
  const dyn = dynamicOf(draft, unitId);
  const entry = domainRows(reg).find((d) => d.grants.includes(cap));
  if (dyn === undefined || entry === undefined || hasCapability(draft, reg, unitId, cap)) return [];
  const yielded: EngineEvent = { type: 'domain_yielded', unitId, domainId: entry.id, via: 'milestone' };
  const rival = holderOfDomain(draft, entry.id, unitId);
  if (rival !== null) return settleDomainConflict(draft, ctx, unitId, rival, entry.id);
  dyn.domains = [...dyn.domains.filter((d) => d.id !== entry.id), { id: entry.id, since: draft.day }];
  return [yielded];
}

/**
 * Two holders want one domain (R12): P9c's order decides (attachment and lead rank, then Impunity, then squad order). The loser loses
 * `contestedLoss` hold; the winner keeps the domain or takes it (the other loses it with `reason: 'contest'`). `domain_contested` says who won.
 */
export function settleDomainConflict(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, claimantId: string, holderId: string, domainId: string): EngineEvent[] {
  const winnerId = settleOrder(draft, ctx.registries, claimantId, holderId);
  const loserId = winnerId === claimantId ? holderId : claimantId;
  const events: EngineEvent[] = [];
  const claimant = dynamicOf(draft, claimantId);
  if (winnerId === claimantId && claimant !== undefined) {
    events.push(loseDomain(draft, holderId, domainId, 'contest'));
    dropVoidOverride(draft, ctx.registries, holderId);
    claimant.domains = [...claimant.domains.filter((d) => d.id !== domainId), { id: domainId, since: draft.day }];
  }
  events.push({ type: 'domain_contested', domainId, winnerId, loserId, claimantId, holderId });
  events.push(...addHold(draft, ctx, loserId, -TUNING.dynamic.contestedLoss, 'contested'));
  return events;
}

/**
 * A transfer of the commander (R15, review I2): the loser's standing domains pass to the winner at once (`domain_lost { reason: 'contest' }`, then the
 * winner holds them since today, `domain_contested` for each with who claimed and who held). Hold is not touched here: the exit charges the loser
 * `contestedLoss` once, whatever she held. A domain that is not standing is left where it is. Draws nothing.
 */
export function transferDomains(draft: CampaignState, loserId: string, winnerId: string, who: { claimantId: string; holderId: string }): EngineEvent[] {
  const loser = dynamicOf(draft, loserId);
  const winner = dynamicOf(draft, winnerId);
  if (loser === undefined || winner === undefined) return [];
  const events: EngineEvent[] = [];
  for (const d of [...loser.domains].filter((x) => standing(x, draft.day))) {
    events.push(loseDomain(draft, loserId, d.id, 'contest'));
    winner.domains = [...winner.domains.filter((x) => x.id !== d.id), { id: d.id, since: draft.day }];
    events.push({ type: 'domain_contested', domainId: d.id, winnerId, loserId, claimantId: who.claimantId, holderId: who.holderId });
  }
  return events;
}

/** The open claim of a unit by id, with her and her block, or `null` when it is stale. */
function openClaim(draft: CampaignState, reg: Registries, claimId: string) {
  const claim = draft.dynamic?.open.claims.find((c) => c.id === claimId);
  const unit = claim === undefined ? undefined : draft.squad.find((u) => u.id === claim.unitId);
  const dyn = claim === undefined ? undefined : dynamicOf(draft, claim.unitId);
  if (claim === undefined || unit === undefined || dyn === undefined || !isLiving(unit) || !dynamicOn(draft, reg)) return null;
  return { claim, dyn };
}

const closeClaim = (draft: CampaignState, claimId: string): void => { draft.dynamic!.open.claims = draft.dynamic!.open.claims.filter((c) => c.id !== claimId); };

/**
 * The commander answers her open claim (`dynamic/answer_claim`): YIELD gives her the domain (a rival holder turns it into a conflict); REFUSE costs
 * by the frame (`refusalCost`), waits `claimCooldownDays` for that domain and takes back a domain she held only by compromise; TALK changes
 * nothing here (the card opens a scene, and a compromise in it is `yieldPartial`). The submit claim (no domain, R1's contest) yields by clearing the contest
 * and, refused, costs a band and raises the Impunity record of every unit who knows the dynamic. Throws for a claim that is not open.
 */
export function answerClaim(draft: CampaignState, ctx: Ctx, claimId: string, answer: 'yield' | 'refuse' | 'talk'): EngineEvent[] {
  const reg = ctx.registries;
  const open = openClaim(draft, reg, claimId);
  if (open === null) throw new Error('That claim is not open.');
  const { claim, dyn } = open;
  if (answer === 'talk') return [];
  const base = { unitId: claim.unitId, claimId };
  if (claim.domainId === undefined) {
    closeClaim(draft, claimId);
    if (answer === 'yield') {
      dyn.contest = [];
      return [{ type: 'domain_yielded', ...base, submit: true }];
    }
    const events: EngineEvent[] = [{ type: 'domain_refused', ...base, submit: true }, ...addHold(draft, ctx, claim.unitId, -TUNING.dynamic.milestones.refuseDrop, 'refusal')];
    for (const [observer, row] of Object.entries(draft.dynamic!.knowledge)) {
      if (row[claim.unitId]?.level === 'knows_dynamic') events.push(...addRecord(draft, observer, TUNING.dynamic.contestImpunity, 'dynamic_contest'));
    }
    return events;
  }
  const entry = domainEntry(reg, claim.domainId);
  if (entry === undefined || !meets(reg, dyn, entry)) {
    closeClaim(draft, claimId);
    throw new Error('That claim is not open.');
  }
  closeClaim(draft, claimId);
  if (answer === 'yield') {
    const rival = holderOfDomain(draft, claim.domainId, claim.unitId);
    if (rival !== null) return settleDomainConflict(draft, ctx, claim.unitId, rival, claim.domainId);
    dyn.domains = [...dyn.domains.filter((d) => d.id !== claim.domainId), { id: claim.domainId, since: draft.day }];
    return [{ type: 'domain_yielded', ...base, domainId: claim.domainId }];
  }
  dyn.domains = dyn.domains.filter((d) => d.id !== claim.domainId);
  dyn.cooldowns[claim.domainId] = draft.day + TUNING.dynamic.claimCooldownDays;
  return [{ type: 'domain_refused', ...base, domainId: claim.domainId }, ...refusalCost(draft, ctx, claim.unitId, 'claim')];
}

/**
 * A compromise in a talk (`compromise_reached { claimId }`): the domain is hers for `partialDays` (`partialUntil`), after which she claims it again.
 * The submit claim has no domain: the compromise only clears the contest. A claim that is not open (stale) does nothing. Draws nothing.
 */
export function yieldPartial(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, claimId: string): EngineEvent[] {
  const open = openClaim(draft, ctx.registries, claimId);
  if (open === null) return [];
  const { claim, dyn } = open;
  closeClaim(draft, claimId);
  const base = { unitId: claim.unitId, claimId, partial: true };
  if (claim.domainId === undefined) {
    dyn.contest = [];
    return [{ type: 'domain_yielded', ...base, submit: true }];
  }
  const entry = domainEntry(ctx.registries, claim.domainId);
  if (entry === undefined || !meets(ctx.registries, dyn, entry)) return [];
  const rival = holderOfDomain(draft, claim.domainId, claim.unitId);
  if (rival !== null) return settleDomainConflict(draft, ctx, claim.unitId, rival, claim.domainId);
  dyn.domains = [...dyn.domains.filter((d) => d.id !== claim.domainId), { id: claim.domainId, since: draft.day, partialUntil: draft.day + TUNING.dynamic.partialDays }];
  return [{ type: 'domain_yielded', ...base, domainId: claim.domainId }];
}
