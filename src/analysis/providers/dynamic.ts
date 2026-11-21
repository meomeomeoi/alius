/**
 * The dynamic's readings (P15). Nothing is registered yet: the facts of the squad's knowledge (`suspects_close`, `suspects_dynamic`, `knows_dynamic`)
 * are written hidden from the commander and the engine drops the flag once the observer has shown it in a later scene or DM (`revealKnown`, review
 * I7), so the ordinary fact rule of `Knowledge` and the prompt's fact line read the same flag. Everything else of the dynamic joins here through
 * `Knowledge.dynamic` (Task 46).
 */

/** Registers the dynamic's readings (called from `registerCoreProviders`). */
export function registerDynamicProviders(): void {
  // later tasks add the providers of the dynamic here
}
