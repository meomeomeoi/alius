import type { Slot } from '../../../engine/state/types';

/**
 * P10e-e (R8): the card's words for a deadline (the WHENS of `docs/prototypes/cards.html`): `today`, `this morning` … `tonight`,
 * `tomorrow`, `tomorrow morning` … `tomorrow night`, `in two days` … `in seven days` (`, in the morning` … when a slot is named), then
 * `in a few days`. Every frame of her `when` lines reads right with each (none puts "by" or "until" before it). A deadline already past is
 * `today`: all that is left of it. `dueWords` stays the PDA's.
 */
const THIS: Readonly<Record<Slot, string>> = { morning: 'this morning', afternoon: 'this afternoon', evening: 'this evening', night: 'tonight' };
const IN_THE: Readonly<Record<Slot, string>> = { morning: 'in the morning', afternoon: 'in the afternoon', evening: 'in the evening', night: 'at night' };
const COUNT = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven'] as const;

export function cardWhen(deadline: { day: number; slot?: Slot } | undefined, today: number): string | null {
  if (deadline === undefined) return null;
  const days = deadline.day - today;
  const slot = deadline.slot;
  if (days < 0) return 'today';
  if (days === 0) return slot === undefined ? 'today' : THIS[slot];
  if (days === 1) return slot === undefined ? 'tomorrow' : `tomorrow ${slot}`;
  if (days <= 7) return `in ${COUNT[days]} days${slot === undefined ? '' : `, ${IN_THE[slot]}`}`;
  return 'in a few days';
}
