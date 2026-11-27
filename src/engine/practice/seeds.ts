/**
 * The seeds a request offers the model (P16, plan R5): examples of what a holder could ask for, gated by what is switched on, her limits, her
 * tracks and her bond. A seed is a wording example and a fallback, never a rule: the engine reads it by field (`kind`, `contentTags`, `track`, `tier`,
 * `needs`, `romantic`), never by id. Draws nothing: a pick is an index into the registry-ordered pool by `practiceRoll`.
 */
import type { PracticeSeedEntry } from '../../content/schemas';
import type { Registries } from '../../content/types';
import { bondTierOf } from '../bonds/profile';
import { contentAllowed } from '../bonds/content';
import { hasCapability } from '../dynamic/capabilities';
import { practiceOf } from '../dynamic/profile';
import { practisedOf } from '../dynamic/drawn';
import { dynamicOf } from '../dynamic/state';
import { trackLevel, trackOpen } from '../dynamic/tracks';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { practiceRoll, type PracticeKind, type Stake } from './state';

const seedOf = (reg: Registries, id: string): PracticeSeedEntry | undefined => reg.practiceSeeds.get(id) as unknown as PracticeSeedEntry | undefined;

/** The seed rows of the registry in registry order. */
export const seedRows = (reg: Registries): PracticeSeedEntry[] => [...reg.practiceSeeds.values()] as unknown as PracticeSeedEntry[];

/** The seed by id (the registry's row), or undefined. */
export const seedEntry = seedOf;

/**
 * The seeds of a kind that may be offered to her now, in registry order: every tag switched on and none among her limits, every practice category among
 * the tags one she practises (`as` is not `none`), the track open for her, the tier no more than her level in it plus one (and not below `minTier`),
 * the capability the seed needs held, and a `romantic` seed only at the romantic tier of the bond.
 */
export function seedPool(state: CampaignState, reg: Registries, holderId: string, kind: PracticeKind, opts: { minTier?: number; echo?: string } = {}): PracticeSeedEntry[] {
  const view = practiceOf(state, reg, holderId);
  const tier = bondTierOf(state, reg, holderId);
  return seedRows(reg).filter((seed) => {
    if (seed.kind !== kind || !contentAllowed(state, reg, seed, holderId)) return false;
    if (seed.echo !== opts.echo) return false; // P16b: a seed of a sentence's echo is offered to that echo alone, and the ordinary pool never has one
    if (seed.contentTags.some((t) => view?.categories[t] !== undefined && view.categories[t].as === 'none')) return false;
    if (!trackOpen(state, reg, holderId, seed.track) || seed.tier > trackLevel(state, holderId, seed.track) + 1) return false;
    if (opts.minTier !== undefined && seed.tier < opts.minTier) return false;
    if (seed.needs !== undefined && !hasCapability(state, reg, holderId, seed.needs)) return false;
    return seed.romantic !== true || tier === 'romantic';
  });
}

/**
 * P15b: the seeds of a pool that are new to the commander and her: first the ones none of whose categories she has practised with the commander, else the ones whose kind (the seed) she has not.
 * Empty when she has done everything (the caller then keeps the whole pool). Reads `dynamic.practised`; a holder with none practised has everything new.
 */
export function freshPool(state: CampaignState, holderId: string, pool: readonly PracticeSeedEntry[]): PracticeSeedEntry[] {
  const done = practisedOf(state, holderId);
  const newCategory = pool.filter((s) => s.contentTags.every((t) => !done.categories.includes(t)));
  return newCategory.length > 0 ? newCategory : pool.filter((s) => !done.kinds.includes(s.id));
}

/** P15b: would a request for something new find something new (the pool's `freshPool` is not empty)? The request says it is new only then. */
export function hasFreshSeeds(state: CampaignState, reg: Registries, holderId: string, kind: PracticeKind, opts: { minTier?: number } = {}): boolean {
  return freshPool(state, holderId, seedPool(state, reg, holderId, kind, opts)).length > 0;
}

/**
 * Three to six seed ids of a kind for one request (`TUNING.practice.seeds`), weighted by the seed's `weight`, drawn without replacement by
 * `practiceRoll` (the count too). The whole pool when it is smaller than the count; none when it is empty.
 */
export function pickSeeds(state: CampaignState, reg: Registries, holderId: string, kind: PracticeKind, opts: { minTier?: number; fresh?: boolean; echo?: string } = {}): string[] {
  const all = seedPool(state, reg, holderId, kind, opts);
  const news = opts.fresh === true ? freshPool(state, holderId, all) : [];
  const pool = news.length > 0 ? news : all; // something new when she has it, else everything she could ask for
  const T = TUNING.practice.seeds;
  const want = T.min + Math.floor(practiceRoll(state, holderId, `seeds:${kind}:n`) * (T.max - T.min + 1));
  const rest = [...pool];
  const picked: string[] = [];
  for (let i = 0; i < want && rest.length > 0; i++) {
    const total = rest.reduce((sum, seed) => sum + seed.weight, 0);
    let at = practiceRoll(state, holderId, `seeds:${kind}:${i}`) * total;
    let index = rest.findIndex((seed) => (at -= seed.weight) < 0);
    if (index < 0) index = rest.length - 1;
    picked.push(rest[index].id);
    rest.splice(index, 1);
  }
  return picked;
}

/** What a fallback practice says: the kind's template with the seed's gist in it (a draft, `AUTHOR TO WRITE:`; a reader passes it through `plainDraft`). */
export function fallbackLine(kind: PracticeKind, gist: string): string {
  return TUNING.practice.fallback[kind].replaceAll('{gist}', gist);
}

/** The summary of a practice that has no model words: the seed's gist. */
export function plainSummary(seed: Pick<PracticeSeedEntry, 'gist'>): string {
  return seed.gist;
}

/** The stakes a frame may give at most (`TUNING.practice.stakesCeiling`). */
export function stakesCeilingOf(state: CampaignState, holderId: string): Stake {
  const frame = dynamicOf(state, holderId)?.frame;
  return frame === 'rule' || frame === 'role' || frame === 'play' ? TUNING.practice.stakesCeiling[frame] : 'minor';
}
