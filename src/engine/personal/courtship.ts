import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { setPublicity } from '../bonds/publicity';
import { syncPublicity } from '../bonds/publicitySync';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { assertiveness } from '../power/options';
import type { CampaignState, PendingProposal } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { favourReactions } from './reactions';
import { pressureGate, pressureMultOf } from './gates';
import { personalOf, unitObeys } from './state';

/** The category that lets the commander refuse a claim in front of the squad. */
export const HUMILIATION_TAG = 'public_humiliation';

/** ×2 (`TUNING.personal.courtship.initiativeMult`) for a unit passing the `courtship` gate (her DM initiative and her night knocks), else 1. */
export function courtshipMult(state: CampaignState, reg: Registries, unitId: string): number {
  return pressureGate(state, reg, unitId, 'courtship') === null ? TUNING.personal.courtship.initiativeMult : 1;
}

/** Does this proposal get the three chips [ACCEPT] [DEFLECT] [SET A CONDITION]: her own, plain (no second romance to disclose), from a unit who passes the gate. */
export function courtshipChips(state: CampaignState, reg: Registries, proposal: Pick<PendingProposal, 'unitId' | 'from' | 'needsDisclosure'>): boolean {
  return proposal.from === 'unit' && !proposal.needsDisclosure && pressureGate(state, reg, proposal.unitId, 'courtship') === null;
}

/** A condition as the promise will say it: control characters out, spaces collapsed; 1–160 characters or it throws. */
export function cleanCondition(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (text.length < 1 || text.length > TUNING.personal.courtship.conditionMax) {
    throw new Error(`A condition is 1 to ${TUNING.personal.courtship.conditionMax} characters.`);
  }
  return text;
}

const recentClaim = (state: CampaignState, unitId: string): boolean =>
  (state.personal?.claims ?? []).some((c) => c.unitId === unitId && c.day > state.day - TUNING.personal.claim.cooldownDays);

/** The claim chance of one unit: `0.04 × demandMult × pressureMult`. */
export const claimChance = (state: CampaignState, reg: Registries, unitId: string): number =>
  TUNING.personal.claim.chance * assertiveness(state, reg).demandMult * pressureMultOf(state, reg, unitId);

/**
 * She says it in front of everyone (P9c §3): the relationship turns public (cause `claimed`), the claim is stored, and every
 * other named living unit with an imported bond reacts: a romantic tier feels `rival_favoured` (major, × her own `pressureMult`),
 * a close tier or `ingroup ≥ 1` feels `bond_shown` (minor); the rest nothing. No draw.
 */
export function claim(draft: CampaignState, ctx: EngineCtx | Pick<EngineCtx, 'registries'>, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [...syncPublicity(draft, reg, unitId), ...setPublicity(draft, reg, unitId, 'public', { cause: 'claimed' })];
  (personalOf(draft).claims ??= []).push({ unitId, day: draft.day });
  const { events: reacted, reactions } = favourReactions(draft, reg, unitId, 'major');
  events.push(...reacted);
  events.push({ type: 'claimed', unitId, reactions });
  return events;
}

/** The day step's roll: each unit passing the `claim` gate and not claimed in the last 14 days draws once. Draws nothing when nobody is eligible. */
export function rollClaims(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    if (u.kind !== 'named' || pressureGate(draft, ctx.registries, u.id, 'claim') !== null || recentClaim(draft, u.id) || unitObeys(draft, u.id)) continue;
    if (ctx.rng.chance(claimChance(draft, ctx.registries, u.id))) events.push(...claim(draft, ctx, u.id));
  }
  return events;
}

/** REFUSE PUBLICLY: only while `public_humiliation` is on and not among her limits, for a claim of today or yesterday; `rejected_advance` (major) and stress +8. The relationship stays public. */
export function refuseClaim(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const entry = [...(draft.personal?.claims ?? [])].reverse().find((c) => c.unitId === unitId && c.day >= draft.day - 1 && c.refused !== true);
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!entry || !unit || !isLiving(unit)) throw new Error('There is no claim to refuse.');
  if (!contentAllowed(draft, reg, { contentTags: [HUMILIATION_TAG] }, unitId)) throw new Error('Refusing her in front of the squad is switched off.');
  entry.refused = true;
  const events = hitHer(draft, reg, unitId, 'rejected_advance', 'major', 'refused her claim in public');
  const next = Math.min(100, unit.stress + TUNING.personal.claim.refuseStress);
  if (next !== unit.stress) events.push({ type: 'stress_changed', unitId, delta: next - unit.stress });
  unit.stress = next;
  events.push({ type: 'claim_refused', unitId });
  return events;
}
