import { registerAction } from '../dispatch';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { buildCombat, checkStart } from '../combat/build';
import { fireTrigger, makeCtx, type EffectCtx } from '../combat/effects';
import { checkOrder, issueOrder } from '../combat/orders';
import { finalizeCombat } from '../combat/outcome';
import { ENEMY_NAMES_MAX, isEnemyName } from '../combat/spawn';
import { completeAction, performAction, runUntilInput, startRound } from '../combat/turn';
import type { PlannedAction, StartPayload } from '../combat/types';
import type { CampaignState } from '../state/types';

// Importing this module registers the combat actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Ends every combat dispatch: the new log lines, what the combat waits for, or its end. A decided combat is
 * written back at once (`combat_ended`), except a loss with easy retry, which waits for RETRY or ACCEPT.
 */
function settle(draft: CampaignState, ctx: EngineCtx, ectx: EffectCtx, logStart: number): EngineEvent[] {
  const { cs } = ectx;
  const events: EngineEvent[] = [{ type: 'combat_log', entries: cs.log.slice(Math.max(0, logStart)) }, ...ectx.events];
  if (cs.phase === 'ended') {
    const outcome = cs.outcome!;
    if (outcome === 'lost' && cs.allowRetry) {
      cs.phase = 'lost_pending';
      events.push({ type: 'combat_lost_pending' });
    } else events.push(...finalizeCombat(draft, ctx.registries, ctx.rng, outcome));
  } else if (cs.awaitingCid) events.push({ type: 'combat_awaiting', cid: cs.awaitingCid });
  return events;
}

/** Builds the combat from a payload and runs it to the first squad decision. */
export function startCombat(draft: CampaignState, ctx: EngineCtx, payload: StartPayload): EngineEvent[] {
  const reason = checkStart(draft, ctx.registries, payload);
  if (reason) throw new Error(reason);
  const cs = buildCombat(draft, ctx.registries, ctx.rng, payload);
  draft.combat = cs;
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  fireTrigger(ectx, 'onCombatStart', {});
  startRound(ectx);
  runUntilInput(ectx);
  return [{ type: 'combat_started', id: cs.id }, ...settle(draft, ctx, ectx, 0)];
}

const open = (draft: CampaignState, what: string) => {
  if (!draft.combat) throw new Error(`${what}: no combat is open`);
  return draft.combat;
};

registerAction('combat/start', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('combat/start needs a payload');
  return startCombat(draft, ctx, payload as unknown as StartPayload);
});

registerAction('combat/act', (draft, payload, ctx) => {
  const cs = open(draft, 'combat/act');
  if (cs.phase !== 'awaiting' || !cs.awaitingCid) throw new Error('combat/act: the combat is not waiting for an action');
  const action = isObj(payload) ? (payload.action as PlannedAction | undefined) : undefined;
  if (!isObj(action) || !['skill', 'guard', 'swap', 'pass'].includes(String(action.kind))) throw new Error('combat/act needs { action }');
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const start = cs.log.length;
  const cid = cs.awaitingCid;
  performAction(ectx, cid, action);
  completeAction(ectx, cid);
  runUntilInput(ectx);
  return settle(draft, ctx, ectx, start);
});

registerAction('combat/auto', (draft, payload, ctx) => {
  const cs = open(draft, 'combat/auto');
  if (!isObj(payload) || typeof payload.on !== 'boolean') throw new Error('combat/auto needs { on: boolean }');
  if (cs.phase !== 'awaiting') throw new Error('combat/auto: the combat is already decided');
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const start = cs.log.length;
  cs.auto = payload.on;
  if (payload.on) runUntilInput(ectx);
  return settle(draft, ctx, ectx, start);
});

registerAction('combat/order', (draft, payload, ctx) => {
  const cs = open(draft, 'combat/order');
  if (!isObj(payload) || typeof payload.orderId !== 'string' || (payload.targetCid !== undefined && typeof payload.targetCid !== 'string')) {
    throw new Error('combat/order needs { orderId, targetCid? }');
  }
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const reason = checkOrder(ectx, payload.orderId, payload.targetCid);
  if (reason) throw new Error(reason);
  const start = cs.log.length;
  issueOrder(ectx, payload.orderId, payload.targetCid);
  return settle(draft, ctx, ectx, start);
});

/** Leaves a running combat: finalized as `retreated` (loss rules without easy retry). */
registerAction('combat/retreat', (draft, _payload, ctx) => {
  const cs = open(draft, 'combat/retreat');
  if (cs.phase !== 'awaiting') throw new Error('combat/retreat: the combat is not running');
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const start = cs.log.length;
  cs.phase = 'ended';
  cs.outcome = 'retreated';
  cs.awaitingCid = undefined;
  return settle(draft, ctx, ectx, start);
});

/** Easy retry: rewinds the rng and rebuilds the combat from its stored start payload (exactly the state after `combat/start`). */
registerAction('combat/retry', (draft, _payload, ctx) => {
  const cs = open(draft, 'combat/retry');
  if (cs.phase !== 'lost_pending') throw new Error('combat/retry: only a lost combat with easy retry can be retried');
  const { rng, payload } = cs.start;
  delete draft.combat;
  ctx.rng.restore(rng);
  return startCombat(draft, ctx, payload);
});

/** Accepts the defeat: the lost combat is written back as it stands. */
registerAction('combat/accept', (draft, _payload, ctx) => {
  const cs = open(draft, 'combat/accept');
  if (cs.phase !== 'lost_pending') throw new Error('combat/accept: there is no lost combat to accept');
  return finalizeCombat(draft, ctx.registries, ctx.rng, 'lost');
});

/** Caches a generated name for an affixed enemy (`enemyId|affixes`); the 100 most recent are kept. */
registerAction('combat/set_enemy_name', (draft, payload) => {
  const p = isObj(payload) ? payload : {};
  if (typeof p.key !== 'string' || !/^[a-z0-9_:.-]+(\|[a-z0-9_:.,-]*)?$/.test(p.key)) throw new Error('combat/set_enemy_name needs a valid key');
  if (!isEnemyName(p.name)) throw new Error('combat/set_enemy_name: the name must be 1 to 3 words of letters, at most 32 characters');
  const names = draft.enemyNames ?? {};
  delete names[p.key];
  names[p.key] = p.name;
  const keys = Object.keys(names);
  for (const old of keys.slice(0, Math.max(0, keys.length - ENEMY_NAMES_MAX))) delete names[old];
  draft.enemyNames = names;
  return [{ type: 'enemy_named', key: p.key, name: p.name }];
});

/** Per-campaign combat difficulty (SYS); not while a combat is open. */
registerAction('campaign/set_difficulty', (draft, payload) => {
  const d = isObj(payload) ? payload.difficulty : undefined;
  if (d !== 'story' && d !== 'normal' && d !== 'hard') throw new Error('campaign/set_difficulty needs { difficulty: story | normal | hard }');
  if (draft.combat) throw new Error('The difficulty cannot change during a combat.');
  draft.difficulty = d;
  return [{ type: 'difficulty_changed', difficulty: d }];
});
