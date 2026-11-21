import type { Registries } from '../../content/types';
import { developmentMode } from '../development/state';
import { ensureDevelopment, nextDevId } from '../development/state';
import { activeRestrictions } from '../discipline/restrictions';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { TUNING } from '../tuning';
import type { EngineEvent } from '../dispatch';
import type { CampaignState, DevFact, HobbyState, Slot, Unit } from '../state/types';
import { plainText, writeLifeFact } from './facts';
import { enqueue } from './news';
import { DAY_SLOTS, busySlot, placesOf, takesPart, unitOf, type DayPlaces } from './places';
import { lifeChance, lifeHash, lifeMode, temperamentOf } from './state';
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
 * She takes up a hobby: skill 0, the novelty interest, active. Past `maxActive` the active one she cares least about (the older on a tie)
 * goes to cooling. Every way of taking one up (an event, a re-sync) goes through here, so she never has more than three active.
 */
export function takeUpHobby(unit: Pick<Unit, 'hobbies'>, id: string, day: number): EngineEvent[] {
  const list = (unit.hobbies ??= []);
  list.push(newHobby(id, day));
  const events: EngineEvent[] = [];
  const active = list.filter((h) => h.state === 'active');
  if (active.length > TUNING.life.maxActive) {
    const least = active.filter((h) => h.id !== id).sort((a, b) => a.interest - b.interest)[0];
    least.state = 'cooling';
    least.coolingSince = day;
    events.push({ type: 'hobby_cooling', unitId: (unit as Unit).id, hobbyId: least.id });
  }
  return events;
}

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
 * Moves her interest in a hobby by `amount` (kept between 0 and 100). The cycle of cooling, dropping and taking it up again is the weekly
 * tick's and the next task's: for now this only moves the number.
 */
export function bumpInterest(draft: Pick<CampaignState, 'squad'>, unitId: string, hobbyId: string, amount: number, _day: number): EngineEvent[] {
  const h = unitOf(draft, unitId)?.hobbies?.find((x) => x.id === hobbyId);
  if (!h) return [];
  h.interest = Math.max(0, Math.min(100, h.interest + amount));
  return [];
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

const factsMax = (): number => TUNING.development.factsMax;

/** The base's best hand at something: a fact the whole squad knows (and the commander may), and a trait of hers while development runs. */
function masterHobby(draft: CampaignState, unit: Unit, h: HobbyState, entry: HobbyEntry): EngineEvent[] {
  h.mastered = true;
  const text = `${unit.displayName} is the base's ${entry.label} hand.`;
  addFact(draft, {
    about: [unit.id], text, tags: ['life', 'hobby', 'mastered', h.id], importance: 2, day: draft.day,
    knownBy: draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id),
  });
  if (developmentMode(draft) !== 'off') {
    const dev = ensureDevelopment(unit);
    const fact: DevFact = { id: nextDevId(dev, 'df'), text, kind: 'skill', day: draft.day, source: 'life' };
    dev.facts.push(fact);
    while (dev.facts.length > factsMax()) {
      const i = dev.facts.findIndex((f) => f.edited !== true && f.id !== fact.id);
      if (i < 0) break;
      dev.facts.splice(i, 1);
    }
  }
  return [{ type: 'hobby_mastered', unitId: unit.id, hobbyId: h.id }];
}

/**
 * She reaches the `n`-th (0..3) milestone of a hobby: skill at least its threshold, the plateau gone, interest +15, a hidden fact and (unless
 * `caused`, told in the scene the commander was in, or `told`, the news of the life event that brought it) an item in the news queue; a
 * milestone with an `opinion` trace opens the hobby's topic for her. The fourth is mastery. Low aptitude stops at the third (ceiling).
 */
export function grantMilestone(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, n: number, opts: { caused?: true; told?: true } = {},
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
  h.skill = Math.max(h.skill, milestoneAt(life.salt, unitId, hobbyId, idx));
  delete h.plateau;
  const events: EngineEvent[] = [{ type: 'hobby_milestone', unitId, hobbyId, milestoneId: m.id }];
  const fact = writeLifeFact(draft, unitId, `${unit.displayName} (${entry.label}): ${plainText(m.line)}`, ['hobby', hobbyId, m.id], n === 3 ? 2 : 1);
  if (opts.caused === true) life.delivered.push({ day: draft.day, unitId, category: 'hobby', hobby: true, caused: true });
  else if (opts.told !== true) {
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
  if (n === 3) events.push(...masterHobby(draft, unit, h, entry));
  return events;
}

/** She gets past a plateau: skill is the milestone ahead and it is granted. Nothing at the ceiling or once all four are reached. */
export function breakthrough(
  draft: CampaignState, reg: Registries, unitId: string, hobbyId: string, _day: number, opts: { caused?: true } = {},
): EngineEvent[] {
  const h = unitOf(draft, unitId)?.hobbies?.find((x) => x.id === hobbyId);
  if (!h || h.ceiling === true || h.milestones.length >= 4) return [];
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
