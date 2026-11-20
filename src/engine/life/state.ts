import type { CampaignState, LifeMode, LifeState, Temperament } from '../state/types';

/**
 * The leaf of her life (P14c): the state shape, its readers, the setting and the hash behind every chance, with nothing but types imported
 * (so `hub`, `dms` and the readers can use it without a cycle). It never reads a registry and never draws from the rng.
 */
export type {
  Humor, HobbyState, LifeMode, LifeState, LifeUnit, NewsItem, Opinion, Talkativeness, Temperament, Volatility,
} from '../state/types';

export const LIFE_MODES: readonly LifeMode[] = ['off', 'rare', 'normal', 'often'];

/** The setting `lifeEvents`: absent or invalid = off (an old save, or a test campaign, picks, practises, queues and forms nothing). */
export function lifeMode(state: Pick<CampaignState, 'settings'>): LifeMode {
  const m = state.settings.lifeEvents;
  return m === 'rare' || m === 'normal' || m === 'often' ? m : 'off';
}

/** What she is when nothing is stored (and what a grunt or an unknown id reads). */
export const TEMPERAMENT_DEFAULTS: Readonly<Temperament> = Object.freeze({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' });

/** Her temperament: the stored fields over the defaults. The only reader of `Unit.temperament` outside the setup and the actions. */
export function temperamentOf(state: Pick<CampaignState, 'squad'>, unitId: string): Temperament {
  const u = state.squad.find((x) => x.id === unitId);
  return { ...TEMPERAMENT_DEFAULTS, ...(u?.kind === 'named' ? u.temperament : undefined) };
}

/** Her life block, or null while there is none (never written back). */
export function lifeOf(state: Pick<CampaignState, 'life'>): Readonly<LifeState> | null {
  return state.life ?? null;
}

/** A new, empty block with this salt. */
export function newLife(salt: number): LifeState {
  return { salt, nextId: 0, units: {}, queue: [], delivered: [], outbox: [], news: [], kinds: [], deaths: [], busy: [] };
}

/**
 * Writes the block on first use and returns the stored one. A block made here takes its salt from a hash of the rng as it stands
 * (deterministic; nothing is drawn). The setup and `life/set_frequency` decide the salt themselves.
 */
export function ensureLife(draft: Pick<CampaignState, 'life' | 'rng'>): LifeState {
  return (draft.life ??= newLife(fnv1a(JSON.stringify(draft.rng))));
}

/** The next id of the news queue: `ln<n>`. */
export function nextLifeId(life: Pick<LifeState, 'nextId'>, prefix: 'ln'): string {
  const n = life.nextId;
  life.nextId = n + 1;
  return `${prefix}${n}`;
}

/** FNV-1a, 32 bit: the same function as `hub.ts`'s (a test pins them together); copied because a leaf imports no module of the engine. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A stable number from the salt and a key; the source of every pick (`% n` over a list in registry order). */
export function lifeHash(life: Pick<LifeState, 'salt'>, key: string): number {
  return fnv1a(`${life.salt}|${key}`);
}

/** A stable yes/no with probability `p` (thousandths): the same salt and key always answer the same. */
export function lifeChance(life: Pick<LifeState, 'salt'>, key: string, p: number): boolean {
  return lifeHash(life, key) % 1000 < Math.round(p * 1000);
}
