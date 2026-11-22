/**
 * Holding the commander (P16, plan R11): a hold is a run of `held_in_quarters` bookings of the commander's slots (a `held` booking kind, source `practice`) with `practices.held` over
 * them. While it stands the dispatch guard (`held.ts`) keeps the commander in her quarters, the hub puts her there (derived, nothing stored), and everything else booked in those
 * slots has lapsed (another holder's booking is left in a conflict for P9c to settle). It ends at its last slot, or when she leaves, is hurt, goes on a run, stops being live, the
 * category goes off, or by her answer. A full hold with no defiance gives `restraint` xp and hold. Nothing here draws: the one chance is `practiceRoll`.
 */
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addHold } from '../dynamic/hold';
import { addTrackXp } from '../dynamic/tracks';
import { holdersAtPlay } from '../dynamic/gate';
import { isLiving } from '../economy';
import { book, nextSlotAfter } from '../personal/bookings';
import type { Booking, CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { cancelBookingsQuietly } from './forget';
import { ensurePractices, practiceLive } from './gate';
import { posOf } from './held';
import type { HeldState, Task } from './state';

export { heldGuard, heldNow } from './held';

/** What asks for a hold: whether it is her discipline (`punitive`, a threat source, R18) and which punishment or task; `sensory` dims the device; `hidden` keeps its end from every reader (no duration, R.9). */
export interface HoldOpts { punitive?: boolean; punishmentId?: string; taskId?: string; sensory?: boolean; hidden?: boolean }

/** Why a hold ended (the event says it): the last slot ran out, she let the commander go when asked, the duty came first, the commander defied it, and the rest are the world leaving it. */
export type HoldEnd = 'ran_out' | 'asked' | 'alarm' | 'defied' | 'run' | 'injured' | 'gone' | 'not_live' | 'content' | 'undone';

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];
const bookingsOf = (state: CampaignState): Booking[] => state.personal?.bookings ?? [];

/** The first slot a hold may begin at: this one, unless it is being spent (a scene is open) or is the Night, then the next of the day, and the morning after the evening. */
function firstSlot(draft: CampaignState): { day: number; slot: Slot } {
  const spent = draft.scene !== undefined || draft.calendar.pendingScene !== undefined;
  if (draft.slot === 'night') return { day: draft.day + 1, slot: 'morning' };
  return spent ? nextSlotAfter(draft.day, draft.slot) : { day: draft.day, slot: draft.slot };
}

/** The slots of a span from `start`, by the day's order and never the Night: `'day'` is what is left of it. */
function slotsOf(start: { day: number; slot: Slot }, span: 1 | 2 | 'day'): Array<{ day: number; slot: Slot }> {
  const left = SLOTS.slice(SLOTS.indexOf(start.slot));
  return left.slice(0, span === 'day' ? left.length : span).map((slot) => ({ day: start.day, slot }));
}

/** One booking of the hold for one slot: what was booked there lapses (another holder's stays, in the conflict `book` marks), the held booking is made. */
function holdSlot(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, kindId: string, at: { day: number; slot: Slot }, practiceId: string, events: EngineEvent[], lapsed: string[]): Booking {
  const rivals = holdersAtPlay(draft).filter((id) => id !== holderId);
  for (const b of bookingsOf(draft)) {
    if (b.status !== 'booked' || b.day !== at.day || b.slot !== at.slot || rivals.includes(b.unitId)) continue;
    b.status = 'lapsed';
    delete b.conflict;
    lapsed.push(b.id);
    events.push({ type: 'booking_lapsed', bookingId: b.id, unitId: b.unitId, lost: true, by: 'hold' }); // lost: a task that watched it is void, not broken
  }
  events.push(...book(draft, ctx, { unitId: holderId, kindId, day: at.day, slot: at.slot, source: 'practice' }));
  const made = bookingsOf(draft).at(-1)!;
  made.practiceId = practiceId;
  return made;
}

/** A task of another holder's that needed a slot this hold takes (a `slot_with_her` task due in it) is void: nothing is lost by it, no deltas. */
function voidImpossible(draft: CampaignState, holderId: string, taken: ReadonlyArray<{ day: number; slot: Slot }>): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const t of draft.practices?.tasks ?? []) {
    if (t.kind !== 'task' || t.status !== 'open' || t.holderId === holderId || t.check !== 'slot_with_her' || t.deadline?.slot === undefined) continue;
    if (!taken.some((s) => s.day === t.deadline!.day && s.slot === t.deadline!.slot)) continue;
    t.status = 'void';
    delete t.sceneId;
    delete t.sceneWith;
    events.push({ type: 'task_void', taskId: t.id, holderId: t.holderId, what: 'task', reason: 'hold' });
  }
  return events;
}

/**
 * Starts a hold of the commander in her quarters for `span` (1 or 2 slots, or what is left of the day) from the first slot that is free (R11). One hold at a time: a second asks
 * for nothing and returns no event. Nothing for a holder who is not live, the category off or among her limits, or a pack with no `held` booking kind. Emits `hold_started`
 * (`punitive` when it is her discipline: a threat source). The span is never the Night; `since` and `until` are the first and last held slots.
 */
export function startHold(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, span: 1 | 2 | 'day', opts: HoldOpts = {}): EngineEvent[] {
  const reg = ctx.registries;
  if (!practiceLive(draft, reg, holderId) || draft.practices?.held !== undefined) return [];
  const kind = [...reg.bookingKinds.values()].find((k) => k.held === true);
  if (kind === undefined || !contentAllowed(draft, reg, kind, holderId)) return [];
  const p = ensurePractices(draft);
  const slots = slotsOf(firstSlot(draft), span);
  const practiceId = opts.taskId ?? opts.punishmentId ?? `hold:${holderId}`;
  const events: EngineEvent[] = [];
  const lapsed: string[] = [];
  const bookingIds = slots.map((at) => holdSlot(draft, ctx, holderId, String(kind.id), at, practiceId, events, lapsed).id);
  const first = slots[0];
  const last = slots[slots.length - 1];
  const held: HeldState = {
    by: holderId, since: { ...first }, until: { ...last }, sensory: opts.sensory === true, extended: 0, bookingIds,
    ...(opts.hidden === true ? { hidden: true as const } : {}), ...(opts.taskId !== undefined ? { taskId: opts.taskId } : {}), ...(opts.punitive === true ? { punitive: true as const } : {}),
    ...(lapsed.length > 0 ? { lapsedIds: lapsed } : {}),
  };
  p.held = held;
  events.push(...voidImpossible(draft, holderId, slots));
  events.push({
    type: 'hold_started', holderId, unitId: holderId, sensory: held.sensory, ...(opts.punitive === true ? { punitive: true } : {}), ...(opts.punishmentId !== undefined ? { punishmentId: opts.punishmentId } : {}),
    ...(opts.hidden === true ? { hidden: true } : { slots: slots.length, since: { ...first }, until: { ...last } }),
  });
  return events;
}

/** The slots the hold really kept the commander for (a slot lost to another holder's booking was not). */
const keptSlots = (draft: CampaignState, held: HeldState): number => bookingsOf(draft).filter((b) => held.bookingIds.includes(b.id) && b.status !== 'cancelled').length;

/** What a hold task becomes when its hold ends: a full hold keeps it, a defied one breaks it, any other end voids it (no cost either way: the hold's own rules did the rest). */
function settleHoldTask(draft: CampaignState, held: HeldState, reason: HoldEnd): void {
  const task: Task | undefined = held.taskId === undefined ? undefined : draft.practices?.tasks.find((t) => t.id === held.taskId);
  if (task === undefined || task.status !== 'open') return;
  task.status = reason === 'ran_out' ? 'kept' : reason === 'defied' ? 'broken' : 'void';
  task.settledDay = draft.day;
}

/**
 * Ends the hold now (the last slot passed, or `reason`): its bookings that are still ahead are cancelled with no cost, the guard lifts, a task that started it is settled. A full hold
 * with no defiance (`ran_out`) gives `restraint` xp by the slots it kept and hold (`TUNING.practice.hold.gain`): this is what makes P15's `first_night_held` reachable. `hold_released` says
 * why. Nothing for no hold. The alarm that asked about it goes with it, unless the duty's own answer is still being given (`alarm`, `defied`).
 */
export function endHold(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, reason: HoldEnd): EngineEvent[] {
  const p = draft.practices;
  const held = p?.held;
  if (p === undefined || held === undefined) return [];
  const slots = keptSlots(draft, held);
  cancelBookingsQuietly(draft, held.bookingIds);
  if (reason === 'undone') for (const b of bookingsOf(draft)) if (held.lapsedIds?.includes(b.id) === true && b.status === 'lapsed' && posOf(b.day, b.slot) >= posOf(draft.day, draft.slot)) b.status = 'booked'; // what the hold pushed out comes back
  delete p.held;
  if (p.alarm !== undefined && p.alarm.holderId === held.by && reason !== 'alarm' && reason !== 'defied') delete p.alarm;
  settleHoldTask(draft, held, reason);
  const events: EngineEvent[] = [{ type: 'hold_released', holderId: held.by, unitId: held.by, reason, slots }];
  if (reason === 'ran_out' && held.defied !== true && slots > 0) {
    events.push(...addTrackXp(draft, ctx.registries, held.by, 'restraint', TUNING.practice.xp.hold * slots));
    events.push(...addHold(draft, ctx, held.by, TUNING.practice.hold.gain, 'hold'));
  }
  return events;
}

/**
 * The after-action of the hold (registered by `actions/practice.ts`): after every action, a hold that has run past its last slot ends, and one whose holder left service, is hurt,
 * went on a run (a hold that covers a run without the commander lasts with it, Task 28), stopped being live or lost its category ends at once. Nothing while no hold exists.
 */
export function holdSweep(draft: CampaignState, ctx: EngineCtx, _events?: readonly EngineEvent[]): EngineEvent[] {
  const held = draft.practices?.held;
  if (held === undefined) return [];
  const reg = ctx.registries;
  const unit = draft.squad.find((u) => u.id === held.by);
  if (unit === undefined || !isLiving(unit)) return endHold(draft, ctx, 'gone');
  if (!practiceLive(draft, reg, held.by)) return endHold(draft, ctx, 'not_live');
  if (!(draft.content?.enabled ?? []).includes('restraint')) return endHold(draft, ctx, 'content');
  if (unit.status === 'injured' || (unit.injuryDays ?? 0) > 0) return endHold(draft, ctx, 'injured');
  if (held.run === true) return draft.expedition === undefined ? endHold(draft, ctx, 'ran_out') : [];
  if (draft.expedition?.party.includes(held.by) === true) return endHold(draft, ctx, 'run');
  if (posOf(draft.day, draft.slot) > posOf(held.until.day, held.until.slot)) return endHold(draft, ctx, 'ran_out');
  return [];
}
