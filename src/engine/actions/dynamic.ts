import { MODEST_BOND } from '../bonds/profile';
import { registerAction } from '../dispatch';
import { EXPECTATION_FIELDS, lockedExpectation, mergeExpectations, validateExpectations, type ExpectationProfile } from '../dynamic/expectations';
import { mergePractice, validatePractice } from '../dynamic/profile';
import { contentAllowed } from '../bonds/content';
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
  const merged = mergePractice(unit.bond?.practice, patch);
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


// ---------------------------------------------------------------------------------------------
// The expectation profile

/** The lock names an expectation patch touches: `worship.<id>` and `moments.<id>` for those two fields, the top-level field for the rest. */
function expectationFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).flatMap((k) => ((k === 'worship' || k === 'moments') && isObj(patch[k]) ? Object.keys(patch[k] as object).map((id) => `${k}.${id}`) : [k]));
}

/**
 * `profile/set_expectation { unitId, patch }`: `patch` holds some fields of her profile; `worship` and `moments` merge per id, every other
 * field is replaced whole, and `null` removes a field or an id. A field in her locks refuses the whole set ("That field is locked."), a
 * worship target that is closed in this campaign is refused, and the merged result must be a legal profile. The engine never checks the edit
 * lock: the UI gates the edit on it.
 */
registerAction('profile/set_expectation', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; patch?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_expectation');
  if (!isObj(p?.patch) || Object.keys(p.patch).length === 0) throw new Error('profile/set_expectation needs at least one field.');
  const patch = p.patch;
  const unknown = Object.keys(patch).filter((k) => !(EXPECTATION_FIELDS as readonly string[]).includes(k));
  if (unknown.length > 0) throw new Error(`An expectation profile has no field "${unknown[0]}".`);
  if (expectationFields(patch).some((f) => lockedExpectation(unit, f))) throw new Error('That field is locked.');
  const merged = mergeExpectations(unit.expectations, patch);
  const read = validateExpectations(merged, ctx.registries, { unitId: unit.id });
  if (read.issues.length > 0) throw new Error(read.issues.join('; '));
  if (isObj(patch.worship)) {
    for (const [id, entry] of Object.entries(patch.worship)) {
      const target = ctx.registries.worshipTargets.get(id);
      if (entry !== null && target !== undefined && !contentAllowed(draft, ctx.registries, target, unit.id)) throw new Error(`"${target.label ?? id}" is closed in this campaign.`);
    }
  }
  if (read.expectations === undefined) delete unit.expectations;
  else unit.expectations = read.expectations as ExpectationProfile;
  return [];
});

/** `profile/lock_expectation { unitId, field, on }`: a field is a top-level field, `worship.<targetId>` or `moments.<sourceId>`. A locked field is kept by a re-sync and by drift. */
registerAction('profile/lock_expectation', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; field?: unknown; on?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/lock_expectation');
  const field = typeof p?.field === 'string' ? p.field : '';
  const [head, id] = field.split('.');
  const known = (EXPECTATION_FIELDS as readonly string[]).includes(head)
    && (id === undefined || (head === 'worship' && ctx.registries.worshipTargets.has(id)) || (head === 'moments' && ctx.registries.momentSources.has(id)));
  if (!known) throw new Error(`An expectation field is ${EXPECTATION_FIELDS.join(', ')}, worship.<target> or moments.<source>.`);
  if (typeof p?.on !== 'boolean') throw new Error('profile/lock_expectation needs on: true or false.');
  const locks = (unit.expectationLocks ?? []).filter((f) => f !== field);
  if (p.on) locks.push(field);
  if (locks.length > 0) unit.expectationLocks = locks;
  else delete unit.expectationLocks;
  return [];
});
