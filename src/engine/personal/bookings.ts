import type { Registries } from '../../content/types';
import { bondOf, bondTierOf, leadRank } from '../bonds/profile';
import { relieveWant, wantOf } from '../bonds/want';
import { restrictionReason } from '../discipline/restrictions';
import { impunityOf } from '../discipline/impunity';
import { refuseLikeDemand } from '../discipline/demands';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { pushMessage } from '../dms';
import { assertiveness } from '../power/options';
import { evaluateAutomatic } from '../relations/graph';
import type { Booking, BookingSource, CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { overrideHer } from './obedience';
import { pressureGate, pressureMultOf } from './gates';
import { commanderObeys, lapseBookingsThrough, nextPersonalId, personalOf, unitObeys } from './state';

const bookingsOf = (state: Pick<CampaignState, 'personal'>): Booking[] => state.personal?.bookings ?? [];
const unitName = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
const kindOf = (reg: Registries, id: string): Record<string, unknown> | undefined => reg.bookingKinds.get(id);

/** How hard she attaches, as a rank (intense 3 … avoidant 0): what settles a conflict together with her lead rank. */
const ATTACHMENT_RANK: Record<string, number> = { intense: 3, steady: 2, slow: 1, avoidant: 0 };

/** The chance she books tomorrow: `base × (1 + Affinity/100) × (1 + Want/100) × (Impunity/50) × demandMult × pressureMult`, capped. */
export function bookingChance(state: CampaignState, reg: Registries, unitId: string): number {
  const T = TUNING.personal.booking;
  const affinity = state.relations[unitId]?.affinity ?? 0;
  const impunity = impunityOf(state, reg, unitId)?.value ?? 0;
  const raw = T.base * Math.max(0, 1 + affinity / 100) * (1 + wantOf(state, unitId) / 100) * (impunity / 50)
    * assertiveness(state, reg).demandMult * pressureMultOf(state, reg, unitId);
  return Math.min(T.cap, raw);
}

/** The first booking due this slot (today, this slot, `booked`); one she can still keep comes first. `null` when none. */
export function dueBooking(state: CampaignState): Booking | null {
  const due = bookingsOf(state).filter((b) => b.status === 'booked' && b.day === state.day && b.slot === state.slot);
  return due.find((b) => bookingPlayable(state, b)) ?? due[0] ?? null;
}

/** Can she be met for it now: a named unit in service, not restricted for scenes, not injured and not on a run. */
export function bookingPlayable(state: CampaignState, booking: Booking): boolean {
  const unit = state.squad.find((u) => u.id === booking.unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return false;
  if (unit.status === 'injured' || (unit.injuryDays ?? 0) > 0) return false;
  if (state.expedition?.party.includes(unit.id)) return false;
  return restrictionReason(state, unit.id, 'scene') === null;
}

/** The refusal of `dispatch` while a playable booking is due: `activity/` (and P14c's `life/time_together`, which spends a slot through the activity), `expedition/start`, END SLOT, a scene without her and (P13) an intrigue slot action. */
export function bookingGuard(state: CampaignState, action: { type: string; payload?: unknown }): { code: 'booking_due'; message: string } | null {
  const blocked = action.type.startsWith('activity/') || action.type === 'life/time_together' || action.type === 'expedition/start' || action.type === 'calendar/consume_slot' || action.type === 'scene/start' || action.type === 'intrigue/act';
  if (!blocked || state.personal?.bookings === undefined) return null;
  const due = dueBooking(state);
  if (!due || !bookingPlayable(state, due)) return null;
  if (action.type === 'scene/start') {
    const ids = (action.payload as { participants?: unknown } | null | undefined)?.participants;
    if (Array.isArray(ids) && ids.includes(due.unitId)) return null;
  }
  return { code: 'booking_due', message: `${unitName(state, due.unitId)} has booked this slot: go to her or cancel it.` };
}

/** The slot after `(day, slot)`: the next one of the day, or tomorrow morning (the Night is nobody's slot to book). */
export function nextSlotAfter(day: number, slot: Slot): { day: number; slot: Slot } {
  if (slot === 'morning') return { day, slot: 'afternoon' };
  if (slot === 'afternoon') return { day, slot: 'evening' };
  return { day: day + 1, slot: 'morning' };
}

/** Marks every booking of that day and slot as a conflict (two or more bookings), or clears the flag when only one is left. */
function syncConflicts(draft: CampaignState, day: number, slot: Slot): Booking[] {
  const same = bookingsOf(draft).filter((b) => b.status === 'booked' && b.day === day && b.slot === slot);
  for (const b of same) {
    if (same.length > 1) b.conflict = true;
    else delete b.conflict;
  }
  return same;
}

/** Books one slot of the commander for her (the day step's roll, a won wager, a smother hold). A second booking of that slot marks both as a conflict. */
export function book(draft: CampaignState, _ctx: Pick<EngineCtx, 'registries'>, p: { unitId: string; kindId: string; day: number; slot: Slot; source: BookingSource }): EngineEvent[] {
  const booking: Booking = {
    id: nextPersonalId(draft, 'bk'), unitId: p.unitId, kindId: p.kindId, day: p.day, slot: p.slot, status: 'booked', source: p.source, made: draft.day,
  };
  (personalOf(draft).bookings ??= []).push(booking);
  const events: EngineEvent[] = [{ type: 'booking_made', bookingId: booking.id, unitId: p.unitId, kindId: p.kindId, day: p.day, slot: p.slot, source: p.source }];
  if (syncConflicts(draft, p.day, p.slot).length > 1) events.push({ type: 'booking_conflict', day: p.day, slot: p.slot, bookingIds: bookingsOf(draft).filter((b) => b.conflict && b.day === p.day && b.slot === p.slot).map((b) => b.id) });
  return events;
}

/** The kinds her tier allows (a `romantic` kind needs the romantic tier), in registry order. */
export function bookingKindsFor(state: CampaignState, reg: Registries, unitId: string): Array<Record<string, unknown>> {
  const tier = bondTierOf(state, reg, unitId);
  return [...reg.bookingKinds.values()].filter((k) => k.tier === undefined || k.tier === tier);
}

/**
 * The day step's roll (no draw unless someone is eligible): each unit passing the `booking` gate, not restricted, under the
 * weekly cap and with no open booking draws once at `bookingChance`; a hit draws once more for the kind by weight among those
 * her tier allows and books tomorrow. She DMs it in the kind's words.
 */
export function rollBookings(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    if (u.kind !== 'named') continue;
    if (pressureGate(draft, reg, u.id, 'booking') !== null) continue;
    if (restrictionReason(draft, u.id, 'scene') !== null || unitObeys(draft, u.id)) continue;
    if ((draft.personal?.noBookUntil?.[u.id] ?? 0) > draft.day) continue;
    const mine = bookingsOf(draft).filter((b) => b.unitId === u.id);
    if (mine.some((b) => b.status === 'booked')) continue;
    if (mine.filter((b) => b.source === 'roll' && (b.made ?? -Infinity) > draft.day - 7).length >= TUNING.personal.booking.perWeek) continue;
    if (!ctx.rng.chance(bookingChance(draft, reg, u.id))) continue;
    const kinds = bookingKindsFor(draft, reg, u.id);
    if (kinds.length === 0) continue;
    let pick = ctx.rng.int(0, kinds.reduce((n, k) => n + Number(k.weight), 0) - 1);
    const kind = kinds.find((k) => (pick -= Number(k.weight)) < 0) ?? kinds[0];
    events.push(...book(draft, ctx, { unitId: u.id, kindId: String(kind.id), day: draft.day + 1, slot: kind.slot as Slot, source: 'roll' }));
    pushMessage(draft, u.id, { from: u.id, text: String(kind.text).replaceAll('{name}', u.displayName), day: draft.day, slot: draft.slot, read: false, initiated: true });
  }
  return events;
}

/** `attachmentRank + leadRank` (intense 3 … avoidant 0, dominant 3 … yielding 0). */
const holdRank = (state: CampaignState, unitId: string): number => {
  const bond = bondOf(state.squad.find((u) => u.id === unitId) ?? { kind: 'grunt' });
  return bond === null ? 0 : (ATTACHMENT_RANK[bond.attachment] ?? 0) + leadRank(bond.leadStyle);
};

/** Who wins a contested slot: the higher attachment + lead rank, then the higher Impunity, then squad order (no draw). */
function settleWinner(state: CampaignState, reg: Registries, contenders: Booking[]): Booking {
  const order = (b: Booking) => state.squad.findIndex((u) => u.id === b.unitId);
  return [...contenders].sort((a, b) =>
    holdRank(state, b.unitId) - holdRank(state, a.unitId)
    || (impunityOf(state, reg, b.unitId)?.value ?? 0) - (impunityOf(state, reg, a.unitId)?.value ?? 0)
    || order(a) - order(b))[0];
}

/**
 * The commander resolves a conflict: `{ bookingId }` keeps that one and the others are cancelled with `rejected_advance`
 * (moderate) on them; `{ day, slot, settle: true }` lets them settle it (the winner is read from the bond profiles) and
 * the losers get stress +10 instead.
 */
export function resolveConflict(draft: CampaignState, ctx: EngineCtx, p: { bookingId: string } | { day: number; slot: Slot; settle: true }): EngineEvent[] {
  const reg = ctx.registries;
  let day: number;
  let slot: Slot;
  let keepId: string | undefined;
  if ('bookingId' in p) {
    const b = bookingsOf(draft).find((x) => x.id === p.bookingId);
    if (!b || b.status !== 'booked' || b.conflict !== true) throw new Error('That booking is not in a conflict.');
    ({ day, slot } = b);
    keepId = b.id;
  } else {
    ({ day, slot } = p);
  }
  const rivals = bookingsOf(draft).filter((b) => b.status === 'booked' && b.day === day && b.slot === slot);
  if (rivals.length < 2) throw new Error('Nothing is in conflict there.');
  const winner = keepId !== undefined ? rivals.find((b) => b.id === keepId)! : settleWinner(draft, reg, rivals);
  const events: EngineEvent[] = [];
  for (const loser of rivals.filter((b) => b !== winner)) {
    loser.status = 'cancelled';
    delete loser.conflict;
    if (keepId !== undefined) {
      events.push(...hitHer(draft, reg, loser.unitId, 'rejected_advance', 'moderate', 'her booking lost the slot'));
    } else {
      const unit = draft.squad.find((u) => u.id === loser.unitId);
      if (unit) {
        const next = Math.min(100, unit.stress + TUNING.personal.booking.settleStress);
        if (next !== unit.stress) events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
        unit.stress = next;
      }
    }
    events.push({ type: 'booking_cancelled', bookingId: loser.id, unitId: loser.unitId, lost: true });
  }
  delete winner.conflict;
  events.push({ type: 'booking_resolved', day, slot, kept: winner.id, unitId: winner.unitId, settled: keepId === undefined });
  return events;
}

/**
 * The commander cancels a booking before it is played: the P9 refuse path (`refuseLikeDemand`); a wagered booking also
 * breaks a promise (moderate). A rival that was in conflict with it is no longer in one.
 */
export function cancelBooking(draft: CampaignState, ctx: EngineCtx, bookingId: string): EngineEvent[] {
  const b = bookingsOf(draft).find((x) => x.id === bookingId);
  if (!b || b.status !== 'booked') throw new Error('That booking cannot be canceled.');
  const reg = ctx.registries;
  b.status = 'cancelled';
  delete b.conflict;
  syncConflicts(draft, b.day, b.slot);
  const events: EngineEvent[] = [{ type: 'booking_cancelled', bookingId: b.id, unitId: b.unitId }];
  if (!draft.squad.some((u) => u.id === b.unitId && isLiving(u))) return events;
  events.push(...refuseLikeDemand(draft, ctx, b.unitId, { evidence: 'a booking was canceled' }));
  if (b.source === 'wager') events.push(...hitHer(draft, reg, b.unitId, 'broke_promise', 'moderate', 'a wagered booking was canceled'));
  else events.push(...evaluateAutomatic(draft, reg, b.unitId));
  if (commanderObeys(draft, b.unitId)) events.push(...overrideHer(draft, ctx, b.unitId, 'canceled her booking on the day of obedience'));
  return events;
}

/** A booking of hers is played: marked, her Want relieved by the kind's `wantRelief`. Returns the events only. */
export function markPlayed(draft: CampaignState, reg: Registries, booking: Booking): EngineEvent[] {
  booking.status = 'played';
  delete booking.conflict;
  const relief = Number(kindOf(reg, booking.kindId)?.wantRelief ?? 0);
  return relieveWant(draft, booking.unitId, relief, 'booking');
}

/**
 * The slot is here: plays the due booking (`id` names it; a conflict settles itself first and its winner is played). It must be
 * due now and she must be playable. Returns the events and the scene to open (her location, origin `event`, she alone).
 */
export function playBooking(draft: CampaignState, ctx: EngineCtx, id?: string): { events: EngineEvent[]; scene: { locationId: string; participants: string[]; origin: 'event' } } {
  const reg = ctx.registries;
  let target = id !== undefined ? bookingsOf(draft).find((b) => b.id === id) : dueBooking(draft) ?? undefined;
  if (!target || target.status !== 'booked' || target.day !== draft.day || target.slot !== draft.slot) throw new Error('That booking is not due now.');
  const events: EngineEvent[] = [];
  if (target.conflict) {
    const rivals = bookingsOf(draft).filter((b) => b.status === 'booked' && b.day === draft.day && b.slot === draft.slot);
    const winner = settleWinner(draft, reg, rivals);
    events.push(...resolveConflict(draft, ctx, { day: draft.day, slot: draft.slot, settle: true }));
    target = winner;
  }
  if (!bookingPlayable(draft, target)) throw new Error(`${unitName(draft, target.unitId)} cannot be met for it now.`);
  const kind = kindOf(reg, target.kindId);
  events.push(...markPlayed(draft, reg, target));
  const scene = { locationId: String(kind?.locationId ?? 'quarters_unit'), participants: [target.unitId], origin: 'event' as const };
  events.push({ type: 'booking_played', bookingId: target.id, unitId: target.unitId, scene });
  return { events, scene };
}

/** Everything of today and before that was never played lapses (no deltas). */
export const lapseBookings = (draft: CampaignState): EngineEvent[] => lapseBookingsThrough(draft, { day: draft.day, slot: 'night' });

/** A scene opened with her counts as playing a booking that is due (she was met): called by `scene/start`. */
export function metAtScene(draft: CampaignState, reg: Registries, participants: string[]): EngineEvent[] {
  const due = bookingsOf(draft).find((b) => b.status === 'booked' && b.day === draft.day && b.slot === draft.slot && participants.includes(b.unitId));
  if (!due) return [];
  const events = markPlayed(draft, reg, due);
  syncConflicts(draft, due.day, due.slot);
  return [...events, { type: 'booking_played', bookingId: due.id, unitId: due.unitId }];
}
