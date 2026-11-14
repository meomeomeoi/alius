import type { StanceEffect } from '../../content/schemas';
import type { Registries } from '../../content/types';
import type { Rng } from '../rng';
import type { CampaignState, Unit, WorldStance } from '../state/types';
import { VALUE_AXES } from '../state/types';
import { isNeutralChoice, worldChoice, worldChoices } from './options';

/**
 * Per-unit stances toward the world's norms (P8 §3.1). A norm reaches a unit only through her own stance, set at
 * import (named) or rolled once (grunts). A neutral world choice (`indifferent`, `tolerated`) has no stances at all.
 */

type StanceHolder = Pick<Unit, 'worldStances'>;

const INDIFFERENT: WorldStance = { stance: 'indifferent', strength: 1, reason: '' };

/** Her stance toward one `squadStance` option; null for any other option and under a neutral choice. Absent = indifferent. */
export function stanceOf(state: Pick<CampaignState, 'world'>, reg: Registries, unit: StanceHolder, optionId: string): WorldStance | null {
  const found = worldChoice(state, reg, optionId);
  if (!found || found.option.squadStance !== true || isNeutralChoice(found.choice)) return null;
  return unit.worldStances?.[optionId] ?? INDIFFERENT;
}

/** The effects of the given type of every stance she holds (registry `stanceEffects`), in option order. */
export function stanceEffects<T extends StanceEffect['type']>(
  state: Pick<CampaignState, 'world'>, reg: Registries, unit: StanceHolder, type: T,
): Array<Extract<StanceEffect, { type: T }>> {
  const out: Array<Extract<StanceEffect, { type: T }>> = [];
  for (const option of reg.worldOptions.values()) {
    const s = stanceOf(state, reg, unit, option.id);
    if (!s || s.stance === 'indifferent') continue;
    for (const entry of reg.stanceEffects.values()) {
      if (entry.option !== option.id || entry.stance !== s.stance || entry.strength !== s.strength) continue;
      for (const fx of entry.effects as StanceEffect[]) if (fx.type === type) out.push(fx as Extract<StanceEffect, { type: T }>);
    }
  }
  return out;
}

/** Her values as she judges the commander's decisions: the stored values shifted by her stances (`value_shift`), each clamped to −3…3. */
export function effectiveValues(
  state: Pick<CampaignState, 'world'>, reg: Registries, unit: StanceHolder & Pick<Unit, 'values'>,
): Unit['values'] {
  const values = { ...unit.values };
  for (const fx of stanceEffects(state, reg, unit, 'value_shift')) {
    if (!VALUE_AXES.includes(fx.axis)) continue;
    values[fx.axis] = Math.min(3, Math.max(-3, values[fx.axis] + fx.amount));
  }
  return values;
}

/**
 * A grunt's stance toward each non-neutral `squadStance` option: one weighted roll per option from the choice's
 * `grunt_stances`, strength 1, no reason. Under neutral choices nothing is drawn and the result is undefined.
 */
export function rollGruntStances(state: Pick<CampaignState, 'world'>, reg: Registries, rng: Rng): Record<string, WorldStance> | undefined {
  const out: Record<string, WorldStance> = {};
  for (const { option, choice } of worldChoices(state, reg)) {
    if (option.squadStance !== true || isNeutralChoice(choice)) continue;
    const weights = choice.effects.find((e) => e.type === 'grunt_stances');
    if (!weights || weights.type !== 'grunt_stances') continue;
    const total = weights.shares + weights.indifferent + weights.opposes;
    if (total <= 0) continue;
    const roll = rng.float() * total;
    const stance = roll < weights.shares ? 'shares' : roll < weights.shares + weights.indifferent ? 'indifferent' : 'opposes';
    out[option.id] = { stance, strength: 1, reason: '' };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
