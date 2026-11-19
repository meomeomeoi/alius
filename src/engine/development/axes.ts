import type { Registries } from '../../content/types';
import type { AxisKind, DevelopmentAxisEntry } from './types';

/** The kind of an axis key (`value:mercy`, `like:tech`, `like:*`, `like:{tag}`), or null for anything else. */
export function axisKind(key: string): AxisKind | null {
  const i = key.indexOf(':');
  if (i <= 0 || i === key.length - 1) return null;
  const kind = key.slice(0, i);
  return kind === 'value' || kind === 'bond' || kind === 'taste' || kind === 'like' || kind === 'dislike' ? kind : null;
}

/** The wildcard of a kind: its id in `developmentAxes` (a dot cannot be part of a normalized tag, so it never clashes with one). */
export const WILDCARD = '.any';

/** The `Bond` field of a bond axis key (`bond:lead_style` → `leadStyle`); null for any other key. Registry ids are snake case. */
export function bondField(key: string): 'attachment' | 'desire' | 'caretaker' | 'leadStyle' | null {
  switch (key) {
    case 'bond:attachment': return 'attachment';
    case 'bond:desire': return 'desire';
    case 'bond:caretaker': return 'caretaker';
    case 'bond:lead_style': return 'leadStyle';
    default: return null;
  }
}

/** The registry entry of an axis key: the exact id first, then the kind's wildcard (`<kind>:.any`). Read by `kind`, never by an id list. */
export function axisEntry(reg: Pick<Registries, 'developmentAxes'>, key: string): DevelopmentAxisEntry | null {
  const exact = reg.developmentAxes.get(key);
  if (exact) return exact as unknown as DevelopmentAxisEntry;
  const kind = axisKind(key);
  const wild = kind ? reg.developmentAxes.get(`${kind}:${WILDCARD}`) : undefined;
  return (wild as unknown as DevelopmentAxisEntry | undefined) ?? null;
}
