import type { EngineEvent } from '../dispatch';
import type { CampaignState, PersonalState, Slot } from '../state/types';
import { TUNING } from '../tuning';

/**
 * The leaf of the personal module (P9c): reading and writing `CampaignState.personal` with nothing but types and the tuning
 * constants imported, so `loyalty/refusal`, `discipline/impunity`, `dms`, `night` and `hub` can read it without a cycle.
 */

/** The personal state, created on the first write (a save without it reads as nothing booked, given, wagered or kept). */
export function personalOf(draft: CampaignState): PersonalState {
  return (draft.personal ??= { seq: 0 });
}

/** The next id `<prefix>_<n>` of the personal records (intercepts, bookings, tokens, wagers, secrets). */
export function nextPersonalId(draft: CampaignState, prefix: string): string {
  const p = personalOf(draft);
  p.seq += 1;
  return `${prefix}_${p.seq}`;
}

/** Does the unit hold anything in the personal state (so the day step knows a dead unit still has something to drop)? */
export function holdsPersonal(state: Pick<CampaignState, 'personal'>, unitId: string): boolean {
  const p = state.personal;
  if (!p) return false;
  return (
    p.decor?.[unitId] !== undefined
    || p.bookings?.some((b) => b.unitId === unitId && b.status === 'booked') === true
    || p.noBookUntil?.[unitId] !== undefined
    || p.intercepts?.open?.unitId === unitId
    || p.tokens?.offer?.giverId === unitId
    || p.wagers?.open.some((w) => w.unitId === unitId) === true
    || p.obedience?.unitId === unitId
    || p.truth?.unitId === unitId
    || p.pendingQuestion?.unitId === unitId
    || p.mark?.unitId === unitId
    || p.secrets?.some((x) => x.knownBy.includes(unitId)) === true
  );
}

/**
 * A unit leaves the service (or is found dead): her booking and offer vanish with no deltas, her open wager is void, her
 * obedience, truth and mark end, her decor fades for a week (a faded decor is kept as it is), a secret she alone knew is
 * dropped and she leaves the others' `knownBy`. Her worn token stays and does nothing. Creates nothing.
 */
export function forgetPersonal(draft: CampaignState, unitId: string): void {
  const p = draft.personal;
  if (!p) return;
  if (p.bookings) p.bookings = p.bookings.filter((b) => !(b.unitId === unitId && b.status === 'booked'));
  if (p.noBookUntil) {
    delete p.noBookUntil[unitId];
    if (Object.keys(p.noBookUntil).length === 0) delete p.noBookUntil;
  }
  if (p.intercepts?.open?.unitId === unitId) delete p.intercepts.open;
  if (p.tokens?.offer?.giverId === unitId) delete p.tokens.offer;
  if (p.wagers) p.wagers.open = p.wagers.open.filter((w) => w.unitId !== unitId);
  if (p.obedience?.unitId === unitId) delete p.obedience;
  if (p.truth?.unitId === unitId) delete p.truth;
  if (p.pendingQuestion?.unitId === unitId) delete p.pendingQuestion;
  if (p.mark?.unitId === unitId) delete p.mark;
  const decor = p.decor?.[unitId];
  if (decor && decor.fadedUntil === undefined) decor.fadedUntil = draft.day + TUNING.personal.decor.fadeDays;
  if (p.secrets) {
    p.secrets = p.secrets.filter((x) => !(x.knownBy.length === 1 && x.knownBy[0] === unitId));
    for (const x of p.secrets) x.knownBy = x.knownBy.filter((id) => id !== unitId);
  }
}

const SLOT_RANK: Record<Slot, number> = { morning: 0, afternoon: 1, evening: 2, night: 3 };

/**
 * Bookings whose slot is over (`through` included) and that were never played lapse, with no deltas and no draw: she could
 * not be met, or the slot passed during a run. The calendar calls this as slots pass; the day step calls it for the whole day.
 */
export function lapseBookingsThrough(draft: CampaignState, through: { day: number; slot: Slot }): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const b of draft.personal?.bookings ?? []) {
    if (b.status !== 'booked') continue;
    if (b.day < through.day || (b.day === through.day && SLOT_RANK[b.slot] <= SLOT_RANK[through.slot])) {
      b.status = 'lapsed';
      delete b.conflict;
      events.push({ type: 'booking_lapsed', bookingId: b.id, unitId: b.unitId });
    }
  }
  return events;
}
