/**
 * P15a: the stand-ins for what P15 knows about a holder (plan R12): her physics style pair and what she holds the commander until. Until a
 * reader is registered every holder is `neutral` and releases at a tap. `blendedStyle` mixes the pair 0.65 / 0.35 (reversed in the phase the
 * secondary leads).
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { bend } from '../bend';
import type { EngineEvent } from '../dispatch';
import type { MannerAxis } from '../dynamic/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { HoldsUntil, PhysicsStyle, StyleKey } from './state';

type StyleReader = (state: CampaignState, unitId: string, reg?: Registries) => PhysicsStyle | null;
type HoldsReader = (state: CampaignState, unitId: string) => HoldsUntil | null;
const styleReaders: StyleReader[] = [];
const holdsReaders: HoldsReader[] = [];

/** P15 plugs in here: her style pair and which one leads the phase (the registries are passed by the callers that have them: the surfacing conditions read them). The first reader that answers wins. */
export function registerPhysicsStyle(fn: StyleReader): void {
  styleReaders.push(fn);
}
/** P15 plugs in here: what she holds the commander until (her expectation profile). The first reader that answers wins. */
export function registerHoldsUntil(fn: HoldsReader): void {
  holdsReaders.push(fn);
}
/** P15b: her six manner axes (−2 … +2) as the physics reads them. */
export type PhysicsManner = Readonly<Record<MannerAxis, number>>;
type MannerReader = (state: CampaignState, unitId: string, reg?: Registries) => PhysicsManner | null;
const mannerReaders: MannerReader[] = [];

/**
 * P15b plugs in here: her manner axes, for the rows the engine bends by them (the jaw's rest by `warmth` now; the windows, leads, segment length and
 * cue lines by chunk m3). A reader answers `null` for a holder with no manner, who is read as every axis at 0. The first reader that answers wins.
 */
export function registerPhysicsManner(fn: MannerReader): void {
  mannerReaders.push(fn);
}
/** Her manner axes, or `null` (no reader answered: nothing bends). */
export function physicsMannerOf(state: CampaignState, unitId: string, reg?: Registries): PhysicsManner | null {
  for (const read of mannerReaders) {
    const m = read(state, unitId, reg);
    if (m !== null) return m;
  }
  return null;
}
/**
 * P15b: how long a segment of this run lasts in real time, in seconds: the entry's `segmentSeconds` (`fallback` when it has none), moved by her
 * `tempo` (+ = quicker = shorter; `scale` per step, whole beats, at least `minBeats`). With no manner, or at 0, it is the entry's number itself.
 * The plan, the controller that ends the segment, the instruments' clocks and the marathon's phases all read it, so they agree on where it ends.
 */
export function segmentSecondsOf(state: CampaignState, reg: Registries, run: { physicsId: string; holderId: string }, fallback = 20): number {
  const seconds = Number(reg.contactPhysics.get(run.physicsId)?.segmentSeconds ?? fallback);
  const tempo = physicsMannerOf(state, run.holderId, reg)?.tempo ?? 0;
  if (tempo === 0) return seconds;
  const beats = Math.ceil((seconds * 1000) / TUNING.physics.beatMs);
  return (Math.max(TUNING.manner.minBeats, Math.round(bend(beats, tempo, { scale: -TUNING.manner.scale }))) * TUNING.physics.beatMs) / 1000;
}
type TargetReader = (state: CampaignState, reg: Registries, targetId: string) => string | undefined;
const targetReaders: TargetReader[] = [];

/**
 * P15 plugs in here: whether a contact run records the target it is on (`PhysicsRun.targetId`, `physics_outcome.targetId`), which mastery counts. With nothing registered, or while the dynamic is off,
 * no reader answers and nothing is written: a campaign without the dynamic is as it was before P15. The first reader that answers wins.
 */
export function registerRunTarget(fn: TargetReader): void {
  targetReaders.push(fn);
}
/** The target a run records, or `undefined` (no reader answered). */
export function runTargetOf(state: CampaignState, reg: Registries, targetId: string): string | undefined {
  for (const fn of targetReaders) {
    const answer = fn(state, reg, targetId);
    if (answer !== undefined) return answer;
  }
  return undefined;
}
/** P16b: what the commander has learnt that the physics reads (stillness, her rhythm); a reader answers `null` when it has nothing to say. */
type SkillReader = (state: CampaignState, holderId: string) => number | null;
const stillnessReaders = new Map<string, SkillReader>();
const rhythmReaders = new Map<string, SkillReader>();

/**
 * P16b plugs in here: the commander's stillness as a share 0-1 of how much quieter a slip is (loudness is `1 x (1 - stillness)`). With nothing registered, or a reader
 * that answers `null`, it is 0 and every slip is as loud as it is. Readers are kept by `key` (registering one again replaces it); the first that answers wins.
 */
export function registerStillness(fn: SkillReader, key = 'default'): void {
  stillnessReaders.set(key, fn);
}
/** How quiet the commander is (0-1) for this holder's hold; 0 when no reader answered. */
export function stillnessOf(state: CampaignState, holderId: string): number {
  for (const read of stillnessReaders.values()) {
    const n = read(state, holderId);
    if (n !== null) return n;
  }
  return 0;
}
/**
 * P16b plugs in here: how many levels (0-5) of her personal rhythm the commander knows. Each level widens the openings of a timing run by `TUNING.craft.rhythm.widenPerLevel`.
 * With nothing registered, or a reader that answers `null`, it is 0 and the openings are as planned (nothing is multiplied).
 */
export function registerRhythmKnown(fn: SkillReader, key = 'default'): void {
  rhythmReaders.set(key, fn);
}
/** The levels of her rhythm the commander knows; 0 when no reader answered. */
export function rhythmKnownOf(state: CampaignState, holderId: string): number {
  for (const read of rhythmReaders.values()) {
    const n = read(state, holderId);
    if (n !== null) return n;
  }
  return 0;
}
/**
 * P16b plugs in here: what else the stop word ends (a posture hold). A hook answers the events of what it ended, or `[]` when there is nothing of its own to end; the stop word always runs them
 * all, so the player's own signal gets the commander out of every hold of the fiction. With nothing registered it changes nothing.
 */
type StopHook = (draft: CampaignState, ctx: { registries: Registries }) => EngineEvent[];
const stopHooks = new Map<string, StopHook>();
export function registerStopHook(fn: StopHook, key = 'default'): void {
  stopHooks.set(key, fn);
}
/** Runs the stop hooks (registration order) and returns what they ended. */
export function runStopHooks(draft: CampaignState, ctx: { registries: Registries }): EngineEvent[] {
  return [...stopHooks.values()].flatMap((fn) => fn(draft, ctx));
}
/** Tests: forget every registered reader. */
export function resetPhysicsHooks(): void {
  stopHooks.clear();
  styleReaders.length = 0;
  holdsReaders.length = 0;
  targetReaders.length = 0;
  mannerReaders.length = 0;
  stillnessReaders.clear();
  rhythmReaders.clear();
}

export function physicsStyleOf(state: CampaignState, unitId: string, reg?: Registries): PhysicsStyle {
  for (const read of styleReaders) {
    const s = read(state, unitId, reg);
    if (s !== null) return s;
  }
  return { primary: 'neutral' };
}

export function holdsUntilOf(state: CampaignState, unitId: string): HoldsUntil {
  for (const read of holdsReaders) {
    const h = read(state, unitId);
    if (h !== null) return h;
  }
  return 'signal';
}

/** What the engine acts on: a `blackout` holder is honoured only with the `breath_play` category on, else she acts as a `limit` holder. */
export function effectiveHoldsUntil(state: CampaignState, reg: Registries, unitId: string): HoldsUntil {
  const h = holdsUntilOf(state, unitId);
  const allowed = h === 'blackout' ? contentAllowed(state, reg, { contentTags: ['breath_play'] }, unitId) : null;
  const base: HoldsUntil = h === 'blackout' && allowed === false ? 'limit' : h;
  // P15b: her warmth at ±2 moves it one step (+2 toward `signal`, -2 toward `blackout`, which only a `breath_play` run honours); otherwise the style's own
  const warmth = physicsMannerOf(state, unitId, reg)?.warmth ?? 0;
  if (warmth * warmth < 4) return base;
  const at = HOLDS_ORDER.indexOf(base) + (warmth > 0 ? -1 : 1);
  const moved = HOLDS_ORDER[Math.max(0, Math.min(HOLDS_ORDER.length - 1, at))]!;
  return moved === 'blackout' && !(allowed ?? contentAllowed(state, reg, { contentTags: ['breath_play'] }, unitId)) ? 'limit' : moved;
}
const HOLDS_ORDER: readonly HoldsUntil[] = ['signal', 'limit', 'blackout'];

type Row = (typeof TUNING.physics.style)[string];
const row = (key: StyleKey): Row => TUNING.physics.style[key] ?? TUNING.physics.style.neutral!;

/** The style rows of the pair in the order that leads: the phase lead first, the other one after it (absent without a secondary). */
export function styleRows(style: PhysicsStyle): { lead: Row; other?: Row; leadKey: StyleKey } {
  const secondaryLeads = style.phaseLead === 'secondary' && style.secondary !== undefined;
  const leadKey = secondaryLeads ? style.secondary! : style.primary;
  const otherKey = secondaryLeads ? style.primary : style.secondary;
  return { lead: row(leadKey), ...(otherKey !== undefined ? { other: row(otherKey) } : {}), leadKey };
}

/** One number of the style rows blended 0.65 / 0.35 (just the lead's when there is no secondary). */
export function blendedStyle(style: PhysicsStyle, field: 'windowMs' | 'falseShare' | 'noCueShare'): number {
  const { lead, other } = styleRows(style);
  const [a, b] = TUNING.physics.blend;
  return other === undefined ? lead[field] : lead[field] * a + other[field] * b;
}

/** The lead's way with cues, seal and skill; those are words, not numbers, so they are not blended. */
export function leadStyle(style: PhysicsStyle): { key: StyleKey; cues: string; seal: string; skillMult: number } {
  const { lead, leadKey } = styleRows(style);
  return { key: leadKey, cues: lead.cues, seal: lead.seal, skillMult: lead.skillMult };
}
