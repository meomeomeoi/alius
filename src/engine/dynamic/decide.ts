/**
 * P10e-e Task 24b (P17g §2.12; review I6): a decision of her hour's script, taken over the commander's head while she sits on the commander (a
 * visitor's business on the throne). The script proposes; the engine decides the real matter and applies it through her command capability
 * (`countermand`, read by capability, never by domain id). Only `roster` exists for now: she takes a soldier off the commander's active roster,
 * the soldier picked by a stable hash (no rng) among the others on it, through `roster/set_active`'s own path (`setActiveRoster`, P12's
 * `actOnWarning` included). A requisition or a punishment is refused (author list: P17g); so is anything without the capability (her business
 * stays talk). Memory: none new (the roster change is `roster_changed`, as any).
 */
import type { Registries } from '../../content/types';
import { setActiveRoster } from '../actions/base';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { fnv1a } from '../hub';
import type { CampaignState } from '../state/types';
import { hasCapability } from './capabilities';

export const DECISION_KINDS = ['roster'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** `physics/decide { runId, kind }`: her decision in her frame (the run is hers), through the command capability. */
export function decideOverHead(draft: CampaignState, ctx: EngineCtx, payload: { runId?: unknown; kind?: unknown }): EngineEvent[] {
  const reg: Registries = ctx.registries;
  const run = draft.scene?.physics;
  if (!run || run.id !== payload.runId) throw new Error('physics/decide: stale physics run');
  if (run.sourceKind !== 'activity') throw new Error('physics/decide: only in her frame');
  if (payload.kind !== 'roster') throw new Error('physics/decide: only a roster decision is applied (a requisition or a punishment is not yet)');
  if (!hasCapability(draft, reg, run.holderId, 'countermand')) throw new Error('physics/decide: she does not hold the command');
  const others = draft.roster.activeIds.filter((id) => id !== run.holderId);
  if (others.length === 0 || draft.roster.activeIds.length < 2) throw new Error('physics/decide: nobody to take off the roster');
  const ref = others[fnv1a(`${draft.scene?.id ?? ''}|${run.id}|decide|${draft.day}`) % others.length]!;
  const events = setActiveRoster(draft, ctx, { activeIds: draft.roster.activeIds.filter((id) => id !== ref), wardenChecked: true });
  return [{ type: 'physics_decided', runId: run.id, holderId: run.holderId, kind: 'roster', ref }, ...events];
}
