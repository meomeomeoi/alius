import type { Entry, Registries } from '../../content/types';
import { initialLoyaltyBand } from '../relations/bands';
import { socialRank } from '../social';
import type { CampaignState, Relation, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { commanderProfile, daysKnown } from './profile';

/**
 * P7: presence and the first impression. Looks matter on first meeting and fade with the days a unit has known the
 * commander; deeds stay. Expression has no mechanical value (overview P11): it only reaches an axis through a unit's
 * taste (`tastes` registry), never directly.
 */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Presence P ∈ [−15, +15]: the archetype, seasoning and Authority rows of the `presence` registry. A missing row counts as 0. */
export function presenceOf(state: CampaignState, reg: Registries): number {
  const profile = commanderProfile(state);
  const row = (factor: string, key: string): number => {
    for (const e of reg.presence.values()) if (e.factor === factor && String(e.key) === key) return Number(e.presence);
    return 0;
  };
  const sum = row('archetype', profile.archetype) + row('seasoning', String(profile.seasoning)) + row('authority', String(socialRank(state, 'authority')));
  return clamp(sum, -TUNING.commander.presenceMax, TUNING.commander.presenceMax);
}

/** w(d) = exp(−d / τ), d = days the unit has known the commander, τ the `firstImpressionTau` setting (default 7). */
export function firstImpressionWeight(state: CampaignState, unitId: string): number {
  const tau = Number(state.settings.firstImpressionTau ?? TUNING.commander.tau);
  return Math.exp(-daysKnown(state, unitId) / (tau > 0 ? tau : TUNING.commander.tau));
}

const inRange = (v: number, r: unknown): boolean => Array.isArray(r) && v >= Number(r[0]) && v <= Number(r[1]);

/** The unit's tastes that fit the commander as he is now. A taste without `match` always fits; unknown ids are skipped. */
export function matchedTastes(state: CampaignState, reg: Registries, unit: Pick<Unit, 'commanderTastes'>): Entry[] {
  const profile = commanderProfile(state);
  const out: Entry[] = [];
  for (const id of unit.commanderTastes ?? []) {
    const t = reg.tastes.get(id);
    if (!t) continue;
    const m = t.match as { archetypes?: string[]; expression?: unknown; seasoning?: unknown } | undefined;
    if (m?.archetypes && !m.archetypes.includes(profile.archetype)) continue;
    if (m?.expression && !inRange(profile.expression, m.expression)) continue;
    if (m?.seasoning && !inRange(profile.seasoning, m.seasoning)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Applied once when a unit joins: Trust moves by round(P × the matched tastes' `presenceMult`), the matched tastes add
 * their offsets, every axis is clamped and the loyalty band is re-based from Trust. Grunts have no tastes, so only
 * their Trust moves.
 */
export function applyFirstImpression(state: CampaignState, reg: Registries, unit: Pick<Unit, 'commanderTastes'>, rel: Relation): void {
  const matched = matchedTastes(state, reg, unit);
  const mult = matched.reduce((m, t) => m * (typeof t.presenceMult === 'number' ? t.presenceMult : 1), 1);
  let trust = rel.trust + Math.round(presenceOf(state, reg) * mult);
  let affinity = rel.affinity;
  let attraction = rel.attraction;
  for (const t of matched) {
    const o = t.offsets as { trust?: number; affinity?: number; attraction?: number } | undefined;
    trust += o?.trust ?? 0;
    affinity += o?.affinity ?? 0;
    attraction += o?.attraction ?? 0;
  }
  rel.trust = clamp(trust, 0, 100);
  rel.affinity = clamp(affinity, -100, 100);
  rel.attraction = clamp(attraction, 0, 100);
  rel.loyaltyBand = initialLoyaltyBand(rel.trust);
}
