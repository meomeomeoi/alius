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
  /** P5: world, missions and rumors. */
  world: Object.freeze({
    completedMax: 30,
    rumorsMax: 20,
    threadsOpenMax: 6,
    threadFlagsMax: 12,
    deadlineMinDays: 5,
    deadlineMaxDays: 14,
    commandEveryDays: 3,
    poiCooldownDays: 2,
    insightRumorRank: 3,
    ownFactionStart: 10,
  }),
  /** P5: expeditions. */
  expedition: Object.freeze({
    partyMax: 4,
    suppliesMax: 12,
    treat: Object.freeze({ hpPct: 20, stress: 10 }),
    logMax: 60,
    recapMax: 1200,
    breakdownNight: Object.freeze({ priority: 60, expiresInDays: 2 }),
  }),
  /** P5: director validation limits. */
  director: Object.freeze({
    maxOffers: 2,
    maxRumors: 3,
    maxClockPerClock: 2,
    maxClockTotal: 3,
    beatCooldownDays: 3,
    titleMax: 60,
    briefMax: 300,
    rumorWords: 40,
    framingWords: 60,
    reasonMax: 120,
    digestFlags: 8,
  }),
  /** P6: the Leash (draft balance values; spec numbers verbatim). */
  leash: Object.freeze({
    weeklyMax: 5,
    /** Used when the commander's corporation vanished from the content under a save. */
    weeklyFallback: 2,
    refreshDays: 7,
    logMax: 60,
    traumaDays: 7,
    /** Standing at or above / at or below ± this moves the week by one. */
    standingStep: 30,
    compel: Object.freeze({ trust: 15, affinity: 10, stress: 15 }),
    suppress: Object.freeze({ trust: 25, stress: 10, squadStress: 5 }),
    /** Witness reaction scale: clamp(base + autonomy·a − corporate·c, min, max); negative = approval. */
    witness: Object.freeze({ base: 0.5, autonomy: 0.25, corporate: 0.25, min: -0.5, max: 1.5 }),
    terminate: Object.freeze({ approvalPerStanding: 0.005, approvalMin: 0.1, approvalMax: 0.95, attemptsForCause: 2 }),
  }),
  /** P6: refusals, signs and desertion. */
  disloyalty: Object.freeze({
    refusal: Object.freeze({ wavering: 0.15, breaking: 0.35 }),
    /** Synergy ids (content) that carry the band's refusal chance. */
    bandSynergy: Object.freeze({ wavering: 'loyalty_wavering', breaking: 'loyalty_breaking' }),
    doubtEveryDays: 3,
    signsMax: 6,
    desertion: Object.freeze({
      base: 0.15, perTrustBelow: 0.02, trustRef: 10, affinityNegative: 0.002, affinityPositive: 0.002,
      perStressAbove: 0.004, stressRef: 50, min: 0.03, max: 0.6, minSignAgeDays: 1, pauseDays: 3,
    }),
    talkDown: Object.freeze({
      baseRank: 2, lowTrust: 5, highStress: 80, base: 0.5, perRank: 0.2, min: 0.1, max: 0.95, trustGain: 8, pauseDays: 3,
    }),
    night: Object.freeze({ desertion: 95, talk: 55, return: 50, expiresInDays: 2 }),
    comeback: Object.freeze({ afterDays: 5, chancePerDay: 0.15, allyAffinity: -30, backTrust: 15 }),
  }),
  /** P6: mutiny. */
  mutiny: Object.freeze({
    chancePerDay: 0.5,
    minDaysInState: 2,
    minSigns: 2,
    triggerWindowDays: 3,
    maxSympathizers: 2,
    sympathizerTrustBelow: 20,
    nightPriority: 100,
    subduedInjuryDays: 2,
  }),
  /** P6: dilemmas. Magnitudes are `[small, medium, large]`; the model only ever picks the word. */
  dilemma: Object.freeze({
    everyDays: 4,
    definingCooldownDays: 7,
    recentMax: 3,
    maxAttempts: 2,
    setupWords: 120,
    labelWords: 12,
    titleMax: 60,
    optionsMin: 2,
    optionsMax: 4,
    /** A social check at choice time: clamp(base + perRank × (commander rank − check rank), min, max). */
    check: Object.freeze({ base: 0.5, perRank: 0.2, min: 0.1, max: 0.95 }),
    /** Resource levels of the digest: below the first number is `low`, from the second `high`. */
    resourceBands: Object.freeze({ credits: [40, 200], supplies: [6, 24], plyx: [6, 30] } as const),
    magnitude: Object.freeze({
      credits: Object.freeze([15, 40, 100] as const),
      supplies: Object.freeze([3, 8, 15] as const),
      plyx: Object.freeze([3, 8, 20] as const),
      faction: Object.freeze([5, 10, 20] as const),
      clock: Object.freeze([1, 1, 2] as const),
      stress: Object.freeze([5, 10, 20] as const),
      severity: Object.freeze(['minor', 'moderate', 'major'] as const),
      checkRank: Object.freeze([2, 3, 4] as const),
    }),
    /** Dominance scoring: points of utility per unit of each dimension. */
    weight: Object.freeze({
      credits: 1, supplies: 3, plyx: 5, faction: 2, clock: -15, stress: -1,
      unit: Object.freeze({ minor: 2, moderate: 5, major: 10 }),
    }),
  }),
  /** P6: defect arcs. */
  arc: Object.freeze({
    minDay: 5,
    nightPriority: 45,
    steps: Object.freeze({ manage: 1, embrace: 2, cure: 3 }),
    stage: Object.freeze({ manage: 1, embrace: 2, cure: 3 }),
    manageUpkeepDays: 5,
    manageDownsideMult: 0.5,
    embraceMult: 1.5,
    cost: Object.freeze({
      manage: Object.freeze({ supplies: 5 }),
      embrace: Object.freeze({ plyx: 5 }),
      cure: Object.freeze({ credits: 60, plyx: 10 }),
    }),
    /** The values a path agrees with: [axis, direction]. */
    axes: Object.freeze({
      cure: Object.freeze([['autonomy', -1], ['corporate', 1]] as const),
      manage: Object.freeze([['pragmatism', 1], ['ingroup', 1]] as const),
      embrace: Object.freeze([['autonomy', 1], ['corporate', -1]] as const),
    }),
  }),
});
