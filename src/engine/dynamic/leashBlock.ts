/**
 * The Leash block (P15, plan R16, spec §10): a holder with the `leash_block` capability and the hold its domain asks for holds every Leash request
 * the commander files, on anyone (and on her): she co-signs with a chance that follows her favour, or the request is cancelled. P13's co-sign
 * (the warden's) runs first; this is the second hand. Each blocked request is logged `denied` copying her, pushes its day into the oversight
 * count (`oversight.ts` reads it) and counts on her relation. Code reads the block by its capability, never by a domain id.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState, LeashKind } from '../state/types';
import { TUNING } from '../tuning';
import { bandMin, domainEntry, standing } from './capabilities';
import { dynamicOn } from './gate';
import { dynamicOf } from './state';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The holder whose domain grants the block and whose hold still meets that domain's band, in squad order; `null` without one (or while the dynamic is off). Pure. */
export function leashBlockOf(state: CampaignState, reg: Registries): string | null {
  if (!dynamicOn(state, reg)) return null;
  for (const u of state.squad) {
    const dyn = u.kind === 'named' && isLiving(u) ? dynamicOf(state, u.id) : undefined;
    if (dyn === undefined) continue;
    const holds = dyn.domains.some((d) => {
      const entry = domainEntry(reg, d.id);
      return entry !== undefined && standing(d, state.day) && entry.grants.includes('leash_block') && dyn.hold >= bandMin(reg, entry);
    });
    if (holds) return u.id;
  }
  return null;
}

/** `clamp(0.2 + 0.3 x favour / 20, 0, 0.5)`: the chance she co-signs a request. The target's identity does not matter. Hidden: it never reaches an event, a toast or a reading. */
export function blockCosignChance(state: CampaignState, _reg: Registries, holderId: string): number {
  const B = TUNING.dynamic.block;
  const favour = dynamicOf(state, holderId)?.favour ?? 0;
  return clamp(B.base + (B.perFavour * favour) / TUNING.dynamic.favour.max, B.min, B.max);
}

/** Writes today into oversight's count and onto her relation (the block's own count). Never draws. */
export function noteBlocked(draft: CampaignState, holderId: string): void {
  const x = draft.dynamic;
  if (x === undefined) return;
  (x.oversight ??= { blocked: [] }).blocked.push(draft.day);
  const dyn = dynamicOf(draft, holderId);
  if (dyn !== undefined) dyn.leashBlock = { since: dyn.leashBlock?.since ?? draft.day, held: (dyn.leashBlock?.held ?? 0) + 1 };
}

/**
 * Asks the holder to co-sign a request the commander files (after the warden has, when there is one). With no block it is ok at once and draws
 * nothing. A request on the holder herself is blocked without a draw (as the warden's is). Otherwise one draw. A blocked request emits
 * `leash_blocked { unitId, holderId, kind }`, counts toward the inquiry and returns her id (`holderId`) so the caller logs the `denied` entry
 * with her as `cc`; nothing is spent here.
 */
export function rollBlock(draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>, targetId: string, kind: LeashKind): { ok: boolean; events: EngineEvent[]; holderId?: string } {
  const holderId = leashBlockOf(draft, ctx.registries);
  if (holderId === null) return { ok: true, events: [] };
  const pass = draft.dynamic?.oversight?.pass;
  if (pass !== undefined) {
    // a bypass was taken for this one request: it goes unheld; any other pass is stale (it was for another request) and is dropped
    delete draft.dynamic!.oversight!.pass;
    if (pass.unitId === targetId && pass.kind === kind) return { ok: true, events: [] };
  }
  const ok = targetId !== holderId && ctx.rng.chance(blockCosignChance(draft, ctx.registries, holderId));
  if (ok) return { ok: true, events: [] };
  noteBlocked(draft, holderId);
  return { ok: false, holderId, events: [{ type: 'leash_blocked', unitId: targetId, holderId, kind }] };
}
