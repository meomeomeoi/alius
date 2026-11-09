import { registerAction } from '../dispatch';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { buildCombat, checkStart } from '../combat/build';
import { fireTrigger, makeCtx, type EffectCtx } from '../combat/effects';
import { completeAction, performAction, runUntilInput, startRound } from '../combat/turn';
import type { PlannedAction, StartPayload } from '../combat/types';
import type { CampaignState } from '../state/types';

// Importing this module registers the combat actions.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Events every combat dispatch ends with: the new log lines, then what the combat waits for or how it ended. */
export function combatEvents(ctx: EffectCtx, start: number): EngineEvent[] {
  const { cs } = ctx;
  const out: EngineEvent[] = [{ type: 'combat_log', entries: cs.log.slice(Math.max(0, start)) }, ...ctx.events];
  if (cs.phase === 'ended') out.push({ type: 'combat_ended', outcome: cs.outcome });
  else if (cs.awaitingCid) out.push({ type: 'combat_awaiting', cid: cs.awaitingCid });
  return out;
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
  return [{ type: 'combat_started', id: cs.id }, ...combatEvents(ectx, 0)];
}

registerAction('combat/start', (draft, payload, ctx) => {
  if (!isObj(payload)) throw new Error('combat/start needs a payload');
  return startCombat(draft, ctx, payload as unknown as StartPayload);
});

registerAction('combat/act', (draft, payload, ctx) => {
  const cs = draft.combat;
  if (!cs) throw new Error('combat/act: no combat is open');
  if (cs.phase !== 'awaiting' || !cs.awaitingCid) throw new Error('combat/act: the combat is not waiting for an action');
  const action = isObj(payload) ? (payload.action as PlannedAction | undefined) : undefined;
  if (!isObj(action) || !['skill', 'guard', 'swap', 'pass'].includes(String(action.kind))) throw new Error('combat/act needs { action }');
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const start = cs.log.length;
  const cid = cs.awaitingCid;
  performAction(ectx, cid, action);
  completeAction(ectx, cid);
  runUntilInput(ectx);
  return combatEvents(ectx, start);
});

registerAction('combat/auto', (draft, payload, ctx) => {
  const cs = draft.combat;
  if (!cs) throw new Error('combat/auto: no combat is open');
  if (!isObj(payload) || typeof payload.on !== 'boolean') throw new Error('combat/auto needs { on: boolean }');
  if (cs.phase !== 'awaiting') throw new Error('combat/auto: the combat is already decided');
  const ectx = makeCtx(cs, draft, ctx.registries, ctx.rng);
  const start = cs.log.length;
  cs.auto = payload.on;
  if (payload.on) runUntilInput(ectx);
  return combatEvents(ectx, start);
});
