/**
 * Drills at the base (P16b, plan Tasks 7 and 8; spec section 5, ruling 3). A drill is a focus of the `train` activity that carries `drill: { key, partner? }`.
 * Alone it is one click: `TUNING.craft.xp.drill` to the discipline, once a day for each key, and the slot is spent (a second drill the same day pays 0). With a
 * companion who shares a drill that has an instrument (breath, weight) it pays x1.5 with a craft-live holder, x1.2 with another close woman, x1 with anyone else; (a scene with her comes in the next task). The activities layer imports nothing of this: it takes
 * the hooks `installDrillHooks` registers. Nothing is written or paid while no holder is craft-live; nothing here draws from the rng.
 */
import type { Registries } from '../../content/types';
import type { ActivityEffect } from '../../content/schemas';
import { registerDrillHooks, type DrillAt, type Focus } from '../activities';
import { bondTierOf } from '../bonds';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { trainedToday } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addCraftXp } from './book';
import { craftLive, craftOn } from './gate';
import { enduranceOf } from './state';

/** The multiplier of a drill shared with this companion: a craft-live holder x1.5, another close woman x1.2, anyone else (or nobody) x1. */
export function drillMult(state: CampaignState, reg: Registries, companionId?: string): number {
  if (companionId === undefined) return 1;
  const unit = state.squad.find((u) => u.id === companionId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return 1;
  if (craftLive(state, reg, companionId)) return TUNING.craft.drill.holder;
  return bondTierOf(state, reg, companionId) !== null ? TUNING.craft.drill.other : 1;
}

/** Has a drill of this key paid today already? An endurance drill reads P15a's `trainedDay`, every other key its own `drillDay`. */
export function drilledToday(state: Pick<CampaignState, 'commander' | 'day'>, key: string): boolean {
  const physics = enduranceOf(key);
  return physics !== null ? trainedToday(state, physics) : state.commander.craft?.[key]?.drillDay === state.day;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What a drill of this key pays now with this companion: `xp.drill` x the multiplier, once a day for each key (0 the second time). 0 while no holder is craft-live. */
export function drillXp(state: CampaignState, reg: Registries, key: string, companionId?: string): number {
  if (!craftOn(state, reg) || drilledToday(state, key)) return 0;
  return round2(TUNING.craft.xp.drill * drillMult(state, reg, companionId));
}

/**
 * Pays one drill: the xp of `drillXp` (or of `mult` when it is given: a partner drill that waited for its scene was priced when it was asked), stamps the day so the
 * next drill of the key pays 0, and says `drill_done`. The slot is not this function's. Nothing while no holder is craft-live.
 */
export function payDrill(draft: CampaignState, reg: Registries, key: string, o: { companionId?: string; mult?: number } = {}): EngineEvent[] {
  if (!craftOn(draft, reg)) return [];
  const mult = o.mult ?? drillMult(draft, reg, o.companionId);
  const xp = drilledToday(draft, key) ? 0 : round2(TUNING.craft.xp.drill * mult);
  const events: EngineEvent[] = [];
  if (xp > 0) {
    events.push(...addCraftXp(draft, reg, key, xp, 'drill'));
    const physics = enduranceOf(key);
    if (physics !== null) draft.commander.endurance![physics]!.trainedDay = draft.day;
    else draft.commander.craft![key]!.drillDay = draft.day;
  }
  events.push({ type: 'drill_done', key, ...(o.companionId !== undefined ? { companionId: o.companionId } : {}), mult, alone: o.companionId === undefined, xp });
  return events;
}

/** The activities' gate for a drill focus: an endurance drill alone is P15a's (always offered); every other drill, and any partner drill, needs a craft-live holder. */
function gate(state: CampaignState, reg: Registries, focus: Focus, mode: 'alone' | 'partner'): string | null {
  if (mode === 'alone' && enduranceOf(focus.drill!.key) !== null) return null;
  return craftOn(state, reg) ? null : `${focus.label} is not available yet.`;
}

/** The effect `commander_craft_xp`: an alone drill. */
function effect(draft: CampaignState, ctx: EngineCtx, fx: ActivityEffect): EngineEvent[] {
  return fx.type === 'commander_craft_xp' ? payDrill(draft, ctx.registries, fx.key) : [];
}

/**
 * A drill a companion shares (the activities' hook): it pays now, at the multiplier of the partner (a craft-live holder x1.5, another close woman x1.2, anyone else x1).
 * The day is the pair's (`partnerDay`: another holder reads it as jealousy).
 */
function partner(draft: CampaignState, ctx: EngineCtx, at: DrillAt): { events: EngineEvent[]; scene?: { locationId: string } } {
  const reg = ctx.registries;
  const rel = draft.relations[at.companionId];
  if (rel === undefined || !craftOn(draft, reg)) return { events: [] };
  (rel.craft ??= {}).partnerDay = draft.day;
  return { events: payDrill(draft, reg, at.focus.drill!.key, { companionId: at.companionId }) };
}

/** Installs the hooks the activities take (idempotent: the same hooks twice are one). */
export function installDrillHooks(): void {
  registerDrillHooks({ gate, effect, partner });
}

