import { z } from 'zod';
import { CALL_TYPE_IDS, type CallTypeId } from './llm/callTypes';
import { DEFAULT_SCENE_SETTINGS, INTERACTION_TOGGLES, MARATHON_PACES, MOMENT_EXPLICIT, MOMENT_FREQUENCIES, type InteractionToggle, type MarathonPace, type MomentExplicit, type MomentFrequency } from './engine/moments/settings';
import type { StAdapter } from './st/adapter';

export interface AliusSettings {
  mechanicProfileId: string;
  mechanicThink: 'min' | 'low' | 'auto';
  mechanicFallbackToMain: boolean;
  /** Minimum max_tokens actually sent on mechanic calls (headroom for thinking models). */
  requestFloor: number;
  /** Expected output tokens per call type. */
  budgets: Record<CallTypeId, number>;
  contextTokenCap: number;
  palette: 'amber' | 'green' | 'white';
  scanlines: boolean;
  flicker: boolean;
  debug: boolean;
  editLock: boolean;
  /** Allow Desire/Bond defects in import candidates and manual lists. */
  desireBondDefects: boolean;
  showRawValues: boolean;
  spriteMode: 'native' | 'emotion_pick';
  /** A short generated vignette after a companion activity (main model, one call per activity). */
  activityFlavor: boolean;
  /** A generated name and one-line bio for newly recruited grunts (one mechanic call per grunt). */
  gruntFlavor: boolean;
  /** P3: when the mechanic model reads the conversation. */
  intentMode: 'exchange' | 'every_n' | 'scene_end';
  /** `every_n` mode: extract after this many exchanges. */
  intentEveryN: number;
  /** Events below this confidence are dropped. */
  intentMinConfidence: number;
  /** After this many exchanges the scene header says time is passing. */
  scenePacing: number;
  /** Typed-out dialogue speed in characters per second; 0 = instant. */
  typingSpeed: number;
  /** P10e: a reply longer than this many words opens the scene's history by itself; 0 = never. */
  curtainWords: number;
  romance: boolean;
  /** Old switch (P3): read ONLY once, to carry `explicit_scenes` over into a campaign or a wizard that has no content choice yet (P9d). It is not in SYS any more. */
  explicitContent: boolean;
  romanticInitiative: 'low' | 'med' | 'high';
  /** Units may start DMs on their own. */
  unitDms: boolean;
  /** Compact old chronicle lines with the mechanic model (otherwise by joining them). */
  chronicleCompaction: boolean;
  /** P9: the mechanic model words a soldier's demand in her voice (off: the template text is used as it is). */
  demandWording: boolean;
  /** P9d: the mechanic model words a leading partner's rule proposal in her voice (off: the template text is used as it is). */
  ruleWording: boolean;
  /** P9b: the mechanic model words the one-line reasons of a squad vote's ballots (off: the template lines of the vote kind). */
  ballotWording: boolean;
  /** P9c: the mechanic model words a level-4 edit of the commander's DM (off: the authored fallback lines). */
  dmEditWording: boolean;
  /** P12: the mechanic model words each Secret Frequency fragment as a broken thought (off: the template fragment). */
  fragmentWording: boolean;
  /** P14b: the mechanic model words a formed habit (off: the registry text). */
  habitWording: boolean;
  /** P13: the mechanic model judges whether an order cuts across a `personal` expectation of the warden (off: only the engine's rules). */
  wardenJudge: boolean;
  /** P4: a lost combat can be retried (rewinds exactly, never recorded in memory). */
  easyRetry: boolean;
  /** P4: affixed enemies get a generated name (optional `flavor` call, cached, never blocks combat). */
  enemyFlavor: boolean;
  /** P5: the mechanic model plans missions, rumors and story beats (off: the engine's own fallback does). */
  directorEnabled: boolean;
  /** P5: days between two story-beat proposals (1–14). */
  beatCooldownDays: number;
  /** P5: a narrative after-action recap from the main model (the deterministic report always exists). */
  expeditionRecap: boolean;
  /** P6: the mechanic model writes dilemmas (off: the authored block of the template is shown). */
  dilemmasEnabled: boolean;
  /** P7: days a unit takes to stop judging the commander by his looks (decay time of the first impression, 1–30). */
  firstImpressionTau: number;
  /** P7a: hover, `?` and long-press open the analysis panel. */
  analyzeEnabled: boolean;
  /** P7a: the ANALYZING animation (`full`: 600 ms first time, 150 ms after; `short`: 150 ms; `off`: none). */
  analyzeAnimation: 'full' | 'short' | 'off';
  /** P7a: hover time before the panel opens, ms (100–1500). */
  analyzeHoverDelay: number;
  /** P10: a `deviceSkins` id for the PDA casing; empty follows the campaign (an id the pack lost reads as empty at use). */
  deviceSkin: string;
  /** P15: hold, frame and the dynamic's other numbers read as feelings, never as values (UI only; the engine is unchanged). */
  dynamicHidden: boolean;
  /** P16: who words what a holder asks of the commander: the mechanic model (`model`), or the plain line of the seed with no model call (`plain`). */
  practiceWording: 'model' | 'plain';
  /** P10: no scanlines, flicker, dithering or glitch; text one step larger. */
  readableMode: boolean;
  /** P10: nothing slides, fades, boots or types out (also on when the system asks for reduced motion). */
  reducedMotion: boolean;
  /** P10: PDA portraits are ordered-dithered into the phosphor palette (off in readable mode). */
  ditheredPortraits: boolean;
  /** P10: UI sound volume, 0–100 (default low). */
  soundVolume: number;
  soundMuted: boolean;
  /** P10: a low engine hum while the shell is open. */
  ambientHum: boolean;
  /** P10b: seconds a knock at the night door waits before it counts as staying silent (0 = no timer, 0–60). */
  doorTimer: number;
  /** P14: milliseconds a model call may run before it counts as a timeout (10 000–600 000). */
  llmTimeoutMs: number;
  /** P14: automatic retries of a failed call before the failure is shown (0–2; a refusal is never retried). */
  autoRetry: 0 | 1 | 2;
  /** P15a: how often a moment of tension comes up while something is live. The engine reads its mirror in the campaign. */
  momentFrequency: MomentFrequency;
  /** P15a: moments in a scene at `explicit` intimacy: rarer, as often, or none. Mirrored. */
  momentExplicit: MomentExplicit;
  /** P15a: a moment shows as chips, or not at all (free text only; the reading maps it). UI only. */
  momentChips: 'chips' | 'immersive';
  /** P15a: a contact physics runs in real time (off: a message uses up beats). Mirrored. */
  physicsRealtime: boolean;
  /** P15a: each interaction type of a physics, and the breath, can be switched off (then only text and moment options remain). Mirrored. */
  physicsInteractions: Record<InteractionToggle, boolean>;
  /** P15a: how long a marathon takes in play. Mirrored. */
  marathonPace: MarathonPace;
}

export const DEFAULT_SETTINGS: AliusSettings = {
  mechanicProfileId: '',
  mechanicThink: 'min',
  mechanicFallbackToMain: true,
  requestFloor: 2000,
  budgets: {
    profile_import: 1800,
    intent_extract: 700, // P15a: 600 + the staging block
    scene_summary: 800,
    dilemma_generate: 1000,
    director_tick: 1200,
    flavor: 400,
    dm_reply: 300,
    expedition_recap: 700,
    emotion_pick: 50,
    activity_vignette: 150,
    chronicle_compact: 400,
    commander_import: 600,
    memory_fold: 500,
    rumor_retell: 200,
    warden_agenda: 800,
    epilogue: 700,
    warden_judge: 120,
    head_start_recap: 900,
    development_review: 700,
    opinion_form: 150,
    physics_cues: 250,
    practice_generate: 700,
    activity_script: 900,
    ping: 100,
  },
  contextTokenCap: 1600,
  palette: 'amber',
  scanlines: true,
  flicker: false,
  debug: false,
  editLock: true,
  desireBondDefects: false,
  showRawValues: false,
  spriteMode: 'native',
  activityFlavor: true,
  gruntFlavor: true,
  intentMode: 'exchange',
  intentEveryN: 3,
  intentMinConfidence: 0.5,
  scenePacing: 30,
  typingSpeed: 60,
  curtainWords: 0,
  romance: true,
  explicitContent: false,
  romanticInitiative: 'med',
  unitDms: true,
  chronicleCompaction: true,
  demandWording: true,
  ruleWording: true,
  ballotWording: false,
  dmEditWording: true,
  fragmentWording: true,
  habitWording: false,
  wardenJudge: false,
  easyRetry: false,
  enemyFlavor: false,
  directorEnabled: true,
  beatCooldownDays: 3,
  expeditionRecap: true,
  dilemmasEnabled: true,
  analyzeEnabled: true,
  analyzeAnimation: 'full',
  analyzeHoverDelay: 250,
  firstImpressionTau: 7,
  deviceSkin: '',
  dynamicHidden: false,
  practiceWording: 'model',
  readableMode: false,
  reducedMotion: false,
  ditheredPortraits: true,
  soundVolume: 20,
  soundMuted: false,
  ambientHum: false,
  doorTimer: 15,
  llmTimeoutMs: 120000,
  autoRetry: 1,
  momentFrequency: 'normal',
  momentExplicit: 'rarer',
  momentChips: 'chips',
  physicsRealtime: true, // P10e-e: the instruments play in real time (the engine's mirror default stays false: a campaign that never mirrored it resolves as before)
  physicsInteractions: { ...DEFAULT_SCENE_SETTINGS.physicsInteractions },
  marathonPace: 'normal',
};

const fieldSchemas = {
  mechanicProfileId: z.string(),
  mechanicThink: z.enum(['min', 'low', 'auto']),
  mechanicFallbackToMain: z.boolean(),
  requestFloor: z.number().int().min(0),
  contextTokenCap: z.number().int().min(1),
  palette: z.enum(['amber', 'green', 'white']),
  scanlines: z.boolean(),
  flicker: z.boolean(),
  debug: z.boolean(),
  editLock: z.boolean(),
  desireBondDefects: z.boolean(),
  showRawValues: z.boolean(),
  spriteMode: z.enum(['native', 'emotion_pick']),
  activityFlavor: z.boolean(),
  gruntFlavor: z.boolean(),
  intentMode: z.enum(['exchange', 'every_n', 'scene_end']),
  intentEveryN: z.number().int().min(2).max(10),
  intentMinConfidence: z.number().min(0).max(1),
  scenePacing: z.number().int().min(5),
  typingSpeed: z.number().min(0),
  curtainWords: z.number().int().min(0),
  romance: z.boolean(),
  explicitContent: z.boolean(),
  romanticInitiative: z.enum(['low', 'med', 'high']),
  unitDms: z.boolean(),
  chronicleCompaction: z.boolean(),
  demandWording: z.boolean(),
  ruleWording: z.boolean(),
  ballotWording: z.boolean(),
  dmEditWording: z.boolean(),
  fragmentWording: z.boolean(),
  habitWording: z.boolean(),
  wardenJudge: z.boolean(),
  easyRetry: z.boolean(),
  enemyFlavor: z.boolean(),
  directorEnabled: z.boolean(),
  beatCooldownDays: z.number().int().min(1).max(14),
  expeditionRecap: z.boolean(),
  dilemmasEnabled: z.boolean(),
  analyzeEnabled: z.boolean(),
  analyzeAnimation: z.enum(['full', 'short', 'off']),
  analyzeHoverDelay: z.number().int().min(100).max(1500),
  firstImpressionTau: z.number().int().min(1).max(30),
  deviceSkin: z.string(),
  dynamicHidden: z.boolean(),
  practiceWording: z.enum(['model', 'plain']),
  readableMode: z.boolean(),
  reducedMotion: z.boolean(),
  ditheredPortraits: z.boolean(),
  soundVolume: z.number().int().min(0).max(100),
  soundMuted: z.boolean(),
  ambientHum: z.boolean(),
  doorTimer: z.number().int().min(0).max(60),
  llmTimeoutMs: z.number().int().min(10000).max(600000),
  autoRetry: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  momentFrequency: z.enum(MOMENT_FREQUENCIES),
  momentExplicit: z.enum(MOMENT_EXPLICIT),
  momentChips: z.enum(['chips', 'immersive']),
  physicsRealtime: z.boolean(),
  physicsInteractions: z.object(Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, z.boolean().default(true)])) as Record<InteractionToggle, z.ZodDefault<z.ZodBoolean>>),
  marathonPace: z.enum(MARATHON_PACES),
};
const budgetSchema = z.number().int().min(1);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Takes every valid field from `over`; anything missing or invalid comes from `base`. */
function merge(base: AliusSettings, over: unknown): AliusSettings {
  const src = isObj(over) ? over : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, schema] of Object.entries(fieldSchemas)) {
    const parsed = schema.safeParse(src[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  const budgets = { ...base.budgets };
  const srcBudgets = isObj(src.budgets) ? src.budgets : {};
  for (const id of CALL_TYPE_IDS) {
    const parsed = budgetSchema.safeParse(srcBudgets[id]);
    if (parsed.success) budgets[id] = parsed.data;
  }
  out.budgets = budgets;
  return out as unknown as AliusSettings;
}

function store(st: StAdapter, s: AliusSettings): void {
  Object.assign(st.getSettings(), s);
}

/**
 * P10e-e: a flag of the stored settings (not a setting): the old default `physicsRealtime: false` was written back into every install by
 * the default-merge, so the new default (true) is applied once to an install that does not carry the flag; a later choice stays.
 */
const REALTIME_MIGRATED = 'physicsRealtimeDefaultMigrated';

/** Reads extensionSettings.alius, fixing invalid fields and filling defaults (written back, not saved). */
export function getSettings(st: StAdapter): AliusSettings {
  const raw = st.getSettings();
  const s = merge(DEFAULT_SETTINGS, raw);
  if (isObj(raw) && raw[REALTIME_MIGRATED] !== true) {
    s.physicsRealtime = true;
    raw[REALTIME_MIGRATED] = true;
  }
  store(st, s);
  return s;
}

export function updateSettings(st: StAdapter, patch: Partial<AliusSettings>): AliusSettings {
  const s = merge(getSettings(st), patch);
  store(st, s);
  st.saveSettings();
  return s;
}
