import { isLiving } from '../../economy';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { hasTraitEffect } from '../../commander/traits';
import { discoverSecret } from '../../personal/secrets';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { newFrequency, specialOf, type Intercepted } from '../state';
import { candidateTruths, falseValue } from './candidates';

export { candidateTruths, falseValue, type Candidate, type CandidateKind } from './candidates';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const stressOf = (state: CampaignState, unitId: string): number => state.squad.find((u) => u.id === unitId)?.stress ?? 0;

/** `pCatch = clamp(0.25 + (private ? 0.10 : 0) − (her stress ≥ 80 ? 0.10 : 0), 0, 1)`, halved for a DM. */
export function catchChance(state: CampaignState, unitId: string, o: { private: boolean; dm: boolean }): number {
  const T = TUNING.special.frequency;
  const p = T.catchBase + (o.private ? T.privateBonus : 0) - (stressOf(state, unitId) >= T.catchStressAt ? T.catchStressPenalty : 0);
  return clamp(p, 0, 1) * (o.dm ? T.dmMult : 1);
}

/** `pDistort = 0.25`, +0.15 while her stress is 50 or more. */
export function distortChance(state: CampaignState, unitId: string): number {
  const T = TUNING.special.frequency;
  return T.distortBase + (stressOf(state, unitId) >= T.distortStressAt ? T.distortStress : 0);
}

/** The frequency state, created on first use (a save made before the trait was picked has none). */
export function frequencyOf(draft: CampaignState): NonNullable<NonNullable<CampaignState['special']>['frequency']> {
  return (specialOf(draft).frequency ??= newFrequency());
}

/**
 * Each unit in `unitIds` (named, living, not yet sure about the commander) may let a fragment slip: one draw for the catch,
 * then (on a hit) the kind, the item, the distortion, the false value where one is picked, and whether it is only the subject.
 * Nothing is drawn without the trait, after the implant is burned, for a unit who knows, or for a DM already rolled today.
 * An undistorted intercept of a kept squad secret opens it (P9c's `frequency` route). The event carries ids only, never the truth.
 */
export function rollIntercepts(
  draft: CampaignState, ctx: EngineCtx, unitIds: string[], opts: { private: boolean; dm: boolean; sceneId?: string },
): EngineEvent[] {
  const reg = ctx.registries;
  if (!hasTraitEffect(draft, reg, 'frequency')) return [];
  const f = frequencyOf(draft);
  if (f.burnedDay !== undefined) return [];
  const events: EngineEvent[] = [];
  for (const unitId of unitIds) {
    const unit = draft.squad.find((u) => u.id === unitId);
    const rel = draft.relations[unitId];
    if (!unit || unit.kind !== 'named' || !isLiving(unit) || !rel || rel.flags.includes('knows_frequency')) continue;
    if (opts.dm) {
      if (f.dmDay[unitId] === draft.day) continue;
      f.dmDay[unitId] = draft.day;
    }
    if (!ctx.rng.chance(catchChance(draft, unitId, opts))) continue;
    const all = candidateTruths(draft, reg, unitId);
    if (all.length === 0) continue;
    const kind = ctx.rng.pick([...new Set(all.map((c) => c.kind))]);
    const item = ctx.rng.pick(all.filter((c) => c.kind === kind));
    const distorted = ctx.rng.chance(distortChance(draft, unitId));
    const value = distorted ? falseValue(kind, item.value, ctx.rng) : item.value;
    const partial = ctx.rng.chance(TUNING.special.frequency.partial);
    f.seq += 1;
    const x: Intercepted = {
      id: `fq${f.seq}`, unitId, day: draft.day, kind, value, true: !distorted, partial,
      ...(item.refId !== undefined ? { refId: item.refId } : {}), ...(opts.sceneId !== undefined ? { sceneId: opts.sceneId } : {}),
    };
    f.intercepts.push(x);
    if (f.intercepts.length > TUNING.special.frequency.logMax) f.intercepts.splice(0, f.intercepts.length - TUNING.special.frequency.logMax);
    events.push({ type: 'frequency_intercept', unitId, interceptId: x.id });
    if (!distorted && kind === 'secret' && item.refId !== undefined) events.push(...discoverSecret(draft, ctx, item.refId, 'frequency'));
  }
  return events;
}
