import type { Registries } from '../../content/types';
import { traitEffects } from '../commander/traits';
import type { CampaignState } from '../state/types';
import type { EffectCtx } from './effects';
import { byCid, isStanding } from './targeting';
import type { CombatState } from './types';

/**
 * The `contingency` order (P12, Bloom-induced Paranoia): the commander designates a squad unit as the cover against a unit that
 * turns. If a mutineer (an enemy-side combatant with a unit id) or a squad unit in breakdown hits the commander, the cover takes the
 * first such hit instead, once per combat. Nothing here draws.
 */

/** An order with `requiresUnlock` is available only to a commander whose traits unlock it (`unlock_order`); any other order always is. */
export function orderUnlocked(state: CampaignState, reg: Registries, orderId: string): boolean {
  if (reg.orders.get(orderId)?.requiresUnlock !== true) return true;
  return traitEffects(state, reg, 'unlock_order').some((fx) => fx.orderId === orderId);
}

/** A unit that turned on the commander: a mutineer, or a squad unit in breakdown. */
export function isTurningAttacker(cs: CombatState, attackerCid: string): boolean {
  const a = cs.combatants.find((c) => c.cid === attackerCid);
  if (!a) return false;
  return a.side === 'enemy' ? a.unitId !== undefined : a.breakdown !== undefined;
}

/**
 * A hit from `attackerCid` is about to reach the commander. When the contingency is set and unused, the attacker is turning and the
 * cover stands, the cover takes it: the contingency is used up, `contingency_cover` is logged and emitted, and the cover's cid is
 * returned. Otherwise `null` and nothing changes.
 */
export function takeContingency(ctx: EffectCtx, attackerCid: string): string | null {
  const c = ctx.cs.contingency;
  if (!c || c.used || !isTurningAttacker(ctx.cs, attackerCid)) return null;
  const cover = ctx.cs.combatants.find((x) => x.cid === c.cid);
  if (!cover || !isStanding(byCid(ctx.cs, c.cid))) return null;
  c.used = true;
  ctx.log({ kind: 'contingency_cover', actor: c.cid, target: 'commander' });
  ctx.emit({ type: 'contingency_cover', cid: c.cid });
  return c.cid;
}
