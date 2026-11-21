/**
 * Practice tracks (P15, plan R1, spec §6): xp per track per holder, the level the thresholds give, and the cap on the intensity tier P16
 * may generate. Nothing in P15 produces xp (P16 does); the writer, the readers and the decay are here so the milestones can read levels.
 */
import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { dynamicOn } from './gate';
import { practiceOf } from './profile';
import { dynamicOf, type TrackState } from './state';
import type { DynamicTrackEntry } from './types';

const trackEntry = (reg: Registries, trackId: string): DynamicTrackEntry | undefined => reg.dynamicTracks.get(trackId) as unknown as DynamicTrackEntry | undefined;

/** The level the xp reaches: how many thresholds it has met (0–5). */
export const levelOfXp = (thresholds: readonly number[], xp: number): TrackState['level'] => thresholds.filter((t) => xp >= t).length as TrackState['level'];

/**
 * Whether the track exists for her: the dynamic is on, she has it, and the track's category (if it names one) is switched on and not
 * among her own limits. A track with no category (`discipline`) is open while the dynamic is.
 */
export function trackOpen(state: CampaignState, reg: Registries, unitId: string, trackId: string): boolean {
  const entry = trackEntry(reg, trackId);
  if (entry === undefined || !dynamicOn(state, reg) || dynamicOf(state, unitId) === undefined) return false;
  return entry.category === undefined || (practiceOf(state, reg, unitId)?.allowed.includes(entry.category) ?? false);
}

/** Her level in a track (0 when she has none). */
export function trackLevel(state: Pick<CampaignState, 'relations'>, unitId: string, trackId: string): number {
  return dynamicOf(state, unitId)?.tracks[trackId]?.level ?? 0;
}

/** The highest intensity tier P16 may generate for the track: her level, or 0 while the track is closed (its category is off or among her limits). */
export function trackCap(state: CampaignState, reg: Registries, unitId: string, trackId: string): number {
  return trackOpen(state, reg, unitId, trackId) ? trackLevel(state, unitId, trackId) : 0;
}

/**
 * Adds xp to one of her tracks and re-reads the level. Nothing happens for an unknown or closed track, or a unit with no dynamic. There
 * is no producer in P15 (P16 calls this), and no event: the level is read, not announced.
 */
export function addTrackXp(draft: CampaignState, reg: Registries, unitId: string, trackId: string, xp: number): EngineEvent[] {
  const entry = trackEntry(reg, trackId);
  const dyn = dynamicOf(draft, unitId);
  if (entry === undefined || dyn === undefined || xp === 0 || !trackOpen(draft, reg, unitId, trackId)) return [];
  const track = dyn.tracks[trackId] ?? { xp: 0, level: 0 };
  track.xp = Math.max(0, Math.round((track.xp + xp) * 1e4) / 1e4);
  track.level = levelOfXp(entry.thresholds, track.xp);
  dyn.tracks[trackId] = track;
  return [];
}
