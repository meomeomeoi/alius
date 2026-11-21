import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { applyLifeEvent, busySlot, pickLifeEvent, takesPart } from './events';
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
 * The day-end step of her life (the `dm_rumors` hook, after development's). It runs for the day that is ending and does nothing while life is
 * off. In order: a shortage noted, the deaths, then for each named soldier at the base (squad order) the life event of her day. Practice and
 * interest, and the delivery of the news, follow in their own tasks. No rng is drawn.
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
  for (const unit of draft.squad) {
    if (!takesPart(draft, unit.id)) continue;
    const entry = pickLifeEvent(draft, reg, unit.id, day);
    if (entry) events.push(...applyLifeEvent(draft, reg, unit.id, entry, day));
  }
  life.kinds = life.kinds.filter((k) => day - k.day < TUNING.life.kindsKeepDays);
  return events;
}
