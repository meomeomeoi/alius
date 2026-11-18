import type { CampaignState, HandNote } from '../state/types';

/**
 * The stored hand notes (P10b §4): a leaf, types only, so any module may import it (like `personal/state` and `power/state`).
 * Absent `notes` means there are none; nothing here creates the object except `notesOf`, which the writers call.
 */

/** The notes object of a draft, created on first use. */
export function notesOf(draft: CampaignState): NonNullable<CampaignState['notes']> {
  return (draft.notes ??= { seq: 0, list: [] });
}

/** The next note id (`hn<n>`). */
export function nextNoteId(draft: CampaignState): string {
  const notes = notesOf(draft);
  notes.seq += 1;
  return `hn${notes.seq}`;
}

/** A unit who leaves service loses her notes. */
export function forgetNotes(draft: CampaignState, unitId: string): void {
  if (draft.notes) draft.notes.list = draft.notes.list.filter((n: HandNote) => n.unitId !== unitId);
}
