/**
 * The command domain (P15, plan R13): P13's override generalised over its source. A holder whose domains grant `countermand` may overrule an order
 * that cuts across what she expects, with the same chance formula as the warden's (`weight x authority x leniency x 2.0`, capped), where her
 * authority is her hold. Her agenda is P13's fallback over her values, and a possessive or obsessive holder also wants the commander close and no
 * romance with others. The warden rolls first at every hook; the first override wins, and one is open at a time. The slot of a holder's override
 * is `state.dynamic.override`; the warden's stays in `leashswap.warden.override`, so P13 saves are untouched.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { fallbackAgenda } from '../warden/agenda';
import { OPEN_FIRST_HOLDER, rollOverride, type OverrideSource } from '../warden/override';
import { openOverrideOf, overrideOpen, wardenUnitId, type Expectation, type WardenOrder } from '../warden/state';
import { TUNING } from '../tuning';
import { hasCapability } from './capabilities';
import { dynamicOn } from './gate';
import { dynamicOf } from './state';
import type { Judged } from '../warden/conflict';

/** The expectations a possessive or obsessive holder adds at the top weight (P13's own kinds). */
const POSSESSIVE_KINDS = ['keep_me_close', 'no_romance_with_others'] as const;

/**
 * What she expects of the commander's orders: P13's fallback agenda over her values, all of it known to her; with a possessive or obsessive primary
 * style, `keep_me_close` and `no_romance_with_others` at the top weight of the list (a kind the fallback already has is raised to it). Draws nothing.
 */
export function holderAgenda(state: CampaignState, reg: Registries, unitId: string): Expectation[] {
  const base = fallbackAgenda(state, reg, unitId).map((x): Expectation => ({ ...x, known: true }));
  const primary = state.squad.find((u) => u.id === unitId)?.bond?.practice?.style.primary;
  if (primary !== 'possessive' && primary !== 'obsessive') return base;
  const top = Math.max(0, ...base.map((x) => x.weight), ...(base.length === 0 ? [0.5] : []));
  const out = base.map((x) => (POSSESSIVE_KINDS.some((k) => k === x.kind) ? { ...x, weight: top } : x));
  for (const kind of POSSESSIVE_KINDS) {
    if (!out.some((x) => x.kind === kind)) out.push({ id: `x${out.length + 1}`, kind, weight: top, source: 'card', known: true });
  }
  return out;
}

/**
 * The source of a holder's override: her hold is her authority, her Affinity softens her (`1 - 0.5 x max(0, affinity) / 100`) and her agenda is
 * `holderAgenda`. `null` unless the dynamic is on and her domains grant `countermand`. Pure.
 */
export function holderSource(state: CampaignState, reg: Registries, unitId: string): OverrideSource | null {
  const dyn = dynamicOf(state, unitId);
  const unit = state.squad.find((u) => u.id === unitId);
  if (dyn === undefined || unit === undefined || !isLiving(unit) || !hasCapability(state, reg, unitId, 'countermand')) return null;
  const affinity = state.relations[unitId]?.affinity ?? 0;
  // the command she kept through a struggle rolls with an authority of its own while it lasts: her hold is 0 once she is no longer the holder
  const authority = dyn.aftermath?.kind === 'command_kept' ? Math.max(dyn.hold / 100, TUNING.dynamic.commandKeptAuthority) : dyn.hold / 100;
  return { kind: 'holder', unitId, authority, leniency: 1 - (0.5 * Math.max(0, affinity)) / 100, expectations: holderAgenda(state, reg, unitId) };
}

/** The holders who may countermand, by hold, highest first (squad order breaks a tie). */
function countermanders(state: CampaignState, reg: Registries): string[] {
  if (state.dynamic === undefined || !dynamicOn(state, reg)) return [];
  return state.squad
    .filter((u) => u.kind === 'named' && u.id !== wardenUnitId(state) && hasCapability(state, reg, u.id, 'countermand'))
    .map((u, order) => ({ id: u.id, order, hold: dynamicOf(state, u.id)!.hold }))
    .sort((a, b) => b.hold - a.hold || a.order - b.order)
    .map((x) => x.id);
}

/**
 * The roll at every hook of an order (an activity, a roster, an expedition, a decision, a combat order): the warden first, as before; if she did
 * not override, each holder with `countermand` rolls in descending hold, and the first override wins. Returns `null` when nothing was overridden
 * and the events of the override otherwise. A roll draws only when a conflict exists for its source; without a holder with the capability this is
 * exactly `rollOverride`. Throws while an override waits (the warden's or a holder's): answer it first.
 */
export function rollOverrides(
  draft: CampaignState, ctx: EngineCtx, order: WardenOrder, opts: { judged?: Judged; payload?: Record<string, unknown> } = {},
): EngineEvent[] | null {
  if (draft.dynamic?.override !== undefined && overrideOpen(draft) !== null) throw new Error(OPEN_FIRST_HOLDER); // a holder's override waits, whoever else could roll
  const first = rollOverride(draft, ctx, order, opts);
  if (first) return first;
  for (const id of countermanders(draft, ctx.registries)) {
    const source = holderSource(draft, ctx.registries, id);
    if (source === null) continue;
    const hit = rollOverride(draft, ctx, order, { ...opts, source });
    if (hit) return hit;
  }
  return null;
}

// `openOverrideOf` lives in the warden's leaf (`dispatch` and P13's readers ask it too); it is the dynamic's as well.
export { openOverrideOf };
