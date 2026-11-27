import type { ProfileStyle } from './dynamic/types';

/** P10e-e (R13): her face before a slap and after it, by her style (the 28 expression labels of the sprites). */
export interface SlapFace { readonly before: string; readonly keep: readonly string[]; readonly after: Readonly<Record<'none' | 'braced' | 'flinched', string>> }

/**
 * P10e-e R32: her flow in gulp by style (gulp.html `STYLES`, verbatim): her base in mouths a second, its slow wander (`vary`), how often she
 * pauses (`pause`), her surges (every `surgeEvery` seconds, `surge` times her flow, after a warning of `warn` ms; `announce`: she says it,
 * `feint`: the share of warnings with no surge after them), her answer to a tap (`tap`, the instrument's) and who cleans what was spilled
 * (`check`: `clean` the commander, `herself` she wipes it up). A style the table has no row of reads neutral's.
 */
export interface GulpRow {
  readonly base: number; readonly vary: number; readonly pause: number; readonly surgeEvery: readonly [number, number]; readonly surge: number; readonly warn: number;
  readonly tap: string; readonly check: string; readonly announce?: boolean; readonly feint?: number;
}
export const GULP_STYLES: Readonly<Record<string, GulpRow>> = Object.freeze({
  neutral:      Object.freeze({ base: 0.2, vary: 0.25, pause: 0.25, surgeEvery: Object.freeze([7, 12] as const), surge: 1.6, warn: 700, tap: 'slower', check: 'clean' }),
  affectionate: Object.freeze({ base: 0.15, vary: 0.2, pause: 0.4, surgeEvery: Object.freeze([12, 20] as const), surge: 1.3, warn: 1100, tap: 'pause', check: 'herself' }),
  ritual:       Object.freeze({ base: 0.19, vary: 0.05, pause: 0.15, surgeEvery: Object.freeze([8, 8] as const), surge: 1.5, warn: 900, tap: 'hold', check: 'clean', announce: true }),
  playful:      Object.freeze({ base: 0.19, vary: 0.45, pause: 0.35, surgeEvery: Object.freeze([5, 9] as const), surge: 1.8, warn: 500, tap: 'faster', check: 'clean', feint: 0.4 }),
  cruel:        Object.freeze({ base: 0.26, vary: 0.35, pause: 0.1, surgeEvery: Object.freeze([4, 7] as const), surge: 2.1, warn: 0, tap: 'surge', check: 'clean' }),
  possessive:   Object.freeze({ base: 0.22, vary: 0.2, pause: 0.15, surgeEvery: Object.freeze([6, 10] as const), surge: 1.7, warn: 600, tap: 'slower', check: 'clean' }),
  cold:         Object.freeze({ base: 0.21, vary: 0.1, pause: 0.1, surgeEvery: Object.freeze([9, 14] as const), surge: 1.4, warn: 400, tap: 'none', check: 'clean' }),
});

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
    /**
     * P10e-e R15: `overDelay` is how many beats her openings move later when she notices the commander holding on (a `strain` of amount 1), by her
     * lead style (`other` for every style not named); `wmul` is how many times an opening's `widthMs` the instrument keeps it open (breath.html).
     */
    breath: Object.freeze({
      drain: 14, caught: 30, missed: 8, cruelMissed: 4, windowEvery: Object.freeze([2, 4] as const), seal: Object.freeze({ leaky: 4, firm: 1, tight: 0 }), gapRelief: 5,
      overDelay: Object.freeze({ cruel: 2, affectionate: 0, other: 1 } as Readonly<Record<string, number>>), wmul: 2,
    }),
    weight: Object.freeze({ drain: 8, shiftEvery: Object.freeze([3, 5] as const), shift: Object.freeze([15, 25] as const), relief: 15,
      /** P10e-e Ruling AE (weight.html `relief`): a shift she caught at once costs 10 and leans her in heavier, 1.5 for 3 beats. */
      caught: 10, caughtLean: Object.freeze({ pressure: 1.5, beats: 3 }) }),
    saturation: Object.freeze({ per: 10, bandFactor: Object.freeze({ faint: 0.5, noticeable: 1, strong: 1.5, overwhelming: 2 }), mouth: 20, noticed: 0.6 }),
    tongue: Object.freeze({ start: 100, right: 15, wrong: 8, checkAt: 10, dryness: 6, parts: Object.freeze(['toes', 'arch', 'heel', 'sole'] as const) }),
    /**
     * P10e-e Task 27 (R30): shoe service. `wetShare`: the share of days that are wet (`wetDay`: a hash of the day; the state has no weather),
     * whose dirt is rain when no run or drill of hers says otherwise. `AUTHOR TO TUNE`.
     */
    shoe: Object.freeze({
      wetShare: 0.25,
      /** Ruling AC (e10 fix I2): her chance to see a spit, by her attention (shoe.html `spit`'s 0.75 / 0.3 / 0.06), one draw when it is made. */
      spitSeen: Object.freeze({ watching: 0.75, glancing: 0.3, busy: 0.06 } as Record<string, number>),
    }),
    gulpFill: Object.freeze({ caught: 5, spill: 20 }), jawRest: 30, noiseSlip: 1,
    jaw: Object.freeze({ per: 8, degradeAt: 70 }),
    /**
     * P10e-e R23: how long a granted rest lasts in real time (jaw.html's `REST_MS`). R22: her moves in the jaw (real time), from jaw.html: the
     * first `firstMs` in, then every `every` seconds by her lead style (`STYLES[].every`; a style the prototype lacks takes `other`, neutral's)
     * plus the length of an order; her toes choose `deeper` / `pull_back` / `suck` / `wider` by `toes` (32 / 18 / 25 / 25 %), the ring asks
     * on `0.4 + ask / 2` of her moves (`STYLES[].ask`) and else wants it `wider`; a `suck` lasts `suckMs`, a `wider` `wideMs`.
     */
    jawRestMs: 4200,
    jawOrders: Object.freeze({
      firstMs: 3000, toes: Object.freeze([0.32, 0.5, 0.75] as const), suckMs: Object.freeze([4000, 7000] as const), wideMs: Object.freeze([3000, 5000] as const),
      styles: Object.freeze({
        neutral: Object.freeze({ every: Object.freeze([5, 9] as const), ask: 0.35 }), affectionate: Object.freeze({ every: Object.freeze([7, 12] as const), ask: 0.4 }),
        ritual: Object.freeze({ every: Object.freeze([6, 6] as const), ask: 0.3 }), playful: Object.freeze({ every: Object.freeze([4, 8] as const), ask: 0.45 }),
        cruel: Object.freeze({ every: Object.freeze([3, 6] as const), ask: 0.5 }), possessive: Object.freeze({ every: Object.freeze([4, 8] as const), ask: 0.35 }),
        vindictive: Object.freeze({ every: Object.freeze([4, 7] as const), ask: 0.4 }), clinical: Object.freeze({ every: Object.freeze([5, 9] as const), ask: 0.3 }),
        other: Object.freeze({ every: Object.freeze([5, 9] as const), ask: 0.35 }),
      } as Record<string, { readonly every: readonly [number, number]; readonly ask: number }>),
    }),
    gulp: Object.freeze({ swallows: Object.freeze([4, 8] as const), spillDirt: 60 }), progressPerBeat: 5,
    /**
     * P10e-e R32 (gulp.html): her flow in real time, planned by hash from her style's row (`styles`): the first warning `firstMs` in (the
     * prototype's `nextSurge`), a pause per beat at `pause × beatMs / 9000` (its per-millisecond chance), the surge one beat long (inside its
     * 1.2–2.2 s). Her volume (`volumeMs`, the prototype's default 35 s) ends the flow; what was spilled is cleaned from `cleanFrom` mouthfuls.
     */
    gulpFlow: Object.freeze({ styles: GULP_STYLES, firstMs: 6000, volumeMs: 35000, cleanFrom: 0.15 }),
    asleep: Object.freeze({ perBeat: 0.08, exchanges: Object.freeze([1, 3] as const) }),
    forget: Object.freeze({ base: 0.10, cruel: 0.15, perImpunity: 0.002, from: 50 }), slipExtend: 1,
    /**
     * P10e-e Task 25 (P16b §8, her_activity.html `MOTIONS` / `MEANINGS` / `herSignals`): her foot language. A holder has five pairs (P16b: 4–6;
     * the prototype's five): the three foot acts and `deskCount` of the desk meanings, each on a motion of hers, shuffled by `fnv1a` of her id.
     */
    footSignals: Object.freeze({
      motions: Object.freeze(['tap2', 'sole', 'push', 'hook', 'point', 'stamp', 'nudge'] as const),
      foot: Object.freeze(['kiss', 'clean', 'rub'] as const),
      desk: Object.freeze(['closer', 'still', 'enough'] as const),
      deskCount: 2,
    }),
    /**
     * P10e-e Task 25: her foot service (her_activity.html `SVC_STYLE`, the drafts of her profile, read by style). `patience` bounds her patience
     * (the plan: 3–5 s, cruel shorter: cruel keeps the prototype's 2.5). `verdict`: a session's mean quality at `pleased` or more pleases her (the
     * prototype's good line, `q ≥ 0.6`), under `adequate` (the prototype's half-done stroke, 0.3) displeases her. Her own words of how she likes
     * her feet (P15 `how` of the targets at her feet: a body-map zone at `footZoneY` or lower) tilt it: `slow` / `quick` scale her kiss and tempo.
     */
    footService: Object.freeze({
      patience: Object.freeze([3, 5] as const), verdict: Object.freeze({ pleased: 0.6, adequate: 0.3 }), footZoneY: 90,
      slow: Object.freeze({ kiss: 1.25, tempo: 0.8 }), quick: Object.freeze({ kiss: 0.75, tempo: 1.25 }),
    }),
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
  /**
   * P15b: her manner over the style (spec TUNING, approved 2026-11-24; the small shares are tuned in play). Every bend at a step of 0 returns its base.
   * `text`: the limits of the profile's new texts and lists; `scale`: one step of a `bend` scale; the shares per step (`sealed`, `noDuration`,
   * `forgot`) are shifts; `voiceLines`: the factor of cue lines by `voice` (never more than one a beat, none within `lineGapMs` of her last);
   * `favour`: `drawnBy`'s bonus; `fresh`: the share of requests for something new by `curiosity`; `drift` / `turn`: the pace of P14b's review;
   * `contrast`: the factor on P15's gossip chance, capped.
   */
  manner: Object.freeze({
    text: Object.freeze({ everydayMax: 160, quirkMax: 160, quirksMax: 3, drawnByMax: 2 }),
    scale: 0.15,
    severity: 0.5,
    sealed: Object.freeze({ curiosity: 0.03, orderDown: 0.02 }),
    noDuration: Object.freeze({ orderDown: 0.03 }),
    forgot: Object.freeze({ warmthDown: 0.03, intensityUp: 0.02 }),
    voiceLines: Object.freeze({ '-2': 0, '-1': 0.5, '0': 1, '1': 1.5, '2': 2 } as Readonly<Record<string, number>>),
    lineGapMs: 3000,
    /** Chunk m3: the share of free beats that carry a counting cue, moved per `order` step (a counting holder's 1 down, any other's 0 up); a hash of the run, never a draw. */
    counted: 0.25,
    /** Chunk m3: the shortest segment a `tempo` step may make, in beats. */
    minBeats: 2,
    /**
     * Chunk m3 (planning ruling 1): how `bendRow` bends a style row's fields, by the field's kind. `axis`: the axis that moves it. `scale`: the factor
     * per step of the kinds that scale (the direction convention of chunk m2: `tempo` + = quicker = shorter, so the time-like kinds scale down with it;
     * `order` + = steadier = less jitter and fewer feints; `intensity` + = larger; `warmth` + = more patience). `feintCap`: a feint is a share. `restsPerStep`:
     * whole rests a `warmth` step adds (`trunc`, so ±2 moves it by one). `gap`: the factor on a spacing between her lines (`linegap`) by `voice`; the lines
     * themselves (`lines`) follow `voiceLines`.
     */
    instrument: Object.freeze({
      axis: Object.freeze({ time: 'tempo', lead: 'tempo', jitter: 'order', feint: 'order', magnitude: 'intensity', patience: 'warmth', rests: 'warmth', lines: 'voice', linegap: 'voice' } as const),
      scale: Object.freeze({ time: -0.15, lead: -0.15, jitter: -0.15, feint: -0.15, magnitude: 0.15, patience: 0.15 }),
      feintCap: 1,
      restsPerStep: 0.5,
      gap: Object.freeze({ '-2': 3, '-1': 2, '0': 1, '1': 2 / 3, '2': 0.5 } as Readonly<Record<string, number>>),
    }),
    favour: Object.freeze({ main: 1, second: 0.5 }),
    fresh: Object.freeze({ '-2': 0, '-1': 0, '0': 0, '1': 0.2, '2': 0.4 } as Readonly<Record<string, number>>),
    /**
     * Chunk m5 (spec §4): the mood of her day, steps added to her axes for that day only (the sum is clamped to ±2 in `mannerOf`). `moody`: the axes a moody
     * woman's hashed −1 / 0 / +1 moves; `events`: what a life event's `mood` moves; `failedRun`: what a failed run that day moves.
     */
    mood: Object.freeze({
      moody: Object.freeze(['intensity', 'warmth', 'tempo'] as const),
      events: Object.freeze({
        good: Object.freeze({ warmth: 1, tempo: -1 }),
        irritated: Object.freeze({ warmth: -1, intensity: 1 }),
        low: Object.freeze({ intensity: -1, voice: -1 }),
      } as const),
      failedRun: Object.freeze({ warmth: -1 }),
    }),
    drift: Object.freeze({ days: 28 }),
    turn: Object.freeze({ margin: 2, reviews: 2, days: 56 }),
    /**
     * Chunk m6 (planning ruling 4, AUTHOR TO TUNE): what the dynamic does to her accumulators (`manner:<axis>`, `manner:drawn_by.<kind>`), before the mode's factor
     * (slow 0.5). A step needs `development.stepThreshold` (3) and is at most one per axis per 28 days, so about two months of steady push make two steps:
     * `yielded` is one yield of the commander (a probe, an offer, a task or a punishment taken); `refusal` a refusal at `role` or above while her reading is in a region she likes;
     * `care` one unasked kindness; `firstWell` / `repeat` the first practice of a kind (×`discoveryMult` when what draws her is `discovery`) and each further one after
     * `repeatRun` of the same kind in a row; `badDay` / `goodDay` one of her own days (P14c); `regardLow` / `regardHigh` a day at the bottom or top Regard band; `forms` one of her forms kept
     * (a ceremony step, a rule kept); `drawn` the outcome each `drawnBy` kind rewards.
     */
    push: Object.freeze({
      yielded: Object.freeze({ intensity: 0.5, warmth: -0.4 }),
      refusal: Object.freeze({ order: 1 }),
      care: Object.freeze({ warmth: 0.6 }),
      firstWell: Object.freeze({ curiosity: 1.2 }),
      discoveryMult: 1.5,
      repeat: Object.freeze({ curiosity: -0.5 }),
      repeatRun: 4,
      badDay: Object.freeze({ warmth: -0.3 }),
      goodDay: Object.freeze({ warmth: 0.3 }),
      regardLow: Object.freeze({ warmth: -0.1 }),
      regardHigh: Object.freeze({ warmth: 0.1 }),
      forms: Object.freeze({ order: 0.5 }),
      drawn: Object.freeze({ power: 0.5, reaction: 0.4, discipline: 0.3, discovery: 0.8, pain: 0.6 }),
      /** A holder with this much `mercy` (or more) never grows colder from yielding. */
      mercyBlock: 2,
    }),
    contrast: Object.freeze({ low: 1, mid: 1.3, high: 1.6, cap: 0.9 }),
    /**
     * The words of the axes (spec §1, the author's, 2026-11-24): `label` names the axis, `low` / `high` its two ends, `steps` the words of a
     * step (an axis at 0 says nothing). The dossier and the holder directive read this one table; the phrase before the first comma is the
     * short word a control shows.
     */
    words: Object.freeze({
      intensity: Object.freeze({ label: 'Intensity', low: 'gentle', high: 'full force', steps: Object.freeze({ '-2': 'gentle, she never pushes hard', '-1': 'measured', '1': 'she pushes hard', '2': 'all the way, holding nothing back' }) }),
      warmth: Object.freeze({ label: 'Warmth', low: 'cold', high: 'tender', steps: Object.freeze({ '-2': 'cold through and through, no comfort after', '-1': 'cool, little comfort', '1': 'soft underneath, she looks after the commander afterwards', '2': 'tender under it all, she comforts the commander afterwards' }) }),
      order: Object.freeze({ label: 'Order', low: 'impulse', high: 'ritual', steps: Object.freeze({ '-2': 'on impulse, never the same twice', '-1': 'loose with forms', '1': 'fond of forms and counting', '2': 'everything by ritual: counted, announced, in its order' }) }),
      voice: Object.freeze({ label: 'Voice', low: 'silent', high: 'talks throughout', steps: Object.freeze({ '-2': 'silent, a look instead of a word', '-1': 'few words', '1': 'talkative while she does it', '2': 'talks the whole way through: narrating, asking, teasing' }) }),
      tempo: Object.freeze({ label: 'Tempo', low: 'slow-burn', high: 'sudden', steps: Object.freeze({ '-2': 'slow, she draws everything out', '-1': 'unhurried', '1': 'quick', '2': 'sudden: no warning, it simply happens' }) }),
      curiosity: Object.freeze({ label: 'Curiosity', low: 'keeps to her own', high: 'tries everything', steps: Object.freeze({ '-2': 'keeps to what she knows', '-1': 'rarely tries something new', '1': 'curious, likes to try new things', '2': 'explores everything she can think of, to the full' }) }),
    } as const),
    /** What draws her, in the directive's words (spec §2). */
    drawnByWords: Object.freeze({
      pain: 'the hurt itself', power: 'the commander giving way to her', reaction: 'what the commander shows: every gasp, every flinch',
      discipline: 'it done right, cleanly', discovery: 'the new, the first time',
    } as const),
  }),
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
    intents: Object.freeze({ summaryMax: 160, correctionMax: 80, answerMax: 80 }),
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
    /** Her answer to `[ ASK PERMISSION ]` (R13): the favour from which she grants (with her Want no higher than restless), and the answer each style gives otherwise (the frame `rule` and a favour at `refusalAt` deny first; `affectionate` grants). `AUTHOR TO TUNE`. */
    permission: Object.freeze({
      grantFavour: 5,
      byStyle: Object.freeze({
        affectionate: 'grant', cold: 'deny', ritual: 'wait', clinical: 'wait', possessive: 'earn', playful: 'earn', cruel: 'deny', obsessive: 'earn', drill: 'wait', regal: 'wait', vindictive: 'earn',
      } as Readonly<Record<string, 'grant' | 'deny' | 'wait' | 'earn'>>),
      /** What she says, as prose for the directive, by answer (drafts). */
      words: Object.freeze({ grant: 'gives permission', deny: 'refuses permission', wait: 'says not yet, and to ask again tomorrow', earn: 'says it has to be earned first' } as const),
      /** What she says under the chip once she has answered, in her voice (drafts, `AUTHOR TO WRITE`): the card's own line, never a number. */
      lines: Object.freeze({
        grant: 'AUTHOR TO WRITE: Yes. Go on.', deny: 'AUTHOR TO WRITE: No.', wait: 'AUTHOR TO WRITE: Not yet. Ask me again tomorrow.', earn: 'AUTHOR TO WRITE: You will have to earn it first.',
      } as const),
    }),
    hold: Object.freeze({ gain: 2, /** `forgot`: the chance a day the last slot ends that she lets it run on (by her primary style, else `base`; a style at 0 never forgets and gets no Impunity bonus). */ forgot: Object.freeze({ base: 0.05, cruel: 0.3, drill: 0, impunityBonus: 0.2 } as Readonly<Record<string, number>>), impunityAt: 60, sensoryVolume: 0.3 }),
    /** Her answer to a duty that comes while the commander is held (R12, `AUTHOR TO TUNE`): the score is `mercy x values.mercy + corporate x values.corporate + style + frame + roll - 0.5`; at `release` or more she lets go, at `late` or more she lets go late, else she keeps. */
    alarm: Object.freeze({
      release: 0.5, late: -0.5, releaseHold: 2, lateRecord: 3, keepRecord: 5, mercy: 1, corporate: 0.5,
      style: Object.freeze({ possessive: -1, cruel: -1.5, affectionate: 1, drill: 0.5 } as Readonly<Record<string, number>>),
      frame: Object.freeze({ play: 0, role: -0.5, rule: -1 } as const),
    }),
    /**
     * The commander's initiative (R15, `AUTHOR TO TUNE`): the hold a yes gives (`hold`), the Record a mock gives her (`mockRecord`), the hold from which any holder says yes (`acceptHold`), the hold
     * under which a `playful` one mocks (`playfulBelow`), the styles that say yes and the ones that mock, and the hold a refusal that she takes as an opening gives (`openingHold`).
     */
    ask: Object.freeze({
      hold: 2, mockRecord: 3, acceptHold: 40, playfulBelow: 20, openingHold: 1,
      accepts: Object.freeze(['ritual', 'drill', 'regal'] as readonly string[]), mocks: Object.freeze(['cruel', 'cold'] as readonly string[]),
      /** What she says to the model for her next reply, by answer (drafts). */
      words: Object.freeze({
        accepted: 'has agreed to what the commander asked, and says so in her own way',
        mocked: 'laughs at the request and mocks it',
        refused: 'turns the request down',
        kind: 'turns the request down gently, and means no harm by it',
        opening: 'turns the request down, and keeps it in mind',
      } as const),
    }),
    posture: Object.freeze({ callChance: 0.15, xp: 2, windowMs: Object.freeze({ ritual: 4000, drill: 3000, other: 5000 }) }),
    slap: Object.freeze({
      windowMs: Object.freeze({
        affectionate: 700, regal: 650, ritual: 550, drill: 550, cold: 500, clinical: 500, possessive: 450, playful: 450, obsessive: 300, vindictive: 350, cruel: 300,
      } as const),
      obsessiveSpread: 400, unannounced: 0.3, feintFrom: 2, feintPerLevel: 0.1,
      /** The time her raised hand is up before any feint or the strike (`leadMs`) and the length of each feint (`feintMs`), in milliseconds (`AUTHOR TO TUNE`): the time to brace in is the last `windowMs` before the strike lands. */
      leadMs: 900, feintMs: 450,
      /**
       * P10e-e (R12, slap.html): `windowMs` is the swing's length; a press `braceBand` ms before the impact braces (the commander's body: the tension's
       * rise 100, peak 80, fall 220 at the 0.8 mark), the same for every style; cruel's second slap after a turned face raises her hand for `againLeadMs`.
       */
      braceBand: Object.freeze([42, 224] as const), againLeadMs: 420,
      /**
       * P10e-e (R13, slap.html `EXPR`, the 28 expression labels; data the author edits): her face by style. `before` is shown as the camera snaps in unless
       * her face now is in `keep` (it already fits); `after` by the result, with her line after the impact.
       */
      faces: Object.freeze({
        cold: { before: 'disapproval', keep: ['disapproval', 'neutral', 'annoyance', 'anger', 'disgust'], after: { none: 'neutral', braced: 'neutral', flinched: 'disapproval' } },
        cruel: { before: 'amusement', keep: ['amusement', 'anger', 'annoyance', 'desire', 'pride'], after: { none: 'amusement', braced: 'annoyance', flinched: 'anger' } },
        vindictive: { before: 'anger', keep: ['anger', 'disapproval', 'annoyance', 'disgust'], after: { none: 'disapproval', braced: 'disapproval', flinched: 'anger' } },
        affectionate: { before: 'disappointment', keep: ['disappointment', 'sadness', 'annoyance', 'disapproval'], after: { none: 'caring', braced: 'pride', flinched: 'sadness' } },
        playful: { before: 'amusement', keep: ['amusement', 'joy', 'excitement', 'desire'], after: { none: 'amusement', braced: 'surprise', flinched: 'amusement' } },
        clinical: { before: 'neutral', keep: ['neutral', 'curiosity', 'disapproval'], after: { none: 'curiosity', braced: 'curiosity', flinched: 'curiosity' } },
        ritual: { before: 'neutral', keep: ['neutral', 'disapproval', 'pride'], after: { none: 'neutral', braced: 'approval', flinched: 'disapproval' } },
        drill: { before: 'annoyance', keep: ['annoyance', 'anger', 'disapproval'], after: { none: 'disapproval', braced: 'approval', flinched: 'anger' } },
        regal: { before: 'pride', keep: ['pride', 'disapproval', 'annoyance', 'anger'], after: { none: 'pride', braced: 'approval', flinched: 'anger' } },
        possessive: { before: 'anger', keep: ['anger', 'annoyance', 'desire', 'disapproval'], after: { none: 'desire', braced: 'pride', flinched: 'anger' } },
        obsessive: { before: 'desire', keep: ['desire', 'love', 'anger', 'excitement'], after: { none: 'love', braced: 'love', flinched: 'anger' } },
      } satisfies Record<ProfileStyle, SlapFace>) as Readonly<Record<ProfileStyle, SlapFace>>,
      /** The styles that slap with no warning after a slip (R21); the favour each outcome moves, the Regard a slap before others costs those who saw it (`regardFall`'s humiliation) and what she says (drafts, no number). */
      unannouncedStyles: Object.freeze(['cold', 'cruel', 'drill', 'vindictive'] as readonly string[]),
      favour: Object.freeze({ none: 1, braced: 2, flinched: -1, softer: 1 } as const), publicRegard: 3,
      words: Object.freeze({
        none: 'has struck the commander, and is content that it was taken',
        braced: 'has struck the commander, who held still, and is pleased by it',
        flinched: 'has struck the commander, who flinched and turned the face away from her hand, so that it only grazed, and is displeased by it',
      } as const),
    }),
    /**
     * The ceremony (R21, `AUTHOR TO TUNE`): the lightest punishment that is carried out as one, the count under which a number the commander named is too low for a weight (`lowNumber`), the styles that double it, and the
     * range of a number that may be named.
     */
    ceremony: Object.freeze({
      minSeverity: 3, lowNumber: Object.freeze({ 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 } as const), doubledBy: Object.freeze(['cruel', 'vindictive'] as readonly string[]), number: Object.freeze({ min: 1, max: 50 }),
    }),
    sealedShare: Object.freeze({
      affectionate: 0.05, cold: 0.05, ritual: 0.02, clinical: 0.05, possessive: 0.05, playful: 0.15, cruel: 0.25, obsessive: 0.05, drill: 0.05, regal: 0.15, vindictive: 0.25,
    } as const),
    noDurationShare: Object.freeze({
      affectionate: 0.1, cold: 0.1, ritual: 0, clinical: 0.1, possessive: 0.3, playful: 0.1, cruel: 0.3, obsessive: 0.1, drill: 0, regal: 0.1, vindictive: 0.3,
    } as const),
    /**
     * Handing things over (R17, `AUTHOR TO TUNE`): the days each kind may be given for (`device` is always one day), the chance a slot she holds the key she is in the commander's cabin, and the words of the card and the record
     * line (`{what}` for what is given and `{days}` for how long, as words). A handover is a severe accept from the commander's side.
     */
    handover: Object.freeze({
      days: Object.freeze({ device: Object.freeze({ min: 1, max: 1 }), key: Object.freeze({ min: 1, max: 7 }), calendar: Object.freeze({ min: 1, max: 3 }) }),
      keyChance: 0.25, cardDays: 1,
      /** The content a kind of handover needs (the device is the intercept of P9c: `jealousy_games`, on and not among her limits). */
      contentTags: Object.freeze({ device: Object.freeze(['jealousy_games']), key: Object.freeze([] as string[]), calendar: Object.freeze([] as string[]) }),
      what: Object.freeze({ device: 'the device', key: 'the key to the quarters', calendar: 'the calendar' } as const),
      text: 'AUTHOR TO WRITE: The commander gives {name} {what}, {for}.',
      summary: 'gave her {what}, {for}',
    }),
    unfairness: Object.freeze({ fair: 0, strict: 0.02, capricious: 0.08, unfair: 0.15, moody: 1.5 } as const),
    /**
     * Unfairness in hand (R16, `AUTHOR TO TUNE`): the days a cancelled reward, a double standard or a moved goal that no scene, task or hold has used waits before it goes stale, and the
     * pretexts the model is told for a punishment without guilt (never that nothing was done: the words must not give the unfairness away).
     */
    unfair: Object.freeze({
      days: 7,
      pretexts: Object.freeze([
        'something she says was left undone', 'a rule she says the commander broke', 'a word she says was out of turn', 'a slip she says she saw',
      ] as readonly string[]),
    }),
    /** The press-and-hold signature of a `signed` accept (R.1): how long it is held, in milliseconds. AUTHOR TO TUNE. */
    sign: Object.freeze({ holdMs: 1200 }),
    /** A false report (R6; AUTHOR TO TUNE): it may be found for `days` after it was made; the day's chance is `witness` (someone the task names is at base) plus her `insight`; `compromat` is what she keeps of it (`{what}`: the task's summary). */
    falseReport: Object.freeze({ days: 14, witness: 0.2, compromat: 'AUTHOR TO WRITE: The commander reported a task as done that was not: {what}.', insight: Object.freeze({ low: 0.04, mid: 0.08, high: 0.16 } as const) }),
  }),
});
