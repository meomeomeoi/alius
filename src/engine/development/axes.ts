import type { Registries } from '../../content/types';
import { tagsOf } from '../bonds/content';
import { lockedExpectation } from '../dynamic/expectations';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import type { AxisKind, DevelopmentAxisEntry } from './types';
import { mannerEntryId, mannerKey } from './mannerKeys';

/** The kind of an axis key (`value:mercy`, `like:tech`, `like:*`, `like:{tag}`), or null for anything else. */
export function axisKind(key: string): AxisKind | null {
  const i = key.indexOf(':');
  if (i <= 0 || i === key.length - 1) return null;
  const kind = key.slice(0, i);
  return kind === 'value' || kind === 'bond' || kind === 'taste' || kind === 'like' || kind === 'dislike' || kind === 'practice' || kind === 'expect' || kind === 'manner' ? kind : null;
}

/**
 * The parts of a practice or expectation key (P15): `practice:<category>.as`, `practice:<category>.witness`, `practice:style.secondary`,
 * `expect:holds_until`, `expect:worship.<target>`. `fixed` is a field that never drifts (fairness, hint style, drive: spec §16.7). Null for
 * anything else, a wildcard included.
 */
export type DynamicAxis =
  | { kind: 'practice'; field: 'as' | 'witness'; category: string }
  | { kind: 'practice'; field: 'secondary' }
  | { kind: 'practice'; field: 'fixed'; name: string }
  | { kind: 'expect'; field: 'holds_until' }
  | { kind: 'expect'; field: 'worship'; target: string };

export function dynamicAxis(key: string): DynamicAxis | null {
  if (key.startsWith('practice:')) {
    const name = key.slice('practice:'.length);
    if (name === 'style.secondary') return { kind: 'practice', field: 'secondary' };
    if (name === 'fairness' || name === 'hint_style' || name === 'drive') return { kind: 'practice', field: 'fixed', name };
    const m = /^([a-z0-9_-]+)\.(as|witness)$/.exec(name);
    return m ? { kind: 'practice', field: m[2] as 'as' | 'witness', category: m[1] } : null;
  }
  if (key.startsWith('expect:')) {
    const name = key.slice('expect:'.length);
    if (name === 'holds_until') return { kind: 'expect', field: 'holds_until' };
    const m = /^worship\.([a-z0-9_-]+)$/.exec(name);
    return m ? { kind: 'expect', field: 'worship', target: m[1] } : null;
  }
  return null;
}

/** The registry id that words a practice or expectation axis (the wildcard of its field, or its own id), or null when none does (a fixed field, a bad key). */
export function dynamicAxisEntryId(d: DynamicAxis | null): string | null {
  if (d === null) return null;
  if (d.kind === 'practice') return d.field === 'as' || d.field === 'witness' ? `practice:.any.${d.field}` : d.field === 'secondary' ? 'practice:style.secondary' : null;
  return d.field === 'holds_until' ? 'expect:holds_until' : 'expect:worship.any';
}

/** The ordered scale (low to high) of a discrete axis, or null: the bond fields (P14b) and the practice and expectation fields (P15). The secondary style's scale is the whole list; `discreteAxis` takes her primary out. */
export function scaleOfAxis(key: string): readonly (string | boolean)[] | null {
  const S = TUNING.development.scales;
  const field = bondField(key);
  if (field !== null) return S[field];
  const d = dynamicAxis(key);
  if (d === null || d.field === 'fixed') return null;
  if (d.kind === 'practice') return d.field === 'as' ? S.practiceAs : d.field === 'witness' ? S.practiceWitness : S.secondary;
  return d.field === 'holds_until' ? S.holdsUntil : S.attitude;
}

/**
 * Where a discrete axis (a bond field, a practice field, an expectation field) stands for a unit: its ordered scale, the word she was
 * imported with and the word she has now. Null when the unit has nothing on it (no bond, no practice, no stated word). Pure.
 */
export function discreteAxis(
  unit: Pick<Unit, 'bond' | 'expectations' | 'development'>, key: string,
): { scale: readonly (string | boolean)[]; imported: string | boolean; now: string | boolean } | null {
  const scale = scaleOfAxis(key);
  if (scale === null) return null;
  const dev = unit.development;
  const field = bondField(key);
  if (field !== null) {
    if (unit.bond === undefined) return null; // P14b: raw profile
    const imported = unit.bond[field]; // P14b: raw profile
    return { scale, imported, now: dev?.bond?.[field] ?? imported };
  }
  const d = dynamicAxis(key);
  if (d === null || d.field === 'fixed') return null;
  if (d.kind === 'practice') {
    const practice = unit.bond?.practice; // P14b: raw profile
    if (practice === undefined) return null;
    if (d.field === 'secondary') {
      const imported = practice.style.secondary;
      return imported === undefined ? null : { scale: scale.filter((x) => x !== practice.style.primary), imported, now: dev?.practice?.secondary ?? imported };
    }
    const imported = practice.categories[d.category]?.[d.field] ?? (d.field === 'as' ? 'none' : 'indifferent');
    return { scale, imported, now: dev?.practice?.categories?.[d.category]?.[d.field] ?? imported };
  }
  const profile = unit.expectations;
  if (profile === undefined) return null;
  if (d.field === 'holds_until') return profile.holdsUntil === undefined ? null : { scale, imported: profile.holdsUntil, now: dev?.expect?.holdsUntil ?? profile.holdsUntil };
  const imported = profile.worship?.[d.target]?.attitude;
  return imported === undefined ? null : { scale, imported, now: dev?.expect?.worship?.[d.target] ?? imported };
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
  if (kind === 'manner') {
    const id = mannerEntryId(key); // P15b: `manner:drawn_by.<kind>` is worded by `manner:drawn_by`
    return id === null ? null : ((reg.developmentAxes.get(id) as unknown as DevelopmentAxisEntry | undefined) ?? null);
  }
  if (kind === 'practice' || kind === 'expect') {
    const id = dynamicAxisEntryId(dynamicAxis(key));
    return id === null ? null : ((reg.developmentAxes.get(id) as unknown as DevelopmentAxisEntry | undefined) ?? null);
  }
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
  state: Pick<CampaignState, 'settings' | 'content'>, reg: Pick<Registries, 'developmentAxes' | 'tastes' | 'contentCategories' | 'worshipTargets'>, unit: Pick<Unit, 'kind' | 'bond' | 'development' | 'expectations' | 'practiceLocks' | 'expectationLocks'>, key: string,
): string | null {
  const kind = axisKind(key);
  const dyn = kind === 'practice' || kind === 'expect' ? dynamicAxis(key) : null;
  if (dyn?.field === 'fixed') return 'her fairness, hint style and drive never drift';
  if (kind === null || axisEntry(reg, key) === null) return `"${key}" is not an axis`;
  if (unit.kind !== 'named') return 'a grunt does not develop';
  if (kind === 'manner') return mannerForbidden(unit, key);
  if (kind === 'bond' && (bondField(key) === null || unit.bond === undefined)) return 'bond axes need an imported bond'; // P14b: raw profile
  if (kind === 'taste' && !reg.tastes.has(key.slice('taste:'.length))) return `"${key}" names no taste`;
  if (unit.development?.held?.includes(key) === true) return 'held by the player';
  if (dyn !== null) return dynamicAxisForbidden(state, reg, unit, dyn);
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

/**
 * Why a manner axis cannot drift for this unit (P15b), or null: she has no imported manner, or the field is locked (the six axes by `manner`, what draws her by `drawnBy`, a turn by `style` and
 * `manner` both, because a turn rebases the axes). The pace and the support are the proposals' business (`mannerProposals`).
 */
function mannerForbidden(unit: Pick<Unit, 'bond' | 'practiceLocks'>, key: string): string | null {
  const k = mannerKey(key);
  if (k === null) return `"${key}" is not a manner axis`;
  if (unit.bond?.practice?.manner === undefined) return 'manner axes need an imported manner'; // P14b: raw profile
  const locks = unit.practiceLocks ?? [];
  const fields = k.kind === 'axis' ? ['manner'] : k.kind === 'drawn_by' ? ['drawnBy'] : ['style', 'manner'];
  return fields.some((f) => locks.includes(f)) ? 'locked by the player' : null;
}

/** Why a practice or expectation axis cannot drift for this unit (P15), or null: nothing imported on it, a field the player locked, a category that is off or among her limits, a worship target that is closed. */
function dynamicAxisForbidden(
  state: Pick<CampaignState, 'content'>, reg: Pick<Registries, 'contentCategories' | 'worshipTargets'>,
  unit: Pick<Unit, 'bond' | 'expectations' | 'practiceLocks' | 'expectationLocks'>, d: DynamicAxis,
): string | null {
  const on = state.content?.enabled ?? [];
  const limits = unit.bond?.ownLimits.categories ?? [];
  if (d.kind === 'practice') {
    const practice = unit.bond?.practice;
    if (practice === undefined) return 'practice axes need an imported practice';
    const locks = unit.practiceLocks ?? [];
    if (d.field === 'secondary') {
      if (practice.style.secondary === undefined) return 'she has no secondary style to drift';
      return locks.includes('style') ? 'locked by the player' : null;
    }
    if (d.field === 'fixed') return 'her fairness, hint style and drive never drift';
    if (!reg.contentCategories.has(d.category)) return `"${d.category}" is no content category`;
    if (!on.includes(d.category) || limits.includes(d.category)) return 'a disabled or limited content category';
    return locks.includes(`categories.${d.category}`) ? 'locked by the player' : null;
  }
  if (unit.expectations === undefined) return 'expectation axes need an imported profile';
  const locked = (field: string): boolean => lockedExpectation(unit, field);
  if (d.field === 'holds_until') {
    if (unit.expectations.holdsUntil === undefined) return 'she has stated no limit to drift';
    return locked('holdsUntil') ? 'locked by the player' : null;
  }
  const target = reg.worshipTargets.get(d.target);
  if (target === undefined) return `"${d.target}" is no worship target`;
  if (locked(`worship.${d.target}`)) return 'locked by the player';
  if (unit.expectations.worship?.[d.target] === undefined) return 'she has no word on that target';
  if (tagsOf(target).some((t) => !on.includes(t) || limits.includes(t))) return 'a closed target';
  return null;
}

/** A tag as the import normalizes it (lowercase, `[a-z0-9 '_-]`, single spaces, trimmed, at most 32), without importing the setup module. */
const isTag = (s: string): boolean => s.length > 0 && s.length <= 32 && /^[a-z0-9'_-]+( [a-z0-9'_-]+)*$/.test(s);

/**
 * An anchor key as the import and a re-sync may give it, or null: a value or bond axis with an entry (the camelCase `bond:leadStyle`
 * is read as `bond:lead_style`), a taste of the registry, a like or a dislike with a normalized tag. Her limits and publicity have no
 * entry and are refused.
 */
export function anchorKey(reg: Pick<Registries, 'developmentAxes' | 'tastes' | 'contentCategories' | 'worshipTargets'>, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw === 'bond:leadStyle' ? 'bond:lead_style' : raw;
  const kind = axisKind(key);
  if (kind === null || kind === 'manner') return null; // P15b: her manner is never anchored (the card's own words are its axes)
  if (kind === 'practice' || kind === 'expect') {
    const d = dynamicAxis(key);
    if (d === null || d.field === 'fixed') return null;
    if (d.field === 'worship' && !reg.worshipTargets.has(d.target)) return null;
    if ((d.field === 'as' || d.field === 'witness') && !reg.contentCategories.has(d.category)) return null;
    return reg.developmentAxes.has(dynamicAxisEntryId(d)!) ? key : null;
  }
  const name = key.slice(kind.length + 1);
  if (kind === 'like' || kind === 'dislike') return reg.developmentAxes.has(`${kind}:${WILDCARD}`) && isTag(name) ? key : null;
  if (kind === 'taste') return reg.tastes.has(name) && reg.developmentAxes.has(`taste:${WILDCARD}`) ? key : null;
  return reg.developmentAxes.has(key) && name !== WILDCARD ? key : null;
}
