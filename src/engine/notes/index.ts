import type { CampaignState, HandNote } from '../state/types';
import { alive } from './dayStep';

export { alive, notesDayStep } from './dayStep';
export { forgetNotes, notesOf } from './state';
export { leaveLifeNote, writeDoorNote } from './write';

/** The notes still on show (within `TUNING.notes.keepDays`), newest first; `where` limits them to one place. */
export function notesFor(state: CampaignState, where?: HandNote['where']): HandNote[] {
  return [...(state.notes?.list ?? [])].filter((n) => alive(state, n) && (where === undefined || n.where === where)).reverse();
}

/** How many notes on show have not been read (the HOME badge). */
export const unreadNotes = (state: CampaignState): number => notesFor(state).filter((n) => n.read !== true).length;
