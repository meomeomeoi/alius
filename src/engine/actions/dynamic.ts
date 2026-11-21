import { MODEST_BOND } from '../bonds/profile';
import { registerAction, type EngineEvent } from '../dispatch';
import { EXPECTATION_FIELDS, lockedExpectation, mergeExpectations, validateExpectations, type ExpectationProfile } from '../dynamic/expectations';
import { mergePractice, validatePractice } from '../dynamic/profile';
import { contentAllowed } from '../bonds/content';
import { registerDayEndStep } from '../calendar';
import { dynamicDayStep } from '../dynamic/dayStep';
import { holdFeed } from '../dynamic/feed';
import { installDynamicHooks } from '../dynamic/hooks';
import { holdReason } from '../dynamic/gate';
import { registerEventLanded } from '../relations/effects';
import { practiceEnabled } from '../dynamic/profile';
import { seedHold } from '../dynamic/seeds';
import { dynamicSaltOf, newDynamicCampaign } from '../dynamic/state';
import { FREQUENCIES, HOLDER_CAPS, MAY_HOLD, PACES, PRACTICE_LOCK_FIELDS, SENSITIVITIES } from '../dynamic/types';
import { TUNING } from '../tuning';
import type { Unit } from '../state/types';

// Importing this module registers the actions of the dynamic (P15): the practice and expectation profile edits first, the dynamic's own later.

/** A named unit by id, or a refusal: a practice and an expectation profile are a named soldier's (grunts have none). */
export function namedUnit(draft: { squad: Unit[] }, id: unknown, action: string): Unit {
  const unit = typeof id === 'string' ? draft.squad.find((u) => u.id === id) : undefined;
  if (!unit || unit.kind !== 'named') throw new Error(`${action} needs a named unit.`);
  return unit;
}

// A relation event that lands on a holder feeds her hold (R8); the hook is inert while the dynamic is off.
registerEventLanded(holdFeed);
// Her days (R8): decay, the slow term, tracks and favour; after her life's step (this module is imported after `actions/life`), and nothing while off.
registerDayEndStep('dm_rumors', dynamicDayStep);
// Her place in the P15a stand-ins: frame, live scenes, physics style, what she holds until, what she expects (R10); every reader is null while off.
installDynamicHooks();

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


// ---------------------------------------------------------------------------------------------
// The campaign setup of the dynamic (R3)

/**
 * `dynamic/set_setup { holders?, pace?, frequency?, seeds? }`: SYS, mid-campaign. The block is created here (a salt from the rng as it stands,
 * nothing drawn) while a practice category is on; with none on and no block, the call is refused. Lowering `holders` ends nothing: a holder
 * keeps her place, and only new probes, offers and milestones out of `equal` are gated by it. `seeds` is the full list of seeded units: a unit
 * newly in it must be able to hold (the cap aside) and gets the head start once; one that leaves it keeps what she has. Never a frame.
 */
registerAction('dynamic/set_setup', (draft, payload, ctx) => {
  const p = (payload ?? {}) as { holders?: unknown; pace?: unknown; frequency?: unknown; seeds?: unknown };
  if (p.holders !== undefined && !(HOLDER_CAPS as readonly unknown[]).includes(p.holders)) throw new Error('Holders must be 0, 1, 2, 3 or any.');
  if (p.pace !== undefined && !(PACES as readonly unknown[]).includes(p.pace)) throw new Error('The pace must be slow, normal or fast.');
  if (p.frequency !== undefined && !(FREQUENCIES as readonly unknown[]).includes(p.frequency)) throw new Error('The frequency must be rare, normal or often.');
  if (p.seeds !== undefined && (!Array.isArray(p.seeds) || p.seeds.some((id) => typeof id !== 'string'))) throw new Error('Seeds must be a list of unit ids.');
  const reg = ctx.registries;
  if (draft.dynamic === undefined) {
    if (!practiceEnabled(reg, draft.content?.enabled)) throw new Error('Switch a practice category on first: the dynamic needs one.');
    const d = TUNING.dynamic.defaults;
    draft.dynamic = newDynamicCampaign(dynamicSaltOf(draft.rng), { holders: d.holders, pace: d.pace, frequency: d.frequency, units: {} });
  }
  const setup = draft.dynamic.setup;
  if (p.holders !== undefined) setup.holders = p.holders as typeof setup.holders;
  if (p.pace !== undefined) setup.pace = p.pace as typeof setup.pace;
  if (p.frequency !== undefined) setup.frequency = p.frequency as typeof setup.frequency;
  const events: EngineEvent[] = [];
  if (p.seeds !== undefined) {
    const seeds = [...new Set(p.seeds as string[])];
    if (setup.holders !== 'any' && seeds.length > setup.holders) throw new Error(`At most ${setup.holders} seeded units (has ${seeds.length}).`);
    for (const id of seeds) {
      const unit = namedUnit(draft, id, 'dynamic/set_setup');
      const was = setup.units[id]?.seeded === true;
      const why = was ? null : holdReason(draft, reg, id, { ignoreCap: true, seeded: true });
      if (why !== null) throw new Error(`${unit.displayName} cannot hold: ${why}.`);
    }
    for (const [id, entry] of Object.entries(setup.units)) if (!seeds.includes(id) && entry.seeded) { delete entry.seeded; delete entry.startFrame; }
    for (const id of seeds) {
      const first = setup.units[id]?.seeded !== true;
      setup.units[id] = { ...setup.units[id], seeded: true };
      if (first) events.push(...seedHold(draft, reg, id));
    }
    for (const [id, entry] of Object.entries(setup.units)) if (Object.keys(entry).length === 0) delete setup.units[id];
  }
  return events;
});

/** `dynamic/set_unit { unitId, mayHold?, sensitivity? }`: what the setup says about one named unit (the spec's `dynamic/set_may_hold`, widened). Needs the block. */
registerAction('dynamic/set_unit', (draft, payload) => {
  const p = (payload ?? {}) as { unitId?: unknown; mayHold?: unknown; sensitivity?: unknown };
  const unit = namedUnit(draft, p.unitId, 'dynamic/set_unit');
  if (p.mayHold === undefined && p.sensitivity === undefined) throw new Error('dynamic/set_unit needs mayHold or sensitivity.');
  if (p.mayHold !== undefined && !(MAY_HOLD as readonly unknown[]).includes(p.mayHold)) throw new Error('May hold must be yes, no or auto.');
  if (p.sensitivity !== undefined && !(SENSITIVITIES as readonly unknown[]).includes(p.sensitivity)) throw new Error('Sensitivity must be sluggish, normal or lively.');
  if (draft.dynamic === undefined) throw new Error('The dynamic is not set up: use dynamic/set_setup first.');
  const entry = { ...draft.dynamic.setup.units[unit.id] };
  if (p.mayHold !== undefined) {
    if (p.mayHold === 'auto') delete entry.mayHold;
    else entry.mayHold = p.mayHold as typeof entry.mayHold;
  }
  if (p.sensitivity !== undefined) {
    if (p.sensitivity === 'normal') delete entry.sensitivity;
    else entry.sensitivity = p.sensitivity as typeof entry.sensitivity;
  }
  if (Object.keys(entry).length === 0) delete draft.dynamic.setup.units[unit.id];
  else draft.dynamic.setup.units[unit.id] = entry;
  return [];
});
