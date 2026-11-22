/**
 * What of a practice the commander may see (P16, plan R16, R24). The engine keeps every end, deadline and count it decided; a practice that runs "until she decides" (`noDuration`, a hidden hold,
 * a hidden count) shows none of them to any reader: the cards, the directives and the readings go through these. Task 39 grows this file into `practiceView`. Reads only.
 */
import type { HeldState, OpenPunishment, Task } from './state';

/** A task's deadline as the commander may see it: `null` while it runs with no duration (the sweep still settles it at the stored one). */
export function deadlineShown(task: Pick<Task, 'deadline' | 'noDuration'>): Task['deadline'] | null {
  return task.noDuration === true || task.deadline === undefined ? null : task.deadline;
}

/** The last held slot as the commander may see it: `null` while the hold is hidden (it still ends at the stored one). */
export function heldEndShown(held: Pick<HeldState, 'hidden' | 'until'>): HeldState['until'] | null {
  return held.hidden === true ? null : held.until;
}

/** Whether a punishment's count (the strokes, the number of a ceremony) is hers alone. */
export const countHidden = (p: Pick<OpenPunishment, 'hiddenCount'>): boolean => p.hiddenCount === true;
