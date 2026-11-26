/**
 * P10e-e Task 24b (P17g §2.12): a decision of her hour's script, taken over the commander's head while she sits on the commander (a visitor's
 * business on the throne). The script proposes; the engine decides which real matter it is and applies it through P15's command capability
 * (`countermand`, read by capability, never by domain id): a `roster` decision takes a soldier off the commander's active roster (or puts one
 * back); a `requisition` or a `punishment` is her word on the commander's request or the commander's discipline, recorded and not applied here
 * (P9 owns punishments and P5 the requisitions: the event is what reaches the scene). Without the capability she decides nothing (refused: the
 * visitor's business stays talk). No draw. Memory: none new (`physics_decided` is remembered where its command action writes; the roster change
 * is `roster_changed`, as any).
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { hasCapability } from './capabilities';

export const DECISION_KINDS = ['roster', 'requisition', 'punishment'] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

/** `physics/decide { runId, kind, ref? }`: her decision in her frame (the run is hers), through the command capability. */
export function decideOverHead(draft: CampaignState, reg: Registries, payload: { runId?: unknown; kind?: unknown; ref?: unknown }): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!run || run.id !== payload.runId) throw new Error('physics/decide: stale physics run');
  if (run.sourceKind !== 'activity') throw new Error('physics/decide: only in her frame');
  if (typeof payload.kind !== 'string' || !(DECISION_KINDS as readonly string[]).includes(payload.kind)) throw new Error('physics/decide: kind is roster, requisition or punishment');
  if (!hasCapability(draft, reg, run.holderId, 'countermand')) throw new Error('physics/decide: she does not hold the command');
  const kind = payload.kind as DecisionKind;
  const ref = typeof payload.ref === 'string' && payload.ref !== '' ? payload.ref : undefined;
  const events: EngineEvent[] = [];
  if (kind === 'roster') {
    const unit = draft.squad.find((u) => u.id === ref);
    if (!unit || !isLiving(unit) || unit.id === run.holderId) throw new Error('physics/decide: a roster decision names another living soldier');
    const active = draft.roster.activeIds.includes(unit.id);
    const next = active ? draft.roster.activeIds.filter((id) => id !== unit.id) : [...draft.roster.activeIds, unit.id];
    if (next.length === 0 || next.length > TUNING.rosterActiveMax) throw new Error('physics/decide: the roster cannot take that');
    unit.status = active ? 'reserve' : unit.status === 'reserve' ? 'active' : unit.status;
    draft.roster.activeIds = next;
    events.push({ type: 'roster_changed', activeIds: [...next], by: run.holderId });
  }
  return [{ type: 'physics_decided', runId: run.id, holderId: run.holderId, kind, ...(ref !== undefined ? { ref } : {}) }, ...events];
}
