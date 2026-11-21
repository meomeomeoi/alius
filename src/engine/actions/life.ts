import { isLiving } from '../economy';
import { registerActivityHook, runActivity } from '../activities';
import { registerDayEndStep } from '../calendar';
import { registerAction, runHandler } from '../dispatch';
import { closeNews } from '../life/news';
import { leaveLifeNote } from '../notes/write';
import { lifeDayStep, noteBusy, recordDeaths } from '../life/dayStep';
import { newHobby, seedLife } from '../life/hobbies';
import { LIFE_MODES, TEMPERAMENT_FIELDS, ensureLife, temperamentOf, temperamentProblems } from '../life/state';
import { pastimeLocation, pastimeProblem } from '../life/meetings';
import { formOpinion, triggerTopics } from '../life/opinions';
import { pastimeActivity, type OpinionTopicEntry, type PastimeEntry } from '../life/types';
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
  const first = draft.life === undefined && mode !== 'off';
  draft.settings.lifeEvents = mode;
  if (mode !== 'off') ensureLife(draft);
  if (first) {
    // life exists from now on: the hobbies she starts with get their starting skill (only this once, so a hobby taken up since is never one),
    // and whoever was already dead is not a recent death
    recordDeaths(draft, true);
    seedLife(draft, ctx.registries);
  }
  return [{ type: 'life_frequency_set', mode }];
});

// Her days off-screen (P14c): the day step runs after development's (this module is imported after `actions/development`), and with life off it does nothing.
registerDayEndStep('dm_rumors', lifeDayStep);

// A companion, and the roster of an activity that works on the roster (`rest`, `mess`: an effect with `target: 'roster'`), are with the commander this slot.
registerActivityHook((draft, ctx, done) => {
  const activity = ctx.registries.activities.get(done.activityId);
  const roster = ((activity?.effects ?? []) as Array<{ target?: unknown }>).some((fx) => fx.target === 'roster');
  noteBusy(draft, [...(done.companionId ? [done.companionId] : []), ...(roster ? done.rosterIds : [])], done.activityId);
  return [];
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


/** Mirrors the global setting `unitDms` into the campaign, which is what the pure engine reads (the channel of her news, P14c). */
registerAction('campaign/set_unit_dms', (draft, payload) => {
  const on = (payload as { on?: unknown } | undefined)?.on;
  if (typeof on !== 'boolean') throw new Error('campaign/set_unit_dms needs { on } as true or false');
  draft.settings.unitDms = on;
  return [];
});

const TRACE_NOTE_MAX = 400;

/** An item that is waiting in the outbox for this channel, or the refusal: it was told already (or never was this kind). */
function outboxItem(draft: { life?: { outbox: Array<{ itemId: string; unitId: string; channel: 'dm' | 'note' }>; queue: Array<{ id: string; ref: string }> } }, itemId: unknown, channel: 'dm' | 'note') {
  const entry = draft.life?.outbox.find((o) => o.itemId === itemId);
  if (!entry || entry.channel !== channel) throw new Error('Already told.');
  return { entry, item: draft.life!.queue.find((q) => q.id === itemId) };
}

/** The named soldier who is still with the squad, or the refusal (the dead, the deserted and those who left tell nothing). */
function livingNamed(draft: { squad: Unit[] }, id: string, action: string): Unit {
  const unit = draft.squad.find((u) => u.id === id);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error(`${action} needs a named soldier who is still with the squad.`);
  return unit;
}

/**
 * `life/share_done { itemId, text }`: her DM about what happened to her arrives (the controller worded it, or the line of the registry did).
 * The same path as any DM she starts, `dm/receive` with `initiated`, and it closes the outbox entry and tells the commander the fact.
 * Refuses an item that is not waiting as a DM ("Already told."). While the commander's DMs are off (`settings.unitDms`, mirrored by the app;
 * unknown = off) nothing is sent: the item falls back to a news directive for her next scene, the usual `newsDays` (ruling R14).
 */
registerAction('life/share_done', (draft, payload, ctx) => {
  const p = payload as { itemId?: unknown; text?: unknown } | undefined;
  const { entry } = outboxItem(draft, p?.itemId, 'dm');
  livingNamed(draft, entry.unitId, 'life/share_done');
  if (draft.settings.unitDms !== true) {
    const life = draft.life!;
    life.outbox = life.outbox.filter((o) => o.itemId !== entry.itemId);
    life.news.push({ itemId: entry.itemId, unitId: entry.unitId, until: draft.day + TUNING.life.newsDays });
    return [{ type: 'news_delivered', itemId: entry.itemId, unitId: entry.unitId, channel: 'directive' }];
  }
  return runHandler('dm/receive', draft, { unitId: entry.unitId, text: p?.text, initiated: true, lifeItemId: entry.itemId }, ctx);
});

/**
 * `life/trace_note { itemId, text }`: the note she leaves in her quarters about a milestone (the trace of the hobby). The fact is revealed
 * and the item closed. Refuses an item that is not waiting as a note ("Already told.").
 */
registerAction('life/trace_note', (draft, payload) => {
  const p = payload as { itemId?: unknown; text?: unknown } | undefined;
  const { entry, item } = outboxItem(draft, p?.itemId, 'note');
  const unit = livingNamed(draft, entry.unitId, 'life/trace_note');
  const text = typeof p?.text === 'string' ? p.text.trim() : '';
  if (text === '' || text.length > TRACE_NOTE_MAX) throw new Error(`A note is 1 to ${TRACE_NOTE_MAX} characters.`);
  return [...leaveLifeNote(draft, unit, text, item?.ref ?? 'hobby'), ...closeNews(draft, entry.itemId)];
});

/**
 * `life/opinion_formed { unitId, topicId, position, text, strength, source }`: her view on a topic is written, once (the model's answer, validated, or
 * the fallback). `strength` is `held` or `loose` (`strong` comes from the import or an edit), `source` is `model` or `fallback`.
 */
registerAction('life/opinion_formed', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; topicId?: unknown; position?: unknown; text?: unknown; strength?: unknown; source?: unknown } | undefined;
  if (typeof p?.unitId !== 'string' || typeof p.topicId !== 'string' || typeof p.position !== 'string') throw new Error('life/opinion_formed needs { unitId, topicId, position }.');
  if (p.strength !== 'held' && p.strength !== 'loose') throw new Error('A formed opinion is held or loose.');
  if (p.source !== 'model' && p.source !== 'fallback') throw new Error('An opinion is formed by the model or by the fallback.');
  if (p.text !== undefined && typeof p.text !== 'string') throw new Error('The opinion text must be text.');
  return formOpinion(draft, ctx.registries, p.unitId, p.topicId, p.position, p.text ?? '', p.strength, p.source);
});

/**
 * `life/topics_triggered { topicIds }`: something in the open scene brought these topics up (the commander's own words, a keyword): they are stored
 * for each woman present and the one she may voice is picked. Nothing while life is off.
 */
registerAction('life/topics_triggered', (draft, payload, ctx) => {
  const ids = (payload as { topicIds?: unknown } | undefined)?.topicIds;
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) throw new Error('life/topics_triggered needs { topicIds } as a list of ids.');
  if (!draft.scene) throw new Error('life/topics_triggered: no scene is open');
  return triggerTopics(draft, ctx.registries, draft.scene.participants, ids as string[], draft.scene.id);
});

/**
 * `life/time_together { unitId, pastimeId }`: a quiet hour with her. It refuses with `pastimeProblem`'s reason and runs the activity that carries
 * `pastime: true` with her as the companion and the pastime in the request (which holds the slot until the scene ends, as a talk does); the hook
 * below stores the pastime for the scene the app opens next (`scene/start` copies it onto the scene). Nothing applies until `scene/end`. An order
 * the squad leader countermands or the warden overrides spends nothing here and stores nothing; when the override is answered the order runs
 * again with the same pastime (`runOrder`), and the hook decides again for the companion who is really there. Like `activity/*` it is refused
 * while a presented dilemma waits and while a booking is due (`dispatch.ts`, `bookingGuard`).
 */
registerAction('life/time_together', (draft, payload, ctx) => {
  const p = payload as { unitId?: unknown; pastimeId?: unknown; wardenJudged?: unknown } | undefined;
  if (typeof p?.unitId !== 'string' || typeof p.pastimeId !== 'string') throw new Error('life/time_together needs { unitId, pastimeId }.');
  const reg = ctx.registries;
  const why = pastimeProblem(draft, reg, p.unitId, p.pastimeId);
  if (why) throw new Error(why);
  const events = runActivity(draft, ctx, {
    activityId: String(pastimeActivity(reg)!.id), companionId: p.unitId, pastimeId: p.pastimeId,
    ...(p.wardenJudged !== undefined ? { wardenJudged: p.wardenJudged } : {}),
  });
  return draft.life?.pending?.pastimeId === p.pastimeId ? [...events, { type: 'pastime_set', unitId: p.unitId, pastimeId: p.pastimeId }] : events;
});

// A quiet hour that has been done (by `life/time_together`, or by an override answered later) stores its pastime for the scene that follows. The
// pastime is checked for the companion who is really there: one that does not fit leaves a plain scene (the slot is held either way) and no stale wait.
registerActivityHook((draft, ctx, done) => {
  if (ctx.registries.activities.get(done.activityId)?.pastime !== true || done.companionId === undefined || done.pastimeId === undefined) return [];
  if (draft.life) delete draft.life.pending;
  const pastime = ctx.registries.pastimes.get(done.pastimeId) as unknown as PastimeEntry | undefined;
  if (!pastime || pastimeProblem(draft, ctx.registries, done.companionId, done.pastimeId) !== null) return [];
  const locationId = pastimeLocation(draft, ctx.registries, pastime, done.companionId);
  if (locationId === null) return [];
  ensureLife(draft).pending = { unitId: done.companionId, pastimeId: done.pastimeId, locationId, day: draft.day, slot: draft.slot };
  return [];
});

/**
 * `life/pastime_in_scene { pastimeId }`: the "let's ..." of an open private scene with one named woman. The same checks as `life/time_together`
 * except that the slot and the place are the scene's; it sets the scene's pastime and spends no slot (the scene's own slot, if it has one,
 * is spent when it ends).
 */
registerAction('life/pastime_in_scene', (draft, payload, ctx) => {
  const pastimeId = (payload as { pastimeId?: unknown } | undefined)?.pastimeId;
  if (typeof pastimeId !== 'string') throw new Error('life/pastime_in_scene needs { pastimeId }.');
  const scene = draft.scene;
  if (!scene) throw new Error('life/pastime_in_scene: no scene is open');
  const unit = scene.participants.length === 1 ? draft.squad.find((u) => u.id === scene.participants[0]) : undefined;
  if (scene.mode !== 'private' || !unit || unit.kind !== 'named') throw new Error('A quiet meeting is for a private scene with one named soldier.');
  if (scene.pastime) throw new Error('The scene is already a quiet meeting.');
  const why = pastimeProblem(draft, ctx.registries, unit.id, pastimeId, { locationId: scene.locationId, slot: scene.slot });
  if (why) throw new Error(why);
  scene.pastime = { id: pastimeId, unitId: unit.id };
  return [{ type: 'pastime_set', unitId: unit.id, pastimeId }];
});
