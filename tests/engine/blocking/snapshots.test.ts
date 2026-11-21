import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { rollbackAfter } from '../../../src/engine/blocking/snapshots';
import { newLife } from '../../../src/engine/life/state';
import { practiceSlots } from '../../../src/engine/life/hobbies';
import { busySlot } from '../../../src/engine/life/places';
import type { CampaignState, HobbyState } from '../../../src/engine/state/types';
import { lifeDirectives } from '../../../src/life/directives';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetBlockingHooks());

const ANN = 'unit_ann';
const take = (id: string): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [] });

/** Day 40, life on, Ann a confidant (the blocking is live). */
function world(slot: CampaignState['slot'] = 'afternoon', stateId = 'confidant'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.slot = slot;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  setRelation(s, ANN, { stateId });
  return s;
}
/** A quiet meeting, opened the way the app does. */
function meet(s: CampaignState, id: string): CampaignState {
  const done = run(s, reg, { type: 'life/time_together', payload: { unitId: ANN, pastimeId: id } });
  expect(errors(done.events)).toEqual([]);
  const started = run(done.state, reg, { type: 'scene/start', payload: { locationId: done.state.life!.pending!.locationId, participants: [ANN], origin: 'activity', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}
const start = (s: CampaignState, over: Record<string, unknown> = {}): CampaignState => {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0, ...over } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};

describe('the scene\'s starting blocking (R6)', () => {
  it('a pastime sets the activities the gates allow: hers, and the commander\'s only at frame play', () => {
    const open = meet(world(), 'fix_gear');
    expect(open.scene!.blocking).toEqual({ [ANN]: { activity: 'repairing_gear' } });
    expect(open.scene!.stagingLog).toBeUndefined(); // the start is not a change
    resetBlockingHooks();
    registerFrameReader(() => 'play');
    const play = meet(world(), 'fix_gear');
    expect(play.scene!.blocking).toEqual({ [ANN]: { activity: 'repairing_gear' }, [COMMANDER]: { activity: 'holding_for_her' } });
  });

  it('a workshop scene sets repairing_gear, a plain one sets nothing (activityId in the payload, or derived from the talk\'s place)', () => {
    expect(start(world(), { activityId: 'workshop' }).scene!.blocking).toEqual({ [ANN]: { activity: 'repairing_gear' } });
    expect(start(world(), { activityId: 'rest' }).scene!.blocking).toBeUndefined();
    expect(start(world()).scene!.blocking).toBeUndefined();
    expect(start(world(), { activityId: 'workshop' }).scene!.activityId).toBe('workshop');
    // a talk in the workshop: no activityId given, the place says which activity it is
    const talk = run(world(), reg, { type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } }).state;
    const s = start(talk, { origin: 'activity', consumesSlot: undefined });
    expect(s.scene!.activityId).toBe('workshop');
    expect(s.scene!.blocking).toEqual({ [ANN]: { activity: 'repairing_gear' } });
  });

  it('not live: nothing is set and nothing is stored on the scene', () => {
    const s = start(world('afternoon', 'comrade'), { activityId: 'workshop' });
    expect(s.scene!.blocking).toBeUndefined();
    expect(s.scene!.stagingLog).toBeUndefined();
    const pastime = meet(world('afternoon', 'comrade'), 'fix_gear');
    expect(pastime.scene!.blocking).toBeUndefined();
  });

  it('a quiet meeting started from inside an open scene sets her activity too (life/pastime_in_scene)', () => {
    const s = start(world(), { locationId: 'workshop' });
    const r = run(s, reg, { type: 'life/pastime_in_scene', payload: { pastimeId: 'fix_gear' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.blocking![ANN]!.activity).toBe('repairing_gear');
  });

  it('a scene that ends takes the blocking, the moments and the log with it', () => {
    let s = start(world());
    s = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting', at: 1 } }).state;
    expect(s.scene!.stagingLog).toHaveLength(1);
    const ended = run(s, reg, { type: 'scene/end', payload: {} }).state;
    expect(ended.scene).toBeUndefined();
    expect(JSON.stringify(ended)).not.toContain('stagingLog');
  });
});

describe('the log and rollbackAfter (R7)', () => {
  const posture = (s: CampaignState, value: string, at: number): CampaignState => {
    const r = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value, at } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };

  it('restores the state before the oldest change made after the index, and drops the log from there', () => {
    let s = start(world());
    s = posture(s, 'sitting', 4);
    s = posture(s, 'kneeling_upright', 6);
    s = posture(s, 'standing', 8);
    const d = structuredClone(s);
    expect(rollbackAfter(d, 5)).toBe(true);
    expect(d.scene!.blocking).toEqual({ [COMMANDER]: { posture: 'sitting' } });
    expect(d.scene!.stagingLog).toHaveLength(1);
    expect(d.scene!.stagingLog![0]!.at).toBe(4);
    const e = structuredClone(s);
    expect(rollbackAfter(e, 3)).toBe(true);
    expect(e.scene!.blocking).toBeUndefined();
    expect(e.scene!.stagingLog).toBeUndefined();
  });

  it('with nothing after the index it does nothing', () => {
    let s = start(world());
    s = posture(s, 'sitting', 4);
    const d = structuredClone(s);
    expect(rollbackAfter(d, 4)).toBe(false);
    expect(rollbackAfter(d, 9)).toBe(false);
    expect(d).toEqual(s);
    expect(rollbackAfter(structuredClone(world()), 0)).toBe(false); // no scene
  });

  it('blocking/rollback { after } emits blocking_rolled_back, or nothing', () => {
    let s = start(world());
    s = posture(s, 'sitting', 6);
    const r = run(s, reg, { type: 'blocking/rollback', payload: { after: 5 } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'blocking_rolled_back')).toEqual([{ type: 'blocking_rolled_back', after: 5 }]);
    expect(r.state.scene!.blocking).toBeUndefined();
    const none = run(s, reg, { type: 'blocking/rollback', payload: { after: 7 } });
    expect(none.events).toEqual([]);
    expect(none.state).toEqual(s);
    expect(errors(run(s, reg, { type: 'blocking/rollback', payload: { after: 'x' } }).events)).toHaveLength(1);
  });

  it('a rollback draws no rng', () => {
    const s = posture(start(world()), 'sitting', 6);
    expect(run(s, reg, { type: 'blocking/rollback', payload: { after: 5 } }).state.rng).toEqual(s.rng);
  });

  it('the log is capped at 40', () => {
    let s = start(world());
    for (let i = 0; i < 43; i++) s = posture(s, i % 2 === 0 ? 'sitting' : 'standing', i + 1);
    expect(s.scene!.stagingLog).toHaveLength(40);
    const d = structuredClone(s);
    setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'curled' }, { at: 99, source: 'engine' });
    expect(d.scene!.stagingLog).toHaveLength(40);
  });
});

describe('scene end counts practice (P14c)', () => {
  const play = (s: CampaignState, hobbies: HobbyState[]): CampaignState => {
    s.squad.find((u) => u.id === ANN)!.hobbies = hobbies;
    let o = start(s);
    o = run(o, reg, { type: 'blocking/set', payload: { person: ANN, field: 'activity', value: 'reading_book', at: 2 } }).state;
    expect(errors(run(o, reg, { type: 'blocking/set', payload: { person: ANN, field: 'activity', value: 'reading_book', at: 2 } }).events)).toEqual([]);
    return run(o, reg, { type: 'scene/end', payload: {} }).state;
  };

  it('her blocking activity is in an active hobby\'s activityIds: the slot she spent counts as practice', () => {
    const s = world('afternoon');
    const ended = play(s, [take('reading')]);
    const busy = ended.life!.busy.find((b) => b.unitId === ANN);
    expect(busy).toMatchObject({ slot: busySlot(40, 'afternoon'), blockingActivityId: 'reading_book' });
    expect(practiceSlots(ended, reg, ANN, 40).filter((p) => p.slot === 'afternoon').map((p) => [p.slot, p.hobbyId])).toEqual([['afternoon', 'reading']]);
  });

  it('no such hobby, or one that is not active: no change', () => {
    const afternoon = (s: CampaignState) => practiceSlots(s, reg, ANN, 40).filter((p) => p.slot === 'afternoon');
    expect(afternoon(play(world('afternoon'), []))).toEqual([]);
    expect(afternoon(play(world('afternoon'), [{ ...take('reading'), state: 'cooling' }]))).toEqual([]);
    expect(afternoon(play(world('afternoon'), [take('sketching')]))).toEqual([]);
  });

  it('a scene with no blocking activity leaves the busy slot as it was', () => {
    const s = world('afternoon');
    s.squad.find((u) => u.id === ANN)!.hobbies = [take('reading')];
    const ended = run(start(s), reg, { type: 'scene/end', payload: {} }).state;
    expect(ended.life!.busy.find((b) => b.unitId === ANN)).toEqual({ unitId: ANN, slot: busySlot(40, 'afternoon') });
    expect(practiceSlots(ended, reg, ANN, 40).filter((p) => p.slot === 'afternoon')).toEqual([]);
  });
});

describe('life:pastime: drops only the words that were set as blocking activities', () => {
  it('her word is gone (it is in [BLOCKING]), the commander\'s stays, at frame equal', () => {
    const open = meet(world(), 'fix_gear');
    const d = lifeDirectives(open, reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(d.text).toContain('A quiet meeting with no stakes');
    expect(d.text).not.toContain('Ann: repairing_gear');
    expect(d.text).toContain('The commander: holding_for_her');
  });

  it('with both set neither word is repeated; with neither (not live) both stay as before', () => {
    registerFrameReader(() => 'play');
    const both = lifeDirectives(meet(world(), 'fix_gear'), reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(both.text).not.toContain('Ann: ');
    expect(both.text).not.toContain('the commander: ');
    resetBlockingHooks();
    const off = lifeDirectives(meet(world('afternoon', 'comrade'), 'fix_gear'), reg, [ANN]).find((x) => x.id === `life:pastime:${ANN}`)!;
    expect(off.text).toContain('Ann: repairing_gear');
    expect(off.text).toContain('the commander: holding_for_her');
  });
});

describe('swipe during a hold keeps the run', () => {
  it('while a physics runs nothing is rolled back: the contact it stands on stays, and so does the log', () => {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    s.content = { enabled: ['worship', 'restraint'] };
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(started, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 5, source: 'chip' });
    expect(started.scene!.physics).toBeDefined();
    const before = structuredClone(started);
    expect(rollbackAfter(started, 2)).toBe(false);
    expect(started).toEqual(before);
    // without a run the same swipe takes the contact back
    const quiet = structuredClone(before);
    delete quiet.scene!.physics;
    expect(rollbackAfter(quiet, 2)).toBe(true);
    expect(quiet.scene!.blocking).toBeUndefined();
  });
});
