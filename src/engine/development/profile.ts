import { bondOf } from '../bonds/profile';
import type { Unit } from '../state/types';

/**
 * The effective profile (P14b): what she was imported with plus what she has become. Every engine and model-input reader of a
 * profile field goes through these (`tests/development/readers.test.ts` enforces it); the raw imported fields stay as imported and
 * only setup, re-sync and import code reads them, each such line marked with `RAW_MARK`.
 */
export const RAW_MARK = '// P14b: raw profile';

const clamp3 = (n: number): number => Math.min(3, Math.max(-3, n));

/** Her values: the import plus the whole steps of her drift (`trunc(drift)`), each clamped to −3…3. Without drift it is the stored object. */
export function valuesOf(unit: Pick<Unit, 'values' | 'development'>): Unit['values'] {
  const drift = unit.development?.drift;
  if (!drift) return unit.values;
  let out: Unit['values'] | null = null;
  for (const axis of Object.keys(drift) as Array<keyof Unit['values']>) {
    const step = Math.trunc(drift[axis] ?? 0);
    if (step === 0) continue;
    out ??= { ...unit.values };
    out[axis] = clamp3(unit.values[axis] + step);
  }
  return out ?? unit.values;
}

type Listed = 'likes' | 'dislikes' | 'tastes';
function listed(base: readonly string[], dev: Unit['development'], field: Listed): string[] {
  const lost = dev?.lost?.[field];
  const gained = dev?.gained?.[field];
  if (!lost?.length && !gained?.length) return base as string[];
  const out = base.filter((t) => !lost?.includes(t));
  for (const t of gained ?? []) if (!out.includes(t)) out.push(t);
  return out;
}

/** Her likes: the import minus what she lost, plus what she gained (import order first, no repeats). */
export const likesOf = (unit: Pick<Unit, 'likes' | 'development'>): string[] => listed(unit.likes, unit.development, 'likes');
export const dislikesOf = (unit: Pick<Unit, 'dislikes' | 'development'>): string[] => listed(unit.dislikes, unit.development, 'dislikes');
/** Her taste ids (P7): the import, with the ones she lost removed and the ones she gained added. */
export const tastesOf = (unit: Pick<Unit, 'commanderTastes' | 'development'>): string[] => listed(unit.commanderTastes ?? [], unit.development, 'tastes');

export function effectiveProfile(unit: Pick<Unit, 'kind' | 'values' | 'likes' | 'dislikes' | 'commanderTastes' | 'bond' | 'development'>) {
  return {
    values: valuesOf(unit), likes: likesOf(unit), dislikes: dislikesOf(unit), tastes: tastesOf(unit),
    bond: bondOf(unit),
  };
}
