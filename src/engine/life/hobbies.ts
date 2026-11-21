import type { Registries } from '../../content/types';
import { activeRestrictions } from '../discipline/restrictions';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { TUNING } from '../tuning';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, HobbyState, Slot, Unit } from '../state/types';
import { plainText, revealFact, revealMastery, writeLifeFact } from './facts';
import { enqueue } from './news';
import { DAY_SLOTS, busySlot, isPrivateRoom, placesOf, takesPart, unitOf, type DayPlaces } from './places';
import { UNTOLD_TAG, lifeChance, lifeHash, lifeMode, temperamentOf } from './state';
import type { HobbyEntry } from './types';

/**
 * Her hobbies (P14c): the thresholds of a hobby's four milestones and the skill a hobby starts at. Everything is a hash of the life salt
 * (never the rng), so the same salt gives the same numbers and two women never share a ladder.
 */

/**
 * Where the `n`-th (0..3) milestone of a hobby sits for her: 10, 30, 60 and 100, each moved by up to 15 percent either way
 * (`TUNING.life.milestoneShift`) by a hash of the salt, her id and the hobby. The fourth never passes 100.
 */
export function milestoneAt(salt: number, unitId: string, hobbyId: string, n: 0 | 1 | 2 | 3): number {
  const t = TUNING.life;
  const spread = Math.round(t.milestoneShift * 1000); // ±150 thousandths
  const shift = (lifeHash({ salt }, `${unitId}|hobby|${hobbyId}|${n}`) % (2 * spread + 1)) - spread;
  return Math.min(100, Math.round(t.milestones[n] * (1 + shift / 1000)));
}

/** A new hobby as she takes it up: skill 0, the novelty interest, active, and no milestone reached. */
export function newHobby(id: string, day: number): HobbyState {
  return { id, skill: 0, interest: TUNING.life.interest.start, state: 'active', since: day, milestones: [] };
}

/**
 * While more than three of her hobbies are active, the one she cares least about goes to cooling: the ones in `keep` last (the hobbies just
 * taken up or taken up again are cooled only when every older one already is). A tie goes to the older. Returns the `hobby_cooling` events.
 */
function coolExcess(unit: Pick<Unit, 'id' | 'hobbies'>, keep: readonly string[], day: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (;;) {
    const active = (unit.hobbies ?? []).filter((h) => h.state === 'active');
    if (active.length <= TUNING.life.maxActive) return events;
    const older = active.filter((h) => !keep.includes(h.id));
    const least = (older.length > 0 ? older : active).sort((a, b) => a.interest - b.interest || a.since - b.since)[0];
    least.state = 'cooling';
    least.coolingSince = day;
    events.push({ type: 'hobby_cooling', unitId: unit.id, hobbyId: least.id });
  }
}

/**
 * She takes up several hobbies at once: each is skill 0, the novelty interest, active. Past `maxActive` the excess is cooled once, after all
 * are added, and from the hobbies she already had first (the least keen, the older on a tie): a new one is cooled only when no older one is left.
 */
export function takeUpHobbies(unit: Pick<Unit, 'id' | 'hobbies'>, ids: readonly string[], day: number): EngineEvent[] {
  if (ids.length === 0) return [];
  const list = (unit.hobbies ??= []);
  for (const id of ids) list.push(newHobby(id, day));
  return coolExcess(unit, ids, day);
}

/** She takes up a hobby (see `takeUpHobbies`). */
export const takeUpHobby = (unit: Pick<Unit, 'id' | 'hobbies'>, id: string, day: number): EngineEvent[] => takeUpHobbies(unit, [id], day);

/**
 * Gives each starting hobby (skill 0, no milestone) the skill she brings: a hash of the salt, her id and the hobby, below her second
 * milestone, with the milestones already passed granted silently (no fact, no queue). A no-op while life is off; running it again changes
 * nothing for a hobby that has any skill or milestone. `only` limits it to one unit and, with `hobbyIds`, to the hobbies just added to her:
 * a hobby taken up later (an event, `set_hobbies`) is never a starting hobby.
 */
export function seedLife(
  draft: Pick<CampaignState, 'settings' | 'life' | 'squad'>, reg: Pick<Registries, 'hobbies'>,
  only?: { unitId: string; hobbyIds?: readonly string[] },
): EngineEvent[] {
  if (lifeMode(draft) === 'off' || !draft.life) return [];
  const salt = draft.life.salt;
  for (const unit of draft.squad) {
    if (unit.kind !== 'named' || (only !== undefined && unit.id !== only.unitId)) continue;
    for (const h of unit.hobbies ?? []) {
      if (only?.hobbyIds !== undefined && !only.hobbyIds.includes(h.id)) continue;
      if (h.skill !== 0 || h.milestones.length > 0 || !reg.hobbies.has(h.id)) continue;
      const entry = reg.hobbies.get(h.id) as HobbyEntry;
      h.skill = lifeHash({ salt }, `${unit.id}|hobby|${h.id}`) % milestoneAt(salt, unit.id, h.id, 1);
      for (const [i, m] of entry.milestones.entries()) {
        if (i < 2 && milestoneAt(salt, unit.id, h.id, i as 0 | 1) <= h.skill) h.milestones.push(m.id);
      }
    }
  }
  return [];
}

/** Her gift for a hobby: what she picks up quickly (`high`) and what she does not (`low`); every other hobby is standard. */
export function aptitudeOf(unit: Pick<Unit, 'aptitudes'>, hobbyId: string): 'high' | 'standard' | 'low' {
  if (unit.aptitudes?.high.includes(hobbyId)) return 'high';
  return unit.aptitudes?.low.includes(hobbyId) ? 'low' : 'standard';
}

/** What one practice slot adds: 1 x her aptitude (low 0.5, standard 1, high 1.6) x interest over 60, at most 1.3. */
export function practiceGain(unit: Pick<Unit, 'aptitudes'>, h: Pick<HobbyState, 'id' | 'interest'>): number {
  const t = TUNING.life;
  return t.aptitude[aptitudeOf(unit, h.id)] * Math.min(h.interest / t.interestDiv, t.interestCap);
}

/**
 * Moves her interest in a hobby by `amount` (kept between 0 and 100) and follows the cycle: an active hobby under 25 goes to cooling; a cooling
 * or dropped one at 40 or more is taken up again (the least keen of the others cools if that makes four).
 */
export function bumpInterest(draft: Pick<CampaignState, 'squad'>, unitId: string, hobbyId: string, amount: number, day: number): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const h = unit?.hobbies?.find((x) => x.id === hobbyId);
  if (!unit || !h) return [];
  const t = TUNING.life.interest;
  h.interest = Math.max(0, Math.min(100, h.interest + amount));
  if (h.state === 'active') {
    if (h.interest >= t.cooling) return [];
    h.state = 'cooling';
    h.coolingSince = day;
    return [{ type: 'hobby_cooling', unitId, hobbyId }];
  }
  if (h.interest < t.active) return [];
  h.state = 'active';
  delete h.coolingSince;
  return [{ type: 'hobby_rekindled', unitId, hobbyId }, ...coolExcess(unit, [hobbyId], day)];
}

/** The topic a trace opens for her, waiting to be formed (once, and not when she already has a view). */
export function openTopic(draft: CampaignState, reg: Pick<Registries, 'opinionTopics'>, unitId: string, topicId: string): void {
  const unit = unitOf(draft, unitId);
  if (!unit || !draft.life || !reg.opinionTopics.has(topicId) || unit.opinions?.[topicId] !== undefined) return;
  const pending = ((draft.life.units[unitId] ??= { last: {} }).pendingTopics ??= []);
  if (!pending.includes(topicId)) pending.push(topicId);
}

/**
 * Where she practises today: for each of morning, afternoon and evening, the slot in which her derived whereabouts are routine in a room whose
 * scene location is one of an active hobby's `locations`, she is not with the commander (an activity or a scene), was not on a run that day, is
 * at the base, not injured, under no restriction (a bench only concerns the next run) and her stress is under 70. With two hobbies in the
 * room the slot goes to the one with more interest (a tie: registry order). Nothing while life is off.
 */
export function practiceSlots(
  state: CampaignState, reg: Registries, unitId: string, day: number, cache?: DayPlaces,
): Array<{ slot: Slot; hobbyId: string; roomId: string }> {
  const unit = unitOf(state, unitId);
  const life = state.life;
  if (lifeMode(state) === 'off' || !life || !unit || !unit.hobbies?.some((h) => h.state === 'active') || !takesPart(state, unitId)) return [];
  if (unit.stress >= TUNING.life.practiceStressMax) return [];
  if (state.lastExpedition?.day === day && state.lastExpedition.party.includes(unitId)) return [];
  const order = [...reg.hobbies.keys()];
  const out: Array<{ slot: Slot; hobbyId: string; roomId: string }> = [];
  const places = placesOf(state, reg, unitId, day, cache);
  for (const [i, slot] of DAY_SLOTS.entries()) {
    const w = places[i];
    if (w.reason !== 'routine' || w.roomId === null) continue;
    if (life.busy.some((b) => b.unitId === unitId && b.slot === busySlot(day, slot))) continue;
    if (activeRestrictions({ ...state, day, slot }, unitId).some((r) => r.kind !== 'benched')) continue;
    const here = reg.hubRooms.get(w.roomId)?.sceneLocationId;
    const choice = unit.hobbies
      .filter((h) => h.state === 'active' && ((reg.hobbies.get(h.id)?.locations ?? []) as string[]).includes(here as string))
      .sort((a, b) => b.interest - a.interest || order.indexOf(a.id) - order.indexOf(b.id))[0];
    if (choice) out.push({ slot, hobbyId: choice.id, roomId: w.roomId });
  }
  return out;
}

/**
 * The base's best hand at something: a fact the whole squad knows and the commander does not yet (hidden, `untold`, like her other news; it is
 * revealed, with the trait it gives her, when the item is told: `revealMastery`).
 */
function masterHobby(draft: CampaignState, unit: Unit, h: HobbyState, entry: HobbyEntry, facts?: string[]): EngineEvent[] {
  h.mastered = true;
  const fact = addFact(draft, {
    about: [unit.id], text: `${unit.displayName} is the base's ${entry.label} hand.`, tags: ['life', UNTOLD_TAG, 'hobby', 'mastered', h.id], importance: 2, day: draft.day,
    knownBy: draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id), hiddenFromCommander: true,
  });
  facts?.push(fact.id); // told with the event that brought the milestone: revealed (with the trait) when that event is told
  return [{ type: 'hobby_mastered', unitId: unit.id, hobbyId: h.id }];
}

/**
 * She reaches the `n`-th (0..3) milestone of a hobby: skill at least its threshold, the plateau gone, interest +15, a hidden fact and (unless
 * `caused`, told in the scene the commander was in, or `told`, the news of a shared life event that brought it) an item in the news queue; a
 * milestone with an `opinion` trace opens the hobby's topic for her. The fourth is mastery. Low aptitude stops at the third (ceiling).
 * A `caused` milestone is known to the commander at once (it was there); a `told` one adds its fact id (and the mastery's) to `opts.facts`, so the
 * item of the event that brought it reveals it with the event. A milestone an unshared event brings is neither: it has its own item (R13).
 */
export function grantMilestone(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, n: number, opts: { caused?: true; told?: true; facts?: string[] } = {},
): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const life = draft.life;
  const h = unit?.hobbies?.find((x) => x.id === hobbyId);
  const entry = reg.hobbies.get(hobbyId) as HobbyEntry | undefined;
  const m = entry?.milestones[n];
  if (!unit || !life || !h || !entry || !m || h.milestones.includes(m.id)) return [];
  const low = aptitudeOf(unit, hobbyId) === 'low';
  if (h.ceiling === true || (low && n >= 3)) return [];
  const idx = n as 0 | 1 | 2 | 3;
  h.milestones.push(m.id);
  h.lastMilestoneDay = draft.day;
  h.skill = Math.max(h.skill, milestoneAt(life.salt, unitId, hobbyId, idx));
  delete h.plateau;
  const events: EngineEvent[] = [{ type: 'hobby_milestone', unitId, hobbyId, milestoneId: m.id }];
  const fact = writeLifeFact(draft, unitId, `${unit.displayName} (${entry.label}): ${plainText(m.line)}`, ['hobby', hobbyId, m.id], n === 3 ? 2 : 1);
  if (opts.caused === true) {
    life.delivered.push({ day: draft.day, unitId, category: 'hobby', hobby: true, caused: true });
    revealFact(draft, fact.id); // the commander was there
  } else if (opts.told === true) opts.facts?.push(fact.id);
  else {
    events.push(...enqueue(draft, {
      unitId, kind: 'hobby', ref: hobbyId, what: n === 3 ? 'mastered' : 'milestone', milestoneId: m.id, factId: fact.id, category: 'hobby', day: draft.day,
      ...(n === 3 ? { notable: true as const } : {}),
    }));
  }
  events.push(...bumpInterest(draft, unitId, hobbyId, TUNING.life.interest.milestone, draft.day));
  if (m.trace === 'opinion' && entry.opinionTopic !== undefined) openTopic(draft, reg, unitId, entry.opinionTopic);
  if (n === 2 && low) {
    h.ceiling = true;
    events.push(...bumpInterest(draft, unitId, hobbyId, temperamentOf(draft, unitId).volatility === 'moody' ? TUNING.life.interest.ceilingMoody : TUNING.life.interest.ceiling, draft.day));
  }
  if (n === 3) {
    events.push(...masterHobby(draft, unit, h, entry, opts.told === true ? opts.facts : undefined));
    if (opts.caused === true) revealMastery(draft, unitId, hobbyId); // the commander was there: it is known now (a mastery told with an event waits for the telling)
  }
  return events;
}

/** Whether another woman reached the same milestone of the same hobby today: two women never do, so whoever comes second waits for another day. */
function reachedToday(draft: Pick<CampaignState, 'squad' | 'day'>, unitId: string, hobbyId: string, n: number): boolean {
  return draft.squad.some((u) => u.id !== unitId && u.hobbies?.some((o) => o.id === hobbyId && o.milestones.length > n && o.lastMilestoneDay === draft.day));
}

/** Whether a push would break her plateau in this hobby right now (she is on one, it is not her ceiling and nobody else reached that step today). */
export function plateauBreaks(draft: Pick<CampaignState, 'squad' | 'day'>, unitId: string, hobbyId: string): boolean {
  const unit = unitOf(draft, unitId);
  const h = unit?.hobbies?.find((x) => x.id === hobbyId);
  if (!unit || !h || h.plateau === undefined || h.ceiling === true || h.milestones.length >= 4) return false;
  return !(aptitudeOf(unit, hobbyId) === 'low' && h.milestones.length >= 3) && !reachedToday(draft, unitId, hobbyId, h.milestones.length);
}

/** She gets past a plateau: skill is the milestone ahead and it is granted. Nothing at the ceiling or once all four are reached. */
export function breakthrough(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, _day: number, opts: { caused?: true } = {},
): EngineEvent[] {
  const h = unitOf(draft, unitId)?.hobbies?.find((x) => x.id === hobbyId);
  if (!h || h.ceiling === true || h.milestones.length >= 4) return [];
  // two women never reach the same milestone of the same hobby on one day: whoever comes second waits for another slot, another day
  const n = h.milestones.length;
  if (reachedToday(draft, unitId, hobbyId, n)) return [];
  const got = grantMilestone(draft, reg, unitId, hobbyId, h.milestones.length, opts);
  return got.length === 0 ? [] : [{ type: 'hobby_breakthrough', unitId, hobbyId }, ...got];
}

/** A push (a quiet meeting about it, a life event that feeds it, praise): interest +8, and a plateau breaks at once. */
export function pushHobby(draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, day: number, opts: { caused?: true } = {}): EngineEvent[] {
  const h = unitOf(draft, unitId)?.hobbies?.find((x) => x.id === hobbyId);
  if (!h) return [];
  return [...(h.plateau ? breakthrough(draft, reg, unitId, hobbyId, day, opts) : []), ...bumpInterest(draft, unitId, hobbyId, TUNING.life.interest.push, day)];
}

/**
 * One practice slot of a hobby. Skill rises by `practiceGain`; at 70 percent of the step to the next milestone it stops on a plateau, and only
 * a breakthrough moves it on: a push (`opts.push`, interest +8 too) breaks it at once, otherwise each slot rolls 0.06 x her aptitude (a hash
 * of her, the hobby, the day and the slot, never the rng). Low aptitude stops at the third milestone. `opts.caused`: the commander was there.
 */
export function practise(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, day: number, slot: Slot, opts: { push?: true; caused?: true } = {},
): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const life = draft.life;
  const h = unit?.hobbies?.find((x) => x.id === hobbyId);
  if (!unit || !life || !h || !reg.hobbies.has(hobbyId)) return [];
  const t = TUNING.life;
  const events: EngineEvent[] = [];
  const n = h.milestones.length;
  const low = aptitudeOf(unit, hobbyId) === 'low';
  h.lastPracticeDay = day;
  if (h.plateau) {
    const roll = lifeChance(life, `${unitId}|${hobbyId}|${day}|${slot}`, t.breakthrough * t.aptitude[aptitudeOf(unit, hobbyId)]);
    if (opts.push === true || roll) events.push(...breakthrough(draft, reg, unitId, hobbyId, day, { ...(opts.caused === true ? { caused: true as const } : {}) }));
  } else if (h.ceiling === true || (low && n >= 3)) {
    // she has gone as far as she goes
  } else if (n >= 4) {
    h.skill = Math.min(100, h.skill + practiceGain(unit, h));
    events.push({ type: 'hobby_progress', unitId, hobbyId });
  } else {
    const prev = n === 0 ? 0 : milestoneAt(life.salt, unitId, hobbyId, (n - 1) as 0 | 1 | 2);
    const next = milestoneAt(life.salt, unitId, hobbyId, n as 0 | 1 | 2 | 3);
    const stop = prev + t.plateauAt * (next - prev);
    const skill = h.skill + practiceGain(unit, h);
    if (skill >= stop) {
      h.skill = Math.max(stop, h.skill);
      h.plateau = { at: h.skill, since: day };
      events.push({ type: 'hobby_plateau', unitId, hobbyId });
    } else {
      h.skill = skill;
    }
    events.push({ type: 'hobby_progress', unitId, hobbyId });
  }
  if (opts.push === true) events.push(...bumpInterest(draft, unitId, hobbyId, t.interest.push, day));
  return events;
}

/** What a milestone-less or reached hobby cannot lose: the threshold of the last milestone she reached (0 with none). */
function floorOf(salt: number, unitId: string, h: HobbyState, entry: HobbyEntry): number {
  let floor = 0;
  for (const [i, m] of entry.milestones.entries()) if (h.milestones.includes(m.id)) floor = milestoneAt(salt, unitId, h.id, i as 0 | 1 | 2 | 3);
  return floor;
}

/** The week of a hobby falls on its seventh day, and every seventh day after. */
const weekDay = (h: HobbyState, day: number): boolean => day > h.since && (day - h.since) % 7 === 6;

/** A dropped hobby loses 1 a week (on its week day), never below the last milestone she reached. */
export function decay(draft: CampaignState, reg: Registries, unitId: string, day: number): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const life = draft.life;
  if (!unit || !life) return [];
  for (const h of unit.hobbies ?? []) {
    const entry = reg.hobbies.get(h.id) as HobbyEntry | undefined;
    if (h.state !== 'dropped' || !entry || !weekDay(h, day)) continue;
    h.skill = Math.max(floorOf(life.salt, unitId, h, entry), h.skill - TUNING.life.decayPerWeek);
  }
  return [];
}

/** The hobby she put away: a fact the commander has not been told (hidden, `untold`) and an item for the queue. */
function dropHobby(draft: CampaignState, reg: Registries, unit: Unit, h: HobbyState, day: number): EngineEvent[] {
  const entry = reg.hobbies.get(h.id) as HobbyEntry | undefined;
  h.state = 'dropped';
  delete h.coolingSince;
  const events: EngineEvent[] = [{ type: 'hobby_dropped', unitId: unit.id, hobbyId: h.id }];
  if (!entry) return events;
  const fact = writeLifeFact(draft, unit.id, `${unit.displayName} has put ${entry.label} away.`, ['hobby', h.id, 'dropped'], 1);
  events.push(...enqueue(draft, { unitId: unit.id, kind: 'hobby', ref: h.id, what: 'dropped', factId: fact.id, category: 'hobby', day }));
  return events;
}

/**
 * The tick of her hobbies for `day` (the day step runs it every day; a hobby's week falls every seventh day from the day she took it up).
 * An active hobby's interest moves by the week: novelty +3 for the first three, a plateau -4, stress of 50 or more -3, a newer active hobby -2.
 * A hobby that has been cooling for 30 days is dropped; a dropped one decays. Nothing is drawn from the rng; nothing happens while life is off.
 */
export function interestTick(draft: CampaignState, reg: Registries, unitId: string, day: number): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  if (lifeMode(draft) === 'off' || !draft.life || !unit || unit.kind !== 'named' || !isLiving(unit)) return [];
  const t = TUNING.life.interest;
  const events: EngineEvent[] = [];
  for (const h of [...(unit.hobbies ?? [])]) {
    if (h.state === 'active' && weekDay(h, day)) {
      const novel = Math.floor((day - h.since) / 7) < t.noveltyWeeks;
      const newer = (unit.hobbies ?? []).some((o) => o.state === 'active' && o.since > h.since);
      const delta = (novel ? t.novelty : 0) + (h.plateau ? t.plateau : 0) + (unit.stress >= t.stressAt ? t.stress : 0) + (newer ? t.newer : 0);
      if (delta !== 0) events.push(...bumpInterest(draft, unitId, h.id, delta, day));
    } else if (h.state === 'cooling' && h.coolingSince !== undefined && day - h.coolingSince >= t.dropAfterDays) {
      events.push(...dropHobby(draft, reg, unit, h, day));
    }
  }
  events.push(...decay(draft, reg, unitId, day));
  return events;
}

/**
 * She takes up a hobby she does not have: skill 0, the novelty interest, active (the least keen of the others cools past three). From an
 * `event` the life event is the news (its fact id goes to `facts`, so the event's item reveals it with the event); from a `friend`, or from an
 * `unshared` event (one she does not tell, so nothing carries its fact) it is news of its own (a hidden fact and a queue item); an `import` is a
 * starting hobby and silent.
 */
export function startHobby(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, day: number, source: 'event' | 'unshared' | 'friend' | 'import', facts?: string[],
): EngineEvent[] {
  const unit = unitOf(draft, unitId);
  const entry = reg.hobbies.get(hobbyId) as HobbyEntry | undefined;
  if (!unit || unit.kind !== 'named' || !entry || (unit.hobbies ?? []).some((h) => h.id === hobbyId)) return [];
  const events: EngineEvent[] = [{ type: 'hobby_started', unitId, hobbyId }, ...takeUpHobby(unit, hobbyId, day)];
  if (source === 'import') return events;
  const fact = writeLifeFact(draft, unitId, `${unit.displayName} has taken up ${entry.label}.`, ['hobby', hobbyId, 'started'], 1);
  if (source === 'event') facts?.push(fact.id);
  if (source === 'friend' || source === 'unshared') events.push(...enqueue(draft, { unitId, kind: 'hobby', ref: hobbyId, what: 'started', factId: fact.id, category: 'hobby', day }));
  return events;
}

/**
 * A friend's hobby: a woman who stands on routine in the room where another practised a hobby she lacks, in a slot she is free, picks it up
 * with a 2 percent hash roll (at most one a day). `plans` are the slots already planned (the day step's); without them they are derived.
 */
export function friendHobbies(
  draft: CampaignState, reg: Registries, day: number, places: DayPlaces = new Map(),
  plans?: ReadonlyMap<string, ReadonlyArray<{ slot: Slot; hobbyId: string; roomId: string }>>,
): EngineEvent[] {
  const life = draft.life;
  if (lifeMode(draft) === 'off' || !life) return [];
  const events: EngineEvent[] = [];
  const learned = new Set<string>();
  const planOf = (id: string) => (plans ? (plans.get(id) ?? []) : practiceSlots(draft, reg, id, day, places)); // a woman with no planned slot has none: nothing is derived again
  for (const teacher of draft.squad) {
    for (const p of planOf(teacher.id)) {
      if (isPrivateRoom(reg, p.roomId)) continue; // her own quarters: nobody is there to learn from her
      const i = DAY_SLOTS.indexOf(p.slot);
      for (const other of draft.squad) {
        if (other.id === teacher.id || learned.has(other.id) || !takesPart(draft, other.id)) continue;
        const w = placesOf(draft, reg, other.id, day, places)[i];
        if (w.reason !== 'routine' || w.roomId !== p.roomId) continue;
        if (life.busy.some((b) => b.unitId === other.id && b.slot === busySlot(day, p.slot))) continue;
        if ((other.hobbies ?? []).some((h) => h.id === p.hobbyId)) continue;
        if (!lifeChance(life, `${other.id}|friend|${p.hobbyId}|${day}|${p.slot}`, TUNING.life.friendHobby)) continue;
        learned.add(other.id);
        events.push(...startHobby(draft, reg, other.id, p.hobbyId, day, 'friend'));
      }
    }
  }
  return events;
}

/**
 * Two women practised the same hobby in the same shared room this slot. At most once a week for the pair (a week is `floor(day / 7)`) it is
 * worth something: both feel the company (interest +5) and the one who is less far along (a tie: a hash of the pair and the week) gets the
 * push, so a plateau she is on breaks at once. The other gets nothing but the company. Bookkeeping in `life.shared`.
 */
export function sharePractice(draft: CampaignState, reg: Registries, aId: string, bId: string, hobbyId: string, day: number): EngineEvent[] {
  const life = draft.life;
  const a = unitOf(draft, aId)?.hobbies?.find((h) => h.id === hobbyId);
  const b = unitOf(draft, bId)?.hobbies?.find((h) => h.id === hobbyId);
  if (!life || !a || !b) return [];
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  const week = Math.floor(day / 7);
  const shared = (life.shared ??= {});
  const key = `${x}|${y}`;
  if (shared[key] === week) return [];
  for (const k of Object.keys(shared)) if (shared[k] < week - 1) delete shared[k];
  shared[key] = week;
  const lower = a.skill !== b.skill ? (a.skill < b.skill ? aId : bId) : lifeHash(life, `${x}|${y}|shared|${week}`) % 2 === 0 ? x : y;
  const events: EngineEvent[] = [];
  if (unitOf(draft, lower)?.hobbies?.find((h) => h.id === hobbyId)?.plateau) events.push(...breakthrough(draft, reg, lower, hobbyId, day));
  for (const id of [aId, bId]) events.push(...bumpInterest(draft, id, hobbyId, TUNING.life.interest.share, day));
  return events;
}
