import type { EngineCtx, EngineEvent } from './dispatch';
import { facilityEffect, facilityLevels, isLiving, recoverUnit, rosterCapacityFor, runUpkeep } from './economy';
import type { CampaignState, Slot } from './state/types';
import { TUNING } from './tuning';

export const SLOT_ORDER: readonly Slot[] = ['morning', 'afternoon', 'evening', 'night'];

/** How many slots can still be consumed before the day ends. */
export const slotsLeftToday = (slot: Slot): number => ({ morning: 3, afternoon: 2, evening: 1, night: 1 })[slot];

/** The ordered day-end pipeline (spec §1). */
export const DAY_END_STEPS = [
  'upkeep', 'ticks', 'facility_timers', 'mission_deadlines', 'director_tick', 'dm_rumors', 'night_check', 'autosave',
] as const;
export type DayEndStep = (typeof DAY_END_STEPS)[number];

/** The steps later packages may plug into (P5 missions and director, P3/P5 DMs and rumors). */
export type HookStep = 'mission_deadlines' | 'director_tick' | 'dm_rumors';
type StepFn = (draft: CampaignState, ctx: EngineCtx) => EngineEvent[];

const hooks: Record<HookStep, StepFn[]> = { mission_deadlines: [], director_tick: [], dm_rumors: [] };

/** Adds a function to a hook step; several packages may share one step, they run in registration order. */
export function registerDayEndStep(id: HookStep, fn: StepFn): void {
  if (!(id in hooks)) throw new Error(`"${id}" is not a pluggable day-end step`);
  hooks[id].push(fn);
}
export function resetDayEndSteps(): void {
  for (const k of Object.keys(hooks) as HookStep[]) hooks[k] = [];
}

/** Replaces everything inside `target` with the contents of `source` (the draft object itself must stay). */
function replaceContents(target: CampaignState, source: CampaignState): void {
  for (const k of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[k];
  Object.assign(target, source);
}

/** A hook runs on a copy: if it throws, its changes are dropped and the day still ends. */
function runHook(step: HookStep, fn: StepFn, draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const work = structuredClone(draft);
  try {
    const events = fn(work, ctx);
    replaceContents(draft, work);
    return events;
  } catch (e) {
    return [{ type: 'day_end_step_failed', step, message: e instanceof Error ? e.message : String(e) }];
  }
}

export const clockText = (day: number, slot: Slot): string => `DAY ${String(day).padStart(3, '0')} // ${slot.toUpperCase()}`;

function rollover(draft: CampaignState): EngineEvent[] {
  draft.day += 1;
  draft.slot = 'morning';
  delete draft.calendar.nightEvent;
  for (const r of Object.values(draft.relations)) r.dailyGain = { trust: 0, affinity: 0, attraction: 0 };
  return [{ type: 'day_started', day: draft.day }];
}

function ticks(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  const speed = 1 + facilityEffect(draft, ctx.registries, 'medbay', 'injurySpeed');
  for (const u of draft.squad) {
    if (!isLiving(u)) continue;
    if (u.injuryDays !== undefined) {
      u.injuryDays -= speed;
      if (u.injuryDays <= 0) {
        events.push(recoverUnit(draft, u));
      }
    }
    u.stress = Math.max(0, u.stress - TUNING.passiveStressRecovery);
  }
  return events;
}

function facilityTimers(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (!draft.base.upgrades) return events;
  const pending: NonNullable<CampaignState['base']['upgrades']> = [];
  for (const up of draft.base.upgrades) {
    up.daysLeft -= 1;
    if (up.daysLeft > 0) {
      pending.push(up);
      continue;
    }
    const max = facilityLevels(ctx.registries, up.facilityId).length || up.toLevel;
    draft.base.facilities[up.facilityId] = Math.min(up.toLevel, max);
    if (up.facilityId === 'barracks') draft.roster.capacity = rosterCapacityFor(ctx.registries, draft.base.facilities.barracks);
    events.push({ type: 'facility_upgraded', facilityId: up.facilityId, level: draft.base.facilities[up.facilityId] });
  }
  draft.base.upgrades = pending;
  return events;
}

function nightCheck(draft: CampaignState): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (draft.calendar.nightEventsQueue.length > 0) {
    draft.calendar.nightEvent = draft.calendar.nightEventsQueue.shift();
    draft.slot = 'night';
    events.push({ type: 'slot_advanced', from: 'evening', to: 'night', day: draft.day });
    events.push({ type: 'night_started', entry: draft.calendar.nightEvent });
  } else {
    events.push({ type: 'slot_advanced', from: 'evening', to: 'morning', day: draft.day + 1 });
    events.push(...rollover(draft));
  }
  return events;
}

function endOfDay(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const step of DAY_END_STEPS) {
    events.push({ type: 'day_end_step', step, day: draft.day });
    switch (step) {
      case 'upkeep': events.push(...runUpkeep(draft, ctx.registries)); break;
      case 'ticks': events.push(...ticks(draft, ctx)); break;
      case 'facility_timers': events.push(...facilityTimers(draft, ctx)); break;
      case 'night_check': events.push(...nightCheck(draft)); break;
      case 'autosave': events.push({ type: 'autosave' }); break;
      default:
        for (const fn of hooks[step]) events.push(...runHook(step, fn, draft, ctx));
    }
  }
  return events;
}

/**
 * Consumes `count` slots. Spending the Evening runs the day-end pipeline once; the Night slot,
 * when entered, ends with a plain rollover. Callers must check `slotsLeftToday` first.
 */
export function consumeSlots(draft: CampaignState, count: number, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (let i = 0; i < count; i++) {
    const from = draft.slot;
    if (from === 'evening') {
      events.push(...endOfDay(draft, ctx));
    } else if (from === 'night') {
      events.push({ type: 'slot_advanced', from: 'night', to: 'morning', day: draft.day + 1 });
      events.push(...rollover(draft));
      events.push({ type: 'autosave' });
    } else {
      draft.slot = SLOT_ORDER[SLOT_ORDER.indexOf(from) + 1];
      events.push({ type: 'slot_advanced', from, to: draft.slot, day: draft.day });
    }
  }
  return events;
}

/** Injures the commander for `days` (Commander Crisis, P4; the `commander/injure` action). Blocks `train` and `work`. */
export function injureCommander(draft: CampaignState, days: number): EngineEvent[] {
  const until = Math.max(draft.commander.injuredUntilDay ?? 0, draft.day + days);
  draft.commander.injuredUntilDay = until;
  return [{ type: 'commander_injured', days, until }];
}
