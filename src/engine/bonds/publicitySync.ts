import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, Publicity } from '../state/types';
import { bondOf, bondTierOf, PUBLICITY_LEVELS } from './profile';

// The tier-following half of publicity, kept free of the event machinery so the relationship graph can call it (see `publicity.ts`).

export const rank = (p: Publicity): number => PUBLICITY_LEVELS.indexOf(p);
const morePrivate = (a: Publicity, b: Publicity): Publicity => (rank(a) <= rank(b) ? a : b);

/**
 * Keeps `Relation.publicity` in step with her state (call after every `enterState` and after an UNDO restores a state): it is
 * set when she is in a `romantic`-tier state and cleared when she is not. A new level is `secret` in the concealed-romance
 * state (its discovery is P3's), otherwise the more private of her preference and the commander's default (`known`).
 * Idempotent; draws no rng.
 */
export function syncPublicity(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!rel || !unit || unit.kind !== 'named') return [];
  if (bondTierOf(draft, reg, unitId) !== 'romantic') {
    if (!rel.publicity) return [];
    delete rel.publicity;
    return [{ type: 'publicity_cleared', unitId }];
  }
  const concealed = rel.stateId === 'secret_affair';
  if (rel.publicity && (!concealed || rel.publicity.level === 'secret')) return [];
  const level: Publicity = concealed ? 'secret' : morePrivate(bondOf(unit)?.publicity ?? 'known', 'known');
  rel.publicity = { level, ...(rel.publicity?.commanderPref ? { commanderPref: rel.publicity.commanderPref } : {}), since: draft.day };
  return [{ type: 'publicity_set', unitId, level }];
}

/** The day-end repair: every named unit's publicity matches her state (a missed hook, romance switched off, an old save). */
export function syncAllPublicity(draft: CampaignState, reg: Registries): EngineEvent[] {
  return draft.squad.flatMap((u) => syncPublicity(draft, reg, u.id));
}

