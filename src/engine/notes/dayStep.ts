import type { HandNoteWhen } from '../../content/schemas';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { passes } from '../dmBehaviours';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { entriesFor, leaveNote, namedLiving, noteWhenHolds, capNotes } from './write';

/** Is a note still on show: written within `TUNING.notes.keepDays` days. */
export const alive = (state: Pick<CampaignState, 'day'>, n: { day: number }): boolean => state.day - n.day <= TUNING.notes.keepDays;

/**
 * The notes part of the day end (P10b §4), after the personal step. Old notes expire and a unit who is no longer living loses hers;
 * then each named living unit with an imported bond profile (`unit.bond`, P9c's gate) may leave one daily note: the first `daily`
 * entry whose conditions hold and whose hash `fnv1a(day|unitId|noteId)` passes, at most one per unit per day and none of a place
 * where she still has an unread note. Draws no rng; a squad with no bond profile writes nothing and creates no `notes`.
 */
export function notesDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (draft.notes) {
    draft.notes.list = draft.notes.list.filter((n) => namedLiving(draft, n.unitId) !== null);
    const gone = draft.notes.list.length;
    draft.notes.list = draft.notes.list.filter((n) => alive(draft, n));
    if (draft.notes.list.length < gone) events.push({ type: 'notes_expired', count: gone - draft.notes.list.length });
  }
  const daily = entriesFor(ctx.registries, 'daily');
  for (const unit of draft.squad) {
    if (unit.bond === undefined || !namedLiving(draft, unit.id)) continue;
    const mine = (draft.notes?.list ?? []).filter((n) => n.unitId === unit.id);
    if (mine.some((n) => n.day === draft.day)) continue;
    const entry = daily.find((e) => {
      if (mine.some((n) => n.where === e.where && n.read !== true)) return false;
      if (!noteWhenHolds(draft, ctx.registries, unit.id, e.when as HandNoteWhen | undefined)) return false;
      return passes(`${draft.day}|${unit.id}|${String(e.id)}`, Number(e.chance));
    });
    if (entry) events.push(...leaveNote(draft, unit, entry));
  }
  capNotes(draft);
  return events;
}
