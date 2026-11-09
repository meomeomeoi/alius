import { z } from 'zod';
import { CALL_TYPE_IDS, type CallTypeId } from './llm/callTypes';
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
  romance: boolean;
  /** Context-only: tells the main model whether explicit scenes are allowed. */
  explicitContent: boolean;
  romanticInitiative: 'low' | 'med' | 'high';
  /** Units may start DMs on their own. */
  unitDms: boolean;
  /** Compact old chronicle lines with the mechanic model (otherwise by joining them). */
  chronicleCompaction: boolean;
  /** P4: a lost combat can be retried (rewinds exactly, never recorded in memory). */
  easyRetry: boolean;
  /** P4: affixed enemies get a generated name (optional `flavor` call, cached, never blocks combat). */
  enemyFlavor: boolean;
}

export const DEFAULT_SETTINGS: AliusSettings = {
  mechanicProfileId: '',
  mechanicThink: 'min',
  mechanicFallbackToMain: true,
  requestFloor: 2000,
  budgets: {
    profile_import: 1500,
    intent_extract: 600,
    scene_summary: 800,
    dilemma_generate: 1000,
    director_tick: 1200,
    flavor: 400,
    dm_reply: 300,
    expedition_recap: 700,
    emotion_pick: 50,
    activity_vignette: 150,
    chronicle_compact: 400,
    ping: 100,
  },
  contextTokenCap: 1200,
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
  romance: true,
  explicitContent: false,
  romanticInitiative: 'med',
  unitDms: true,
  chronicleCompaction: true,
  easyRetry: false,
  enemyFlavor: false,
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
  romance: z.boolean(),
  explicitContent: z.boolean(),
  romanticInitiative: z.enum(['low', 'med', 'high']),
  unitDms: z.boolean(),
  chronicleCompaction: z.boolean(),
  easyRetry: z.boolean(),
  enemyFlavor: z.boolean(),
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

/** Reads extensionSettings.alius, fixing invalid fields and filling defaults (written back, not saved). */
export function getSettings(st: StAdapter): AliusSettings {
  const s = merge(DEFAULT_SETTINGS, st.getSettings());
  store(st, s);
  return s;
}

export function updateSettings(st: StAdapter, patch: Partial<AliusSettings>): AliusSettings {
  const s = merge(getSettings(st), patch);
  store(st, s);
  st.saveSettings();
  return s;
}
