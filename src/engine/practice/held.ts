/**
 * What is held now (P16, plan R11): the readers of the hold, a leaf (types only) so that the dispatch guard, the hub's whereabouts and the plan's room of the commander can ask
 * without reaching into the rest of the practices. `heldNow` is the one question every other reader asks; `heldGuard` is the refusal of `dispatch` while it is true. Reads only,
 * draws nothing, and answers null while no hold exists (a campaign with no practices has none).
 */
import type { Registries } from '../../content/types';
import type { CampaignState, Slot } from '../state/types';
import type { HeldState } from './state';

const RANK: Record<Slot, number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };
/** A running index of a moment (four slots a day, the Night included). */
export const posOf = (day: number, slot: Slot): number => day * 4 + RANK[slot];

type Readable = Pick<CampaignState, 'practices' | 'day' | 'slot' | 'personal'>;

/** The booking of the hold for one slot (still standing: a slot lost to another holder's booking is not held). */
function heldBookingAt(state: Readable, held: HeldState, day: number, slot: Slot): { kindId: string } | null {
  const b = (state.personal?.bookings ?? []).find((x) => held.bookingIds.includes(x.id) && x.day === day && x.slot === slot && x.status !== 'cancelled' && x.status !== 'lapsed');
  return b === undefined ? null : { kindId: b.kindId };
}

/** The hold that keeps the commander in this slot, or `null`: it has begun, has not ended, and its booking for this slot still stands. */
export function heldNow(state: Readable): HeldState | null {
  const held = state.practices?.held;
  if (held === undefined) return null;
  const now = posOf(state.day, state.slot);
  if (now < posOf(held.since.day, held.since.slot) || now > posOf(held.until.day, held.until.slot)) return null;
  return heldBookingAt(state, held, state.day, state.slot) === null ? null : held;
}

/** The location the hold keeps the commander at (the held booking kind's `locationId`: her quarters), or `null` while she is not held. */
export function heldLocation(state: Readable, reg: Registries): string | null {
  const held = heldNow(state);
  const b = held === null ? null : heldBookingAt(state, held, state.day, state.slot);
  const id = b === null ? undefined : reg.bookingKinds.get(b.kindId)?.locationId;
  return typeof id === 'string' ? id : null;
}

/** Whether a payload names the holder among a scene's participants. */
const names = (payload: unknown, holderId: string): boolean => {
  const ids = (payload as { participants?: unknown } | null | undefined)?.participants;
  return Array.isArray(ids) && ids.includes(holderId);
};

const keepAlarm = (state: Readable): boolean => {
  const a = state.practices?.alarm;
  return a !== undefined && a.answer === 'keep' && (a.kind === 'launch' || a.kind === 'deadline');
};

/**
 * The refusal `dispatch` gives while the commander is held (after P9c's `booking_due`): an activity, a quiet hour, a scene that is not with her in her quarters and an intrigue move
 * are `held`; an expedition launch and a night knock are `held_alarm` (the duty decides, R12: the UI raises the alarm). A scene with her at her quarters, a night scene and every
 * other action (END SLOT, DMs, the actions of the hold itself) go through. A launch `withoutCommand` goes through only while a `keep` alarm is open (Task 28 checks the rest). Null with no hold.
 */
export function heldGuard(state: Readable, reg: Registries, action: { type: string; payload?: unknown }): { code: 'held' | 'held_alarm'; message: string } | null {
  const held = heldNow(state);
  if (held === null) return null;
  const type = action.type;
  if (type === 'expedition/start') {
    if (keepAlarm(state) && (action.payload as { withoutCommand?: unknown } | null | undefined)?.withoutCommand === true) return null;
    return { code: 'held_alarm', message: 'The commander is held: the duty has to be weighed against the hold.' };
  }
  if (type === 'night/open') return { code: 'held_alarm', message: 'The commander is held: the knock has to be weighed against the hold.' };
  const refused = type.startsWith('activity/') || type === 'life/time_together' || type === 'intrigue/act';
  if (refused) return { code: 'held', message: 'The commander is held in her quarters: ask to be let go, or let the slot pass.' };
  if (type === 'scene/start') {
    const p = action.payload as { origin?: unknown; locationId?: unknown } | null | undefined;
    if (p?.origin === 'night') return null; // a knock is an event that happens to the commander
    if (names(action.payload, held.by) && p?.locationId === heldLocation(state, reg)) return null;
    return { code: 'held', message: 'The commander is held in her quarters: only a scene with her there can be had.' };
  }
  return null;
}
