/**
 * P10e-e R25: her presence in the frame of her time (her_activity.html `baseScore` / `stepOf`): four steps, `with`, `glancing`, `own`, `use`,
 * derived from her activity's attention, her talkativeness, her style, her Regard (a tone term: P15 confines Regard to tone and aftermaths, and
 * presence is tone), her hold band, her mood and a hash of the session; it drifts between phases by the activity's `absorb`.
 *
 * It is a derived reader: never stored, never shown as a word or a number, never read by a prompt (a sentinel in
 * `tests/fixtures/analyze/hidden.ts`). No draw: the session's term is `dynamicHash(state, holderId, 'presence:' + runId)` (the dynamic gives it
 * through its hook; without the dynamic the same formula with a salt of 0). The lower layer imports nothing of the dynamic: Regard, the hold and
 * the hash come through `registerPresenceTerms`, read by rank (position in their registries), never by id.
 */
import type { Registries } from '../../content/types';
import type { ActivityFrame } from '../blocking/types';
import { fnv1a } from '../hub';
import { temperamentOf } from '../life/state';
import { stressBand } from '../relations/bands';
import type { CampaignState } from '../state/types';
import { leadStyle, physicsStyleOf } from './style';
import type { PhysicsRun, StyleKey } from './state';

export type Presence = 'with' | 'glancing' | 'own' | 'use';
export const PRESENCES: readonly Presence[] = ['use', 'own', 'glancing', 'with'];

/** What the dynamic says of a holder (P15, through the hook): her Regard's band rank (0 the highest), her hold band's index (0 the lowest) and the session's hash. */
export interface PresenceTerms { regardRank: number; regardBands: number; holdIndex: number; holdBands: number; hash: (key: string) => number }
type TermsReader = (state: CampaignState, reg: Registries, unitId: string) => PresenceTerms | null;
const readers: TermsReader[] = [];
/** P15 plugs in here (`installDynamicHooks`). The first reader that answers wins; none: a neutral Regard, a `keeping` hold and the salt-0 hash. */
export function registerPresenceTerms(fn: TermsReader): void {
  if (!readers.includes(fn)) readers.push(fn);
}
/** Tests: forget the readers. */
export function resetPresenceHooks(): void {
  readers.length = 0;
}

/* the prototype's weights (her_activity.html `baseScore`, a draft for this reader) */
const ATT: Record<string, number> = { on_commander: 2, divided: 0.9, elsewhere: 0, none: -1.4 };
const TALK: Record<string, number> = { silent: -0.8, terse: 0, talkative: 0.8 };
/** Regard by its band, highest first (esteem, respect, neutral, low, none in the prototype): read by rank. */
const REGARD_BY_RANK = [0.6, 0.3, 0, -0.8, -1.5];
/** The hold by its band, lowest first (interest, testing, keeping, owning, possessing): read by index. */
const HOLD_BY_INDEX = [0.3, 0.2, 0, -0.4, -0.8];
/** Her style's bias (her_activity.html `STYLES[].bias`, with `regal`'s from throne.html); a style the prototype has no row of reads 0. */
export const PRESENCE_BIAS: Partial<Record<StyleKey, number>> = { neutral: 0, affectionate: 0.8, playful: 0.6, possessive: -0.5, cold: -0.6, cruel: -0.4, clinical: 0.3, ritual: 0, regal: -0.2 };
/** Her mood (the prototype's `calm` 0, `good` 0.3, `irritated` −0.4) read from her stress: strained or breaking is irritated. */
const MOOD_BY_STRESS: Record<string, number> = { calm: 0, tense: 0, strained: -0.4, breaking: -0.4 };

/** A position in a list of `n` bands mapped onto the prototype's five (a registry of another length is read by its share). */
const at = (table: readonly number[], i: number, n: number): number => table[Math.round((Math.max(0, Math.min(n - 1, i)) / Math.max(1, n - 1)) * (table.length - 1))] ?? 0;

function termsOf(state: CampaignState, reg: Registries, unitId: string): PresenceTerms {
  for (const read of readers) {
    const t = read(state, reg, unitId);
    if (t !== null) return t;
  }
  return { regardRank: 2, regardBands: 5, holdIndex: 2, holdBands: 5, hash: (key) => fnv1a(`0|${unitId}|dynamic|${key}|${state.day}`) / 2 ** 32 };
}

/** The frame of an activity entry, or null (read by field). */
export function frameOf(entry: unknown): ActivityFrame | null {
  const f = (entry as { frame?: ActivityFrame } | undefined)?.frame;
  return f !== undefined && typeof f === 'object' ? f : null;
}

/** The activity the run's frame is (her activity when the run came from it), and its entry. */
function activityOf(state: CampaignState, reg: Registries, run: PhysicsRun): { attention: string | undefined; frame: ActivityFrame | null } {
  const id = run.sourceKind === 'activity' ? run.sourceId : state.scene?.blocking?.[run.holderId]?.activity;
  const entry = id !== undefined ? reg.blockingActivities.get(id) : undefined;
  return { attention: entry?.attention as string | undefined, frame: frameOf(entry) };
}

/** The prototype's `baseScore` for this holder and run (phase 1), without the drift. */
export function presenceScore(state: CampaignState, reg: Registries, run: PhysicsRun): number {
  const { attention } = activityOf(state, reg, run);
  const t = termsOf(state, reg, run.holderId);
  const unit = state.squad.find((u) => u.id === run.holderId);
  const style = leadStyle(physicsStyleOf(state, run.holderId, reg)).key;
  const hash = (t.hash(`presence:${run.id}`) - 0.5) * 1.0; // a hash, not a draw
  return (ATT[attention ?? 'on_commander'] ?? 0) + (TALK[temperamentOf(state, run.holderId).talkativeness] ?? 0) + (PRESENCE_BIAS[style] ?? 0)
    + at(REGARD_BY_RANK, t.regardRank, t.regardBands) + at(HOLD_BY_INDEX, t.holdIndex, t.holdBands) + (MOOD_BY_STRESS[unit ? stressBand(unit.stress) : 'calm'] ?? 0) + hash;
}

/** The prototype's `stepOf`. */
export const stepOf = (score: number): Presence => (score >= 1.2 ? 'with' : score >= 0.3 ? 'glancing' : score >= -0.7 ? 'own' : 'use');

/**
 * Her presence in a phase (1-based): the score, plus her activity's `absorb` and a hashed ±0.15 for every phase after the first (the
 * prototype's drift at `resolveSkip`, a hash instead of its draw).
 */
export function presenceOf(state: CampaignState, reg: Registries, run: PhysicsRun, phase: number): Presence {
  const { frame } = activityOf(state, reg, run);
  const t = termsOf(state, reg, run.holderId);
  let score = presenceScore(state, reg, run);
  for (let p = 2; p <= phase; p++) score += (frame?.absorb ?? 0) + (t.hash(`presence:${run.id}:${p}`) * 2 - 1) * 0.15;
  return stepOf(score);
}

/** Her attention per presence step, `[watching, glancing, busy]` (her_activity.html `ATT_BY_STEP`). */
export const ATT_BY_STEP: Record<Presence, [number, number, number]> = { with: [0.4, 0.4, 0.2], glancing: [0.14, 0.38, 0.48], own: [0.05, 0.25, 0.7], use: [0.02, 0.12, 0.86] };
/** Her style's watch bias (her_activity.html `STYLES[].watch`). */
export const PRESENCE_WATCH: Partial<Record<StyleKey, number>> = { neutral: 0, affectionate: -0.05, playful: 0, possessive: 0.05, cold: -0.05, cruel: 0.15, clinical: 0.3, ritual: 0.1, regal: 0.1 };
