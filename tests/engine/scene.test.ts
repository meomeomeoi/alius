import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];

const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  return s;
};
const start = (s: CampaignState, over: Record<string, unknown> = {}) =>
  run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 7, ...over } });
const rejected = (s: CampaignState, action: { type: string; payload?: unknown }, match?: RegExp) => {
  const r = run(s, reg, action);
  expect(r.state, JSON.stringify(action)).toBe(s);
  expect(errors(r.events)).toHaveLength(1);
  if (match) expect(String(errors(r.events)[0].message)).toMatch(match);
};
const talk = (s: CampaignState, unit = ANN) => run(s, reg, { type: 'activity/do', payload: { activityId: 'talk', companionId: unit } }).state;

describe('scene/start', () => {
  it('talk then scene/start creates the scene and keeps the slot held', () => {
    const t = talk(fresh());
    expect(t.calendar.pendingScene).toMatchObject({ unitId: ANN });
    const r = start(t, { origin: 'activity', locationId: 'quarters_commander' });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene).toEqual({
      id: 's1', day: 1, slot: 'morning', locationId: 'quarters_commander', participants: [ANN], mode: 'private',
      origin: 'activity', consumesSlot: true, startIndex: 7, readIndex: 7, exchanges: 0,
    });
    expect(r.state.calendar.pendingScene).toEqual(t.calendar.pendingScene);
    expect(ofType(r.events, 'scene_started')).toEqual([{ type: 'scene_started', sceneId: 's1', participants: [ANN], locationId: 'quarters_commander' }]);
    rejected(r.state, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'x' } });
  });

  it('an event scene holds the slot too, and a group is a group', () => {
    const r = start(fresh(), { participants: [ANN, BEA, CAT] });
    expect(r.state.scene).toMatchObject({ mode: 'group', participants: [ANN, BEA, CAT], origin: 'event' });
    expect(r.state.calendar.pendingScene).toMatchObject({ unitId: ANN, slot: 'morning' });
  });

  it('rejects a grunt, a dead unit, a fourth participant, an unknown location, a second open scene', () => {
    const s = fresh();
    s.squad.find((u) => u.id === DEE)!.status = 'dead';
    const grunt = run(s, reg, { type: 'base/recruit_grunt', payload: {} });
    const g = grunt.state.squad.find((u) => u.kind === 'grunt');
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [DEE], origin: 'event', startIndex: 0 } }, /not available/);
    if (g) rejected(grunt.state, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [g.id], origin: 'event', startIndex: 0 } }, /grunt|character card/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT, DEE], origin: 'event', startIndex: 0 } }, /1 to 3/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'nowhere', participants: [ANN], origin: 'event', startIndex: 0 } }, /location/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, ANN], origin: 'event', startIndex: 0 } }, /twice/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ['ghost'], origin: 'event', startIndex: 0 } }, /unknown|not available/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'bogus', startIndex: 0 } }, /origin/);
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: -1 } }, /startIndex/);
    const open = start(s).state;
    rejected(open, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA], origin: 'event', startIndex: 0 } }, /already open/);
  });

  it('rejects a location closed in this slot', () => {
    const s = fresh();
    rejected(s, { type: 'scene/start', payload: { locationId: 'roof', participants: [ANN], origin: 'event', startIndex: 0 } }, /not available in the morning/);
    s.slot = 'afternoon';
    expect(errors(start(s, { locationId: 'roof' }).events)).toEqual([]);
  });

  it('activity origin needs the matching open talk', () => {
    const s = fresh();
    rejected(s, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'activity', startIndex: 0 } }, /talk|conversation/);
    const t = talk(s, ANN);
    rejected(t, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA], origin: 'activity', startIndex: 0 } }, /talk|conversation/);
    rejected(t, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA], origin: 'event', startIndex: 0 } }, /conversation|talk/);
  });

  it('night scene only in the Night slot', () => {
    const s = fresh();
    rejected(s, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0 } }, /Night/i);
    s.slot = 'night';
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0, nightEntryId: 'n1' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene).toMatchObject({ origin: 'night', nightEntryId: 'n1', slot: 'night' });
  });
});

describe('scene/exchange and scene/abort', () => {
  it('counts exchanges', () => {
    let s = start(fresh()).state;
    s = run(s, reg, { type: 'scene/exchange', payload: {} }).state;
    const r = run(s, reg, { type: 'scene/exchange', payload: {} });
    expect(r.state.scene!.exchanges).toBe(2);
    expect(ofType(r.events, 'scene_exchange')).toEqual([{ type: 'scene_exchange', exchanges: 2 }]);
    rejected(fresh(), { type: 'scene/exchange', payload: {} });
  });
  it('abort drops the scene without a slot; an activity talk stays open for cancel_scene', () => {
    const t = talk(fresh());
    const open = start(t, { origin: 'activity' }).state;
    const r = run(open, reg, { type: 'scene/abort', payload: {} });
    expect(r.state.scene).toBeUndefined();
    expect(r.state.calendar.pendingScene).toEqual(t.calendar.pendingScene);
    expect(r.state.slot).toBe('morning');
    const c = run(r.state, reg, { type: 'calendar/cancel_scene', payload: {} });
    expect(errors(c.events)).toEqual([]);
    const e = run(start(fresh()).state, reg, { type: 'scene/abort', payload: {} });
    expect(e.state.calendar.pendingScene).toBeUndefined();
    rejected(fresh(), { type: 'scene/abort', payload: {} });
  });
});

describe('scene/end', () => {
  it('writes chronicle and facts, releases the lock and consumes one slot', () => {
    const s = start(fresh(), { participants: [ANN, BEA] }).state;
    const r = run(s, reg, { type: 'scene/end', payload: { summary: {
      chronicle: 'Ann and Bea argued over the rations.',
      facts: [{ about: [ANN], text: 'Ann skips meals.', importance: 3, tags: [] }, { about: ['unit_cat'], text: 'ignored: not a participant', importance: 3, tags: [] }],
    } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene).toBeUndefined();
    expect(r.state.calendar.pendingScene).toBeUndefined();
    expect(r.state.slot).toBe('afternoon');
    expect(r.state.memory.chronicle).toMatchObject([{ kind: 'scene', day: 1, text: 'Ann and Bea argued over the rations.', sceneId: 's1' }]);
    expect(r.state.memory.facts).toMatchObject([{ text: 'Ann skips meals.', knownBy: [ANN, BEA], sceneId: 's1' }]);
    const types = r.events.map((e) => e.type);
    expect(types.indexOf('scene_ended')).toBeLessThan(types.indexOf('slot_advanced'));
    expect(ofType(r.events, 'scene_ended')).toEqual([{ type: 'scene_ended', sceneId: 's1', consumed: true }]);
  });

  it('caps the chronicle line at 240 characters', () => {
    const r = run(start(fresh()).state, reg, { type: 'scene/end', payload: { summary: { chronicle: 'x'.repeat(500), facts: [] } } });
    expect(r.state.memory.chronicle[0].text).toHaveLength(240);
  });

  it('scene/end without a summary writes the fallback line', () => {
    const r = run(start(fresh(), { participants: [ANN, BEA] }).state, reg, { type: 'scene/end', payload: {} });
    expect(r.state.memory.chronicle[0].text).toBe('Mess hall: Ann, Bea talked.');
    expect(r.state.memory.facts).toEqual([]);
    expect(r.state.slot).toBe('afternoon');
  });

  it('scene/end without a scene is rejected', () => {
    rejected(fresh(), { type: 'scene/end', payload: {} });
  });

  it('a mess scene with consumesSlot false consumes nothing', () => {
    const r = run(start(fresh(), { consumesSlot: false }).state, reg, { type: 'scene/end', payload: {} });
    expect(r.state.slot).toBe('morning');
    expect(r.state.scene).toBeUndefined();
    expect(r.state.calendar.pendingScene).toBeUndefined();
    expect(ofType(r.events, 'scene_ended')).toMatchObject([{ consumed: false }]);
  });

  it('a talk scene consumes the slot the talk held', () => {
    const s = start(talk(fresh()), { origin: 'activity' }).state;
    const r = run(s, reg, { type: 'scene/end', payload: {} });
    expect(r.state.slot).toBe('afternoon');
  });

  it('scene/end in the Night slot rolls the day over', () => {
    const s = fresh();
    s.slot = 'night';
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0 } }).state;
    const r = run(open, reg, { type: 'scene/end', payload: {} });
    expect(r.state.day).toBe(2);
    expect(r.state.slot).toBe('morning');
    expect(ofType(r.events, 'day_started')).toHaveLength(1);
  });

  it('a secret affair can be discovered at scene end', () => {
    const s = fresh();
    s.squad.forEach((u) => { s.relations[u.id].stateId = 'comrade'; });
    s.relations[BEA].stateId = 'lover';
    s.relations[ANN].stateId = 'secret_affair';
    s.relations[ANN].affair = { as: 'flirting', hiddenFrom: [BEA], since: 1 };
    // forced by a public fact tagged affair: certain discovery
    s.memory.facts.push({ id: 'f1', about: [ANN], text: 'seen together', tags: ['affair'], importance: 4, day: 1, knownBy: ['*'] });
    const open = start(s, { participants: [ANN, BEA] }).state;
    const r = run(open, reg, { type: 'scene/end', payload: {} });
    expect(ofType(r.events, 'affair_discovered')).toEqual([{ type: 'affair_discovered', unitId: ANN, by: [BEA] }]);
    expect(r.state.relations[ANN].stateId).toBe('flirting');
  });
});

describe('proposal, intimacy and compaction actions', () => {
  it('proposal/commander and proposal/answer wrap the engine', () => {
    const s = fresh();
    Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
    const open = start(s).state;
    const r = run(open, reg, { type: 'proposal/commander', payload: { unitId: ANN, kind: 'date', channel: 'scene' } });
    expect(ofType(r.events, 'proposal_resolved')).toMatchObject([{ receptive: true }]);
    expect(r.state.relations[ANN].stateId).toBe('flirting');
    rejected(open, { type: 'proposal/commander', payload: { unitId: ANN, kind: 'marry', channel: 'scene' } }, /kind/);
    rejected(open, { type: 'proposal/commander', payload: { unitId: BEA, kind: 'date', channel: 'scene' } }, /scene/);
    rejected(open, { type: 'proposal/answer', payload: { proposalId: 'q99', answer: 'accept' } }, /no open proposal/);
  });

  it('a unit proposal can be answered through the action', () => {
    const s = fresh();
    Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
    const open = start(s).state;
    const a = run(open, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'x' }] } } });
    const id = a.state.proposals![0].id;
    const b = run(a.state, reg, { type: 'proposal/answer', payload: { proposalId: id, answer: 'accept' } });
    expect(b.state.relations[ANN].stateId).toBe('flirting');
    expect(b.state.proposals).toEqual([]);
  });

  it('set_intimacy off blocks a later date proposal', () => {
    let s = fresh();
    Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
    s = run(s, reg, { type: 'campaign/set_intimacy', payload: { romance: false, initiative: 'low' } }).state;
    expect(s.settings.intimacy).toEqual({ romance: false, initiative: 'low' });
    const open = start(s).state;
    const r = run(open, reg, { type: 'proposal/commander', payload: { unitId: ANN, kind: 'date', channel: 'scene' } });
    expect(ofType(r.events, 'proposal_resolved')).toMatchObject([{ receptive: false, reason: 'unavailable' }]);
    rejected(fresh(), { type: 'campaign/set_intimacy', payload: { romance: 'yes', initiative: 'low' } }, /romance/);
    rejected(fresh(), { type: 'campaign/set_intimacy', payload: { romance: true, initiative: 'max' } }, /initiative/);
  });

  it('memory/compact rejects a mismatch and accepts the due compaction', () => {
    const s = fresh();
    s.day = 3;
    s.memory.chronicle.push({ id: 'c1', kind: 'scene', day: 2, text: 'a' }, { id: 'c2', kind: 'scene', day: 2, text: 'b' });
    rejected(s, { type: 'memory/compact', payload: { kind: 'day', day: 1, text: 'x' } }, /not due/);
    rejected(s, { type: 'memory/compact', payload: { kind: 'week', day: 2, text: 'x' } }, /not due/);
    const r = run(s, reg, { type: 'memory/compact', payload: { kind: 'day', day: 2, text: 'Day 2: a and b.' } });
    expect(r.state.memory.chronicle).toMatchObject([{ kind: 'day', day: 2, text: 'Day 2: a and b.' }]);
  });
});

describe('daily relation pass', () => {
  it('adds stress_high marks and moves comrade to trusted after three days', () => {
    let s = fresh();
    s.day = 10;
    s.slot = 'evening';
    Object.assign(s.relations[ANN], { stateId: 'comrade', stateSince: 7, trust: 60 });
    s.squad.find((u) => u.id === BEA)!.stress = 90;
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'x' } });
    s = r.state;
    expect(s.relations[ANN].stateId).toBe('trusted');
    expect(s.relations[BEA].history.filter((h) => h.type === 'stress_high')).toHaveLength(1);
    expect(s.relations[ANN].history.filter((h) => h.type === 'stress_high')).toHaveLength(0);
  });

  it('the pass catches trust moved by shortages (loyalty band)', () => {
    const s = fresh();
    s.slot = 'evening';
    s.resources.supplies = 0;
    s.relations[ANN].trust = 28;
    s.relations[ANN].loyaltyBand = 'steady';
    s.relations[ANN].affinity = 0;
    s.calendar.shortageStreak = 2;
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'x' } });
    expect(r.state.relations[ANN].trust).toBeLessThan(28);
    expect(r.state.relations[ANN].loyaltyBand).not.toBe('steady');
  });
});
