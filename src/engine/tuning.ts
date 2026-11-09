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
    /** History types an `eventCount` condition counts: evicted last. Every such type used by content must be listed here. */
    historyKeep: Object.freeze(['stress_high', 'sided_against'] as const),
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
  /** P4: combat rules (draft balance values). */
  combat: Object.freeze({
    maxRounds: 30,
    logMax: 300,
    cpStart: 1,
    cpMax: 5,
    maxPerRow: 3,
    critMult: 1.5,
    variance: Object.freeze([0.9, 1.1] as const),
    initiativeRand: 3,
    strainedMult: 1.5,
    breakingChance: 0.25,
    commanderHp: 60,
    commanderDef: 10,
    commanderInjuryDays: 3,
    gruntDeathOnWin: 0.1,
    autoResolveRatio: 0.6,
    difficultyMult: Object.freeze({ story: 0.8, normal: 1, hard: 1.2 }),
    injuryDays: 2,
    injuryStatPct: -10,
    injuryMaxStacks: 3,
    armorSpd: Object.freeze({ light: 0, medium: -1, heavy: -3 }),
    stress: Object.freeze({ critTaken: 6, allyDowned: 8, commanderHit: 5, refusedOrder: 6, kill: -2, loss: 10 }),
  }),
  /** P4: levels, skill trees and respec. */
  progression: Object.freeze({
    levelCaps: Object.freeze([10, 20, 30, 40]),
    xpToNext: Object.freeze({ base: 40, perLevel: 20 }),
    combatXp: Object.freeze({ base: 20, perEnemyLevel: 3, lowLevelBonus: 1.5, lowLevelGap: 2, gruntMult: 0.5 }),
    respec: Object.freeze({ creditsPerLevel: 10, plyxPerLevel: 5 }),
    loadoutSize: 4,
  }),
  /** P4: items, rarities, workshop. */
  items: Object.freeze({
    rarityStatStep: 0.15,
    upgradeStep: 0.08,
    maxUpgrade: 5,
    affixSlots: Object.freeze([0, 1, 2, 3, 3]),
    upgradeCost: Object.freeze({ credits: 20, plyx: 10 }),
    rerollPlyxPerRarity: 15,
    dismantlePct: 50,
    opsPerSession: 3,
    companionQualityChance: 0.25,
  }),
});
