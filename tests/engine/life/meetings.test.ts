import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { availablePastimes, commanderHobbyWord, pastimeLocation, pastimeProblem } from '../../../src/engine/life/meetings';
import { milestoneAt } from '../../../src/engine/life/hobbies';
import { newLife } from '../../../src/engine/life/state';
import type { HobbyEntry, PastimeEntry } from '../../../src/engine/life/types';
import type { CampaignState, HobbyState, Slot } from '../../../src/engine/state/types';
import { lifeDirectives } from '../../../src/life/directives';
import { personalOf } from '../../../src/engine/personal/state';
import { writeLifeFact } from '../../../src/engine/life/facts';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const mine = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const pastime = (id: string): PastimeEntry => reg.pastimes.get(id) as unknown as PastimeEntry;
const hobby = (id: string): HobbyEntry => reg.hobbies.get(id) as unknown as HobbyEntry;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [], ...over });

/** Day 40, morning, life normal, a block with a salt. */
function world(slot: Slot = 'morning'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.slot = slot;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  return s;
}
const problem = (s: CampaignState, id: string, at?: { locationId: string; slot: Slot }) => pastimeProblem(s, reg, ANN, id, at);

/** Runs the action, opens the scene it asks for, and returns the open campaign. */
function meet(s: CampaignState, id: string, unitId = ANN): CampaignState {
  const done = run(s, reg, { type: 'life/time_together', payload: { unitId, pastimeId: id } });
  expect(errors(done.events)).toEqual([]);
  const loc = done.state.life!.pending!.locationId;
  const started = run(done.state, reg, { type: 'scene/start', payload: { locationId: loc, participants: [unitId], origin: 'activity', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}

describe('who may have a quiet meeting, and when', () => {
  it('is open with any closeness except hostility', () => {
    const s = world();
    expect(problem(s, 'tidy_her_quarters')).toBeNull();
    s.relations[ANN].affinity = -29;
    expect(problem(s, 'tidy_her_quarters')).toBeNull();
    s.relations[ANN].affinity = -30;
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
    s.relations[ANN].affinity = -31;
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
  });

  it('is refused while life is off, for a grunt, an unknown pastime and a woman out on a run', () => {
    const off = world();
    delete off.settings.lifeEvents;
    expect(problem(off, 'tidy_her_quarters')).toEqual(expect.any(String));
    const s = world();
    expect(problem(s, 'no_such_pastime')).toEqual(expect.any(String));
    expect(pastimeProblem(s, reg, 'nobody', 'tidy_her_quarters')).toEqual(expect.any(String));
    s.expedition = { party: [ANN] } as unknown as CampaignState['expedition'];
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
  });

  it('is refused for a woman who is deserting or has gone', () => {
    const s = world();
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, day: 40, at: 'night' } };
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
    expect(pastimeProblem(s, reg, BEA, 'tidy_her_quarters')).toBeNull();
    const gone = world();
    mine(gone).status = 'deserted';
    expect(problem(gone, 'tidy_her_quarters')).toEqual(expect.any(String));
  });

  it('is refused while she is confined', () => {
    const s = world();
    s.discipline = { restrictions: [{ unitId: ANN, kind: 'confined', untilDay: 45 }] } as unknown as CampaignState['discipline'];
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
  });

  it('is refused the second time in a day', () => {
    const s = world();
    s.life!.units[ANN] = { last: {}, meetingDay: 40 };
    expect(problem(s, 'tidy_her_quarters')).toEqual(expect.any(String));
    s.life!.units[ANN] = { last: {}, meetingDay: 39 };
    expect(problem(s, 'tidy_her_quarters')).toBeNull();
  });

  it('keeps to the slots of the pastime', () => {
    expect(problem(world('morning'), 'tea_at_night')).toEqual(expect.any(String));
    expect(problem(world('night'), 'tea_at_night')).toBeNull();
    expect(problem(world('morning'), 'tea_at_night', { locationId: 'mess_hall', slot: 'night' })).toBeNull();
  });

  it('patch_each_other needs a run just back, and care_for_animal her animals', () => {
    const s = world();
    expect(problem(s, 'patch_each_other')).toEqual(expect.any(String));
    s.lastExpedition = { day: 39, party: [ANN], injuries: [] } as unknown as CampaignState['lastExpedition'];
    expect(problem(s, 'patch_each_other')).toBeNull();
    s.lastExpedition = { day: 30, party: [ANN], injuries: [] } as unknown as CampaignState['lastExpedition'];
    expect(problem(s, 'patch_each_other')).toEqual(expect.any(String));
    const t = world('afternoon');
    expect(problem(t, 'care_for_animal')).toEqual(expect.any(String));
    mine(t).hobbies = [take('animals')];
    expect(problem(t, 'care_for_animal')).toBeNull();
  });

  it('her_hobby needs an active hobby', () => {
    const s = world();
    expect(problem(s, 'her_hobby')).toEqual(expect.any(String));
    mine(s).hobbies = [take('reading', { state: 'dropped' })];
    expect(problem(s, 'her_hobby')).toEqual(expect.any(String));
    mine(s).hobbies = [take('reading')];
    expect(problem(s, 'her_hobby')).toBeNull();
  });

  it('a pastime in a scene must fit the scene place and slot, and the pastime that is her hobby her hobby place', () => {
    const s = world();
    expect(problem(s, 'fix_gear', { locationId: 'workshop', slot: 'morning' })).toBeNull();
    expect(problem(s, 'fix_gear', { locationId: 'mess_hall', slot: 'morning' })).toEqual(expect.any(String));
    mine(s).hobbies = [take('tinkering')];
    expect(problem(s, 'her_hobby', { locationId: 'workshop', slot: 'morning' })).toBeNull();
    expect(problem(s, 'her_hobby', { locationId: 'roof', slot: 'afternoon' })).toEqual(expect.any(String));
  });
});

describe('where the meeting is, and in what order they are listed', () => {
  it('laundry_together starts at the laundry', () => {
    const s = world('morning');
    expect(pastimeLocation(s, reg, pastime('laundry_together'))).toBe('laundry');
    const started = meet(s, 'laundry_together');
    expect(started.scene!.locationId).toBe('laundry');
    expect(started.scene!.pastime).toEqual({ id: 'laundry_together', unitId: ANN });
  });

  it('rain_on_the_roof needs only an open roof (no weather)', () => {
    expect(pastimeLocation(world('morning'), reg, pastime('rain_on_the_roof'))).toBeNull(); // the roof has no morning
    expect(problem(world('morning'), 'rain_on_the_roof')).toEqual(expect.any(String));
    expect(pastimeLocation(world('afternoon'), reg, pastime('rain_on_the_roof'))).toBe('roof');
    expect(problem(world('afternoon'), 'rain_on_the_roof')).toBeNull();
  });

  it('the first location that is open for the slot is used', () => {
    expect(pastimeLocation(world('night'), reg, pastime('cards'))).toBe('quarters_unit'); // the mess is closed at night
    expect(pastimeLocation(world('evening'), reg, pastime('cards'))).toBe('mess_hall');
  });

  it('her_hobby is held where her keenest active hobby is practised', () => {
    const s = world('morning');
    mine(s).hobbies = [take('reading', { interest: 50 }), take('tinkering', { interest: 80 })];
    expect(pastimeLocation(s, reg, pastime('her_hobby'), ANN)).toBe('workshop');
    mine(s).hobbies = [take('reading', { interest: 90 }), take('tinkering', { interest: 80 })];
    expect(pastimeLocation(s, reg, pastime('her_hobby'), ANN)).toBe('quarters_unit');
  });

  it('silent women see the quiet pastimes first, everyone else in the order of the registry', () => {
    const s = world('evening');
    const all = availablePastimes(s, reg, ANN).map((p) => p.id);
    expect(all.length).toBeGreaterThan(3);
    expect(all).toEqual([...reg.pastimes.values()].map((p) => p.id).filter((id) => all.includes(id)));
    mine(s).temperament = { talkativeness: 'silent', volatility: 'steady', humor: 'dry' };
    const silent = availablePastimes(s, reg, ANN);
    const firstSome = silent.findIndex((p) => p.talk === 'some');
    expect(firstSome).toBeGreaterThan(0);
    expect(silent.slice(firstSome).every((p) => p.talk === 'some')).toBe(true);
    expect(silent.slice(0, firstSome).every((p) => p.talk === 'quiet')).toBe(true);
    expect(silent.map((p) => p.id).sort()).toEqual([...all].sort());
  });
});

describe('the meeting', () => {
  it('applies at scene end only: Affinity +2, stress -5, the history line, the slot', () => {
    const s = world('afternoon');
    mine(s).stress = 30;
    const open = meet(s, 'tidy_her_quarters');
    expect(open.relations[ANN].affinity).toBe(s.relations[ANN].affinity);
    expect(mine(open).stress).toBe(30);
    expect(open.life!.units[ANN].meetingDay).toBeUndefined();
    expect(open.life!.pending).toBeUndefined();
    const ended = run(open, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.relations[ANN].affinity).toBe(s.relations[ANN].affinity + 2);
    expect(mine(ended.state).stress).toBe(25);
    expect(ended.state.life!.units[ANN].meetingDay).toBe(40);
    expect(ended.state.relations[ANN].history.some((h) => h.kind === 'event' && h.type === 'time_together')).toBe(true);
    expect(String(reg.eventDeltas.get('time_together')!.journal)).toMatch(/quiet hour/);
    expect(ended.state.slot).not.toBe('afternoon'); // the slot was spent by the scene
  });

  it('an Affinity gain that has already been made today is diminished like any other', () => {
    const s = world('afternoon');
    s.relations[ANN].affinity = 10;
    s.relations[ANN].dailyGain.affinity = 100; // a day of gains already
    const ended = run(meet(s, 'tidy_her_quarters'), reg, { type: 'scene/end', payload: {} }).state;
    const gained = ended.relations[ANN].affinity - 10;
    expect(gained).toBeGreaterThanOrEqual(0);
    expect(gained).toBeLessThan(2);
  });

  it('an aborted scene applies nothing', () => {
    const s = world('afternoon');
    mine(s).stress = 30;
    const open = meet(s, 'tidy_her_quarters');
    const gone = run(open, reg, { type: 'scene/abort', payload: {} }).state;
    expect(gone.relations[ANN].affinity).toBe(s.relations[ANN].affinity);
    expect(mine(gone).stress).toBe(30);
    expect(gone.life!.units[ANN].meetingDay).toBeUndefined();
    expect(gone.scene).toBeUndefined();
  });

  it('time_together spends nothing until the scene ends, and refuses what the picker would not list', () => {
    const s = world('morning');
    const done = run(s, reg, { type: 'life/time_together', payload: { unitId: ANN, pastimeId: 'tea_at_night' } });
    expect(errors(done.events)).toHaveLength(1);
    const ok = run(s, reg, { type: 'life/time_together', payload: { unitId: ANN, pastimeId: 'tidy_her_quarters' } });
    expect(errors(ok.events)).toEqual([]);
    expect(ofType(ok.events, 'scene_requested')).toHaveLength(1);
    expect(ofType(ok.events, 'pastime_set')).toEqual([{ type: 'pastime_set', unitId: ANN, pastimeId: 'tidy_her_quarters' }]);
    expect(ok.state.slot).toBe('morning');
    expect(ok.state.life!.pending).toEqual({ unitId: ANN, pastimeId: 'tidy_her_quarters', locationId: 'quarters_unit', day: 40, slot: 'morning' });
  });

  it('a cancelled conversation drops the waiting meeting', () => {
    const s = world('morning');
    const ok = run(s, reg, { type: 'life/time_together', payload: { unitId: ANN, pastimeId: 'tidy_her_quarters' } }).state;
    const back = run(ok, reg, { type: 'calendar/cancel_scene', payload: {} }).state;
    expect(back.life!.pending).toBeUndefined();
  });

  it('her_hobby practises her keenest hobby and pushes it, and the commander learns', () => {
    const s = world('morning');
    mine(s).hobbies = [take('reading', { interest: 50, skill: 2 }), take('tinkering', { interest: 70, skill: 2 })];
    const ended = run(meet(s, 'her_hobby'), reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    const h = (id: string) => mine(ended.state).hobbies!.find((x) => x.id === id)!;
    expect(h('tinkering').skill).toBeGreaterThan(2);
    expect(h('tinkering').interest).toBe(78); // the push
    expect(h('reading')).toMatchObject({ skill: 2, interest: 50 });
    expect(ended.state.commander.hobbySkill).toEqual({ tinkering: 2 });
  });

  it('a push breaks her plateau and the step is told at once', () => {
    const s = world('morning');
    mine(s).hobbies = [take('tinkering', { skill: 5, plateau: { at: 5, since: 30 } })];
    const ended = run(meet(s, 'her_hobby'), reg, { type: 'scene/end', payload: {} });
    const t = mine(ended.state).hobbies![0];
    expect(t.milestones).toHaveLength(1);
    expect(t.plateau).toBeUndefined();
    const fact = ended.state.memory.facts.find((f) => f.tags.includes(hobby('tinkering').milestones[0].id));
    expect(fact).toBeDefined();
    expect(fact!.hiddenFromCommander).toBeUndefined(); // the commander was there
  });

  it('the commander learns four when it is teachable and she is past her second milestone, and the first teaching is remembered', () => {
    const s = world('morning');
    const m = hobby('tinkering').milestones.map((x) => x.id);
    expect(hobby('tinkering').teachable).toBe(true);
    mine(s).hobbies = [take('tinkering', { skill: milestoneAt(7, ANN, 'tinkering', 1) + 1, milestones: [m[0], m[1]] })];
    const before = s.memory.nextId ?? 0;
    const ended = run(meet(s, 'her_hobby'), reg, { type: 'scene/end', payload: {} });
    expect(ended.state.commander.hobbySkill).toEqual({ tinkering: 4 });
    expect(ofType(ended.events, 'hobby_taught')).toEqual([{ type: 'hobby_taught', unitId: ANN, hobbyId: 'tinkering' }]);
    expect(ended.state.life!.units[ANN].taught).toEqual(['tinkering']);
    const fact = ended.state.memory.facts.find((f) => f.tags.includes('taught'));
    expect(fact).toBeDefined();
    expect(fact!.about).toEqual([ANN]);
    expect(fact!.text).toContain('Ann');
    expect(ended.state.memory.nextId).toBeGreaterThan(before);
    // the second time teaches again but writes no second fact
    const again = structuredClone(ended.state);
    again.slot = 'morning';
    again.life!.units[ANN].meetingDay = 39;
    const second = run(meet(again, 'her_hobby'), reg, { type: 'scene/end', payload: {} });
    expect(second.state.commander.hobbySkill).toEqual({ tinkering: 8 });
    expect(ofType(second.events, 'hobby_taught')).toEqual([]);
    expect(second.state.memory.facts.filter((f) => f.tags.includes('taught'))).toHaveLength(1);
  });

  it('a hobby she cannot teach adds two, and the commander skill stops at 100', () => {
    const s = world('morning');
    const nt = [...reg.hobbies.values()].find((h) => (h as unknown as HobbyEntry).teachable === false && (h as unknown as HobbyEntry).locations.includes('quarters_unit'))!;
    mine(s).hobbies = [take(nt.id as string, { skill: 40, milestones: hobby(nt.id as string).milestones.slice(0, 3).map((x) => x.id) })];
    s.commander.hobbySkill = { [nt.id as string]: 99 };
    const ended = run(meet(s, 'her_hobby'), reg, { type: 'scene/end', payload: {} });
    expect(ended.state.commander.hobbySkill).toEqual({ [nt.id as string]: 100 });
    expect(ofType(ended.events, 'hobby_taught')).toEqual([]);
  });

  it('the commander hobby word is a descriptor', () => {
    expect([0, 9, 10, 29, 30, 59, 60, 100].map(commanderHobbyWord)).toEqual(['none', 'none', 'a beginner', 'a beginner', 'getting there', 'getting there', 'good at it', 'good at it']);
  });
});

describe('the activity of a quiet hour', () => {
  it('is not done directly: activity/do refuses it and holds nothing', () => {
    const s = world('afternoon');
    const done = run(s, reg, { type: 'activity/do', payload: { activityId: 'time_together', companionId: ANN } });
    expect(errors(done.events)).toHaveLength(1);
    expect(done.state.calendar.pendingScene).toBeUndefined();
    expect(done.state.slot).toBe('afternoon');
  });
});

describe('the guards of a slot-spending action', () => {
  const ask: { type: string; payload: unknown } = { type: 'life/time_together', payload: { unitId: ANN, pastimeId: 'tidy_her_quarters' } };

  it('a presented dilemma refuses a quiet hour like any activity', () => {
    const s = world('afternoon');
    s.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'minor', context: 'base', day: 40, status: 'presented', attempts: 1, units: [], beatId: 'b' } } as CampaignState['dilemmas'];
    const r = run(s, reg, ask);
    expect(r.events).toEqual([{ type: 'error', code: 'dilemma_open', message: 'A decision is waiting: answer it first.' }]);
    expect(r.state).toBe(s);
    expect(run(s, reg, { type: 'activity/do', payload: { activityId: 'rest' } }).events[0]).toMatchObject({ code: 'dilemma_open' }); // the same refusal
  });

  it('a due booking refuses a quiet hour with another woman, like any activity', () => {
    const s = world('evening');
    personalOf(s).bookings = [{ id: 'b1', unitId: BEA, kindId: 'evening_with_me', day: 40, slot: 'evening', status: 'booked', source: 'roll', made: 39 }];
    const r = run(s, reg, ask);
    expect(r.events[0]).toMatchObject({ type: 'error', code: 'booking_due', message: 'Bea has booked this slot: go to her or cancel it.' });
    expect(r.state).toBe(s);
  });

  it('labelling a scene that is already open spends nothing and is not refused by a waiting dilemma (it would strand the scene)', () => {
    const s = world('afternoon');
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    started.dilemmas = { seq: 1, open: { id: 'dl1', templateId: 't', scale: 'minor', context: 'base', day: 40, status: 'presented', attempts: 1, units: [], beatId: 'b' } } as CampaignState['dilemmas'];
    const r = run(started, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.pastime).toEqual({ id: 'fix_gear', unitId: ANN });
  });
});

describe('her_hobby shows only a hobby the commander knows she has', () => {
  it('an untold hobby is never the one: not offered alone, not in the place, the directive or the commander skills', () => {
    const s = world('morning');
    mine(s).hobbies = [take('chess', { interest: 95 })]; // taken up off-screen, not told
    writeLifeFact(s, ANN, 'Ann has taken up chess.', ['hobby', 'chess', 'started'], 1);
    expect(problem(s, 'her_hobby')).toEqual(expect.any(String));
    expect(pastimeLocation(s, reg, pastime('her_hobby'), ANN)).toBeNull();
    expect(availablePastimes(s, reg, ANN).map((p) => p.id)).not.toContain('her_hobby');
    // with a told hobby beside it the told one is picked, however keen she is on the other
    mine(s).hobbies = [take('chess', { interest: 95 }), take('tinkering', { interest: 60 })];
    expect(problem(s, 'her_hobby')).toBeNull();
    expect(pastimeLocation(s, reg, pastime('her_hobby'), ANN)).toBe('workshop');
    const open = meet(s, 'her_hobby');
    const d = lifeDirectives(open, reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(d.text).toContain(hobby('tinkering').label);
    expect(d.text).not.toContain(hobby('chess').label);
    const ended = run(open, reg, { type: 'scene/end', payload: {} }).state;
    expect(Object.keys(ended.commander.hobbySkill ?? {})).toEqual(['tinkering']);
    expect(mine(ended).hobbies!.find((x) => x.id === 'chess')).toMatchObject({ skill: 0, interest: 95 });
  });
});

describe('a pastime proposed inside a scene', () => {
  function inScene(s: CampaignState, locationId = 'workshop', participants = [ANN]): CampaignState {
    const started = run(s, reg, { type: 'scene/start', payload: { locationId, participants, origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    return started.state;
  }

  it('sets the pastime of an open private scene and spends no slot', () => {
    const open = inScene(world('morning'));
    const done = run(open, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } });
    expect(errors(done.events)).toEqual([]);
    expect(done.state.scene!.pastime).toEqual({ id: 'fix_gear', unitId: ANN });
    expect(done.state.slot).toBe('morning');
    expect(ofType(done.events, 'pastime_set')).toHaveLength(1);
    const ended = run(done.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.relations[ANN].affinity).toBe(open.relations[ANN].affinity + 2);
  });

  it('is refused outside a private scene, for a pastime that does not fit the place, or twice', () => {
    const none = run(world(), reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } });
    expect(errors(none.events)).toHaveLength(1);
    const group = inScene(world(), 'workshop', [ANN, BEA]);
    expect(errors(run(group, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } }).events)).toHaveLength(1);
    const open = inScene(world());
    expect(errors(run(open, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'cook_together' } }).events)).toHaveLength(1);
    const set = run(open, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } }).state;
    expect(errors(run(set, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } }).events)).toHaveLength(1);
  });
});

describe('the directive of a quiet meeting', () => {
  it('carries the opening and both activities, with no pronoun for the commander', () => {
    const open = meet(world('afternoon'), 'fix_gear');
    const d = lifeDirectives(open, reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`);
    expect(d).toBeDefined();
    const p = pastime('fix_gear');
    expect(d!.expiresAfter).toBe('scene');
    expect(d!.text).toContain(p.opening.trim());
    expect(d!.text).toContain('A quiet meeting with no stakes');
    expect(d!.text).toContain(`Ann: ${p.herActivity}`);
    expect(d!.text).toContain(`the commander: ${p.commanderActivity}`);
    expect(d!.text).not.toMatch(/AUTHOR TO WRITE/);
    expect(d!.text).not.toMatch(/\b(he|him|his|himself|they|them|their)\b/i);
  });

  it('names her hobby for her_hobby and is gone with the scene', () => {
    const s = world('morning');
    mine(s).hobbies = [take('tinkering')];
    const open = meet(s, 'her_hobby');
    const d = lifeDirectives(open, reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(d.text).toContain(hobby('tinkering').label);
    const ended = run(open, reg, { type: 'scene/end', payload: {} }).state;
    expect(lifeDirectives(ended, reg, [ANN]).find((x) => x.id.startsWith('life:pastime:'))).toBeUndefined();
  });

  it('says the breakthrough comes when her hobby is on a plateau', () => {
    const s = world('morning');
    mine(s).hobbies = [take('tinkering', { skill: 5, plateau: { at: 5, since: 30 } })];
    const d = lifeDirectives(meet(s, 'her_hobby'), reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(d.text).toContain('gets it right for the first time today');
    const flat = world('morning');
    mine(flat).hobbies = [take('tinkering', { skill: 5 })];
    expect(lifeDirectives(meet(flat, 'her_hobby'), reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!.text).not.toContain('first time today');
  });

  it('nothing while life is off', () => {
    const open = meet(world('afternoon'), 'fix_gear');
    delete open.settings.lifeEvents;
    expect(lifeDirectives(open, reg, [ANN])).toEqual([]);
  });
});
