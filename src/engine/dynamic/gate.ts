/**
 * The gate of the dynamic (P15, plan R2, R7): whether it is on, who may hold, how many at once, and the one writer of a holder's
 * `Relation.dynamic`. Everything else of the dynamic asks `dynamicOn` first; while it is false nothing is written and nothing answers.
 */
import type { Registries } from '../../content/types';
import { leadRank, bondOf } from '../bonds/profile';
import type { EngineEvent } from '../dispatch';
import { impunityOf } from '../discipline/impunity';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { frameRank } from '../blocking/state';
import { knownPracticeCategories, practiceEnabled, practiceOf } from './profile';
import { blankDynamic } from './state';
import type { Inclination, MayHold } from './types';

/** The one gate: the campaign has the block, holders are not 0, and a practice category is switched on. */
export function dynamicOn(state: Pick<CampaignState, 'dynamic' | 'content'>, reg: Registries): boolean {
  return state.dynamic !== undefined && state.dynamic.setup.holders !== 0 && practiceEnabled(reg, state.content?.enabled);
}

/**
 * State-only: does she practise anything that is switched on? True when some category of her practice section with `as` other than
 * `none` (what she has become folded in) is among the campaign's enabled content and not among her own limits. The readers on the P15a
 * hooks have no registry, so they cannot ask `dynamicOn`; this is what turns them off with the categories (needs no registry).
 */
export function herPracticeLive(state: Pick<CampaignState, 'squad' | 'content'>, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const stored = unit?.bond?.practice?.categories;
  if (unit === undefined || stored === undefined) return false;
  const on = state.content?.enabled ?? [];
  const limits = unit.bond?.ownLimits.categories ?? [];
  const drift = unit.development?.practice?.categories;
  const practised = knownPracticeCategories(); // a category that is not a practice category (`worship`) is no practice of hers (R2)
  return Object.keys({ ...stored, ...drift }).some((id) => (practised === undefined || practised.includes(id)) && on.includes(id) && !limits.includes(id) && { ...stored[id], ...drift?.[id] }.as !== undefined && { ...stored[id], ...drift?.[id] }.as !== 'none');
}

/** What the setup says about her; `auto` leaves it to her inclination. */
export function mayHoldOf(state: Pick<CampaignState, 'dynamic'>, unitId: string): MayHold {
  return state.dynamic?.setup.units[unitId]?.mayHold ?? 'auto';
}

/**
 * Her inclination as the dynamic reads it (spec §15.1): `curious` when the setup says `yes` and her profile says `none`, else the profile's
 * own; `none` when she has no practice section. Probing and `canHold` both ask this, never the raw field.
 */
export function effectiveInclination(state: Pick<CampaignState, 'dynamic' | 'squad'>, unitId: string): Inclination {
  const own = state.squad.find((u) => u.id === unitId)?.bond?.practice?.inclination; // P14b: raw profile (inclination never drifts)
  if (own === undefined) return 'none';
  return own === 'none' && mayHoldOf(state, unitId) === 'yes' ? 'curious' : own;
}

/** How many may hold at once: `any` is unlimited; no block is none. */
export function holderCap(state: Pick<CampaignState, 'dynamic'>): number {
  const h = state.dynamic?.setup.holders;
  return h === undefined ? 0 : h === 'any' ? Infinity : h;
}

/** The living units whose frame is `play` or beyond: they count against the cap (her own place never counts against her). */
export function holdersAtPlay(state: Pick<CampaignState, 'relations' | 'squad'>): string[] {
  const play = frameRank('play');
  return state.squad.filter((u) => u.kind === 'named' && isLiving(u) && frameRank(state.relations[u.id]?.dynamic?.frame ?? 'equal') >= play).map((u) => u.id);
}

/**
 * Why a unit may not hold (R2), or `null` when she may: the dynamic is off, she has no profile, the setup says no, she has no inclination
 * (unless seeded, or the setup says `yes`), no category she would lead in, a lead style too weak for her Impunity, or the cap is reached. `ignoreCap` leaves the
 * last one out (a seed and a unit that already holds are not turned away by it). Reads only; draws nothing.
 */
export function canHold(state: CampaignState, reg: Registries, unitId: string, opts: { ignoreCap?: boolean } = {}): string | null {
  return holdReason(state, reg, unitId, { ...opts, seeded: state.dynamic?.setup.units[unitId]?.seeded === true });
}

/** `canHold` with the seed decided by the caller (the setup checks a unit it is about to seed). */
export function holdReason(state: CampaignState, reg: Registries, unitId: string, opts: { ignoreCap?: boolean; seeded: boolean }): string | null {
  if (!dynamicOn(state, reg)) return 'the dynamic is off';
  const view = practiceOf(state, reg, unitId);
  if (view === null) return 'she has no practice profile';
  const unit = state.squad.find((u) => u.id === unitId)!;
  const may = mayHoldOf(state, unitId);
  if (may === 'no') return 'the setup says she may not hold';
  if (effectiveInclination(state, unitId) === 'none' && !opts.seeded) return 'her inclination is none';
  const lead = bondOf(unit)?.leadStyle ?? 'balanced';
  const leads = Object.values(view.categories).some((c) => c.as === 'craves' || c.as === 'enjoys' || (c.as === 'tolerates' && lead === 'dominant'));
  if (!leads) return 'no enabled practice she would lead in';
  if (leadRank(lead) < leadRank('assertive') && (impunityOf(state, reg, unitId)?.value ?? 0) < TUNING.dynamic.impunityRoute) return 'her lead style is too weak for her Impunity';
  if (!opts.ignoreCap && holdersAtPlay(state).filter((id) => id !== unitId).length >= holderCap(state)) return 'the holder cap is reached';
  return null;
}

/**
 * The one creator of a holder's block (called by `addHold` for an eligible unit, and by a seed): writes `Relation.dynamic` once and emits
 * `dynamic_started`. A no-op while the dynamic is off or when she has the block already.
 */
export function ensureDynamic(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel || rel.dynamic !== undefined || !dynamicOn(draft, reg)) return [];
  rel.dynamic = blankDynamic(draft.day);
  return [{ type: 'dynamic_started', unitId }];
}
