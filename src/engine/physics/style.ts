/**
 * P15a: the stand-ins for what P15 knows about a holder (plan R12): her physics style pair and what she holds the commander until. Until a
 * reader is registered every holder is `neutral` and releases at a tap. `blendedStyle` mixes the pair 0.65 / 0.35 (reversed in the phase the
 * secondary leads).
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { HoldsUntil, PhysicsStyle, StyleKey } from './state';

type StyleReader = (state: CampaignState, unitId: string) => PhysicsStyle | null;
type HoldsReader = (state: CampaignState, unitId: string) => HoldsUntil | null;
const styleReaders: StyleReader[] = [];
const holdsReaders: HoldsReader[] = [];

/** P15 plugs in here: her style pair and which one leads the phase. The first reader that answers wins. */
export function registerPhysicsStyle(fn: StyleReader): void {
  styleReaders.push(fn);
}
/** P15 plugs in here: what she holds the commander until (her expectation profile). The first reader that answers wins. */
export function registerHoldsUntil(fn: HoldsReader): void {
  holdsReaders.push(fn);
}
/** Tests: forget every registered reader. */
export function resetPhysicsHooks(): void {
  styleReaders.length = 0;
  holdsReaders.length = 0;
}

export function physicsStyleOf(state: CampaignState, unitId: string): PhysicsStyle {
  for (const read of styleReaders) {
    const s = read(state, unitId);
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
  return h === 'blackout' && !contentAllowed(state, reg, { contentTags: ['breath_play'] }, unitId) ? 'limit' : h;
}

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
