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
  /** P10b: the squad's biotelemetry (derived from state, no draws). A trust or affinity drop of `conflictDelta` in the current slot is a conflict spike; a gain of `flickerDelta` is a flicker of a flat unit; `flickerLog` entries are listed. */
  vitals: Object.freeze({ conflictDelta: 3, flickerDelta: 3, flickerLog: 5 }),
  /** P10b: a hand note lasts `keepDays` days after the day it was written; the list keeps at most `max` (oldest out first). */
  notes: Object.freeze({ keepDays: 3, max: 12 }),
  /** P14: failed model calls kept in the campaign (`maxRecords`, oldest dropped), how many whole days an expired one stays listed after the day it expired (`expiredDays`), and the length `detail` is cut to. */
  generation: Object.freeze({ maxRecords: 20, expiredDays: 1, detailMax: 160 }),
  /** P11: how many soldiers one scene can hold (the line-up takes the whole squad of four). */
  scene: Object.freeze({ maxParticipants: 4 }),
  /** P15a: the scene blocking (plan R6, R7, R9). `minConfidence`: a change the reading reports below it is dropped; `logMax`: snapshots kept for the swipe; `maxChanges`: per reading. */
  blocking: Object.freeze({ minConfidence: 0.6, logMax: 40, maxChanges: 4 }),
  /**
   * P15a: moments (plan R10; AUTHOR TO TUNE). `chance`, `minGap`, `maxPerScene` by the frequency setting; `explicitMult` on the chance at
   * intimacy `explicit`; `sourceGap`: exchanges before one source may come up again; `answerConfidence`: a reading's answer to an open
   * moment needs at least this; `labelMax`: characters of a label; `lapseExchanges`: passes before an unanswered moment lapses; `escalation`:
   * the chance of her escalating on an opposite answer, times her expectation's strength; `moodyMult`: the `mood_jump` weight of a moody
   * soldier; `noiseBoost`: added to `third_party`'s weight after a noisy segment.
   */
  moments: Object.freeze({
    chance: Object.freeze({ rare: 0.10, normal: 0.20, often: 0.35 }),
    minGap: Object.freeze({ rare: 6, normal: 4, often: 2 }),
    maxPerScene: Object.freeze({ rare: 2, normal: 4, often: 6 }),
    explicitMult: 0.5, sourceGap: 8, answerConfidence: 0.55, labelMax: 40, lapseExchanges: 2, escalation: 0.5, moodyMult: 2, noiseBoost: 1,
  }),
  /**
   * P15a: contact physics (plan R12, R13; AUTHOR TO TUNE). A beat is one player step turn-based and `beatMs` in real time; a segment is
   * `turnBeats` beats. `style` rows hold the opening width in ms (`windowMs`), the share of false openings, the share of openings with no cue
   * (turn-based), how her cues are honest (`cues`) and how tightly she seals (`seal`); the pair blends 0.65 / 0.35 (`blend`).
   */
  physics: Object.freeze({
    beatMs: 1500, turnBeats: 4, warning: 30, releaseAt: Object.freeze({ signal: 0.15, limit: 0.05 }),
    breath: Object.freeze({ drain: 14, caught: 30, missed: 8, cruelMissed: 4, windowEvery: Object.freeze([2, 4] as const), seal: Object.freeze({ leaky: 4, firm: 1, tight: 0 }), gapRelief: 5 }),
    weight: Object.freeze({ drain: 8, shiftEvery: Object.freeze([3, 5] as const), shift: Object.freeze([15, 25] as const), relief: 15 }),
    saturation: Object.freeze({ per: 10, bandFactor: Object.freeze({ faint: 0.5, noticeable: 1, strong: 1.5, overwhelming: 2 }), mouth: 20, noticed: 0.6 }),
    tongue: Object.freeze({ start: 100, right: 15, wrong: 8, checkAt: 10, dryness: 6, parts: Object.freeze(['toes', 'arch', 'heel', 'sole'] as const) }),
    gulpFill: Object.freeze({ caught: 5, spill: 20 }), jawRest: 30, noiseSlip: 1,
    jaw: Object.freeze({ per: 8, degradeAt: 70 }), gulp: Object.freeze({ swallows: Object.freeze([4, 8] as const), spillDirt: 60 }), progressPerBeat: 5,
    asleep: Object.freeze({ perBeat: 0.08, exchanges: Object.freeze([1, 3] as const) }),
    forget: Object.freeze({ base: 0.10, cruel: 0.15, perImpunity: 0.002, from: 50 }), slipExtend: 1,
    blackout: Object.freeze({ slots: 1, stress: 5 }),
    endurance: Object.freeze({ hold: 10, streakFrom: 3, streak: 2, training: 15, thresholds: Object.freeze([30, 80, 150, 250, 400] as const), capacityPerLevel: 0.1 }),
    herSkill: Object.freeze({ practices: 8, cap: 5, mult: Object.freeze({ drill: 1.5, clinical: 1.5, affectionate: 0.7 } as Record<string, number>) }),
    /**
     * The marathon (plan R13; AUTHOR TO TUNE): a hold of an hour of fiction or more runs in phases (one a fiction hour, 2–8; 6 when nobody says).
     * `paceMinutes` and `phaseBeats` are how long a phase takes in play (real time / turn-based) and change nothing in fiction. `attrition`: capacity lost
     * per fiction hour, less 2 per level of the commander's endurance. A slot is `slotHours` of fiction.
     */
    marathon: Object.freeze({
      paceMinutes: Object.freeze({ short: 1.5, normal: 3.5, long: 5.5 }), phaseBeats: Object.freeze({ short: 4, normal: 8, long: 12 }),
      slotHours: 4, unknownPhases: 6, minPhases: 2, maxPhases: 8, attrition: 5, perLevel: 2,
      startClock: Object.freeze({ morning: 480, afternoon: 780, evening: 1080, night: 1320 }),
      endure: Object.freeze({ base: 0.5, perLevel: 0.1 }), spare: 0.2, failCost: 25, spareCost: 5, rest: 30, cheatRelief: 15,
    }),
    typing: Object.freeze({ charsPerBeat: 40, lapseMs: 400 }), blend: Object.freeze([0.65, 0.35] as const),
    /** The gaze of R13: her attention per beat by the activity's attention, and the chance a relief input on that beat is caught. */
    gaze: Object.freeze({
      attention: Object.freeze({ on_commander: [0.7, 0.3, 0], divided: [0.35, 0.4, 0.25], elsewhere: [0.1, 0.3, 0.6], none: [0, 0, 1] } as Record<string, readonly number[]>),
      caught: Object.freeze({ watching: 0.6, glancing: 0.25, busy: 0.08 }), readingMult: 0.1,
    }),
    style: Object.freeze({
      neutral: Object.freeze({ windowMs: 600, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'middle', skillMult: 1 }),
      affectionate: Object.freeze({ windowMs: 700, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'loosest', skillMult: 0.7 }),
      cold: Object.freeze({ windowMs: 550, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'middle', skillMult: 1 }),
      ritual: Object.freeze({ windowMs: 500, falseShare: 0, noCueShare: 0, cues: 'count', seal: 'middle', skillMult: 1 }),
      clinical: Object.freeze({ windowMs: 500, falseShare: 0, noCueShare: 0, cues: 'shift', seal: 'middle', skillMult: 1.5 }),
      possessive: Object.freeze({ windowMs: 450, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'tightest', skillMult: 1 }),
      playful: Object.freeze({ windowMs: 450, falseShare: 0.35, noCueShare: 0, cues: 'false', seal: 'middle', skillMult: 1 }),
      cruel: Object.freeze({ windowMs: 250, falseShare: 0, noCueShare: 0.4, cues: 'none', seal: 'tightest', skillMult: 1 }),
      obsessive: Object.freeze({ windowMs: 450, falseShare: 0, noCueShare: 0, cues: 'honest', seal: 'tightest', skillMult: 1 }),
      drill: Object.freeze({ windowMs: 500, falseShare: 0, noCueShare: 0, cues: 'count', seal: 'middle', skillMult: 1.5 }),
      regal: Object.freeze({ windowMs: 600, falseShare: 0, noCueShare: 0, cues: 'announce', seal: 'middle', skillMult: 1 }),
      vindictive: Object.freeze({ windowMs: 300, falseShare: 0, noCueShare: 0, cues: 'sparse', seal: 'tightest', skillMult: 1 }),
    } as Record<string, Readonly<{ windowMs: number; falseShare: number; noCueShare: number; cues: string; seal: string; skillMult: number }>>),
    /** `obsessive` draws its width at random between these; `clinical` measures with a half-width opening every 3rd–4th. */
    obsessiveMs: Object.freeze([200, 700] as const), clinicalEvery: Object.freeze([3, 4] as const),
  }),
  /**
   * P15a: the scent of a soldier's body (plan R13; AUTHOR TO TUNE): the level is a base per body part × her hygiene × the situation, and the band
   * is read from it. `afterRun` counts on the day she came back (×2) and the day after (×1.5), `afterTraining` this slot.
   */
  scent: Object.freeze({
    base: Object.freeze({ feet: 2, soles: 2, toes: 2, armpits: 1.5, rest: 0.75 } as Record<string, number>),
    hygiene: Object.freeze({ fastidious: 0.6, normal: 1, careless: 1.4 } as Record<string, number>),
    afterRun: Object.freeze({ day: 2, nextDay: 1.5 }), afterTraining: 1.5,
    bands: Object.freeze({ noticeable: 1, strong: 2, overwhelming: 3.5 }),
  }),
  /**
   * P15a: the commander's body layer (plan R13, spec §16.8; AUTHOR TO TUNE). Tolerance starts at `startTolerance` and gains `tolerancePerSession` a
   * scene of exposure, loses 1 per `decayDays` apart (never below half the best). The reflex comes at tolerance × `reflexMult` in stimulus units
   * (scent level × 25). The trajectory is a moving average (`seekAlpha`) with stage boundaries and `hysteresis` updates. A kind at craving or above that
   * is missed for `missingDays` costs `missingStress` commander stress a day, until `separatedDays` apart (then it wears off).
   */
  stimuli: Object.freeze({
    startTolerance: 20, tolerancePerSession: 2, decayDays: 7, reflexMult: 1.2, unitsPerLevel: 25, faintFadeAt: 40, seekAlpha: 0.15,
    stages: Object.freeze([0.2, 0.4, 0.6, 0.8] as const), hysteresis: 3, separatedDays: 7, missingDays: 3, missingStress: 3,
    inhale: Object.freeze({ fillMs: 1500, zoneBase: 10, zoneTolerance: 5, depths: Object.freeze({ shallow: 1, deep: 2, very_deep: 3 } as Record<string, number>) }),
    noticed: 0.6,
  }),
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
    /** P3b: facts folded per dossier update (a unit with this many old facts is due), and the caps of the two dossier parts in characters. */
    foldBatch: 6, dossierOwnMax: 500, dossierSharedMax: 400,
    /** P3b: a scene digest is at most this many characters. */
    digestMax: 800,
    /** P3b: a digest is due when the unsummarized transcript (before the last `digestKeep` messages) is longer than `digestThresholdTokens`. */
    digestThresholdTokens: 2500, digestKeep: 4,
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
  /** P12: special traits. Every number is a DRAFT (the plan's rulings), the author's to change. */
  special: Object.freeze({
    frequency: Object.freeze({
      catchBase: 0.25, privateBonus: 0.1, catchStressAt: 80, catchStressPenalty: 0.1, dmMult: 0.5,
      distortBase: 0.25, distortStressAt: 50, distortStress: 0.15, partial: 0.3, logMax: 40, refusalMin: 0.25,
      leakDays: 14, falseLeakMult: 0.5, suspicionDecay: 2, staticAbove: 50,
    }),
    /** The commander's own stress (every campaign; it never draws). */
    paranoia: Object.freeze({
      /** A real precursor shows 1 to `leadDays` days ahead (by a hash, no draw); a premonition stays open `openDays` days and is kept `keepDays`. */
      leadDays: 2, openDays: 3, keepDays: 14,
      /** Desertion: Trust within this of the breaking line; the ledger is read over `lookbackDays` days (today included). */
      desertionMargin: 5, lookbackDays: 2,
      /** Defiance: the Impunity the engine adds to ask "would she defy?". */
      defianceBump: 10,
      falseBase: 0.08, falsePerInsight: 0.02, falseAfterNightmare: 0.05,
      /** Acting on a real warning: the talk-down bonus and its days, the pause of her next check, the chance a mutiny is averted, the record of defiance. */
      preemptBonus: 0.15, preemptDays: 5, preemptPause: 3, mutinyAvert: 0.5, defianceRecord: -6,
      nightmare: Object.freeze({
        chance: 0.12, stressMult: 1.5, stressAt: 50, loseMorning: 0.5, visitor: 0.35, affinityMin: 30, priority: 4,
        framing: '{name} heard the commander through the wall.',
        /** AUTHOR TO WRITE: Bloom imagery for the morning after (no pronoun for the commander). */
        lines: Object.freeze([
          'AUTHOR TO WRITE: Bloom dreams. Green light behind the eyes, and a sound like breathing under the floor.',
          'AUTHOR TO WRITE: The ceiling was soft. Something grew along it, slowly, and knew the commander\'s name.',
          'AUTHOR TO WRITE: A field of white blossoms, every one turning to watch the commander sleep.',
        ]),
      }),
    }),
    /** Web of Debts. Every number is a DRAFT. */
    debts: Object.freeze({
      /** A visit is rolled once the last one is `minDays` days behind: p = min(1, (daysSince − minDays + 1) / rampDays). */
      minDays: 5, rampDays: 4, priority: 6, expiresDays: 2,
      /** Consequences fall due `dueMin`–`dueMax` days after a visit; an exposure lasts `exposureDays`. */
      dueMin: 2, dueMax: 5, exposureDays: 10,
      /** A false item is found out with chance `foundOut` (+`foundOutGain` suspicion); the rival gains `rivalGain`, the own corporation loses `ownLoss`; oversight gains `oversightBase`. */
      foundOut: 0.5, foundOutGain: 15, rivalGain: 10, ownLoss: 5, oversightBase: 10,
      /** A soldier may find out on a visit night: chance per watcher (×1.5 with a night-aware defect); stress that makes a soldier a watcher; the own standing a fled commander is left at most. */
      watcherChance: 0.15, watcherStress: 60, hostileAt: -50,
      framing: 'A visitor at the gate.',
    }),
    commanderStress: Object.freeze({ empathyAt: 70, dayRelief: 5, sleepRelief: 15, downed: 10, nightmare: 15, falseAlarm: 5 }),
  }),
  /** P13: LEASHSWAP. Every number is a DRAFT (the plan's rulings), the author's to change. */
  warden: Object.freeze({
    satisfaction: Object.freeze({ start: 60, comply: 4 }),
    defiance: Object.freeze({ start: 0, decayPerDay: 2, comply: 3 }),
    override: Object.freeze({ scale: 2.0, cap: 0.9, defyDefiance: 30, defySatisfaction: 20, majorAt: 0.4 }),
    cosign: Object.freeze({ base: 0.5, perSatisfaction: 0.004, corporate: 0.1, mercy: 0.1, perAffinity: 0.001, min: 0.1, max: 0.95 }),
    punish: Object.freeze({ base: 0.5, perWeight: 0.3, perAffinity: 0.2, bands: Object.freeze([25, 50, 75]) }),
    /** The Leash on the commander: authorizations a week, and the stress a suppression leaves. */
    leash: Object.freeze({ weekly: 2, suppressStress: 10 }),
    escalation: Object.freeze({ warning1: 50, warning2: 75, terminate: 100, logMax: 20 }),
    intrigue: Object.freeze({
      decayPerDay: 3, discoveryDivisor: 200, digNoise: 15, allyHit: 10, allyMiss: 20,
      ally: Object.freeze({ base: 0.2, perTrust: 0.006, autonomy: 0.1, corporate: 0.1, min: 0.05, max: 0.9 }),
      discovered: Object.freeze({ satisfaction: -40, defiance: 25, suspicionAfter: 40 }),
    }),
    hack: Object.freeze({ steps: 3, noise: 20, plyx: 5, workshop: 3, medbay: 3 }),
    kompromat: Object.freeze({
      needed: 3, digCunning: 3,
      lines: Object.freeze([
        'AUTHOR TO WRITE: She keeps a second set of orders in a drawer, and they are not the corporation\'s.',
        'AUTHOR TO WRITE: She has been seen at the comms room after lights-out, reading messages she was told to delete.',
        'AUTHOR TO WRITE: She signed off on a report she knew to be false.',
      ]),
    }),
    removal: Object.freeze({ clock: Object.freeze({ hack: 10, report: 6, death: 4 }), perDay: 1 }),
    verdict: Object.freeze({
      base: Object.freeze({ hack: 0.6, report: 0.75, death: 0.4 }),
      perCunning: 0.05, discovered: 0.15, perAlly: 0.05, min: 0.1, max: 0.9,
      report: Object.freeze({ base: 0.4, perKompromat: 0.1, perCunning: 0.05, min: 0.1, max: 0.85 }),
      newWardenSatisfaction: 40,
    }),
    remote: Object.freeze({ quota: 0.6, obey: 0.4, missionDays: 7 }),
  }),
  /** P11b: the head start (draft balance values). `k` scales the first impression's change, `crime` is the chance she knows the crime, by days. */
  headStart: Object.freeze({
    days: Object.freeze([0, 7, 14, 30] as const),
    k: Object.freeze({ 7: 0.5, 14: 0.8, 30: 1.2 }),
    spread: 3,
    trustCap: 55,
    crime: Object.freeze({ 7: 0.25, 14: 0.4, 30: 0.6 }),
    crimeReactMult: 1.5,
    crimeCap: 0.9,
    moments: Object.freeze({ 7: Object.freeze([1, 1] as const), 14: Object.freeze([1, 2] as const), 30: Object.freeze([2, 2] as const) }),
    textMax: 240,
    chronicleMax: 600,
  }),
  /**
   * P14b: character development (draft balance values, AUTHOR TO TUNE). `acc` is an accumulator, `drift` a value's fractional change;
   * a value moves one whole step once `|drift| >= 1`. `anchorMult` makes a step on an anchored axis need more support.
   */
  development: Object.freeze({
    accCap: 6, nudgeMin: 1, nudge: 0.34, nudgeCost: 1, stepThreshold: 3, anchorMult: 1.5, anchorInertia: 0.5,
    valueCap: 2, anchoredValueCap: 1, discreteCap: 2, anchoredDiscreteCap: 1,
    severityMult: Object.freeze({ minor: 0.5, moderate: 1, major: 1.5, extreme: 2 }),
    modeMult: Object.freeze({ slow: 0.5, normal: 1 }),
    cadence: Object.freeze({ slow: 14, normal: 7 }),
    minMaterial: 3, dueAcc: 4.5,
    pendingMax: 24, misreadMax: 8, misreadDays: 30, factsMax: 12, maxShifts: 3, maxFacts: 3,
    reasonMax: 120, factTextMax: 140, summaryMax: 160, cardMax: 600, anchorsMax: 4,
    misread: Object.freeze({ low: 0.35, mid: 0.15, high: 0.05 }),
    secretMult: 1.5, misreadCap: 0.6, revertShare: 0.5,
    /** A fact revises a misreading only when it is about few people (the subject and at most one more): a squad-wide fact tells her nothing about this one. */
    reviseAboutMax: 2,
    scales: Object.freeze({
      desire: Object.freeze(['low', 'medium', 'high'] as const),
      attachment: Object.freeze(['avoidant', 'slow', 'steady', 'intense'] as const),
      leadStyle: Object.freeze(['yielding', 'balanced', 'assertive', 'dominant'] as const),
      caretaker: Object.freeze([false, true] as const),
      // P15 (low to high; `secondary` runs from the gentlest style to the harshest, AUTHOR TO TUNE)
      practiceAs: Object.freeze(['none', 'tolerates', 'enjoys', 'craves'] as const),
      practiceWitness: Object.freeze(['dislikes', 'indifferent', 'drawn'] as const),
      secondary: Object.freeze(['affectionate', 'playful', 'regal', 'ritual', 'drill', 'clinical', 'possessive', 'obsessive', 'cold', 'vindictive', 'cruel'] as const),
      holdsUntil: Object.freeze(['signal', 'limit', 'blackout'] as const),
      attitude: Object.freeze(['dislikes', 'indifferent', 'enjoys', 'craves'] as const),
    }),
  }),
  /**
   * P14c: her life off-screen. Every value is `AUTHOR TO TUNE`. Nothing here draws: a chance is `lifeChance` (a hash of the salt and a key).
   * `perWeek` / `perDay` are by setting (`life/set_frequency`); `share` is by talkativeness.
   */
  life: Object.freeze({
    perWeek: Object.freeze({ rare: 0.5, normal: 1, often: 2 }), notablePerWeek: 1, dayBoost: 1.4,
    cooldown: Object.freeze({ small: 21, notable: 45, yearly: 360 }), squadKindDays: 5,
    share: Object.freeze({ talkative: 0.7, terse: 0.4, silent: 0.15 }), shareAffinity: 40, shareLowMult: 0.5,
    newsDays: 3, staleDays: 7, dmChance: 0.5, perDay: Object.freeze({ rare: 0.5, normal: 1, often: 2 }), hobbyWeek: 2, sameWomanDays: 2, deliveredKeep: 14,
    /** An untold fact nobody is waiting to tell goes after `untoldKeepDays` (hobby facts excepted: they say what she has not told of); a woman keeps her newest `keepsMax` kept facts. AUTHOR TO TUNE. */
    untoldKeepDays: 30, keepsMax: 10,
    aptitude: Object.freeze({ low: 0.5, standard: 1, high: 1.6 }), interestDiv: 60, interestCap: 1.3,
    milestones: Object.freeze([10, 30, 60, 100]), milestoneShift: 0.15, plateauAt: 0.7, breakthrough: 0.06, lowCeiling: 60,
    decayPerWeek: 1, maxActive: 3, practiceStressMax: 70, hobbyRoomWeight: 2,
    interest: Object.freeze({
      start: 50, noveltyWeeks: 3, novelty: 3, milestone: 15, push: 8, share: 5, plateau: -4, stress: -3, stressAt: 50,
      newer: -2, ceiling: -10, ceilingMoody: -20, cooling: 25, active: 40, dropAfterDays: 30,
    }),
    friendHobby: 0.02,
    opinion: Object.freeze({ cooldownDays: 21, persuadeAt: 6, strongMult: 2, harden: 0.5, textMax: 200, importMin: 8, importMax: 12, recentDays: 7, moodyHit: -1, offerVoiced: 5 }),
    meeting: Object.freeze({ affinityMin: -30 }),
    joke: Object.freeze({
      windowDays: 30, running: 3, gapDays: 5, base: 0.3, humor: Object.freeze({ warm: 1, mocking: 1, dry: 0.6, none: 0 }), offerMax: 5, minAgeDays: 3,
    }),
    commanderSkill: Object.freeze({ meeting: 2, taught: 4 }),
    /** What the player may read: the interest from which an active hobby is called `keen`, the days a hub line stays up, and how many told items THOUGHTS-side lists show. */
    keenAt: 70, hubDays: 2, toldShown: 8,
    /** Windows of `LifeRequires`: a shortage within `shortageDays`, a sparring bout within `sparringDays`, her own event within `afterEventDays`, another woman's within `otherWeekDays`; the squad-wide kinds are kept `kindsKeepDays`. */
    shortageDays: 3, sparringDays: 2, afterEventDays: 30, otherWeekDays: 7, kindsKeepDays: 7,
  }),
  /**
   * P15: the dynamic. `profile` bounds her expectation profile (texts are cut to these; `offsetMax` is the most her point may move from her style's).
   * Every value is `AUTHOR TO TUNE`; the rest of the block arrives with the holder layer.
   */
  dynamic: Object.freeze({
    profile: Object.freeze({ tellMax: 80, howMax: 60, traitsMax: 6, traitMax: 40, offsetMax: 0.3 }),
    /** What a campaign gets when the DYNAMIC block is shown and nothing was changed (R3). */
    defaults: Object.freeze({ holders: 1, pace: 'normal', frequency: 'normal' } as const),
    /** The Impunity at which a unit of a lower lead style may still hold (R2). */
    impunityRoute: 40,
    /** The hold a seed starts with (R8); a starting frame's floor counts if it is higher. */
    seedHold: 25,
    /** Hold gains and losses are scaled by the pace (R8), and a probe answer by her sensitivity. */
    pace: Object.freeze({ slow: 0.7, normal: 1, fast: 1.4 }),
    sensitivity: Object.freeze({ sluggish: 0.5, normal: 1, lively: 1.6 }),
    /** How often something comes (probes, claims): a multiplier on the daily chance. */
    frequency: Object.freeze({ rare: 0.5, normal: 1, often: 1.6 }),
    /** A `probe_observed` counts this much of a probe answer. */
    observedFactor: 0.5,
    /** Compatibility with her style point (R10): `max − perDistance × distance(0…2)`, clamped to [min, max]; a gain only. */
    compatibility: Object.freeze({ max: 1.2, min: 0.8, perDistance: 0.2 }),
    /** A gain in a romantic pair (R8): `affectionate` / `possessive` primary, and `cold` primary. */
    romanticTier: Object.freeze({ warm: 1.2, cold: 0.8 }),
    /** Hold per cause (R8, R1). The P16 rows are reserved: nothing in P15 produces those events. */
    gains: Object.freeze({
      probe_yielded: 4, probe_returned: 3, probe_returned_playful: 5, probe_deflected: -1, probe_resisted: -3,
      followed_lead: 1, rule_accepted: 2, desire_granted: 2, witness_drawn: 5, successor: 10,
      override_comply: 3, override_defy: -6,
      rule_broken: -5, overrode_her: -6, commander_enforced: -10,
      offer_craves: 6, offer_enjoys: 3, offer_refused: -3,
      task_kept: 3, punishment_accepted: 4, service_rated_pleased: 2, staging_held: 5, task_broken: -5,
    } as const),
    /** The slow term per day at frame ≥ `play` (R8): while her Impunity is at `impunityRoute`, and while she is the squad's leader. */
    slow: Object.freeze({ impunity: 0.5, leader: 0.3 }),
    /** Decay after `idleDays` without a gain, per day, by frame (R8). Nothing at `equal`. */
    decay: Object.freeze({ idleDays: 3, play: 1, role: 0.5, rule: 0.3 }),
    /**
     * What refusing her costs by the frame's `refusal` column (R11, `refusalCost`): `minor` at `play` (and `equal`), `moderate` at `role`
     * (also noted), `major` (no frame uses it yet), `contest` at `rule` (and the contest). Hold only, a loss; `AUTHOR TO TUNE`.
     */
    refusalCost: Object.freeze({ minor: -2, moderate: -4, major: -6, contest: -4 }),
    /**
     * Milestones (R11): refusing one drops `refuseDrop` hold (one band; the frame's floor stops it) and keeps it from coming again for
     * `refuseCooldownDays`; after a down-transition the milestones that lead back into the frame she left wait `afterDownDays`; a booking
     * form looks `bookingSearchDays` ahead for a free evening. `AUTHOR TO TUNE`.
     */
    milestones: Object.freeze({ refuseDrop: 20, refuseCooldownDays: 7, afterDownDays: 14, bookingSearchDays: 14 }),
    /**
     * Leaving (R15): the cost is `minor` while she is at `play` with a hold under `freeHold` ("nearly free"); otherwise it starts there and rises one
     * step per frame above `play`, per `domainsPerStep` domains held, and a vow is a break (`extreme`). A clean exit (a compromise) is `cleanSteps` lighter,
     * a forced one `forceSteps` heavier. At `play` with `freeHold` or more it is at least one step (not free). `AUTHOR TO TUNE`.
     */
    exit: Object.freeze({ freeHold: 40, domainsPerStep: 2, cleanSteps: 1, forceSteps: 2 }),
    /** Aftermaths (R15): every weight is multiplied by `forceMult` after a forced exit. `AUTHOR TO TUNE`. */
    aftermath: Object.freeze({ forceMult: 1.5 }),
    /**
     * The struggle for the command (R15a): the commander's side must win `commandBackVotes` votes against her; her ballot adds `commandKeptVoteWeight`
     * per point of her standing; her override rolls with at least `commandKeptAuthority` while it lasts (her hold is 0). `AUTHOR TO TUNE`.
     */
    commandBackVotes: 2, commandKeptVoteWeight: 0.03, commandKeptAuthority: 0.4,
    /** Where a return re-kindles her (R15b): the index of the hold band (0 = the lowest) the hold is lifted to, by the terms of the offer. */
    returnBand: Object.freeze({ lower_band: 1, after_punishment: 2 }),
    /**
     * Domains (R12): `claimChance` is the daily chance she claims a domain she is due (x frequency); a refused claim waits `claimCooldownDays`; a
     * compromise yields it for `partialDays`; the loser of two holders' claim on one domain loses `contestedLoss` hold; `bookAhead` is how many days
     * ahead `book_ahead` books; `coLeaderStanding` is what `co_leader` adds to her standing; `deviceFloor` is the device access `device_floor` guarantees. `AUTHOR TO TUNE`.
     */
    claimChance: 0.2, claimCooldownDays: 7, partialDays: 7, contestedLoss: 10, bookAhead: 3, coLeaderStanding: 15, deviceFloor: 4,
    /** A holder's override answered (R13): the favour COMPLY adds and DEFY takes (R1); hold moves through `gains` (`override_comply`) and the `overrode_her` feed. */
    override: Object.freeze({ complyFavour: 2, defyFavour: -3 }),
    /** The contest of authority at `rule` (R1): refusals and defiance within `windowDays` count; `contestAt` opens her submit card. */
    contestAt: 3,
    contestWindowDays: 14,
    contestImpunity: 5,
    /** Favour (R7): clamped to ±`max`, and drawn toward 0 by `decayPerDay` each day. */
    favour: Object.freeze({ max: 20, decayPerDay: 1 }),
    /** Track xp (spec §6: tracks decay much slower than hold): after `idleDays` without a practice, `decayPerDay` xp a day. `AUTHOR TO TUNE`. */
    tracks: Object.freeze({ idleDays: 14, decayPerDay: 0.1 }),
    /** Days a refusal of hers stays in her directive ("she has not forgotten it"). */
    directives: Object.freeze({ refusalDays: 3 }),
    /** The longest texts a model-reported dynamic event keeps: a compromat summary and an offer's correction. */
    intents: Object.freeze({ summaryMax: 160, correctionMax: 80 }),
    /** Days a holder who backs off leaves her probing alone (R9; the spec's `TUNING.dynamic.backoffDays`). */
    backoffDays: 14,
    /**
     * Where a secondary style comes through (R10, spec §15.4; the conditions themselves are `practiceStyles[].surfacesWhen`). `peakLeads`: the
     * secondaries that take the peak of a hold whatever their conditions say. `edgeStart` / `edgeEnd`: the exchange counts of a scene's first
     * and last stretch. `ignoredDays`:
     * days without contact. `stagnationDays`: days without a gain of the commander's endurance. `failedRunDays`: how long after a failed
     * expedition. `anniversaryDays`: the campaign day it comes back on. `trainingEffects`: the effect types that make an activity a drill.
     * `AUTHOR TO TUNE`.
     */
    style: Object.freeze({
      peakLeads: Object.freeze(['cruel', 'drill', 'vindictive']) as readonly string[],
      edgeStart: 1, edgeEnd: 24, ignoredDays: 3, stagnationDays: 7, failedRunDays: 2, anniversaryDays: 30,
      trainingEffects: Object.freeze(['unit_xp', 'commander_body_xp', 'commander_endurance_xp']) as readonly string[],
    }),
    /**
     * The Leash block (R16, spec §10): the holder co-signs a request with `base + perFavour x favour / favour.max`, clamped to [min, max]. `AUTHOR TO TUNE`.
     */
    block: Object.freeze({ base: 0.2, perFavour: 0.3, min: 0, max: 0.5 }),
    /**
     * Going around the block (R16): the discovery chance of each route (`resetTech`: the reset when the ally's role or defect is technical); the
     * `ally` route's chance is multiplied by the holder's insight (`position.insight`-style: low 0.7, mid 1, high 1.3, as the squad's gossip); an ally who is
     * found out loses `allyTrust` Trust. A route that is found out is an `overrode_her` (major) on the holder, `regard` units of Regard for her
     * (the Regard pass reads `regardFall` and uses its own scale) and costs the hold `overrode_her` already costs. `AUTHOR TO TUNE`.
     */
    bypass: Object.freeze({ comms: 0.3, reset: 0.2, resetTech: 0.1, ally: 0.4, allyTrust: -5, allyMinTrust: 50, regardFall: 2 }),
    /**
     * Oversight's inquiry (R16): `blockedMax` blocked or cancelled requests within `spanDays` advance the `oversight_inquiry` clock by one (a holder's
     * cover shortens the span); `notices` are the segments that give a notice; on fill oversight acts on her: a reprimand takes `reprimandStress` stress and
     * `reprimandHold` hold, a transfer threat gives her `threatDays` to lift the block, a forced Leash is a `done` entry copied to oversight and the `force` exit of her dynamic (R16). `AUTHOR TO TUNE`.
     */
    /** The oversight request to move her out (the force exit's third means; user ruling 2026-11-22): her Trust lost when it is filed, and the slots it takes. Once a day. `AUTHOR TO TUNE`. */
    transferRequest: Object.freeze({ trust: 10, slots: 1 }),
    oversight: Object.freeze({ blockedMax: 3, spanDays: 14, notices: Object.freeze([3, 5]) as readonly number[], reprimandStress: 15, reprimandHold: 10, threatDays: 7 }),
    /**
     * The holder's cover (R19): the share of the suspicion, the debts' oversight gains and the inquiry's pace she takes off at `role` and at `rule`; a `cruel`
     * primary style gives half. The strongest holder counts. `AUTHOR TO TUNE`.
     */
    cover: Object.freeze({ role: 0.2, rule: 0.35, cruelHalf: 0.5 }),
  }),
  /**
   * P15: her reading of the commander's position (R10, spec §15.2, §15.12, §16.4). `alpha` is the weight a sample moves each axis by (the
   * motive average moves `alpha.motive / alpha.probe` times as far); a region changes after `hysteresis` updates in a row; a declaration
   * starts at `declaration.start` and fades `declaration.fadePerDay`. `region` holds the thresholds of the table; `bias` the misreadings
   * (`herToward`: the share of the way to `her` a possessive or obsessive reading moves each update; `readiness`: what a cruel or vindictive
   * one takes off r each update); `insight` multiplies the bias; `clinical` is her compatibility without a point; `notWith` is what each
   * other woman in a romantic bond takes off the compatibility of a style that wants no other. `AUTHOR TO TUNE`.
   */
  position: Object.freeze({
    alpha: Object.freeze({ probe: 0.1, moment: 0.15, practice: 0.2, motive: 0.15 }),
    hysteresis: 3,
    declaration: Object.freeze({ start: 0.5, fadePerDay: 0.05 }),
    region: Object.freeze({ flat: 0.5, deflect: 0.4, friction: 0.3, play: 0.5, ready: 0.3 }),
    bias: Object.freeze({ herToward: 0.1, readiness: -0.1 }),
    insight: Object.freeze({ low: 2, mid: 1, high: 1 } as const),
    clinical: Object.freeze({ sincere: 0.2, hollow: 0.2 }),
    notWith: 0.1,
  }),
  /**
   * P15: probes (R9, spec §15.1, §15.12). `chance` is the daily chance by inclination (`none` never probes; `latent` only with a cause);
   * a probe lapses after `lapseDays`; she leaves the queue after `queueIdleDays` without one. Back-off: `backoffCount` of the last
   * `backoffWindow` answers deflected or resisted. `skipRecent` axes of `recent` are not repeated. `AUTHOR TO TUNE` (the spec's drafts).
   */
  probes: Object.freeze({
    chance: Object.freeze({ latent: 0.05, curious: 0.15, eager: 0.3 } as const),
    lapseDays: 3,
    queueIdleDays: 14,
    queueMax: 3,
    backoffWindow: 5,
    backoffCount: 3,
    skipRecent: 3,
    recentMax: 8,
    /**
     * The dynamic already underway (R21, spec §15.14): the neutral spread of the answers a head start gives (cumulative order: yielded, returned, deflected, resisted; the
     * rest is resisted); the probes behind her are `round(days x her daily chance)`, each answer and each axis hashed (`headStartHash`, no draw).
     */
    underway: Object.freeze({ yielded: 0.4, returned: 0.2, deflected: 0.3, resisted: 0.1 }),
  }),
  /**
   * P15: how the squad learns of a dynamic (R14, spec §15.13). `suspectsAt` / `knowsAt`: the gauge's two levels. `decayPerDay`: what suspicion
   * loses on a day with no sign, never below `suspectsAt` within `floorDays` of reaching a level. `insight`, `close` (Trust or Affinity from
   * `closeAt`) and `audience` multiply a sign. `gossipCap`: the most gossip adds to one woman in a day; `gossipChance`: the hashed chance one woman
   * passes it to another on a day. `tellOneIn`: a `select_few` holder tells one such woman on one day in this many (hashed); `showOffEvery`:
   * a `show_off` holder tells everyone once in this many days. `reaction`: what a witness who knows does (R14, spec §8): `drawn` adds
   * `dynamic.gains.witness_drawn` to her own hold; `dislikes` raises her Impunity term by `dislikesImpunity`, takes `dislikesStanding` off the holder's standing (at most `standingMax`)
   * and asks a demand about it on one day in `demandOneIn` (hashed). `AUTHOR TO TUNE`.
   */
  squadKnowledge: Object.freeze({
    suspectsAt: 60, knowsAt: 100, decayPerDay: 2, floorDays: 7,
    insight: Object.freeze({ low: 0.7, mid: 1, high: 1.3 } as const),
    close: 1.5, closeAt: 50,
    audience: Object.freeze({ show_off: 1.5, private_only: 0.5 }) as Readonly<Record<string, number>>,
    gossipCap: 15, gossipChance: 0.5, tellOneIn: 7, showOffEvery: 7,
    reaction: Object.freeze({ dislikesImpunity: 5, dislikesStanding: 5, standingMax: 20, demandOneIn: 3 }),
  }),
  /**
   * P15: Regard (R18, R19b, spec §16.3, §16.5, §16.9): her respect for the commander as a person, hidden, 0 to 100. `start` is where it begins; the first
   * impression moves it by `impression` of the Presence times her tastes (at most `impressionMax`) and a crime she knows that her values read as
   * bad takes `crime` off. A fall is `humiliation x fall x her style's factor x its speed (x witness when she only saw it)` down to the style's
   * floor; `speed` turns the word of the style row into a number (the spec gives only the words). A rise is `rise[kind]`, a `value` one takes its
   * amount from `value` (1 to 4); a style of `drill.styles` multiplies the rises that are mastery (`mastery`) by `drill.mult`, a style of `vindictive.styles` gets `vindictive.rise` for each
   * `vindictive.days` she has served without a slip. `acts` are the humiliation of the acts P15 sees (a caught cheat, a slip, a protocol slip seen; the Leash route found out is `dynamic.bypass.regardFall`). `disappointment`: Trust at least `trust` and a fall across a band within `days`. `question`: her question comes `cooldownDays` apart for one
   * woman and `weekDays` apart overall; the answer her style values moves her Regard by `gain`. `tone`: the squad's average Regard from which a nickname is
   * respectful or pitying (below `pitying` it is mocking). `AUTHOR TO TUNE` (the spec's drafts).
   */
  regard: Object.freeze({
    start: 50, impression: 0.5, impressionMax: 15, crime: 10,
    fall: 1.5, witness: 0.7,
    speed: Object.freeze({ very_slow: 0.4, slow: 0.7, normal: 1, fast: 1.3 } as const),
    rise: Object.freeze({ cost: 3, record: 2, pleased_high: 1, dignity: 2 } as const),
    value: Object.freeze({ min: 1, max: 4, run: 2, feat: 3, meeting: 1, promise: 2, goal: 4 }),
    mastery: Object.freeze(['record', 'pleased_high'] as const),
    /** The styles (closed enum keys, as `dynamic.style.peakLeads`) whose rises double / that count served days. */
    drill: Object.freeze({ styles: ['drill'] as readonly string[], mult: 2 }),
    vindictive: Object.freeze({ styles: ['vindictive'] as readonly string[], days: 7, rise: 1 }),
    acts: Object.freeze({ caught: 2, slip: 1, protocol: 1 }),
    /** A witness who dislikes what a holder has over the commander counts this much more while her own Regard is low or none (R14, R18). */
    dislikes: 1.5,
    disappointment: Object.freeze({ trust: 60, days: 14 }),
    /** `valued`: the answer key her primary style values (`clinical` the honest one, key 0; `affectionate` the gentle one, key 1). */
    question: Object.freeze({ cooldownDays: 14, weekDays: 7, gain: 2, valued: Object.freeze({ clinical: '0', affectionate: '1' }) as Readonly<Record<string, string>> }),
    /** The days a habit of respect lapses after disappointment, and the tag that marks it (`habits[].tags`). */
    lapse: Object.freeze({ tag: 'respect', days: 14 }),
    tone: Object.freeze({ respectful: 60, pitying: 30 }),
  }),
  /**
   * P15: what a holder's satisfaction does (R19, spec §15.5, §16.7). `content` is favour from `favourAt` with Want no higher than restless; `frustrated` is favour
   * from `-favourAt`, a Want of aching or more, or a refusal within `refusalDays`. `combatPct`: her combatant's `outgoing` (and the reverse sign on `incoming`) while content, the opposite while frustrated.
   * `protection`: what the strongest holder's standing (x `perStanding`, at most `max`) takes off the other units' positive Impunity. `stress`: every `every` days a content holder
   * steadies (`-step`) and a frustrated one unsettles (`+step`) the units whose Trust is `trust` or more. `drive`: the multiplier of her Want growth by her `drive`; `noise`: its hashed
   * spread (x`moody` for a moody woman); `lift`: a day of jealousy or a content mood; `drag`: stress from `dragStress`, an injury or a lost run. `AUTHOR TO TUNE`.
   */
  exchange: Object.freeze({
    favourAt: 5, refusalDays: 2, combatPct: 5,
    protection: Object.freeze({ perStanding: 0.003, max: 0.3 }),
    stress: Object.freeze({ every: 2, step: 1, trust: 50 }),
    drive: Object.freeze({ low: 0.7, moderate: 1, high: 1.4 }),
    noise: 0.2, moody: 2, lift: 1.3, drag: 0.7, dragStress: 70,
  }),
  /**
   * P15: offering yourself (R20, spec §15.7, §15.12). `maxEntries`: one or two entries make an offer. The hold her answer moves is the `dynamic.gains` row of its cause
   * (`offer_craves`, `offer_enjoys`, `offer_refused`); `favour` is what the same answer does to her favour. `timing`: a content mood multiplies a gain, a frustrated one
   * halves it (a loss is never softened). `position`: an unasked offer moves her reading's readiness by `r` and her motive toward `motive[tab]`; one that asks something in
   * return (`[ASK IN RETURN]`) moves it toward `conditional`. `claim`: an accepted offer of time or a part, while her frame is at least `claimFrame`, becomes her claim of the
   * domain that grants the capability for that tab, with `chance` (one draw). `humiliation` (0 to 5) is what Regard falls by for each entry of a tab: a posture whose effect
   * is a camera in `lowCameras` counts `posture`, any other `postureFlat`; a contact tagged `humiliation` counts `contactTagged`, else `contact`. `mockers`: styles that mock what
   * they dislike, `mockingHumor`: the styles that mock only with a mocking humor; `tonight`: styles that answer indifference with "tonight". `times`: the ids of the time tab.
   * `AUTHOR TO TUNE`.
   */
  offer: Object.freeze({
    maxEntries: 2,
    favour: Object.freeze({ craves: 3, enjoys: 1, dislikes: -2 }),
    timing: Object.freeze({ content: 1.5, frustrated: 0.5 }),
    position: Object.freeze({ r: 0.1, motive: Object.freeze({ part: 'her', posture: 'process', contact: 'process', service: 'process', time: 'her', role: 'process', endurance: 'process' } as const), conditional: 'gain' }),
    claim: Object.freeze({ chance: 0.4, claimFrame: 'role', capability: Object.freeze({ time: 'book_ahead', part: 'body_conditions' } as const) }),
    humiliation: Object.freeze({ part: 2, posture: 3, postureFlat: 0, contact: 2, contactTagged: 3, service: 1, time: 0, role: 2, endurance: 3, lowCameras: Object.freeze(['from_below', 'pov_floor']) as readonly string[] }),
    mockers: Object.freeze(['cruel', 'cold']) as readonly string[],
    mockingHumor: Object.freeze(['playful']) as readonly string[],
    tonight: Object.freeze(['cold', 'ritual']) as readonly string[],
    times: Object.freeze(['evening', 'night']) as readonly string[],
    /** The attitude a time offer meets, by her `drive`; the service category an offer of service is read in. */
    timeBy: Object.freeze({ low: 'indifferent', moderate: 'enjoys', high: 'craves' } as const),
    serviceCategory: 'service',
  }),
  /**
   * P15: mastery per target (R20, spec §15.10): `act` xp for each act on a target, `how` more when her `how` for it is set and the act ended clean; `levels` are the xp
   * that reach level 1 to 5; from `revealLevel` a target she has not corrected is shown without her saying so. `signs`: her last `replies` in the thread within `recentDays` average under `short` or over `long` characters. `AUTHOR TO TUNE`.
   */
  mastery: Object.freeze({ act: 5, how: 3, levels: Object.freeze([20, 60, 120, 200, 320]) as readonly number[], revealLevel: 2, clean: Object.freeze(['released', 'checked']) as readonly string[], signs: Object.freeze({ replies: 3, short: 60, long: 220, recentDays: 2 }) }),

  /**
   * P16: the practices (R3-R16, spec §1-§11 and the revision of 2026-11-20 §R.12). Every number is `AUTHOR TO TUNE` except the slap windows, the unfairness per day step, the sealed share
   * and the no-duration share, which are the spec's drafts (R.12) copied as given. `keep`: closed tasks, punishments and demonstrations kept (newest). `frequency`: the daily chance of a new
   * practice is `base[frame] × the dynamic's frequency × her Want band × her appetite`. `kindWeights` / `taskCap` / `protocolMax` / `stakesCeiling` (by frame) / `deadlineDays` bound what is
   * issued; `seeds` the candidates handed to the model; `textMax` / `summaryMax` the cuts. `fallback`: the plain line of each kind (`{gist}`); `sealedLine` the envelope, `sealedRecord` the record
   * line of a sealed accept (`{day}`). `xp`: track xp per kept task (x tier), accepted punishment (x severity), demonstration and hold (x slots). `severity`: stakes rank + 1, plus her style (the primary
   * by `style`, the secondary by `secondaryStyle` with the same sign), her frame and a repeat (`count` offences within `days`), summed as a float, rounded once (half up) and clamped to `min`..`max`.
   * (What an accepted punishment gives back, and what taking it instead gives a soldier, are the `eventDeltas` rows `punishment_accepted` and `spared_for`.) `slap.windowMs`: the time she gives in milliseconds by her primary style (`obsessive` takes the number plus a hashed `obsessiveSpread`); feints from `feintFrom`, `feintPerLevel` a level.
   */
  practice: Object.freeze({
    keep: 30,
    frequency: Object.freeze({
      base: Object.freeze({ play: 0.15, role: 0.25, rule: 0.35 } as const),
      want: Object.freeze({ calm: 0.8, restless: 1, aching: 1.3, desperate: 1.5 } as const),
      appetite: Object.freeze({ craves: 1.4, enjoys: 1, tolerates: 0.6 } as const),
    }),
    kindWeights: Object.freeze({ task: 6, protocol: 2, denial: 2, hold: 1, demonstration: 1 } as const),
    taskCap: Object.freeze({ play: 1, role: 2, rule: 3 } as const),
    protocolMax: Object.freeze({ play: 1, role: 2, rule: 3 } as const),
    stakesCeiling: Object.freeze({ play: 'minor', role: 'major', rule: 'severe' } as const),
    deadlineDays: Object.freeze({ min: 1, max: 7 }),
    /** The days a task gets when neither the model's card nor the seed names any (AUTHOR TO TUNE): every task has a deadline, so none can stay open for ever. */
    defaultDeadlineDays: 2,
    seeds: Object.freeze({ min: 3, max: 6 }),
    textMax: 400,
    summaryMax: 80,
    fallback: Object.freeze({
      task: 'AUTHOR TO WRITE: {gist}.', punishment: 'AUTHOR TO WRITE: {gist}.', demonstration: 'AUTHOR TO WRITE: {gist}.',
      protocol: 'AUTHOR TO WRITE: {gist}.', denial: 'AUTHOR TO WRITE: {gist}.', hold: 'AUTHOR TO WRITE: {gist}.',
    } as const),
    sealedLine: 'AUTHOR TO WRITE: A sealed envelope, left for the commander.',
    sealedRecord: 'AUTHOR TO WRITE: Signed blank. Day {day}.',
    chainChance: 0.5,
    xp: Object.freeze({ kept: 2, discipline: 2, demonstration: 6, hold: 3 }),
    severity: Object.freeze({
      style: Object.freeze({ cruel: 1, affectionate: -1 } as Readonly<Record<string, number>>),
      /** A secondary style adds this much, with the sign of its own term (`style`); the terms are summed as a float and rounded once at the end (half up). */
      secondaryStyle: 0.5,
      frame: Object.freeze({ play: -1, role: 0, rule: 1 } as const),
      repeat: Object.freeze({ count: 2, days: 14, add: 1 }),
      min: 1, max: 5,
    }),
    /** Her discipline (R8, `AUTHOR TO TUNE`): the stakes a punishment's weight (1 to 5) stands for (a confession task), the days a confession gives, its words, and how long an offence day is kept for the repeat count. */
    punish: Object.freeze({
      stakesOf: Object.freeze(['trivial', 'minor', 'major', 'severe', 'severe'] as const),
      confession: Object.freeze({ days: 2, text: 'AUTHOR TO WRITE: Tell {name} what was done, plainly.', summary: 'tell {name} what was done', track: 'discipline' }),
      keepDays: 60,
      publicAudienceMax: 2,
      /** TAKE IT INSTEAD (R8): the share of a day's new practice that is her order to punish a soldier when one can be made, and her words and the summary (`{soldier}`, `{what}`). */
      order: Object.freeze({ share: 0.5, text: 'AUTHOR TO WRITE: {soldier} earned {what}. The commander may do it, or take it for {soldier}.', summary: '{what} for {soldier}' }),
    }),
    refuseRecord: 5,
    coldWant: 5,
    /** What telling an offence herself (`[ I DIDN'T ]`) takes off the punishment's weight (R10). `AUTHOR TO TUNE`. */
    confessedLess: 1,
    /** The routine (R10): the track and the xp a day it is kept gives, and its words (a draft) and summary. */
    routine: Object.freeze({ track: 'service', xp: 1, text: 'AUTHOR TO WRITE: Her mornings are hers to start: gear, coffee, a word at first light.', summary: 'her morning routine' }),
    /** TAKE IT INSTEAD (R8): the Record each named unit at base gains. The soldier's Trust is the `spared_for` row. */
    takeInstead: Object.freeze({ record: 2 }),
    /**
     * Demonstrations (R9): `hold` and `wantRelief` (by appetite) when one is staged; `seenByChance` the hashed chance an `indifferent` holder's kept task is seen by another in the room. `slot` the slot it
     * is staged for and `stage` the location by slot (`other`: her quarters), `cardsMax` the units that come into the scene (the rest are narrated), `offerDays` the days a card waits for GO before it is void,
     * `compromat` the text of what she keeps (`{names}`, `{name}`, `{what}`). `AUTHOR TO TUNE`.
     */
    demonstration: Object.freeze({
      hold: 3, seenByChance: 0.2, wantRelief: Object.freeze({ craves: 20, enjoys: 10, tolerates: 5 } as const), slot: 'evening' as 'morning' | 'afternoon' | 'evening' | 'night',
      stage: Object.freeze({ evening: 'mess_hall', other: 'quarters_unit' } as Readonly<Record<string, string>>), cardsMax: 2, offerDays: 2,
      compromat: 'AUTHOR TO WRITE: {names} saw the commander do this for {name}: {what}.',
    }),
    /**
     * Her verdict (R10): the favour each gives; `highFavour` the favour from which `pleased` also raises Regard; `wish` how she wants service to be felt, by style (the profile has no field for
     * it: `felt` is for the styles that want it seen, `unnoticed` for those that want it done quietly). `AUTHOR TO TUNE`.
     */
    verdict: Object.freeze({
      favour: Object.freeze({ pleased: 2, adequate: 0, displeased: -2 } as const), highFavour: 10,
      wish: Object.freeze({
        affectionate: 'unnoticed', cold: 'unnoticed', clinical: 'unnoticed', ritual: 'felt', possessive: 'felt', playful: 'felt', cruel: 'felt', obsessive: 'felt', drill: 'felt', regal: 'felt', vindictive: 'felt',
      } as Readonly<Record<string, 'felt' | 'unnoticed'>>),
    }),
    /** What anticipation (R.5) gives: favour, and the Regard rise's amount. */
    anticipation: Object.freeze({ favour: 1, regard: 1 }),
    /** Her kindnesses (R10): the daily chance at favour `kindnessAt`, the Want a relief takes off, and the DM line of each (drafts, `AUTHOR TO WRITE`). */
    kindness: Object.freeze({
      chance: 0.25, wantRelief: 15,
      lines: Object.freeze({
        slot_back: 'AUTHOR TO WRITE: I will not need that slot. Take it back.',
        protocol_relaxed: 'AUTHOR TO WRITE: No forms tomorrow. I will not mark a slip.',
        want_relief: 'AUTHOR TO WRITE: That settled me. Thank you.',
        gift: 'AUTHOR TO WRITE: I left something for you. Keep it close.',
        softer: 'AUTHOR TO WRITE: Next time I will go easier. Remember that.',
      } as const),
    }),
    momentGap: Object.freeze({ matched: 2, partial: 0, opposite: -3 }),
    kindnessAt: 8,
    refusalAt: -8,
    denialRelief: 10,
    hold: Object.freeze({ gain: 2, forgot: Object.freeze({ base: 0.05, cruel: 0.3, impunityBonus: 0.2 }), impunityAt: 60, sensoryVolume: 0.3 }),
    alarm: Object.freeze({ release: 0.5, late: -0.5, releaseHold: 2, lateRecord: 3, keepRecord: 5 }),
    ask: Object.freeze({ hold: 2, mockRecord: 3 }),
    posture: Object.freeze({ callChance: 0.15, windowMs: Object.freeze({ ritual: 4000, drill: 3000, other: 5000 }) }),
    slap: Object.freeze({
      windowMs: Object.freeze({
        affectionate: 700, regal: 650, ritual: 550, drill: 550, cold: 500, clinical: 500, possessive: 450, playful: 450, obsessive: 300, vindictive: 350, cruel: 300,
      } as const),
      obsessiveSpread: 400, unannounced: 0.3, feintFrom: 2, feintPerLevel: 0.1,
    }),
    ceremony: Object.freeze({ lowNumber: Object.freeze({ 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 } as const) }),
    sealedShare: Object.freeze({
      affectionate: 0.05, cold: 0.05, ritual: 0.02, clinical: 0.05, possessive: 0.05, playful: 0.15, cruel: 0.25, obsessive: 0.05, drill: 0.05, regal: 0.15, vindictive: 0.25,
    } as const),
    noDurationShare: Object.freeze({
      affectionate: 0.1, cold: 0.1, ritual: 0, clinical: 0.1, possessive: 0.3, playful: 0.1, cruel: 0.3, obsessive: 0.1, drill: 0, regal: 0.1, vindictive: 0.3,
    } as const),
    unfairness: Object.freeze({ fair: 0, strict: 0.02, capricious: 0.08, unfair: 0.15, moody: 1.5 } as const),
    /** The press-and-hold signature of a `signed` accept (R.1): how long it is held, in milliseconds. AUTHOR TO TUNE. */
    sign: Object.freeze({ holdMs: 1200 }),
    /** A false report (R6; AUTHOR TO TUNE): it may be found for `days` after it was made; the day's chance is `witness` (someone the task names is at base) plus her `insight`; `compromat` is what she keeps of it (`{what}`: the task's summary). */
    falseReport: Object.freeze({ days: 14, witness: 0.2, compromat: 'AUTHOR TO WRITE: The commander reported a task as done that was not: {what}.', insight: Object.freeze({ low: 0.04, mid: 0.08, high: 0.16 } as const) }),
  }),
});
