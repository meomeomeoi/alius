import { registerAction } from '../dispatch';
import { newHobby, seedLife } from '../life/hobbies';
import { LIFE_MODES, TEMPERAMENT_FIELDS, ensureLife, lifeMode, temperamentOf, temperamentProblems } from '../life/state';
import type { OpinionTopicEntry } from '../life/types';
import { aptitudeProblems } from '../setup';
import { TUNING } from '../tuning';
import type { LifeMode, Opinion, Temperament, Unit } from '../state/types';

// Importing this module registers the actions of her life (P14c).

/**
 * `life/set_frequency { mode }`: the setting `lifeEvents`. The first time it is turned on, the block is made with the salt of every
 * chance (a hash of the rng as it stands; nothing is drawn). Turning it off keeps what was written (the facts, the hobbies, the opinions)
 * and stops every new pick, practice, queueing and opinion.
 */
registerAction('life/set_frequency', (draft, payload, ctx) => {
  const mode = (payload as { mode?: unknown } | undefined)?.mode;
  if (typeof mode !== 'string' || !LIFE_MODES.includes(mode as LifeMode)) throw new Error('Life events must be off, rare, normal or often.');
  const wasOff = lifeMode(draft) === 'off';
  draft.settings.lifeEvents = mode;
  if (mode !== 'off') ensureLife(draft);
  // the hobbies she starts with get their starting skill the first time life is on (the same call that seeds a built campaign)
  if (wasOff && mode !== 'off') seedLife(draft, ctx.registries);
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

/**
 * `profile/set_hobbies { unitId, hobbies, aptitudes? }`: `hobbies` is the list she should have. A hobby she has keeps all its progress, a new one
 * starts at skill 0 (active, with the novelty interest), and one that is not listed goes. At most three may be active (`maxActive`; a cooling
 * or dropped one does not count). `aptitudes` (at most 3 high and 3 low, none in both) replace hers; absent keeps them. The engine never checks
 * the edit lock: the UI gates the edit on it.
 */
registerAction('profile/set_hobbies', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; hobbies?: unknown; aptitudes?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_hobbies');
  if (!Array.isArray(p?.hobbies)) throw new Error('profile/set_hobbies needs a list of hobbies.');
  const ids = p.hobbies as unknown[];
  for (const id of ids) if (typeof id !== 'string' || !ctx.registries.hobbies.has(id)) throw new Error(`Unknown hobby "${String(id)}".`);
  if (new Set(ids).size !== ids.length) throw new Error('A hobby is listed twice.');
  const have = unit.hobbies ?? [];
  const next = (ids as string[]).map((id) => have.find((h) => h.id === id) ?? newHobby(id, draft.day));
  if (next.filter((h) => h.state === 'active').length > TUNING.life.maxActive) throw new Error(`At most ${TUNING.life.maxActive} hobbies can be active at once.`);
  if (p.aptitudes !== undefined) {
    const problems = aptitudeProblems(p.aptitudes, ctx.registries);
    if (problems.length > 0) throw new Error(problems.join('; '));
  }
  if (next.length > 0) unit.hobbies = next;
  else delete unit.hobbies;
  if (p.aptitudes !== undefined) {
    const a = p.aptitudes as { high: string[]; low: string[] };
    if (a.high.length > 0 || a.low.length > 0) unit.aptitudes = { high: [...a.high], low: [...a.low] };
    else delete unit.aptitudes;
  }
  return [{ type: 'hobbies_set', unitId: unit.id, hobbies: next.map((h) => h.id) }];
});

const STRENGTHS: readonly Opinion['strength'][] = ['strong', 'held', 'loose'];

/**
 * `profile/set_opinion { unitId, topicId, position, text?, strength? }`: sets or adds her opinion on a topic. The position must be one of the
 * topic's; the text is cut to 200 characters (an empty one clears it); a new opinion is `strong` unless a strength is given, an old one keeps
 * its strength. Moving the position by hand leaves no history and resets the pressure on it.
 */
registerAction('profile/set_opinion', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; topicId?: unknown; position?: unknown; text?: unknown; strength?: unknown } | undefined;
  const unit = namedUnit(draft, p?.unitId, 'profile/set_opinion');
  const topic = typeof p?.topicId === 'string' ? (ctx.registries.opinionTopics.get(p.topicId) as OpinionTopicEntry | undefined) : undefined;
  if (!topic) throw new Error(`Unknown opinion topic "${String(p?.topicId)}".`);
  if (typeof p?.position !== 'string' || !topic.positions.some((x) => x.id === p.position)) throw new Error(`Topic "${topic.id}" has no position "${String(p?.position)}".`);
  if (p.text !== undefined && typeof p.text !== 'string') throw new Error('The opinion text must be text.');
  if (p.strength !== undefined && !STRENGTHS.includes(p.strength as Opinion['strength'])) throw new Error('An opinion is strong, held or loose.');
  const opinions = (unit.opinions ??= {});
  const old = opinions[topic.id];
  const text = typeof p.text === 'string' ? p.text.trim().slice(0, TUNING.life.opinion.textMax) : old?.text;
  const next: Opinion = {
    ...old,
    position: p.position,
    strength: (p.strength as Opinion['strength'] | undefined) ?? old?.strength ?? 'strong',
    formedDay: old?.formedDay ?? draft.day,
  };
  if (text) next.text = text;
  else delete next.text;
  delete next.push;
  opinions[topic.id] = next;
  return [{ type: 'opinion_set', unitId: unit.id, topicId: topic.id, position: next.position }];
});

