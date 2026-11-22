/**
 * Oversight's own forced Leash on a holder (P15, review M2): a `done` log entry copying `oversight`. It is the means of a forced exit that day, but it
 * is nothing the commander did: Impunity's Leash term, the relation graph's `leashUsesMin` and the `leash_used` memory resolver skip it. A leaf: no imports.
 */
export const OVERSIGHT_CC = 'oversight';

/** Whether a log entry (well-formed or not) is oversight's own forced Leash. */
export function isOversightEntry(entry: unknown): boolean {
  return typeof entry === 'object' && entry !== null && (entry as { cc?: unknown }).cc === OVERSIGHT_CC;
}
