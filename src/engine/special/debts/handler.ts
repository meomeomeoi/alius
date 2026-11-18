import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { hasTraitEffect } from '../../commander/traits';
import { fnv1a } from '../../hub';
import { nextId } from '../../memory/facts';
import { enqueueNight } from '../../night';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { HANDLER_UNIT, HANDLER_VISIT_KIND, specialOf, type DebtsState } from '../state';

/** An empty debts block for a campaign served by this handler. */
export const newDebts = (corporationId: string, handlerId: string): DebtsState => ({
  corporationId, handlerId, visitSeq: 0, answered: [], handlerSuspicion: 0, handlerPressure: 0, oversightSuspicion: 0, scheduled: [], exposures: [],
});

/**
 * Who buys the commander's intel: the first corporation (in registry order) that is not the commander's own, and a handler that serves
 * it, picked by a hash of the campaign's rng state at seed time (no draw). `null` without a rival or a handler. The result is stored.
 */
export function pickHandler(state: CampaignState, reg: Registries): { corporationId: string; handlerId: string } | null {
  const corporationId = [...reg.corporations.keys()].find((id) => id !== state.commander.corporationId);
  if (corporationId === undefined) return null;
  const pool = [...reg.debtHandlers.values()].filter((h) => {
    const serves = (h.corporations as string[] | undefined) ?? [];
    return serves.length === 0 || serves.includes(corporationId);
  });
  if (pool.length === 0) return null;
  return { corporationId, handlerId: pool[fnv1a(JSON.stringify(state.rng)) % pool.length].id };
}

/** The debts block, when the arrangement is on (the trait is present and the seed found a handler). */
export const debtsOf = (draft: CampaignState): DebtsState | undefined => specialOf(draft).debts;

/**
 * Once the last visit is 5 or more days behind (a new campaign counts from day 0), one draw at `min(1, (daysSince − 4) / 4)`, so about
 * weekly and never before day 5. A hit queues the handler's night entry (own panel, no unit, priority 6) and fixes the visit. No roll
 * while a visit waits or once the arrangement has ended; nothing at all without the debts effect.
 */
export function rollVisit(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (!hasTraitEffect(draft, ctx.registries, 'debts')) return [];
  const d = draft.special?.debts;
  if (!d || d.ended !== undefined || d.visit !== undefined) return [];
  const T = TUNING.special.debts;
  const since = draft.day - (d.lastVisitDay ?? 0);
  if (since < T.minDays) return [];
  if (!ctx.rng.chance(Math.min(1, (since - T.minDays + 1) / T.rampDays))) return [];
  const entry = {
    id: nextId(draft, 'n'), unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: T.priority, framing: T.framing,
    ignore: { event: 'dismissed', severity: 'minor' } as const, expiresDay: draft.day + T.expiresDays,
  };
  if (!enqueueNight(draft, entry)) return [];
  d.visitSeq += 1;
  d.lastVisitDay = draft.day;
  d.visit = { id: `hv${d.visitSeq}`, day: draft.day, items: [] };
  return [{ type: 'handler_visit', visitId: d.visit.id }];
}
