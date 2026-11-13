import type { Severity } from '../state/types';
import { TUNING } from '../tuning';
import { activePassives, applyEffects, type EffectCtx } from './effects';
import { addStress } from './stress';
import { byCid, hasFlag, isStanding, living } from './targeting';
import type { EffectSpec, RelationHint } from './types';

interface OrderEntry { id: string; cost: number; target: 'none' | 'ally' | 'enemy'; effects: EffectSpec[] }

const orderOf = (ctx: EffectCtx, id: string): OrderEntry | undefined => ctx.reg.orders.get(id) as unknown as OrderEntry | undefined;
const matches = (list: string[] | undefined, orderId: string): boolean => !list || list.length === 0 || list.includes(orderId);

/**
 * What an order costs: the registry cost plus the `order_cost` passives of the unit it targets that match the order,
 * never below 1; Steady Voice (P7) takes 1 CP off the next paid order.
 */
export function orderCost(ctx: EffectCtx, orderId: string, targetCid?: string): number {
  const order = orderOf(ctx, orderId);
  if (!order) throw new Error(`Unknown order "${orderId}"`);
  let cost = order.cost;
  if (targetCid && targetCid !== 'commander' && ctx.cs.combatants.some((c) => c.cid === targetCid)) {
    for (const e of activePassives(ctx, targetCid, 'order_cost')) if (matches(e.orders, orderId)) cost += e.delta;
  }
  cost = Math.max(1, cost);
  // P7 Steady Voice: the next paid order is 1 CP cheaper, and may be free
  return ctx.cs.presence?.steadyVoicePending ? Math.max(0, cost - 1) : cost;
}

/** Why the order cannot be issued now, or null. Orders are accepted while a squad unit awaits input. */
export function checkOrder(ctx: EffectCtx, orderId: string, targetCid?: string): string | null {
  const { cs } = ctx;
  const order = orderOf(ctx, orderId);
  if (!order) return `Unknown order "${orderId}".`;
  if (cs.phase !== 'awaiting' || !cs.awaitingCid) return 'Orders are only given while a unit awaits input.';
  let target;
  if (order.target === 'none') {
    if (targetCid !== undefined) return `${orderId} takes no target.`;
  } else {
    target = cs.combatants.find((c) => c.cid === targetCid);
    if (!target || !isStanding(target) || (target.side === 'enemy' && hasFlag(target, ctx.reg, 'untargetable'))) return 'The order needs a standing target.';
    if (order.target === 'ally' && target.side !== 'squad') return 'The order targets a squad unit.';
    if (order.target === 'enemy' && target.side !== 'enemy') return 'The order targets an enemy.';
    if (target.breakdown?.ignoresOrders) return `${target.nameKey} ignores orders.`;
  }
  const cost = orderCost(ctx, orderId, targetCid);
  if (cs.cp < cost) return `${orderId} needs ${cost} CP.`;
  return null;
}

const severityOfMissing = (missing: number): Severity => (missing < 0.15 ? 'minor' : missing < 0.4 ? 'moderate' : 'major');
const SEVERITY_RANK: Severity[] = ['minor', 'moderate', 'major', 'extreme'];

/** Adds a relation hint candidate, keeping one per (type, actor, target) at the highest severity. */
export function addHint(ctx: EffectCtx, hint: RelationHint): void {
  const key = (h: RelationHint) => `${h.type}|${h.actor}|${h.targets.join(',')}`;
  const existing = ctx.cs.hints.find((h) => key(h) === key(hint));
  if (!existing) ctx.cs.hints.push(hint);
  else if (SEVERITY_RANK.indexOf(hint.severity) > SEVERITY_RANK.indexOf(existing.severity)) existing.severity = hint.severity;
}

const PROTECTIVE_ORDERS = ['steady', 'hold_the_line', 'fall_back'];

function applyOrder(ctx: EffectCtx, order: OrderEntry, targetCid: string | undefined): void {
  const { cs } = ctx;
  const owner = targetCid && order.target === 'ally' ? targetCid : living(cs, 'squad')[0]?.cid;
  if (!owner) return;
  const woundedBefore = new Map(living(cs, 'squad').map((c) => [c.cid, c.hp / c.maxHp]));
  applyEffects(ctx, owner, order.effects, { targets: targetCid ? [targetCid] : [] }, `order:${order.id}`);
  cs.ordersThisRound.push({ orderId: order.id, ...(targetCid ? { targetCid } : {}) });
  cs.lastOrder = { orderId: order.id, ...(targetCid ? { targetCid } : {}) };
  ctx.log({ kind: 'order', orderId: order.id, ...(targetCid ? { target: targetCid } : {}) });
  if (PROTECTIVE_ORDERS.includes(order.id)) {
    const covered = order.target === 'ally' && targetCid ? [targetCid] : living(cs, 'squad').filter((c) => c.row === 'front').map((c) => c.cid);
    for (const cid of covered) {
      const pct = woundedBefore.get(cid);
      if (pct !== undefined && pct < 0.3) {
        const unitId = byCid(cs, cid).unitId;
        if (unitId) addHint(ctx, { type: 'protected', actor: 'commander', targets: [unitId], severity: severityOfMissing(1 - pct) });
      }
    }
  }
}

/**
 * Gives an order: pays CP, then the target may refuse (the highest matching `order_refusal` chance); a refusal keeps
 * the CP spent, stresses her, emits `order_refused` and is remembered as `cs.lastRefusal` (P6: `combat/compel` runs it
 * with `compel: true`, which skips the roll). Otherwise the order's effects run on the target (or the
 * squad) and the order is remembered for `sig_command_echo`.
 */
export function issueOrder(ctx: EffectCtx, orderId: string, targetCid?: string, opts: { free?: boolean; compel?: boolean } = {}): boolean {
  const { cs } = ctx;
  const order = orderOf(ctx, orderId)!;
  if (!opts.free) {
    cs.cp -= orderCost(ctx, orderId, targetCid);
    if (cs.presence?.steadyVoicePending) delete cs.presence.steadyVoicePending;
  }
  delete cs.lastRefusal; // any later order answers the refusal (P6)
  if (order.target === 'ally' && targetCid && opts.compel !== true) {
    const chance = Math.max(0, ...activePassives(ctx, targetCid, 'order_refusal')
      .filter((e) => matches(e.orders, orderId)).map((e) => e.chance ?? 0));
    if (chance > 0 && ctx.rng.chance(chance)) {
      ctx.log({ kind: 'order_refused', orderId, target: targetCid });
      ctx.emit({ type: 'order_refused', orderId, cid: targetCid, unitId: byCid(cs, targetCid).unitId });
      addStress(ctx, targetCid, TUNING.combat.stress.refusedOrder, 'order');
      cs.lastRefusal = { orderId, targetCid };
      return false;
    }
  }
  applyOrder(ctx, order, targetCid);
  return true;
}

/** `repeat_order` (sig_command_echo): the last order again, for free; the repeat is not itself repeatable. */
export function repeatLastOrder(ctx: EffectCtx): void {
  const { cs } = ctx;
  cs.repeatOrder = false;
  const last = cs.lastOrder;
  if (!last) return;
  const order = orderOf(ctx, last.orderId);
  if (!order) return;
  if (order.target !== 'none') {
    const t = cs.combatants.find((c) => c.cid === last.targetCid);
    if (!t || !isStanding(t) || (hasFlag(t, ctx.reg, 'untargetable') && order.target === 'enemy') || t.breakdown?.ignoresOrders) return;
  }
  issueOrder(ctx, last.orderId, last.targetCid, { free: true });
}
