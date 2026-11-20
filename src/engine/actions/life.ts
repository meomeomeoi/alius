import { registerAction } from '../dispatch';
import { LIFE_MODES, TEMPERAMENT_FIELDS, ensureLife, temperamentOf, temperamentProblems } from '../life/state';
import type { LifeMode, Temperament, Unit } from '../state/types';

// Importing this module registers the actions of her life (P14c).

/**
 * `life/set_frequency { mode }`: the setting `lifeEvents`. The first time it is turned on, the block is made with the salt of every
 * chance (a hash of the rng as it stands; nothing is drawn). Turning it off keeps what was written (the facts, the hobbies, the opinions)
 * and stops every new pick, practice, queueing and opinion.
 */
registerAction('life/set_frequency', (draft, payload) => {
  const mode = (payload as { mode?: unknown } | undefined)?.mode;
  if (typeof mode !== 'string' || !LIFE_MODES.includes(mode as LifeMode)) throw new Error('Life events must be off, rare, normal or often.');
  draft.settings.lifeEvents = mode;
  if (mode !== 'off') ensureLife(draft);
  return [{ type: 'life_frequency_set', mode }];
});

/** A named unit by id, or a refusal: her temperament is a named soldier's (grunts have none). */
function namedUnit(draft: { squad: Unit[] }, id: unknown, action: string): Unit {
  const unit = typeof id === 'string' ? draft.squad.find((u) => u.id === id) : undefined;
  if (!unit || unit.kind !== 'named') throw new Error(`${action} needs a named unit.`);
  return unit;
}

/**
 * `profile/set_temperament { unitId, temperament }`: sets some of her three fields (the rest keep their words). A locked field refuses the
 * whole set. The engine never checks the edit lock: the UI gates the edit on it.
 */
registerAction('profile/set_temperament', (draft, payload) => {
  const p = payload as { unitId?: unknown; temperament?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_temperament');
  const problems = temperamentProblems(p?.temperament);
  if (problems.length > 0) throw new Error(problems.join('; '));
  const patch = p?.temperament as Partial<Temperament>;
  const fields = Object.keys(patch) as Array<keyof Temperament>;
  if (fields.length === 0) throw new Error('profile/set_temperament needs at least one field.');
  const locked = unit.temperamentLocks ?? [];
  if (fields.some((f) => locked.includes(f))) throw new Error('That trait is locked.');
  unit.temperament = { ...temperamentOf(draft, unit.id), ...patch };
  return [{ type: 'temperament_set', unitId: unit.id, temperament: { ...unit.temperament }, locks: [...locked] }];
});

/** `profile/lock_temperament { unitId, field, on }`: a locked field is kept by a re-sync and by any future drift, and shows a padlock. */
registerAction('profile/lock_temperament', (draft, payload) => {
  const p = payload as { unitId?: unknown; field?: unknown; on?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/lock_temperament');
  const field = (TEMPERAMENT_FIELDS as readonly unknown[]).includes(p?.field) ? (p?.field as keyof Temperament) : undefined;
  if (field === undefined) throw new Error(`A temperament field is ${TEMPERAMENT_FIELDS.join(', ')}.`);
  if (typeof p?.on !== 'boolean') throw new Error('profile/lock_temperament needs on: true or false.');
  const locks = (unit.temperamentLocks ?? []).filter((f) => f !== field);
  if (p.on) locks.push(field);
  if (locks.length > 0) unit.temperamentLocks = locks;
  else delete unit.temperamentLocks;
  return [{ type: 'temperament_set', unitId: unit.id, temperament: temperamentOf(draft, unit.id), locks: [...locks] }];
});
