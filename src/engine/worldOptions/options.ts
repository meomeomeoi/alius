import type { WorldChoice, WorldOptionEffect } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../state/types';

/**
 * Readers for the world options (P8). A campaign stores `world.options: { [optionId]: choiceId }`; an old save, a missing
 * key or a choice the pack no longer has reads the option's `default`. Code reads choice effects BY TYPE, never by
 * option or choice id (overview P4).
 */

type WorldHolder = Pick<CampaignState, 'world'>;
export type WorldOptionEntry = Entry & { choices: WorldChoice[]; default: string };

/** Effect types that make a `squadStance` choice non-neutral: the stances of a unit only count under such a choice. */
const NON_NEUTRAL: readonly WorldOptionEffect['type'][] = ['expression_norm', 'enable_family', 'mission_reward_pct'];

const optionEntries = (reg: Registries): WorldOptionEntry[] => [...reg.worldOptions.values()] as WorldOptionEntry[];

function pick(option: WorldOptionEntry, stored: string | undefined): WorldChoice {
  return option.choices.find((c) => c.id === stored) ?? option.choices.find((c) => c.id === option.default) ?? option.choices[0];
}

/** The current choice of one option (stored, else the default); null for an unknown option. */
export function worldChoice(state: WorldHolder, reg: Registries, optionId: string): { option: WorldOptionEntry; choice: WorldChoice } | null {
  const option = reg.worldOptions.get(optionId) as WorldOptionEntry | undefined;
  if (!option) return null;
  return { option, choice: pick(option, state.world.options?.[optionId]) };
}

/** The current choice of every option, in registry order. */
export function worldChoices(state: WorldHolder, reg: Registries): Array<{ option: WorldOptionEntry; choice: WorldChoice }> {
  return optionEntries(reg).map((option) => ({ option, choice: pick(option, state.world.options?.[option.id]) }));
}

/** Every effect of this type carried by a current choice, in option order. */
export function worldEffects<T extends WorldOptionEffect['type']>(
  state: WorldHolder, reg: Registries, type: T,
): Array<Extract<WorldOptionEffect, { type: T }>> {
  return worldChoices(state, reg).flatMap(({ choice }) =>
    choice.effects.filter((e): e is Extract<WorldOptionEffect, { type: T }> => e.type === type));
}

/** A choice that changes nothing a unit's stance could react to (`indifferent`, `tolerated`). */
export function isNeutralChoice(choice: Pick<WorldChoice, 'effects'>): boolean {
  return !choice.effects.some((e) => NON_NEUTRAL.includes(e.type));
}

/** The default choice of every option. */
export function defaultWorldOptions(reg: Registries): Record<string, string> {
  return Object.fromEntries(optionEntries(reg).map((o) => [o.id, o.default]));
}

/** One readable message per unknown option or choice; an absent map is valid (defaults). */
export function validateWorldOptions(options: Record<string, string> | undefined, reg: Registries): string[] {
  const out: string[] = [];
  for (const [optionId, choiceId] of Object.entries(options ?? {})) {
    const option = reg.worldOptions.get(optionId) as WorldOptionEntry | undefined;
    if (!option) out.push(`Unknown world option "${optionId}"`);
    else if (!option.choices.some((c) => c.id === choiceId)) out.push(`Unknown choice "${String(choiceId)}" for world option "${optionId}"`);
  }
  return out;
}
