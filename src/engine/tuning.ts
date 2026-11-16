/** Rule constants of the P2 economy and calendar (draft balance values). Content-like data lives in JSON. */
export const TUNING = Object.freeze({
  /** P7: the commander's body, presence and traits (draft balance values). */
  commander: Object.freeze({
    pool: 7,
    creationMax: 4,
    defaults: Object.freeze({
      body: Object.freeze({ strength: 3, endurance: 3, reflexes: 2 }),
      expression: 3,
      seasoning: 3,
    }),
    /** Tenths of a session: one `train` body session = 10; a step costs 3 / 6 / 10 / 15 sessions (index = value − 1). */
    bodyXpPerSession: 10,
    bodyXpSteps: Object.freeze([30, 60, 100, 150]),
    crisisHpBase: 20,
    crisisHpPerEndurance: 10,
    crisisHpMin: 10,
    dodgePerReflex: 0.06,
    scarChance: 0.15,
    unnoticedSkip: 0.5,
    rallyStress: 10,
    presenceMax: 15,
    tau: 7,
    offImageMult: 1.3,
    earlyDays: 14,
    exhaustionEndurance: 2,
    coverStates: Object.freeze(['friend', 'confidant', 'kindred', 'sworn', 'flirting', 'fwb', 'lover', 'devoted', 'secret_affair']),
    intimidatePerPoint: 0.03,
    delegateRemarkChance: 0.3,
    maxTastes: 3,
    maxRegular: 2,
  }),
  /** P8: world options and unit disposition. */
  disposition: Object.freeze({
    loreMaxChars: 100,
    worldBlockTokens: 120,
    /** The setting `intentMinConfidence` is measured against this reference (its default). */
    confidenceRef: 0.5,
    /** A commander event of one of these types at `minSeverity` or above is a big gesture. P9 adds more. */
    bigGesture: Object.freeze({ events: Object.freeze(['protected', 'granted_demand', 'shielded'] as readonly string[]), minSeverity: 'major' }),
    /** A `self` breakdown costs this share of the unit's max HP. */
    selfHarmPct: 10,
    /** A stance's gain damping never takes more than this share of a gain. */
    gainDampMax: 0.8,
    /** A disposition-scaled refusal chance never exceeds this. */
    refusalCap: 0.95,
  }),
  /** P9: Impunity, stances and covert sabotage (spec numbers verbatim; the rest are draft balance values). */
  impunity: Object.freeze({
    recordMin: -40,
    recordMax: 40,
    decayPerDay: 1,
    /** Used when a pack's disposition level carries no `impunityBase`. */
    defaultBase: 35,
    /** `R` gained when a defiance goes unanswered, by severity. */
    defied: Object.freeze({ minor: 3, moderate: 5, major: 8, extreme: 12 }),
    /** `R` gained when the commander backs down (minor and moderate read 6, major and extreme read 10). */
    yielded: Object.freeze({ minor: 6, moderate: 6, major: 10, extreme: 10 }),
    /** `R` of an enforcement whose measure the registry no longer has. */
    enforcedFallback: -8,
    leashEnforced: -20,
    /** `neverUsed` is the credit of a Leash nobody has used: it grows to its full value over `bluffDays` days and fades the same way after the first use. */
    leash: Object.freeze({ noneLeft: 10, neverUsed: 8, bluffDays: 7, recentUse: -10, recentDays: 7 }),
    defectUpkeep: 10,
    contagion: 0.3,
    secret: 5,
    secretCap: 15,
    stance: Object.freeze({
      trustHigh: 45,
      impunityHigh: 50,
      /** The zone where she does not much care who commands her: Trust from `trustMin` up to (not including) `trustHigh`, Impunity inside the range. */
      indifferent: Object.freeze({ trustMin: 30, impunityMin: 35, impunityMax: 59 }),
    }),
    /** A threat is believed while Impunity is below this. */
    believeBelow: 50,
    /** `commander_enforced` and `threatened` below this confidence are dropped for every unit. */
    minConfidence: 0.6,
    mutinyMin: 60,
    desertInsteadBelow: 30,
    bands: Object.freeze({ low: 30, high: 50, brazen: 60 }),
    /** `chancePerDay` is the chance at Impunity 0; it falls to 0 at `stance.impunityHigh`. At most one random sabotage in `cooldownDays` days. */
    sabotage: Object.freeze({ chancePerDay: 0.12, cooldownDays: 3, supplies: 2, credits: 10, gearChance: 0.5, gearSupplies: 2 }),
    applicationsMax: 20,
  }),
  /** P9: the squad's nicknames for the commander. A unit reacts once: Trust `trustPerWeight × weight`, Affinity `affinityPerWeight × weight`. */
  reputation: Object.freeze({ maxActive: 2, trustPerWeight: 2, affinityPerWeight: 3, leaveAfterDays: 7 }),
  /** P9: demands (draft balance values). `baseChance` is the daily chance at Impunity 50 on a guarded world with a stance weight of 1. */
  demands: Object.freeze({
    baseChance: 0.04, maxChance: 0.5, perWeek: 2, weekDays: 7, maxOpen: 2, expiresInDays: 2, grantRecord: 4, refuseHighMult: 1.5, textMax: 240,
  }),
  /** P7a: the change ledger behind trends, stress sources and "last changes" readings. */
  ledger: Object.freeze({ days: 7, max: 150 }),
  /** P11: how many soldiers one scene can hold (the line-up takes the whole squad of four). */
  scene: Object.freeze({ maxParticipants: 4 }),
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
    /** P8: events read from one answer before the per-unit judgement (a hostile flood is bounded); the judged ones are then cut to `maxEventsPerExchange`. */
    maxEventsRead: 40,
    loyalty: Object.freeze({ steady: 35, waveringEnter: 25, breakingEnter: 10, breakingExit: 20 }),
    crime: Object.freeze({ trustPerWeight: 3, affinityPerWeight: 5 }),
    affair: Object.freeze({ base: 0.04, perOther: 0.04, partnerPresent: 0.15 }),
  }),
  /** P3: facts, promises and the chronicle. */
  memory: Object.freeze({
    factTextMax: 200, factsPerScene: 8, closedPromisesMax: 30,
    /** P3b: the retrieval bonus of a pinned fact, and how far past `factsMax` the hard ceiling sits (the fold runs first). */
    pinnedBonus: 2, hardCeiling: 1.25,
    /** P3b: days a fast / slow rumor takes to reach the whole squad. */
    rumor: Object.freeze({ fast: 2, slow: 4 }),
  }),
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
  /**
   * P9d: desire and bonds. Spec numbers verbatim (Want 0–100, rises +4 / +7, ×1.4 intense, ×0.6 avoidant, Attraction ≥ 60,
   * bands 40 / 70 / 90); everything else is a DRAFT balance value, the author's to change.
   */
  bonds: Object.freeze({
    /** Character limits shared by the profile, her note and what extraction reports. */
    limits: Object.freeze({ noteMax: 160, evidenceMax: 120, maxViolations: 3, sceneLimitMax: 160, sceneLimitsMax: 5 }),
    lead: Object.freeze({
      styleBase: Object.freeze({ yielding: 15, balanced: 40, assertive: 60, dominant: 75 }),
      /** The score moves by this much per point of Impunity above or below `impunityRef`. */
      impunityWeight: 0.2,
      impunityRef: 50,
      /** Per `commander_yielded` / `followed_lead` (+) or `commander_enforced` (−) on her in the last `windowDays`, capped.
       *  A defect's and a state's `leadBonus` are content (a state's counts only while her style is at least assertive). */
      perYield: 10, yieldCap: 20, perEnforced: 10, enforcedCap: 20, windowDays: 3,
      unitAtLeast: 60,
      commanderAtMost: 35,
    }),
    want: Object.freeze({
      max: 100,
      rise: Object.freeze({ medium: 4, high: 6 }),
      attachmentFactor: Object.freeze({ slow: 1, steady: 1, intense: 1.4, avoidant: 0.6 }),
      attractionMin: 60,
      /** An ineligible unit's Want fades this much a day. */
      decayPerDay: 5,
      bands: Object.freeze({ restless: 40, aching: 70, desperate: 90 }),
      initiativeMult: 1.5,
      stressPerDay: 2,
      visit: Object.freeze({
        chance: 0.25, priority: 55, ignore: Object.freeze({ event: 'dismissed', severity: 'moderate' }),
        /** AUTHOR TO WRITE: the knock a Want visit shows; `{name}` is her name. */
        framing: '{name} is at your door, restless and not hiding why.',
      }),
      /** What lowers Want (draft). */
      relief: Object.freeze({ intimateScene: 60, romanticScene: 25, companion: 5, train: 15, expeditionDay: 10, expeditionMinDanger: 3, wantVisit: 30 }),
      demandEveryDays: 3,
      /** A SATISFY answer queues tonight's visit at this priority. */
      satisfyPriority: 90,
      breakdownMoneyCost: 10,
    }),
    rules: Object.freeze({
      /** Daily chance a leading partner proposes a rule, × the lead-style multiplier. */
      chance: 0.05,
      leadMult: Object.freeze({ assertive: 1, dominant: 1.5 }),
      maxActive: 3,
      textMax: 160,
    }),
    publicity: Object.freeze({
      /** `publicReactions`: what the other units do once a relationship turns public while she leads. */
      reactions: Object.freeze({ lostRespectRecord: 4, respectTrust: 2 }),
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
  /**
   * P9b: the squad's power structure. Spec numbers verbatim: the commander's vote weight 1 + 0.5 × (Authority rank − 1) and × 0.75
   * at `high` assertiveness (`squad_power`), a leader's vote × 1.5, grunts 0.5, overrule record +5, standing 0.4 / 0.3 / 0.3
   * with the lead-style factors, the leader margin 10 and the weekly recompute, contagion weight 2, endorsement × 1.5, challenge
   * 14 days and Impunity +10, feat suppression 14 days, take-the-blame Leash −1. Everything else is a DRAFT, the author's to change.
   */
  power: Object.freeze({
    vote: Object.freeze({
      commanderBase: 1, commanderPerRank: 0.5, leaderWeight: 1.5, gruntWeight: 0.5,
      /** `decision_violated` severity on each unit that voted against an overruled vote. */
      overruleSeverity: 'moderate' as const,
      overruleRecord: 5,
      /** × her refusal chance while a grudge holds (until the next day end). */
      grudgeRefusalMult: 1.5,
      logMax: 30,
    }),
    ballot: Object.freeze({
      /** `clamp((trust − 50) / trustPer, −trustCap, trustCap)`. */
      trustPer: 25, trustCap: 2,
      openDemand: -1, subject: -4, compatibility: -1,
      /** `commandStances[].voteBias` is content; the ballot adds it as is. */
    }),
    merit: Object.freeze({ damagePer: 10, finishingBlow: 2, healPer: 10, absorbPer: 10, windowDays: 14 }),
    standing: Object.freeze({
      merit: 0.4, respect: 0.3, impunity: 0.3,
      factor: Object.freeze({ yielding: 0.7, balanced: 1, assertive: 1.15, dominant: 1.3 }),
      margin: 10, recomputeDays: 7, lostChallengeBonus: 10,
    }),
    countermand: Object.freeze({ chance: 0.2, cap: 0.6, overruleRecord: 3 }),
    endorse: Object.freeze({ multiplier: 1.5, othersRecord: 3 }),
    challenge: Object.freeze({
      base: 0.5, perRank: 0.12, min: 0.15, max: 0.85, standingPerRank: 26,
      cooldownDays: 14, deposedDays: 14, winRecord: -5, lossRecord: 10,
    }),
    outside: Object.freeze({ suppressDays: 14 }),
    /** The two answers' own numbers live in the `scapegoat_mission` template; only the failed-run penalty is here. */
    scapegoat: Object.freeze({ failedRunStanding: 4 }),
    /** DRAFT: `fighters_first` costs each reserve share that goes without this much Trust; the commander going without (`commander_short`) earns every named unit this much Trust. */
    rations: Object.freeze({ unfairTrust: 1, hungerTrust: 1 }),
  }),
  /**
   * P9e: a soldier acting on her own at an expedition event node. Spec numbers: chance 0.35 (× the squad's privilege multiplier),
   * the squad leader's weight ×2, Impunity record +4 on a good outcome. The rest is a DRAFT, the author's to change.
   */
  herCall: Object.freeze({
    chance: 0.35, chanceCap: 0.8,
    /** Actor weight = (1 + leadBonus[leadStyle]) × band[Impunity band] × (leader ? leaderMult : 1). */
    leadBonus: Object.freeze({ yielding: 0, balanced: 0, assertive: 1, dominant: 2 }),
    band: Object.freeze({ cowed: 0.5, low: 0.75, high: 1, brazen: 1.5 }),
    leaderMult: 2,
    /** odds of a good outcome = clamp(base + perPoint × (score(good) − score(bad)) + Σ defect tilts, min, max). */
    odds: Object.freeze({ base: 0.5, perPoint: 0.05, min: 0.15, max: 0.85 }),
    meritGood: 6, recordGood: 4, recordBad: 4, factImportance: 2,
    /** The standing order "ask me first": giving it costs Trust as a `decision_violated` of this severity. */
    askFirst: Object.freeze({ severity: 'minor' as const }),
  }),
  /**
   * P9c: personal pressure. Every number is a DRAFT (the plan's rulings), the author's to change. Frequencies below are
   * multiplied by the squad's `demandMult` (P9b) and the unit's `pressureMult` (defects) where the rulings say so.
   */
  personal: Object.freeze({
    /** Who may take part (the bond gate, `pressureGate`): lead ranks 0–3, Affinity and Impunity floors. */
    gates: Object.freeze({
      device: Object.freeze({ minLeadRank: 1 }),
      courtship: Object.freeze({ minLeadRank: 2 }),
      token: Object.freeze({ minAffinity: 50 }),
      wager: Object.freeze({ minLeadRank: 1, minAffinity: 20, minImpunity: 50 }),
    }),
    decor: Object.freeze({ regrowDays: 7, fadeDays: 7 }),
    /** A level-4 edit (one a day per unit): chance per eligible event (before the multipliers), its cap, and how many days of the log are kept. */
    intercept: Object.freeze({ chance: 0.3, cap: 0.6, logDays: 7 }),
    booking: Object.freeze({ base: 0.08, cap: 0.5, perWeek: 2, settleStress: 10 }),
    courtship: Object.freeze({ initiativeMult: 2, conditionMax: 160 }),
    claim: Object.freeze({ chance: 0.04, cooldownDays: 14, refuseStress: 8 }),
    token: Object.freeze({ chance: 0.03, maxWorn: 2, offerDays: 3, lockDays: 7, giverAffinityPerDay: 1 }),
    wager: Object.freeze({
      chance: 0.03, acceptAffinity: 0, acceptImpunity: 40, offerDays: 3, noBookDays: 7, privilegeRecord: 6, markDays: 3, markLoseStress: 3,
      answerMax: 200, logMax: 20,
    }),
    /** The commander's one skill in a bout: a single-target basic attack of the skills registry (pinned by a test). */
    sparring: Object.freeze({ commanderSkill: 'as_strike', maxRounds: 20, bodyXp: 0.5 }),
    bet: Object.freeze({ voidDays: 7, killsNeeded: 3 }),
    obedience: Object.freeze({ days: 1 }),
    secret: Object.freeze({
      insightBase: 0.08, insightCap: 0.4, insightTrust: 40, slipChance: 0.25, nightChance: 0.1, nightAffinity: 60, nightTrust: 50,
      usedDays: 14, heldPerSecret: 8, heldMax: 16, confrontRecord: 5, hiddenInjuryHp: 0.25, successorDays: 7, nightPriority: 50, nightExpiresDays: 2,
    }),
    /** The record the commander takes on for overriding her (a REVERT, a cancelled booking under obedience, …). */
    overrideRecord: 3,
  }),
});
