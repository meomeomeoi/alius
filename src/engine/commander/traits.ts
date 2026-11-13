import type { TraitEffect } from '../../content/schemas';
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';

/**
 * P7: what the commander's traits do. Every other module asks these three readers at its hook point; none of them
 * names a trait id (overview P4: data, not code).
 */

/** The ids of the chosen traits: regular ones first, then the special one. */
export function traitIds(state: CampaignState): string[] {
  const t = state.commander.traits;
  return t ? [...t.regular, ...(t.special !== undefined ? [t.special] : [])] : [];
}

/** Every effect of type `type` of the commander's traits, in trait order. Ids the pack no longer knows are skipped. */
export function traitEffects<T extends TraitEffect['type']>(state: CampaignState, reg: Registries, type: T): Array<Extract<TraitEffect, { type: T }>> {
  const out: Array<Extract<TraitEffect, { type: T }>> = [];
  for (const id of traitIds(state)) {
    const effects = reg.commanderTraits.get(id)?.effects;
    if (!Array.isArray(effects)) continue;
    for (const fx of effects as TraitEffect[]) if (fx.type === type) out.push(fx as Extract<TraitEffect, { type: T }>);
  }
  return out;
}

export const hasTraitEffect = (state: CampaignState, reg: Registries, type: TraitEffect['type']): boolean => traitEffects(state, reg, type).length > 0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Start-time effects that shape the commander himself: `social_rank` (never lowers a rank) and `seasoning_start`
 * (capped at 5). Run before any unit joins, so presence already sees them.
 */
export function applyStartTraitEffects(draft: CampaignState, reg: Registries): void {
  for (const fx of traitEffects(draft, reg, 'social_rank')) {
    draft.commander.socialStats[fx.stat] = Math.max(draft.commander.socialStats[fx.stat], fx.rank);
  }
  for (const fx of traitEffects(draft, reg, 'seasoning_start')) {
    draft.commander.seasoning = clamp((draft.commander.seasoning ?? 3) + fx.amount, 1, 5);
  }
}

/** `faction_start`: the own corporation's standing moves once. Run after the world is seeded (seeding keeps what is set). */
export function applyFactionTraitEffects(draft: CampaignState, reg: Registries): void {
  const own = draft.commander.corporationId;
  if (own === null) return;
  for (const fx of traitEffects(draft, reg, 'faction_start')) {
    draft.world.factions[own] = clamp((draft.world.factions[own] ?? 0) + fx.amount, -100, 100);
  }
}

/**
 * `no_romance` is read by `intimacyOf`, which has no registry: the campaign mirrors it as `settings.noRomance`.
 * Call it whenever the commander's traits are set.
 */
export function syncTraitSettings(draft: CampaignState, reg: Registries): void {
  if (hasTraitEffect(draft, reg, 'no_romance')) draft.settings.noRomance = true;
  else delete draft.settings.noRomance;
}

/** The summed `starting_trust` of the traits for a unit with these values (no values: only the unconditional ones count). */
export function traitStartingTrust(state: CampaignState, reg: Registries, values?: Record<string, number>): number {
  let sum = 0;
  for (const fx of traitEffects(state, reg, 'starting_trust')) {
    if (fx.ifValue) {
      const v = values?.[fx.ifValue.axis];
      if (v === undefined || (fx.ifValue.sign === '+' ? !(v > 0) : !(v < 0))) continue;
    }
    sum += fx.amount;
  }
  return sum;
}
