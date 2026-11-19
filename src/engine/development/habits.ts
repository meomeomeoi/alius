import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';
import type { HabitEntry } from './types';

/** The habits the content gate lets through: one tagged with a category that is switched off never forms (P9d). Registry order. */
export function allowedHabits(state: ContentHolder, reg: Registries): HabitEntry[] {
  return [...reg.habits.values()].filter((h) => contentAllowed(state, reg, h)) as unknown as HabitEntry[];
}
