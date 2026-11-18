import type { Entry, Registries } from '../../content/types';
import type { HandNoteWhen } from '../../content/schemas';
import { bondTierOf } from '../bonds/profile';
import { wantBandOf } from '../bonds/want';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { deviceAccess } from '../personal/access';
import type { CampaignState, HandNote, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { nextNoteId, notesOf } from './state';

/** The stored note entries of a trigger, in registry order (an entry without `when.trigger` is a daily one). */
export function entriesFor(reg: Registries, trigger: 'daily' | 'knock_unanswered'): Entry[] {
  return [...reg.handNotes.values()].filter((e) => ((e.when as HandNoteWhen | undefined)?.trigger ?? 'daily') === trigger);
}

/** Do the conditions of an entry hold for her now (read by field: access level, tier, Want band, relationship state)? */
export function noteWhenHolds(state: CampaignState, reg: Registries, unitId: string, when: HandNoteWhen | undefined): boolean {
  if (when === undefined) return true;
  const rel = state.relations[unitId];
  if (!rel) return false;
  if (when.minAccess !== undefined && deviceAccess(state, reg, unitId) < when.minAccess) return false;
  if (when.tiers !== undefined) {
    const tier = bondTierOf(state, reg, unitId);
    if (tier === null || !when.tiers.includes(tier)) return false;
  }
  if (when.wantBands !== undefined && !when.wantBands.includes(wantBandOf(state, reg, unitId))) return false;
  if (when.states !== undefined && !when.states.includes(rel.stateId)) return false;
  return true;
}

export const namedLiving = (state: CampaignState, unitId: string): Unit | null => {
  const u = state.squad.find((x) => x.id === unitId);
  return u !== undefined && u.kind === 'named' && isLiving(u) ? u : null;
};

/** Keeps the list at `TUNING.notes.max`, the oldest out first. */
export function capNotes(draft: CampaignState): void {
  if (draft.notes && draft.notes.list.length > TUNING.notes.max) draft.notes.list = draft.notes.list.slice(draft.notes.list.length - TUNING.notes.max);
}

/** Copies an entry's text into a stored note: the draft marker is for authors and `{name}` is hers. Draws nothing. */
export function leaveNote(draft: CampaignState, unit: Unit, entry: Entry): EngineEvent[] {
  const text = String(entry.text).replace(/^AUTHOR TO WRITE:\s*/, '').replaceAll('{name}', unit.displayName);
  const note: HandNote = { id: nextNoteId(draft), unitId: unit.id, noteId: String(entry.id), where: entry.where as HandNote['where'], text, day: draft.day };
  notesOf(draft).list.push(note);
  capNotes(draft);
  return [{ type: 'note_left', unitId: unit.id, noteId: note.noteId, where: note.where }];
}

/**
 * An unanswered knock (the timer, STAY SILENT, the old IGNORE) leaves a note under the door: the first `knock_unanswered`
 * entry whose conditions hold. No hash gate: it always happens when an entry fits. Opening the door writes nothing.
 */
export function writeDoorNote(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const unit = namedLiving(draft, unitId);
  if (!unit) return [];
  const entry = entriesFor(reg, 'knock_unanswered').find((e) => noteWhenHolds(draft, reg, unitId, e.when as HandNoteWhen | undefined));
  return entry ? leaveNote(draft, unit, entry) : [];
}
