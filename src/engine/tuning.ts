/** Rule constants of the P2 economy and calendar (draft balance values). Content-like data lives in JSON. */
export const TUNING = Object.freeze({
  upkeep: Object.freeze({ perUnit: 1, commander: 1, doubledByDefect: 'hunger_loop' }),
  shortage: Object.freeze({ stressPerPoint: 4, affinityPerPoint: 1, streakDays: 3, trustPenalty: 5 }),
  /** Per axis per day: full value below `soft`, half value below `hard`, nothing after. */
  gain: Object.freeze({ soft: 4, hard: 8 }),
  passiveStressRecovery: 1,
  recruit: Object.freeze({ credits: 40, baseTrust: 25, gruntCrimeBonus: 10 }),
  requisition: Object.freeze({ creditsPerSupply: 8 }),
  rosterActiveMax: 4,
  rosterBaseCapacity: 6,
});
