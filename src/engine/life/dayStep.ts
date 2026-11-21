import type { EngineCtx, EngineEvent } from '../dispatch';
import type { Registries } from '../../content/types';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { applyLifeEvent, pickLifeEvent } from './events';
import { deliverNews, staleSweep } from './news';
import { friendHobbies, interestTick, practise, practiceSlots } from './hobbies';
import { busySlot, takesPart, type DayPlaces } from './places';
import { ensureLife, lifeMode } from './state';

/**
 * Records that these units are with the commander now (a companion, a roster activity, a scene): they cannot be anywhere else this slot, and
 * `requires.activity` reads the activity. A no-op while life is off. The list keeps today and yesterday; `slot` is `busySlot(day, slot)`.
 */
export function noteBusy(draft: CampaignState, unitIds: readonly string[], activityId?: string): void {
  if (lifeMode(draft) === 'off') return;
  const life = ensureLife(draft);
  const slot = busySlot(draft.day, draft.slot);
  const keepFrom = busySlot(draft.day - 1, 'morning');
  life.busy = life.busy.filter((b) => b.slot >= keepFrom);
  for (const unitId of new Set(unitIds)) {
    const have = life.busy.find((b) => b.unitId === unitId && b.slot === slot && (activityId === undefined || b.activityId === activityId));
    if (!have) life.busy.push({ unitId, slot, ...(activityId !== undefined ? { activityId } : {}) });
  }
}

/**
 * The units that died since the last day end are recorded once (a grunt or a named soldier), for the events that remember a loss. With
 * `old` they are marked as dead before life began (an old save turned on): their day is not the day they died, so nothing reads it.
 */
export function recordDeaths(draft: CampaignState, old = false): void {
  const life = ensureLife(draft);
  for (const u of draft.squad) {
    if (u.status !== 'dead' || life.deaths.some((d) => d.unitId === u.id)) continue;
    life.deaths.push({ unitId: u.id, day: draft.day, grunt: u.kind === 'grunt', ...(old ? { old: true as const } : {}) });
  }
}

/**
 * Each woman practises in the slots `practiceSlots` lists. A slot shared with another woman who has the same hobby in the same room is a push
 * for both (they practise together); the plans are all made before anyone practises. Returns what was planned too, for the friends' hobbies.
 */
function practicePass(draft: CampaignState, reg: Registries, day: number, places: DayPlaces): { events: EngineEvent[]; plans: Map<string, Array<{ slot: Slot; hobbyId: string; roomId: string }>> } {
  const plans = new Map(draft.squad.map((u) => [u.id, practiceSlots(draft, reg, u.id, day, places)] as const).filter(([, slots]) => slots.length > 0));
  const events: EngineEvent[] = [];
  for (const [unitId, slots] of plans) {
    for (const p of slots) {
      const together = [...plans].some(([o, theirs]) => o !== unitId && theirs.some((q) => q.slot === p.slot && q.hobbyId === p.hobbyId && q.roomId === p.roomId));
      events.push(...practise(draft, reg, unitId, p.hobbyId, day, p.slot, together ? { push: true } : {}));
    }
  }
  return { events, plans };
}

/**
 * The day of her hobbies: practice, the hobbies friends pass on, then the tick of every hobby (interest, cooling, dropping, decay). Exported
 * so the cycle can be run without the life events (the simulation of the hobby cycle does).
 */
export function hobbyPass(draft: CampaignState, reg: Registries, day: number, places: DayPlaces = new Map()): EngineEvent[] {
  const practice = practicePass(draft, reg, day, places);
  const events = [...practice.events, ...friendHobbies(draft, reg, day, places, practice.plans)];
  for (const unit of draft.squad) events.push(...interestTick(draft, reg, unit.id, day));
  return events;
}

/**
 * The day-end step of her life (the `dm_rumors` hook, after development's). It runs for the day that is ending and does nothing while life is
 * off. In order: a shortage noted, the deaths, then for each named soldier at the base (squad order) the life event of her day, the practice
 * of the day, the hobbies friends pass on, the weekly tick of every hobby (interest, cooling, dropping, decay), and last the news: what has gone stale, then
 * what is told today. No rng is drawn.
 */
export function lifeDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (lifeMode(draft) === 'off') return [];
  const created = draft.life === undefined; // the setting was set without the action: whoever is already dead is not a recent death
  const life = ensureLife(draft);
  const reg = ctx.registries;
  const day = draft.day;
  if ((draft.calendar.shortageStreak ?? 0) > 0) life.shortageDay = day; // today's upkeep fell short (it ran earlier in this day end)
  recordDeaths(draft, created);
  const events: EngineEvent[] = [];
  const places: DayPlaces = new Map(); // her whereabouts of this day, derived once and read by the events and by practice
  for (const unit of draft.squad) {
    if (!takesPart(draft, unit.id)) continue;
    const entry = pickLifeEvent(draft, reg, unit.id, day, places);
    if (entry) events.push(...applyLifeEvent(draft, reg, unit.id, entry, day));
  }
  events.push(...hobbyPass(draft, reg, day, places));
  events.push(...staleSweep(draft, day), ...deliverNews(draft, reg, day)); // the news last: what the day brought is paced out
  life.kinds = life.kinds.filter((k) => day - k.day < TUNING.life.kindsKeepDays);
  return events;
}
