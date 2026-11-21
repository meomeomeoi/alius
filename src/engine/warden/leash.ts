import type { Registries } from '../../content/types';
import { consumeSlots } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { bookUse } from '../leash/use';
import { addCommanderStress } from '../special/commanderStress';
import type { CampaignState, LeashKind, LeashLogEntry, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { wardenOf } from './state';
import { valuesOf } from '../development/profile';

/**
 * The Leash in LEASHSWAP (P13 §3): the Leash on the commander (the warden's authorizations, `compel` and `suppress`) and her co-sign on
 * the squad's requests. The co-sign chance is the engine's and never reaches an event, a toast or a reading.
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const SLOTS: Slot[] = ['morning', 'afternoon', 'evening'];

/** `clamp(0.5 + 0.004 × (satisfaction − 50) + 0.1 × her corporate − 0.1 × her mercy + 0.001 × her Affinity, 0.1, 0.95)`. The target's identity matters only when it is she. */
export function cosignChance(state: CampaignState, _reg: Registries, _targetId: string): number {
  const w = wardenOf(state);
  if (!w) return 1;
  const C = TUNING.warden.cosign;
  const unit = state.squad.find((u) => u.id === w.unitId);
  const affinity = state.relations[w.unitId]?.affinity ?? 0;
  return clamp(C.base + C.perSatisfaction * (w.satisfaction - 50) + C.corporate * (unit ? valuesOf(unit).corporate : 0) - C.mercy * (unit ? valuesOf(unit).mercy : 0) + C.perAffinity * affinity, C.min, C.max);
}

/**
 * Asks the warden to co-sign a squad Leash request. With nobody holding the leash it is ok at once (no draw). A request against her is
 * denied without a draw. Otherwise one draw. The events say `leash_cosigned` or `leash_cosign_denied` (the caller logs the denial).
 */
export function rollCosign(draft: CampaignState, ctx: EngineCtx, targetId: string, kind: LeashKind): { ok: boolean; events: EngineEvent[] } {
  const w = wardenOf(draft);
  if (!w) return { ok: true, events: [] };
  const ok = targetId !== w.unitId && ctx.rng.chance(cosignChance(draft, ctx.registries, targetId));
  return { ok, events: [{ type: ok ? 'leash_cosigned' : 'leash_cosign_denied', unitId: targetId, kind }] };
}

/** A request the warden refused (P15: or a holder who blocks the Leash, `cc` her id): a `denied` log entry that copies her, no authorization spent. */
export function logCosignDenied(draft: CampaignState, ctx: EngineCtx, unitId: string, kind: LeashKind, context: LeashLogEntry['context'], cc: 'warden' | string = 'warden'): EngineEvent[] {
  return bookUse(draft, ctx, unitId, kind, context, 'denied', cc);
}

/** Slots from now to the end of the evening, which is where the day rolls over. Nothing is left at night. */
const restOfDay = (slot: Slot): number => (SLOTS.includes(slot) ? SLOTS.length - SLOTS.indexOf(slot) : 0);

/**
 * The Leash on the commander, one of her weekly authorizations: `compel` (her next override accepts only COMPLY, and a major decision is
 * hers to make), `suppress` (the rest of the day is lost and the commander takes stress). Throws with none left or nobody holding the leash.
 */
export function leashCommander(draft: CampaignState, ctx: EngineCtx, kind: 'compel' | 'suppress'): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) throw new Error('Nobody holds the Leash.');
  if (w.leashLeft < 1) throw new Error('The warden has no Leash authorization left this week.');
  w.leashLeft -= 1;
  const events: EngineEvent[] = [{ type: 'commander_leashed', kind }];
  if (kind === 'compel') w.compelled = true;
  else {
    events.push(...addCommanderStress(draft, TUNING.warden.leash.suppressStress, 'warden_leash'));
    const rest = restOfDay(draft.slot);
    if (rest > 0) events.push(...consumeSlots(draft, rest, ctx));
  }
  return events;
}

/** Her authorizations refill on the squad Leash's refresh day (called from the same day-end step), and her refresh day follows it. */
export function refreshWardenLeash(draft: CampaignState, _reg: Registries): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w) return [];
  w.leashLeft = TUNING.warden.leash.weekly;
  w.leashRefreshDay = draft.leash.refreshDay;
  return [{ type: 'warden_leash_refreshed', left: w.leashLeft }];
}
