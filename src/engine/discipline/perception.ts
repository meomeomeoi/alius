import type { Entry, Registries } from '../../content/types';
import type { Unit } from '../state/types';
import { dislikesOf, likesOf } from '../development/profile';

/** The registry entry of a measure, or `undefined` for `leash`, `unspecified`, a missing key and a punishment the pack no longer has. */
export const punishmentFor = (reg: Registries, measure: string | undefined): Entry | undefined => (measure === undefined ? undefined : reg.punishments.get(measure));

/**
 * How much harder a punishment lands on her (and how much more it deters): the highest multiplier among the perception
 * entries whose tag is one of her likes, dislikes or triggers; 1 when none matches.
 */
export function perceptionOf(_reg: Registries, unit: Pick<Unit, 'likes' | 'dislikes' | 'triggers'>, punishment: Entry): number {
  const owned = new Set([...likesOf(unit), ...dislikesOf(unit), ...unit.triggers]);
  let best: number | undefined;
  for (const p of (punishment.perception as Array<{ tag: string; multiplier: number }> | undefined) ?? []) {
    if (owned.has(p.tag) && (best === undefined || p.multiplier > best)) best = p.multiplier;
  }
  return best ?? 1;
}
