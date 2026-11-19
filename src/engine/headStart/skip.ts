/**
 * The prologue's campaign steps a head start skips (the squad has already met; no tutorial mission, no guide). Read by `enterStep`.
 * A leaf module: `onboarding/state.ts` imports it, and the rest of the head start imports the graph, which reaches the onboarding.
 */
export const HEAD_START_SKIPPED_KINDS = ['scene', 'expedition', 'guided_slot'] as const;
