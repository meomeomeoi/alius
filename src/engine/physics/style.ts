/**
 * P15a: the stand-ins for what P15 knows about a holder (plan R12): her physics style pair and what she holds the commander until. Until a
 * reader is registered every holder is `neutral` and releases at a tap. `blendedStyle` mixes the pair 0.65 / 0.35 (reversed in the phase the
 * secondary leads).
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { bend } from '../bend';
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
/** Tests: forget every registered reader. */
export function resetPhysicsHooks(): void {
  styleReaders.length = 0;
  holdsReaders.length = 0;
  targetReaders.length = 0;
  mannerReaders.length = 0;
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
