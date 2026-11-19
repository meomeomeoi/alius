import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../state/types';
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

/** An axis the unit's card states strongly (from the import): it moves slower and stays closer to the base. */
export function isAnchored(unit: Pick<Unit, 'development'>, key: string): boolean {
  return unit.development?.anchors.includes(key) === true;
}

/**
 * Why an axis can take no push, shift or step for this unit, or null. Never drifts: a grunt's anything (counters and habits aside),
 * the bond fields of a unit without an imported bond, an axis the player froze, and anything no entry words (her own limits and
 * her publicity preference have no entry). Disabled content categories are the callers' business (they gate rules, habits and tags).
 */
export function axisForbidden(
  state: Pick<CampaignState, 'settings' | 'content'>, reg: Pick<Registries, 'developmentAxes' | 'tastes' | 'contentCategories'>, unit: Pick<Unit, 'kind' | 'bond' | 'development'>, key: string,
): string | null {
  const kind = axisKind(key);
  if (kind === null || axisEntry(reg, key) === null) return `"${key}" is not an axis`;
  if (unit.kind !== 'named') return 'a grunt does not develop';
  if (kind === 'bond' && (bondField(key) === null || unit.bond === undefined)) return 'bond axes need an imported bond'; // P14b: raw profile
  if (kind === 'taste' && !reg.tastes.has(key.slice('taste:'.length))) return `"${key}" names no taste`;
  if (unit.development?.held?.includes(key) === true) return 'held by the player';
  if (kind === 'like' || kind === 'dislike') {
    // a tag that is a content category (its id or its label) never develops while the category is off, or when it is among HER limits
    const tag = key.slice(kind.length + 1);
    const on = state.content?.enabled ?? [];
    const limits = unit.bond?.ownLimits.categories ?? [];
    for (const c of reg.contentCategories.values()) {
      const id = String(c.id);
      if (tag !== id.replace(/_/g, ' ') && tag !== id && tag !== String(c.label).toLowerCase()) continue;
      if (!on.includes(id) || limits.includes(id)) return 'a disabled or limited content category';
    }
  }
  return null;
}

/** A tag as the import normalizes it (lowercase, `[a-z0-9 '_-]`, single spaces, trimmed, at most 32), without importing the setup module. */
const isTag = (s: string): boolean => s.length > 0 && s.length <= 32 && /^[a-z0-9'_-]+( [a-z0-9'_-]+)*$/.test(s);

/**
 * An anchor key as the import and a re-sync may give it, or null: a value or bond axis with an entry (the camelCase `bond:leadStyle`
 * is read as `bond:lead_style`), a taste of the registry, a like or a dislike with a normalized tag. Her limits and publicity have no
 * entry and are refused.
 */
export function anchorKey(reg: Pick<Registries, 'developmentAxes' | 'tastes'>, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw === 'bond:leadStyle' ? 'bond:lead_style' : raw;
  const kind = axisKind(key);
  if (kind === null) return null;
  const name = key.slice(kind.length + 1);
  if (kind === 'like' || kind === 'dislike') return reg.developmentAxes.has(`${kind}:${WILDCARD}`) && isTag(name) ? key : null;
  if (kind === 'taste') return reg.tastes.has(name) && reg.developmentAxes.has(`taste:${WILDCARD}`) ? key : null;
  return reg.developmentAxes.has(key) && name !== WILDCARD ? key : null;
}
