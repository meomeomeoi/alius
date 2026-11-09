/** Rule constants of the P2 economy and calendar (draft balance values). Content-like data lives in JSON. */
export const TUNING = Object.freeze({
  upkeep: Object.freeze({ perUnit: 1, commander: 1, doubledByDefect: 'hunger_loop' }),
  shortage: Object.freeze({ stressPerPoint: 4, affinityPerPoint: 1, streakDays: 3, trustPenalty: 5 }),
  /** Per axis per day: full value below `soft`, half value below `hard`, nothing after. */
  gain: Object.freeze({ soft: 4, hard: 8 }),
  passiveStressRecovery: 1,
  recruit: Object.freeze({ credits: 40, baseTrust: 25, gruntCrimeBonus: 10 }),
  requisition: Object.freeze({ creditsPerSupply: 3 }),
  rosterActiveMax: 4,
  rosterBaseCapacity: 6,
  /** P3: relationship rules. */
  relations: Object.freeze({
    k: 6,
    historyMax: 60,
    triggerStress: 8,
    likeMult: 1.5,
    stressHint: Object.freeze({ minor: 2, moderate: 5, major: 10, extreme: 18 }),
    maxEventsPerExchange: 6,
    loyalty: Object.freeze({ steady: 35, waveringEnter: 25, breakingEnter: 10, breakingExit: 20 }),
    crime: Object.freeze({ trustPerWeight: 3, affinityPerWeight: 5 }),
    affair: Object.freeze({ base: 0.04, perOther: 0.04, partnerPresent: 0.15 }),
  }),
  /** P3: facts, promises and the chronicle. */
  memory: Object.freeze({ factTextMax: 200, factsPerScene: 8, recencyBase: 0.8, retrievalK: 6, factsMax: 120, closedPromisesMax: 30 }),
  /** P3: PDA DMs and night visits. */
  comms: Object.freeze({
    threadMax: 40,
    battery: 6,
    snapAfter: 4,
    initiativeMult: Object.freeze({ low: 0.5, med: 1, high: 1.5 }),
    maxInitiatedPerSlot: 2,
  }),
});
