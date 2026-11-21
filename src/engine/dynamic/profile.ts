/**
 * P15: the practice section of the bond profile (plan R2, R5). `validatePractice` reads untrusted data field by field (an import, an edit, a
 * save); `practiceOf` is the only reader of `bond.practice` and folds in what the campaign switched off and what SHE would not do. A leaf
 * for the bonds layer: it imports no engine module, so `validateBond` can call it.
 */
import type { Registries } from '../../content/types';
import type { CampaignState, Unit } from '../state/types';
import {
  AUDIENCE, DRIVE, FAIRNESS, HINT_STYLE, INCLINATION, PRACTICE_AS, PROFILE_STYLES, WITNESS,
  type Practice, type PracticeCategory,
} from './types';

/** What a field reads when nothing legal is stored (R5). */
export const PRACTICE_DEFAULTS = Object.freeze({
  as: 'none', witness: 'indifferent', audience: 'indifferent', inclination: 'none', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
} as const);

/** What a category she does not practise reads. */
const NONE: PracticeCategory = Object.freeze({ as: 'none', witness: 'indifferent' }) as PracticeCategory;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The categories the dynamic is about: the ones a track names, once each, in registry order (R2). */
export function practiceCategories(reg: Registries): string[] {
  const out: string[] = [];
  for (const t of reg.dynamicTracks.values()) {
    const c = t.category;
    if (typeof c === 'string' && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Whether one of the categories the dynamic is about is among `enabled` (the content categories switched on). */
export function practiceEnabled(reg: Registries, enabled: readonly string[] | undefined): boolean {
  return enabled !== undefined && practiceCategories(reg).some((c) => enabled.includes(c));
}

/**
 * Reads a practice section from untrusted data. A field that is not legal falls back and is named in `issues`; an unknown category is
 * dropped (named in `dropped` as `practice:<id>` and in `issues`); a `secondary` equal to the `primary` is dropped; a missing or illegal
 * `style.primary` leaves no section at all (`practice` undefined: she never holds). Never throws.
 */
export function validatePractice(raw: unknown, reg: Registries): { practice?: Practice; issues: string[]; dropped: string[] } {
  const issues: string[] = [];
  const dropped: string[] = [];
  if (raw === undefined) return { issues, dropped };
  if (!isObj(raw)) return { issues: ['practice must be an object'], dropped };
  const pick = <T extends string>(field: string, allowed: readonly T[], fallback: T): T => {
    const v = raw[field];
    if (v === undefined) return fallback;
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    issues.push(`practice.${field} must be one of ${allowed.join(', ')}`);
    return fallback;
  };
  const style = raw.style;
  if (!isObj(style) || typeof style.primary !== 'string' || !(PROFILE_STYLES as readonly string[]).includes(style.primary)) {
    issues.push(`practice.style.primary must be one of ${PROFILE_STYLES.join(', ')}`);
    return { issues, dropped };
  }
  const primary = style.primary as Practice['style']['primary'];
  let secondary: Practice['style']['secondary'];
  if (style.secondary !== undefined) {
    if (typeof style.secondary !== 'string' || !(PROFILE_STYLES as readonly string[]).includes(style.secondary)) issues.push(`practice.style.secondary must be one of ${PROFILE_STYLES.join(', ')}`);
    else if (style.secondary === primary) issues.push('practice.style.secondary is the primary style and was dropped');
    else secondary = style.secondary as Practice['style']['secondary'];
  }
  const categories: Record<string, PracticeCategory> = {};
  if (raw.categories !== undefined) {
    if (!isObj(raw.categories)) issues.push('practice.categories must be an object');
    else {
      for (const [id, c] of Object.entries(raw.categories)) {
        if (!reg.contentCategories.has(id)) {
          issues.push(`practice names unknown content category "${id}"`);
          dropped.push(`practice:${id}`);
          continue;
        }
        const entry = isObj(c) ? c : {};
        if (!isObj(c)) issues.push(`practice.categories.${id} must be an object`);
        const as = entry.as === undefined ? PRACTICE_DEFAULTS.as : (PRACTICE_AS as readonly unknown[]).includes(entry.as) ? (entry.as as PracticeCategory['as']) : (issues.push(`practice.categories.${id}.as must be one of ${PRACTICE_AS.join(', ')}`), PRACTICE_DEFAULTS.as);
        const witness = entry.witness === undefined ? PRACTICE_DEFAULTS.witness : (WITNESS as readonly unknown[]).includes(entry.witness) ? (entry.witness as PracticeCategory['witness']) : (issues.push(`practice.categories.${id}.witness must be one of ${WITNESS.join(', ')}`), PRACTICE_DEFAULTS.witness);
        categories[id] = { as, witness };
      }
    }
  }
  const practice: Practice = {
    categories,
    style: secondary === undefined ? { primary } : { primary, secondary },
    audience: pick('audience', AUDIENCE, PRACTICE_DEFAULTS.audience),
    inclination: pick('inclination', INCLINATION, PRACTICE_DEFAULTS.inclination),
    fairness: pick('fairness', FAIRNESS, PRACTICE_DEFAULTS.fairness),
    hintStyle: pick('hintStyle', HINT_STYLE, PRACTICE_DEFAULTS.hintStyle),
    drive: pick('drive', DRIVE, PRACTICE_DEFAULTS.drive),
  };
  return { practice, issues, dropped };
}

/** The practice she has, with the categories that are off, or that she would not do, read as `none` / `indifferent`. `allowed` lists the ones that stand. */
export type PracticeView = Practice & { allowed: string[] };

/** A unit that left the squad (the same four as `isLiving`; copied so this module stays free of engine imports). */
const gone = (u: Pick<Unit, 'status'>): boolean => u.status === 'dead' || u.status === 'deserted' || u.status === 'terminated' || u.status === 'reassigned';

/**
 * Her practice as the campaign sees it: `null` for a grunt, a unit that left, or a named unit with no section. A category the campaign
 * switched off, or that is among her own limits, reads `none` / `indifferent` whatever is stored; switch it back on and the stored value
 * reads again (nothing is rewritten). Every practice category is present in the answer. What she has become (`development.practice`) is folded in.
 */
export function practiceOf(state: Pick<CampaignState, 'squad' | 'content'>, reg: Registries, unitId: string): PracticeView | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || gone(unit)) return null;
  const stored = unit.bond?.practice;
  if (stored === undefined) return null;
  const drift = unit.development?.practice; // P14b: what she has become sits on top of the import, as in `bondOf`
  const on = state.content?.enabled ?? [];
  const limits = unit.bond?.ownLimits.categories ?? [];
  const ids = [...new Set([...practiceCategories(reg), ...Object.keys(stored.categories)])];
  const categories: Record<string, PracticeCategory> = {};
  const allowed: string[] = [];
  for (const id of ids) {
    const open = on.includes(id) && !limits.includes(id);
    if (open) allowed.push(id);
    categories[id] = open ? { ...(stored.categories[id] ?? NONE), ...drift?.categories?.[id] } : { ...NONE };
  }
  return { ...stored, categories, style: styleOf(unit)!, allowed };
}

/**
 * Her style pair as the campaign reads it (what she has become sits on top of the import): `undefined` without a practice section. It
 * needs no registry, so the physics reader of the dynamic can use it.
 */
export function styleOf(unit: Pick<Unit, 'bond' | 'development'>): Practice['style'] | undefined {
  const stored = unit.bond?.practice?.style;
  if (stored === undefined) return undefined;
  const secondary = unit.development?.practice?.secondary ?? stored.secondary;
  return secondary === undefined ? { primary: stored.primary } : { primary: stored.primary, secondary };
}

/**
 * A re-import of the practice (a re-sync, a regenerate) keeps what she locked: a locked field of `old` replaces the same field of `next`
 * (`categories.<id>` is one category; a category the card no longer has is dropped unless it is locked). Pure; `next` is not changed.
 */
export function keepLockedPractice(old: Practice | undefined, next: Practice, locks: readonly string[]): Practice {
  const out = structuredClone(next);
  if (old === undefined) return out;
  for (const f of locks) {
    if (f.startsWith('categories.')) {
      const id = f.slice('categories.'.length);
      if (old.categories[id] !== undefined) out.categories[id] = { ...old.categories[id] };
      else delete out.categories[id];
    } else if (f in old) (out as unknown as Record<string, unknown>)[f] = structuredClone((old as unknown as Record<string, unknown>)[f]);
  }
  return out;
}

/**
 * The raw result of a patch on her practice (not yet validated): `categories` merges per id and per field, `style` per field (`null` drops
 * the secondary), every other field replaces. The one merge the action and the editors share; pass the result to `validatePractice`.
 */
export function mergePractice(have: Practice | undefined, patch: Record<string, unknown>): Record<string, unknown> {
  const cats = isObj(patch.categories) ? patch.categories : {};
  return {
    ...have,
    ...patch,
    categories: { ...have?.categories, ...Object.fromEntries(Object.entries(cats).map(([id, c]) => [id, { ...have?.categories[id], ...(isObj(c) ? c : {}) }])) },
    style: isObj(patch.style) ? Object.fromEntries(Object.entries({ ...have?.style, ...patch.style }).filter(([, v]) => v !== null)) : have?.style,
  };
}
