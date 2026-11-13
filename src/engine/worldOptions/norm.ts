import type { Registries } from '../../content/types';
import { commanderProfile } from '../commander/profile';
import type { CampaignState } from '../state/types';
import { worldEffects } from './options';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * How far the commander's expression is from the norm the world expects (0 to 4); null when no current choice sets a
 * norm. Expression has no mechanical value of its own (overview P11): this is a world option reading it.
 */
export function normDistance(state: CampaignState, reg: Registries): number | null {
  const norm = worldEffects(state, reg, 'expression_norm')[0];
  if (!norm) return null;
  return Math.abs(commanderProfile(state).expression - norm.norm);
}

/**
 * World effects that act once at the start: the own corporation's standing moves by `standingPerStep` for every step
 * of norm distance. Run after the world is seeded (seeding keeps a standing that is already set).
 */
export function applyWorldStartEffects(draft: CampaignState, reg: Registries): void {
  const own = draft.commander.corporationId;
  const distance = normDistance(draft, reg);
  if (own === null || distance === null) return;
  const per = worldEffects(draft, reg, 'expression_norm')[0].standingPerStep;
  draft.world.factions[own] = clamp((draft.world.factions[own] ?? 0) + per * distance, -100, 100);
}
