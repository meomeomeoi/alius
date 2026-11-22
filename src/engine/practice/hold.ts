/**
 * Holding the commander (P16, plan R11): a hold is a run of `held_in_quarters` bookings of the commander's slots (a `held` booking kind, source `practice`) with `practices.held` over
 * them. While it stands the dispatch guard (`held.ts`) keeps the commander in her quarters, the hub puts her there (derived, nothing stored), and everything else booked in those
 * slots has lapsed (another holder's booking is left in a conflict for P9c to settle). It ends at its last slot, or when she leaves, is hurt, goes on a run, stops being live, the
 * category goes off, or by her answer. A full hold with no defiance gives `restraint` xp and hold. Nothing here draws: the one chance is `practiceRoll`.
 */
import { personEffects, removeSource, setQuietly } from '../blocking/blocking';
import { blockingLive } from '../blocking/gate';
import { COMMANDER } from '../blocking/state';
import { effectsOfEntry } from '../blocking/types';
import { contentAllowed } from '../bonds/content';
import { impunityOf } from '../discipline/impunity';
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addHold } from '../dynamic/hold';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { addTrackXp } from '../dynamic/tracks';
import { holdersAtPlay } from '../dynamic/gate';
import { isLiving } from '../economy';
import { book, nextSlotAfter } from '../personal/bookings';
import type { Booking, CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { cancelBookingsQuietly } from './forget';
import { ensurePractices, practiceLive } from './gate';
import { heldNow, posOf } from './held';
import { practiceRoll, type HeldState, type Task } from './state';

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
  if (held.eyes !== undefined) removeSource(draft, 'item', held.eyes); // what darkened the commander's sight goes with the hold (no log entry stays)
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
  if (posOf(draft.day, draft.slot) > posOf(held.until.day, held.until.slot)) return forgot(draft, ctx, held) ?? endHold(draft, ctx, 'ran_out');
  return [];
}

// ---------------------------------------------------------------------------------------------
// the hold goes on: asked, forgotten

/** The slot after a hold's last, in the same day (never past the Night), or `null`. */
function slotAfter(at: { day: number; slot: Slot }): { day: number; slot: Slot } | null {
  const order: readonly Slot[] = ['morning', 'afternoon', 'evening', 'night'];
  const next = order[order.indexOf(at.slot) + 1];
  return next === undefined ? null : { day: at.day, slot: next };
}

/**
 * Keeps the commander one slot longer (R11): a held booking for the slot after the last (what is booked there lapses as for any held slot), `until` moves, `hold_extended` says why
 * (`asked`, `forgot`, `alarm`). Never past the Night. Nothing for no hold or a hold already at its limit.
 */
export function extendHold(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, reason: 'asked' | 'forgot' | 'alarm'): EngineEvent[] {
  const held = draft.practices?.held;
  const next = held === undefined ? null : slotAfter(held.until);
  const first = held === undefined ? undefined : bookingsOf(draft).find((b) => held.bookingIds.includes(b.id));
  if (held === undefined || next === null || first === undefined) return [];
  const events: EngineEvent[] = [];
  const lapsed: string[] = [];
  const made = holdSlot(draft, ctx, held.by, first.kindId, next, first.practiceId ?? `hold:${held.by}`, events, lapsed);
  held.bookingIds.push(made.id);
  if (lapsed.length > 0) held.lapsedIds = [...(held.lapsedIds ?? []), ...lapsed];
  held.until = next;
  held.extended += 1;
  events.push({ type: 'hold_extended', holderId: held.by, unitId: held.by, reason, ...(held.hidden === true ? {} : { slots: 1, until: { ...next } }) });
  return events;
}

/** Her chance of letting a hold run on when its last slot ends (R11): by her style (`cruel` 0.3, `drill` never, else the base), plus the Impunity bonus from `impunityAt`. A style at 0 never forgets. */
export function forgotChance(state: CampaignState, reg: Registries, holderId: string): number {
  const T = TUNING.practice.hold;
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const own = style === undefined ? undefined : T.forgot[style];
  if (own === 0) return 0;
  const bonus = (impunityOf(state, reg, holderId)?.value ?? 0) >= T.impunityAt ? T.forgot.impunityBonus : 0;
  return Math.min(1, (own ?? T.forgot.base) + bonus);
}

/** She forgot (the hashed roll of the day, `practiceRoll(holderId, 'forgot:' + day)`): the hold runs on one slot, once a hold, never past the Night and never into a slot that is already over. `null` when she did not. */
function forgot(draft: CampaignState, ctx: EngineCtx, held: HeldState): EngineEvent[] | null {
  if (held.forgot === true || practiceRoll(draft, held.by, `forgot:${draft.day}`) >= forgotChance(draft, ctx.registries, held.by)) return null;
  const next = slotAfter(held.until);
  if (next === null || posOf(draft.day, draft.slot) > posOf(next.day, next.slot)) return null;
  const events = extendHold(draft, ctx, 'forgot');
  if (events.length === 0) return null;
  held.forgot = true;
  return events;
}

export type ReleaseAnswer = 'release' | 'extend' | 'refuse';

/**
 * Her answer to being asked to let the commander go (R11), by style and frame, deterministic: `affectionate` and `playful` let go at favour 0 or more; `ritual` and `drill` only at the named end
 * (the last held slot); `cruel`, `possessive` and `vindictive` keep the commander one slot longer at Impunity `impunityAt` or more, else refuse; `cold` refuses in silence (no line); every
 * other style refuses. A hold that cannot run on (it is at the Night) is only refused.
 */
export function releaseAnswer(state: CampaignState, reg: Registries, holderId: string): { answer: ReleaseAnswer; silent?: true } {
  const held = state.practices?.held;
  const style = practiceOf(state, reg, holderId)?.style.primary;
  const refuse = { answer: 'refuse' as const };
  if (held === undefined) return refuse;
  switch (style) {
    case 'affectionate': case 'playful':
      return (dynamicOf(state, holderId)?.favour ?? 0) >= 0 ? { answer: 'release' } : refuse;
    case 'ritual': case 'drill':
      return posOf(state.day, state.slot) >= posOf(held.until.day, held.until.slot) ? { answer: 'release' } : refuse;
    case 'cruel': case 'possessive': case 'vindictive':
      return (impunityOf(state, reg, holderId)?.value ?? 0) >= TUNING.practice.hold.impunityAt && slotAfter(held.until) !== null ? { answer: 'extend' } : refuse;
    case 'cold':
      return { answer: 'refuse', silent: true };
    default:
      return refuse;
  }
}

/** `[ ASK TO BE LET GO ]` (`practice/ask_release`): her answer by `releaseAnswer`; a release ends the hold (`asked`), an extension adds a slot (`asked`). Throws while the commander is not held. Draws nothing. */
export function askRelease(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const held = heldNow(draft);
  if (held === null) throw new Error('The commander is not held.');
  const a = releaseAnswer(draft, ctx.registries, held.by);
  const events: EngineEvent[] = [{ type: 'hold_asked', holderId: held.by, unitId: held.by, answer: a.answer, ...(a.silent === true ? { silent: true } : {}) }];
  if (a.answer === 'release') events.push(...endHold(draft, ctx, 'asked'));
  else if (a.answer === 'extend') events.push(...extendHold(draft, ctx, 'asked'));
  return events;
}

// ---------------------------------------------------------------------------------------------
// sensory (the device dims)

/** Is the commander's sight taken now: a sensory hold, or a blindfold worn (a `filter sensory_dark` effect in the blocking). Derived; reads no media query. */
export function sensoryNow(state: CampaignState, reg: Registries): boolean {
  if (heldNow(state)?.sensory === true) return true;
  return personEffects(state, reg, COMMANDER).some((e) => e.type === 'filter' && e.kind === 'sensory_dark');
}

/**
 * The hold scene is P15a blocking (R11): at `scene_started` with her during a sensory hold the commander wears the first item of the pack that darkens her sight and that the gates allow
 * (read by its `filter sensory_dark` effect), quietly (the engine's own setup, no staging log). It comes off with the hold. Nothing while the blocking is not live or one is already worn.
 */
export function blindfoldFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const held = draft.practices?.held;
  if (held === undefined || held.sensory !== true || heldNow(draft) === null) return [];
  const reg = ctx.registries;
  for (const e of events) {
    if (e.type !== 'scene_started' || !Array.isArray(e.participants) || !(e.participants as string[]).includes(held.by) || !blockingLive(draft, reg)) continue;
    if (personEffects(draft, reg, COMMANDER).some((x) => x.type === 'filter' && x.kind === 'sensory_dark')) continue;
    for (const item of reg.blockingItems.values()) {
      if (!effectsOfEntry(item).some((x) => x.type === 'filter' && x.kind === 'sensory_dark')) continue;
      if (setQuietly(draft, reg, { person: COMMANDER, field: 'worn', value: String(item.id) })) { held.eyes = String(item.id); break; }
    }
  }
  return [];
}
