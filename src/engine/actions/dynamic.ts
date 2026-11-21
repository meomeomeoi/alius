import { MODEST_BOND } from '../bonds/profile';
import { registerAction } from '../dispatch';
import { validatePractice } from '../dynamic/profile';
import { PRACTICE_LOCK_FIELDS } from '../dynamic/types';
import type { Unit } from '../state/types';

// Importing this module registers the actions of the dynamic (P15): the practice and expectation profile edits first, the dynamic's own later.

/** A named unit by id, or a refusal: a practice and an expectation profile are a named soldier's (grunts have none). */
export function namedUnit(draft: { squad: Unit[] }, id: unknown, action: string): Unit {
  const unit = typeof id === 'string' ? draft.squad.find((u) => u.id === id) : undefined;
  if (!unit || unit.kind !== 'named') throw new Error(`${action} needs a named unit.`);
  return unit;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The lock names a patch touches: its top-level fields, and `categories.<id>` for each category it names. */
function patchedFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).flatMap((k) => (k === 'categories' && isObj(patch.categories) ? Object.keys(patch.categories).map((id) => `categories.${id}`) : [k]));
}

/**
 * `profile/set_practice { unitId, practice }`: `practice` holds some of her fields; the rest keep their values. `categories` holds only the
 * categories to change, each with some of `as` / `witness`; `style` holds `primary` and / or `secondary` (null drops the secondary). A
 * field in her locks refuses the whole set ("That field is locked."). The merged result must be a legal section, else the set is refused
 * with what is wrong. The engine never checks the edit lock: the UI gates the edit on it.
 */
registerAction('profile/set_practice', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; practice?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_practice');
  if (!isObj(p?.practice) || Object.keys(p.practice).length === 0) throw new Error('profile/set_practice needs at least one field.');
  const patch = p.practice;
  const unknown = Object.keys(patch).filter((k) => !(['categories', 'style', 'audience', 'inclination', 'fairness', 'hintStyle', 'drive'] as string[]).includes(k));
  if (unknown.length > 0) throw new Error(`A practice has no field "${unknown[0]}".`);
  const locked = unit.practiceLocks ?? [];
  if (patchedFields(patch).some((f) => locked.includes(f))) throw new Error('That field is locked.');
  const have = unit.bond?.practice;
  const merged: Record<string, unknown> = {
    ...have,
    ...patch,
    categories: { ...have?.categories, ...(isObj(patch.categories) ? Object.fromEntries(Object.entries(patch.categories).map(([id, c]) => [id, { ...have?.categories[id], ...(isObj(c) ? c : {}) }])) : {}) },
    style: isObj(patch.style) ? Object.fromEntries(Object.entries({ ...have?.style, ...patch.style }).filter(([, v]) => v !== null)) : have?.style,
  };
  const read = validatePractice(merged, ctx.registries);
  if (read.practice === undefined || read.issues.length > 0) throw new Error(read.issues.length > 0 ? read.issues.join('; ') : 'A practice needs a primary style.');
  if (unit.bond === undefined) unit.bond = { ...MODEST_BOND, ownLimits: { categories: [] } };
  unit.bond.practice = read.practice;
  return [];
});

/** `profile/lock_practice { unitId, field, on }`: a locked field is kept by a re-sync and by drift, and shows a padlock. A field is one of `PRACTICE_LOCK_FIELDS` or `categories.<id>`. */
registerAction('profile/lock_practice', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; field?: unknown; on?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/lock_practice');
  const field = typeof p?.field === 'string' ? p.field : '';
  const category = field.startsWith('categories.') ? field.slice('categories.'.length) : undefined;
  if (!(PRACTICE_LOCK_FIELDS as readonly string[]).includes(field) && !(category !== undefined && ctx.registries.contentCategories.has(category))) {
    throw new Error(`A practice field is ${PRACTICE_LOCK_FIELDS.join(', ')} or categories.<id>.`);
  }
  if (typeof p?.on !== 'boolean') throw new Error('profile/lock_practice needs on: true or false.');
  const locks = (unit.practiceLocks ?? []).filter((f) => f !== field);
  if (p.on) locks.push(field);
  if (locks.length > 0) unit.practiceLocks = locks;
  else delete unit.practiceLocks;
  return [];
});

