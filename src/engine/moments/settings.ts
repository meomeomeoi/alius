/**
 * P15a: the scene settings the engine reads (plan R14). The global settings live in the extension's settings; the pure engine reads their
 * MIRROR in `state.settings` (kept by `campaign/set_scene_settings`, synced like the beat cooldown). Missing or invalid = the default.
 */
import { INTERACTIONS, type InteractionType } from '../blocking/types';
import type { CampaignState } from '../state/types';

export const MOMENT_FREQUENCIES = ['rare', 'normal', 'often'] as const;
export type MomentFrequency = (typeof MOMENT_FREQUENCIES)[number];
export const MOMENT_EXPLICIT = ['rarer', 'same', 'off'] as const;
export type MomentExplicit = (typeof MOMENT_EXPLICIT)[number];
export const MARATHON_PACES = ['short', 'normal', 'long'] as const;
export type MarathonPace = (typeof MARATHON_PACES)[number];
/** P10e-e 24b: how hard a long hold is on the strength (the weight inside her frame): its drain × `LONG_HOLD` (throne.html `S.frameDrain`, 0.35). */
export const LONG_HOLD_STRAINS = ['light', 'normal', 'heavy', 'raw'] as const;
export type LongHoldStrain = (typeof LONG_HOLD_STRAINS)[number];
export const LONG_HOLD: Readonly<Record<LongHoldStrain, number>> = Object.freeze({ light: 0.25, normal: 0.35, heavy: 0.6, raw: 1 });
/** The six interaction types and the breath; each can be switched off (then only text and moment options remain). */
export const INTERACTION_TOGGLES = [...INTERACTIONS, 'inhale'] as const;
export type InteractionToggle = InteractionType | 'inhale';

export interface SceneSettings {
  momentFrequency: MomentFrequency;
  momentExplicit: MomentExplicit;
  physicsRealtime: boolean;
  physicsInteractions: Record<InteractionToggle, boolean>;
  marathonPace: MarathonPace;
  /** P10e-e 24b: only a weight run inside a frame reads it (`run.sourceKind === 'activity'`); every other run is as before. */
  longHoldStrain: LongHoldStrain;
}

export const DEFAULT_SCENE_SETTINGS: Readonly<SceneSettings> = Object.freeze({
  momentFrequency: 'normal', momentExplicit: 'rarer', physicsRealtime: false,
  physicsInteractions: Object.freeze(Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, true]))) as Record<InteractionToggle, boolean>,
  marathonPace: 'normal',
  longHoldStrain: 'normal',
});

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback);

/** The scene settings of this campaign (the mirror over the defaults). */
export function sceneSettingsOf(state: Pick<CampaignState, 'settings'>): SceneSettings {
  const s = state.settings;
  const stored = typeof s.physicsInteractions === 'object' && s.physicsInteractions !== null ? (s.physicsInteractions as Record<string, unknown>) : {};
  return {
    momentFrequency: pick(MOMENT_FREQUENCIES, s.momentFrequency, DEFAULT_SCENE_SETTINGS.momentFrequency),
    momentExplicit: pick(MOMENT_EXPLICIT, s.momentExplicit, DEFAULT_SCENE_SETTINGS.momentExplicit),
    physicsRealtime: typeof s.physicsRealtime === 'boolean' ? s.physicsRealtime : DEFAULT_SCENE_SETTINGS.physicsRealtime,
    physicsInteractions: Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, typeof stored[k] === 'boolean' ? stored[k] : true])) as Record<InteractionToggle, boolean>,
    marathonPace: pick(MARATHON_PACES, s.marathonPace, DEFAULT_SCENE_SETTINGS.marathonPace),
    longHoldStrain: pick(LONG_HOLD_STRAINS, s.longHoldStrain, DEFAULT_SCENE_SETTINGS.longHoldStrain),
  };
}

/** The mirror's fields from an action payload, or the reason it is refused. */
export function parseSceneSettings(p: Record<string, unknown>): SceneSettings | string {
  if (!(MOMENT_FREQUENCIES as readonly unknown[]).includes(p.momentFrequency)) return 'momentFrequency is rare, normal or often';
  if (!(MOMENT_EXPLICIT as readonly unknown[]).includes(p.momentExplicit)) return 'momentExplicit is rarer, same or off';
  if (typeof p.physicsRealtime !== 'boolean') return 'physicsRealtime must be a boolean';
  if (!(MARATHON_PACES as readonly unknown[]).includes(p.marathonPace)) return 'marathonPace is short, normal or long';
  if (p.longHoldStrain !== undefined && !(LONG_HOLD_STRAINS as readonly unknown[]).includes(p.longHoldStrain)) return 'longHoldStrain is light, normal, heavy or raw';
  const i = p.physicsInteractions;
  if (typeof i !== 'object' || i === null || Array.isArray(i) || INTERACTION_TOGGLES.some((k) => typeof (i as Record<string, unknown>)[k] !== 'boolean')) {
    return `physicsInteractions needs a boolean for each of ${INTERACTION_TOGGLES.join(', ')}`;
  }
  return {
    momentFrequency: p.momentFrequency as MomentFrequency, momentExplicit: p.momentExplicit as MomentExplicit, physicsRealtime: p.physicsRealtime,
    physicsInteractions: Object.fromEntries(INTERACTION_TOGGLES.map((k) => [k, (i as Record<string, boolean>)[k]])) as Record<InteractionToggle, boolean>,
    marathonPace: p.marathonPace as MarathonPace,
    longHoldStrain: (p.longHoldStrain as LongHoldStrain | undefined) ?? DEFAULT_SCENE_SETTINGS.longHoldStrain,
  };
}
