/**
 * What the three programmes of the new styles share (P16b, Tasks 19-21): whether a holder's style (primary or secondary, through `styleOf`) is one, and the booking of free slots. A programme books
 * the commander's time only on a slot nobody has booked (a held slot of P16 is a `booked` booking too), never over one, looking at most `TUNING.craft.drill.lookahead` days ahead. Nothing here draws.
 */
import type { Registries } from '../../../content/types';
import { styleOf } from '../../dynamic/profile';
import { book } from '../../personal/bookings';
import { pushMessage } from '../../dms';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import type { CampaignState, Slot } from '../../state/types';
import { TUNING } from '../../tuning';

/** Is this soldier's style (primary or secondary) the one? A turn of her style counts (`styleOf`). */
export function hasStyle(state: Pick<CampaignState, 'squad'>, unitId: string, style: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const s = unit === undefined ? undefined : styleOf(unit);
  return s !== undefined && (s.primary === style || s.secondary === style);
}

const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening'];

/** The first free slot of the commander from `fromDay` on, the kind's own slot of a day first; `null` when none is free in the days looked at. A slot is free when no booking of it is still `booked`. */
export function freeSlot(state: Pick<CampaignState, 'personal'>, fromDay: number, prefer: Slot): { day: number; slot: Slot } | null {
  const taken = (day: number, slot: Slot): boolean => (state.personal?.bookings ?? []).some((b) => b.day === day && b.slot === slot && b.status === 'booked');
  const order = [prefer, ...SLOTS.filter((s) => s !== prefer)];
  for (let day = fromDay; day < fromDay + TUNING.craft.drill.lookahead; day++) for (const slot of order) if (!taken(day, slot)) return { day, slot };
  return null;
}

/** The booking kind of a programme, by its `programme` field (the first in registry order). */
export const programmeKind = (reg: Registries, programme: 'exam' | 'session'): Record<string, unknown> | undefined => [...reg.bookingKinds.values()].find((k) => k.programme === programme);

/**
 * Books the programme's kind for her on the first free slot from `fromDay` and tells the commander in her words (a DM, as a booking of hers is). Returns the events and the day it was booked for
 * (`null` when no kind or no free slot exists: nothing is written).
 */
export function bookProgramme(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, programme: 'exam' | 'session', fromDay: number): { events: EngineEvent[]; day: number | null } {
  const kind = programmeKind(ctx.registries, programme);
  if (kind === undefined) return { events: [], day: null };
  const at = freeSlot(draft, fromDay, kind.slot as Slot);
  if (at === null) return { events: [], day: null };
  const events = book(draft, ctx, { unitId: holderId, kindId: String(kind.id), day: at.day, slot: at.slot, source: 'practice' });
  const name = draft.squad.find((u) => u.id === holderId)?.displayName ?? holderId;
  pushMessage(draft, holderId, { from: holderId, text: String(kind.text).replaceAll('{name}', name), day: draft.day, slot: draft.slot, read: false, initiated: true });
  return { events, day: at.day };
}
