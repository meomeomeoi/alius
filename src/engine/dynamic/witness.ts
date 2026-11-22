/**
 * What a witness thinks of a dynamic she knows of (P15, plan R14, spec §8): her `witness` attitude toward the practice the holder leads in, and
 * the two numbers that follow from `dislikes` (her Impunity term, the holder's standing malus). A leaf for the discipline and power layers: it
 * imports only types, the practice reader and the tuning (never `impunityOf` or `standingOf`), so those two can call it without a cycle.
 * Reads only; draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicLive, practiceCategories, practiceOf } from './profile';
import { dynamicHash, dynamicOf } from './state';
import type { DynamicTrackEntry, Witness } from './types';

/** How strongly a holder leads in a category she practises: `craves` first, then `enjoys`, then `tolerates`. */
const AS_ORDER: readonly string[] = ['craves', 'enjoys', 'tolerates'];

/**
 * The category the holder leads in, as far as the squad can tell: the category of her highest track (a track with no category, such as
 * `discipline`, is skipped), else the category she herself practises most keenly. `undefined` when there is neither.
 */
export function leadingCategory(state: CampaignState, reg: Registries, holderId: string): string | undefined {
  const dyn = dynamicOf(state, holderId);
  const ranked = Object.entries(dyn?.tracks ?? {})
    .filter(([, t]) => t.xp > 0)
    .map(([id, t]) => ({ category: (reg.dynamicTracks.get(id) as unknown as DynamicTrackEntry | undefined)?.category, xp: t.xp }))
    .filter((t): t is { category: string; xp: number } => typeof t.category === 'string')
    .sort((a, b) => b.xp - a.xp);
  if (ranked.length > 0) return ranked[0].category;
  const view = practiceOf(state, reg, holderId);
  if (view === null) return undefined;
  for (const as of AS_ORDER) {
    const found = practiceCategories(reg).find((c) => view.categories[c]?.as === as);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Her `witness` attitude toward what the holder leads in (R14); `indifferent` when she has no practice section or the holder leads in nothing. */
export function witnessOf(state: CampaignState, reg: Registries, observerId: string, holderId: string): Witness {
  const category = leadingCategory(state, reg, holderId);
  if (category === undefined) return 'indifferent';
  return practiceOf(state, reg, observerId)?.categories[category]?.witness ?? 'indifferent';
}

/** What she does about it once she knows (R14): by her `witness`, unless she is a holder herself, who respects or contests the other's claim by her manner. */
export type Reaction = 'drawn' | 'indifferent' | 'dislikes' | 'respects' | 'competes';

/**
 * Her reaction to the holder's dynamic. A woman who holds a dynamic of her own (frame beyond `equal`) takes it as a rival: `ritual` and `cold` respect the claim,
 * `possessive` and `cruel` compete for it; any other manner reads like a witness. Everybody else reacts by `witnessOf`. Reads only.
 */
export function reactionOf(state: CampaignState, reg: Registries, observerId: string, holderId: string): Reaction {
  const frame = dynamicOf(state, observerId)?.frame;
  if (frame !== undefined && frame !== 'equal') {
    const manner = practiceOf(state, reg, observerId)?.style.primary;
    if (manner === 'ritual' || manner === 'cold') return 'respects';
    if (manner === 'possessive' || manner === 'cruel') return 'competes';
  }
  return witnessOf(state, reg, observerId, holderId);
}

/**
 * A hashed chance in [0, 1): `dynamicHash` with a murmur finalizer on top. `dynamicHash` is FNV-1a over a string whose last characters are the day, so
 * two consecutive days give two nearby numbers (0.480, 0.492, 0.488, ...); a chance read straight from it would come up on the same stretch of days for
 * every pair. The finalizer spreads them. Deterministic; draws nothing.
 */
export function dynamicRoll(state: Pick<CampaignState, 'dynamic' | 'day'>, unitId: string, key: string): number {
  let x = Math.floor(dynamicHash(state, unitId, key) * 2 ** 32) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 2 ** 32;
}

/**
 * How much more her dislike weighs (R18): Regard (`regard.ts`) registers a reader that answers `TUNING.regard.dislikes` for a woman whose Regard is low or none and 1
 * for the rest. This file stays a leaf, so the reader is injected; with none registered every dislike counts once.
 */
type ScaleReader = (state: CampaignState, reg: Registries, unitId: string) => number;
let dislikeScale: ScaleReader | null = null;
export function registerDislikeScale(reader: ScaleReader): void { dislikeScale = reader; }
const scaleOf = (state: CampaignState, reg: Registries, unitId: string): number => dislikeScale?.(state, reg, unitId) ?? 1;

/**
 * What a holder's standing takes off the other units' positive Impunity (R19, a share 0 to 0.3): `exchange.ts` registers the reader (it needs `standingOf`, which
 * needs `impunityOf`, which calls this), so this file stays a leaf. With none registered nobody is protected.
 */
type ProtectionReader = (state: CampaignState, reg: Registries, unitId: string) => number;
let protection: ProtectionReader | null = null;
export function registerProtection(reader: ProtectionReader): void { protection = reader; }
export const protectionShare = (state: CampaignState, reg: Registries, unitId: string): number => protection?.(state, reg, unitId) ?? 0;

/** The observers who `knows_dynamic` of this holder and whose `witness` is `dislikes`, in squad order. */
export function dislikers(state: CampaignState, reg: Registries, holderId: string): string[] {
  const rows = state.dynamic?.knowledge;
  if (rows === undefined) return [];
  return state.squad.filter((u) => rows[u.id]?.[holderId]?.level === 'knows_dynamic' && reactionOf(state, reg, u.id, holderId) === 'dislikes').map((u) => u.id);
}

/**
 * The `dynamic` term of her Impunity (P9 §8, R14): `dislikesImpunity` for each holder she knows of and dislikes seeing. 0 without the block, with no
 * holders allowed, with the practice categories off, and for a woman who knows of none (so `impunityOf` is unchanged without a dynamic). Only the reaction half of R19's term: the
 * protection a holder's standing gives the others is `protectionShare`, subtracted in `impunityOf` (it needs the other terms).
 */
export function dynamicTerm(state: CampaignState, reg: Registries, unitId: string): number {
  const x = state.dynamic;
  if (x === undefined || !dynamicLive(state, reg)) return 0;
  const row = x.knowledge[unitId];
  if (row === undefined) return 0;
  const dislikes = Object.entries(row).filter(([holderId, k]) => k.level === 'knows_dynamic' && reactionOf(state, reg, unitId, holderId) === 'dislikes').length;
  return dislikes === 0 ? 0 : Math.round(dislikes * TUNING.squadKnowledge.reaction.dislikesImpunity * scaleOf(state, reg, unitId)) + 0;
}

/** What the holder's standing loses to the witnesses who dislike it (a positive number: `dislikesStanding` each, at most `standingMax`). 0 without the block. */
export function standingMalus(state: CampaignState, reg: Registries, holderId: string): number {
  if (!dynamicLive(state, reg)) return 0;
  const R = TUNING.squadKnowledge.reaction;
  return Math.min(R.standingMax, Math.round(dislikers(state, reg, holderId).reduce((sum, id) => sum + scaleOf(state, reg, id), 0) * R.dislikesStanding));
}
