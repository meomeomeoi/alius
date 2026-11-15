import type { HerCallSpec } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import { bondOf, leadRank } from '../bonds/profile';
import { impunityBand, impunityOf } from '../discipline/impunity';
import { commandStance } from '../discipline/stance';
import { isLiving } from '../economy';
import type { Rng } from '../rng';
import { VALUE_AXES, type CampaignState, type Unit } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveValues } from '../worldOptions/stances';
import { assertiveness } from './options';
import { leaderOf } from './state';

/**
 * Her call (P9e): at an expedition event node of a her-call template a soldier with a will of her own may act on her own. Who may,
 * how likely she is to be the one and how it turns out are pure functions of her card (values, lead style, defects) and her
 * Impunity; only `rollHerCall` draws from the rng. This module never imports the expedition (the party comes in as ids).
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const unitOf = (state: CampaignState, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

/** The her-call block of a template, `null` for an ordinary event. */
export function herCallSpecOf(template: Entry | undefined): HerCallSpec | null {
  return (template?.herCall as HerCallSpec | undefined) ?? null;
}

/** The commander ordered her to ask first: while it holds she never acts on her own. */
export function askFirstHolds(state: Pick<CampaignState, 'power'>, unitId: string): boolean {
  return state.power?.askFirst?.[unitId] !== undefined;
}

/**
 * Who of the party may act on this template, in party order: a named, living, active unit not under the ask-first order whose
 * lead rank reaches `minLeadRank`, or whose command stance is one of `stances` with Impunity at `minImpunity` (default 0).
 * Read from the card, never from an id.
 */
export function herCallCandidates(state: CampaignState, reg: Registries, spec: HerCallSpec, partyIds: string[]): string[] {
  const t = spec.trigger;
  return partyIds.filter((id) => {
    const unit = unitOf(state, id);
    if (!unit || unit.kind !== 'named' || !isLiving(unit) || unit.status !== 'active' || askFirstHolds(state, id)) return false;
    const bond = bondOf(unit);
    if (t.minLeadRank !== undefined && bond !== null && leadRank(bond.leadStyle) >= t.minLeadRank) return true;
    if (!t.stances || t.stances.length === 0) return false;
    const stance = commandStance(state, reg, id);
    const impunity = impunityOf(state, reg, id);
    return stance !== null && impunity !== null && t.stances.includes(stance) && impunity.value >= (t.minImpunity ?? 0);
  });
}

/** `(1 + leadBonus[leadStyle]) × band[Impunity band] × (leader ? leaderMult : 1)`; 0 for a unit that has no card to read. */
export function actorWeight(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = unitOf(state, unitId);
  const bond = unit ? bondOf(unit) : null;
  const impunity = impunityOf(state, reg, unitId);
  if (!bond || !impunity) return 0;
  const T = TUNING.herCall;
  return (1 + T.leadBonus[bond.leadStyle]) * T.band[impunityBand(impunity.value)] * (leaderOf(state)?.id === unitId ? T.leaderMult : 1);
}

/** The chance a her-call node is acted on at all: `min(chanceCap, chance × privilegeMult)`. */
export function herCallChance(state: CampaignState, reg: Registries): number {
  return Math.min(TUNING.herCall.chanceCap, TUNING.herCall.chance * assertiveness(state, reg).privilegeMult);
}

/** The chance the outcome is good: her values against each outcome's lean, plus the tilt of her defects by category. */
export function herCallOdds(state: CampaignState, reg: Registries, unitId: string, spec: HerCallSpec): number {
  const unit = unitOf(state, unitId);
  const T = TUNING.herCall.odds;
  if (!unit) return T.base;
  const values = effectiveValues(state, reg, unit);
  const score = (id: 'good' | 'bad'): number => {
    const lean = spec.outcomes.find((o) => o.id === id)?.lean ?? {};
    return VALUE_AXES.reduce((sum, axis) => sum + values[axis] * (lean[axis] ?? 0), 0);
  };
  const categories = new Set(unit.defects.map((d) => String(reg.defects.get(d.id)?.category)));
  const tilt = (spec.defectTilt ?? []).reduce((sum, t) => sum + (categories.has(t.category) ? t.shift : 0), 0);
  return clamp(T.base + T.perPoint * (score('good') - score('bad')) + tilt, T.min, T.max);
}

/**
 * The roll at a her-call node. No candidate: no draw. A candidate: one draw (does she act). She acts: two more, who (weighted by
 * `actorWeight`, over the candidates in party order) and the outcome (`odds` for good). Returns `null` when she does not.
 */
export function rollHerCall(
  state: CampaignState, reg: Registries, rng: Rng, spec: HerCallSpec, partyIds: string[],
): { unitId: string; outcome: 'good' | 'bad'; odds: number } | null {
  const candidates = herCallCandidates(state, reg, spec, partyIds);
  if (candidates.length === 0) return null;
  if (rng.float() >= herCallChance(state, reg)) return null;
  const weights = candidates.map((id) => actorWeight(state, reg, id));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.float() * total;
  const index = weights.findIndex((w) => (r -= w) < 0);
  const unitId = candidates[index === -1 ? candidates.length - 1 : index];
  const odds = herCallOdds(state, reg, unitId, spec);
  return { unitId, outcome: rng.float() < odds ? 'good' : 'bad', odds };
}
