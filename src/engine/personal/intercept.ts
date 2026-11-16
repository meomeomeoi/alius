import type { Registries } from '../../content/types';
import { impunityOf } from '../discipline/impunity';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { assertiveness } from '../power/options';
import type { CampaignState, InterceptChannel } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { pressureGate, pressureMultOf } from './gates';
import { nextPersonalId, personalOf } from './state';

export const INTERCEPT_CHANNELS: readonly InterceptChannel[] = ['dm', 'leash', 'recruit'];

/**
 * Who edits what the commander is about to send (P9c §1, level 4): among the units that pass the `intercept` gate and have not
 * edited today, the one with the highest Impunity (ties: squad order); for a DM never the recipient. Pure; `null` = nobody.
 */
export function interceptEditor(state: CampaignState, reg: Registries, channel: InterceptChannel, toUnitId?: string): string | null {
  const editedToday = new Set((state.personal?.intercepts?.log ?? []).filter((e) => e.day === state.day).map((e) => e.unitId));
  let best: { id: string; impunity: number } | null = null;
  for (const u of state.squad) {
    if (u.kind !== 'named' || editedToday.has(u.id) || (channel === 'dm' && u.id === toUnitId)) continue;
    if (pressureGate(state, reg, u.id, 'intercept') !== null) continue;
    const impunity = impunityOf(state, reg, u.id)?.value ?? 0;
    if (best === null || impunity > best.impunity) best = { id: u.id, impunity };
  }
  return best?.id ?? null;
}

/**
 * The roll for one thing the commander is about to send (a DM to another soldier, a Leash request, a recruit order). No editor,
 * or an intercept already waiting: no draw. Else one draw at `chance × demandMult × pressureMult` (capped); a hit stores the
 * waiting edit and logs the day, so she edits at most once a day. The engine never stores the edited text.
 */
export function rollIntercept(draft: CampaignState, ctx: EngineCtx, p: { channel: InterceptChannel; toUnitId?: string }): EngineEvent[] {
  const reg = ctx.registries;
  if (draft.personal?.intercepts?.open !== undefined) return [{ type: 'device_intercept', hit: false }];
  const unitId = interceptEditor(draft, reg, p.channel, p.toUnitId);
  if (unitId === null) return [{ type: 'device_intercept', hit: false }];
  const T = TUNING.personal.intercept;
  const chance = Math.min(T.cap, T.chance * assertiveness(draft, reg).demandMult * pressureMultOf(draft, reg, unitId));
  if (!ctx.rng.chance(chance)) return [{ type: 'device_intercept', hit: false }];
  const personal = personalOf(draft);
  const id = nextPersonalId(draft, 'icp');
  const intercepts = (personal.intercepts ??= { log: [] });
  intercepts.open = { id, unitId, channel: p.channel, ...(p.toUnitId !== undefined ? { toUnitId: p.toUnitId } : {}), day: draft.day, status: 'open' };
  intercepts.log.push({ unitId, day: draft.day });
  return [{ type: 'device_intercept', hit: true, interceptId: id, unitId, channel: p.channel }];
}

/**
 * KEEP or REVERT. KEEP: a DM edit stays (`kept`) until the app sends it once with `dm/send { interceptId }`; a request edit
 * closes at once and nothing is filed. REVERT: `overrode_her` (moderate, × her `pressureMult`) and the record the override
 * costs; the app then sends the original or files the request. Only an edit that still waits (`open`) can be answered.
 */
export function resolveIntercept(draft: CampaignState, ctx: EngineCtx, id: string, keep: boolean): EngineEvent[] {
  const intercepts = draft.personal?.intercepts;
  const open = intercepts?.open;
  if (!intercepts || !open || open.id !== id || open.status !== 'open') throw new Error('That edit is not waiting for an answer.');
  const done: EngineEvent = { type: 'intercept_resolved', id, unitId: open.unitId, channel: open.channel, keep };
  if (keep) {
    if (open.channel === 'dm') open.status = 'kept';
    else delete intercepts.open;
    return [done];
  }
  delete intercepts.open;
  return [
    done,
    ...hitHer(draft, ctx.registries, open.unitId, 'overrode_her', 'moderate', 'reverted her edit', { amplified: true }),
    ...addRecord(draft, open.unitId, TUNING.personal.overrideRecord, 'override'),
  ];
}

/**
 * A kept DM edit is sent: it must be the kept intercept of today for this recipient. Closes it (so it is used once) and
 * returns who edited, for `DmMessage.editedBy`.
 */
export function takeKeptEdit(draft: CampaignState, interceptId: string, recipientId: string): string {
  const intercepts = draft.personal?.intercepts;
  const open = intercepts?.open;
  if (!intercepts || !open || open.id !== interceptId || open.status !== 'kept' || open.channel !== 'dm' || open.toUnitId !== recipientId || open.day !== draft.day) {
    throw new Error('That edit is not waiting to be sent.');
  }
  delete intercepts.open;
  return open.unitId;
}

/** The day step's part: a pending edit is dropped with no effect (the app was closed) and the log keeps only the last days. */
export function interceptDayStep(draft: CampaignState): EngineEvent[] {
  const intercepts = draft.personal?.intercepts;
  if (!intercepts) return [];
  delete intercepts.open;
  intercepts.log = intercepts.log.filter((e) => e.day > draft.day - TUNING.personal.intercept.logDays);
  return [];
}
