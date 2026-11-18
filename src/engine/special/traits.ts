import type { EngineCtx, EngineEvent } from '../dispatch';
import { traitEffects } from '../commander/traits';
import type { CampaignState } from '../state/types';
import { newFrequency, specialOf } from './state';

/**
 * P12: switches on what the commander's special trait asks for. Idempotent and additive: it sets the commander flags of
 * `commander_flag` effects and creates the state block of each system whose effect is present (`frequency`, `paranoia`,
 * `debts`), and never removes anything. Called when a campaign is built and when an old save picks its traits at review.
 * It draws nothing, so the rng is untouched.
 */
export function seedSpecialTraits(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  for (const fx of traitEffects(draft, reg, 'commander_flag')) {
    if (!draft.commander.flags.includes(fx.flag)) draft.commander.flags.push(fx.flag);
  }
  if (traitEffects(draft, reg, 'frequency').length > 0) specialOf(draft).frequency ??= newFrequency();
  if (traitEffects(draft, reg, 'paranoia').length > 0) specialOf(draft).paranoia ??= {};
  if (traitEffects(draft, reg, 'debts').length > 0) specialOf(draft).debts ??= {};
  return [];
}
