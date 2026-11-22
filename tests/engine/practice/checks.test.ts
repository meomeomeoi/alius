import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/comms';
import { compatibilityOf } from '../../../src/engine/dynamic/hold';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { book } from '../../../src/engine/personal/bookings';
import { deadlineSweep, settleTask, taskChecksFromEvents } from '../../../src/engine/practice/checks';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const task = (over: Partial<Task> = {}): Task => ({
  id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 2, stakes: 'minor', check: 'model', proof: 'none', text: 'Do it.', summary: 'do it',
  status: 'open', acceptForm: 'button_cost', day: 19, answeredDay: 19, ...over,
});
const withTask = (over: Partial<Task> = {}, frame: 'play' | 'role' | 'rule' = 'role'): CampaignState => {
  const s = withService(world(reg, frame));
  s.practices = { ...blankPractices(), seq: 3, tasks: [task(over)] };
  return s;
};
const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const t1 = (s: CampaignState) => s.practices!.tasks.find((t) => t.id === 'pt1')!;
const sweep = (s: CampaignState) => { const d = structuredClone(s); const events = deadlineSweep(d, ctxOf(d)); return { state: d, events }; };
const after = (s: CampaignState, events: Array<Record<string, unknown>>) => { const d = structuredClone(s); const out = taskChecksFromEvents(d, ctxOf(d), events as never); return { state: d, events: out }; };
const startScene = (s: CampaignState, ids: string[]) => run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: ids, origin: 'event', consumesSlot: false, startIndex: 0 } });

describe('slot_with_her', () => {
  it('a scene with her in the deadline slot is kept when it ends, not before', () => {
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20, slot: s0slot() } });
    const started = startScene(s, [ANN]);
    expect(errors(started.events)).toEqual([]);
    expect(t1(started.state)).toMatchObject({ status: 'open', sceneId: started.state.scene!.id });
    const ended = run(started.state, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(t1(ended.state).status).toBe('kept');
    expect(ofType(ended.events, 'task_kept')).toMatchObject([{ taskId: 'pt1', holderId: ANN, via: 'engine' }]);
  });

  it('a scene in another slot, or without her, keeps nothing; one that is aborted clears its mark', () => {
    const other = withTask({ check: 'slot_with_her', deadline: { day: 20, slot: 'evening' } });
    expect(t1(startScene(other, [ANN]).state).sceneId).toBeUndefined();
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20, slot: s0slot() } });
    expect(t1(startScene(s, [BEA]).state).sceneId).toBeUndefined();
    const started = startScene(s, [ANN]);
    const aborted = run(started.state, reg, { type: 'scene/abort', payload: {} });
    expect(errors(aborted.events)).toEqual([]);
    expect(t1(aborted.state)).toMatchObject({ status: 'open' });
    expect(t1(aborted.state).sceneId).toBeUndefined();
  });

  it('none by the deadline is broken at the sweep', () => {
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20, slot: 'evening' } });
    const r = sweep(s);
    expect(t1(r.state).status).toBe('broken');
    expect(ofType(r.events, 'task_broken')).toHaveLength(1);
  });

  it('a task whose deadline has not come stays open', () => {
    expect(t1(sweep(withTask({ check: 'slot_with_her', deadline: { day: 22 } })).state).status).toBe('open');
  });
});

function s0slot() { return 'morning' as const; }

describe('booking_kept', () => {
  const booked = (over: Partial<Task> = {}) => {
    const s = withTask({ check: 'booking_kept', deadline: { day: 21 }, ...over });
    book(s, ctxOf(s), { unitId: ANN, kindId: 'evening_with_me', day: 20, slot: 'morning', source: 'roll' });
    t1(s).bookingId = s.personal!.bookings![0].id;
    return s;
  };

  it('the task\'s booking played is kept', () => {
    const s = booked();
    const r = run(s, reg, { type: 'booking/play', payload: { bookingId: s.personal!.bookings![0].id } });
    expect(errors(r.events)).toEqual([]);
    expect(t1(r.state).status).toBe('kept');
  });

  it('cancelled is broken, and the P9c cancel cost applies once as well', () => {
    const s = booked();
    const r = run(s, reg, { type: 'booking/cancel', payload: { bookingId: s.personal!.bookings![0].id } });
    expect(errors(r.events)).toEqual([]);
    expect(t1(r.state).status).toBe('broken');
    expect(ofType(r.events, 'task_broken')).toHaveLength(1);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event' && h.type === 'refused_demand')).toHaveLength(1);
  });

  it('lapsed is broken; one lost to another booking is nobody\'s fault (void, no deltas)', () => {
    const s = booked();
    const id = s.personal!.bookings![0].id;
    expect(t1(after(s, [{ type: 'booking_lapsed', bookingId: id, unitId: ANN }]).state).status).toBe('broken');
    const lost = after(s, [{ type: 'booking_cancelled', bookingId: id, unitId: ANN, lost: true }]);
    expect(t1(lost.state).status).toBe('void');
    expect(lost.state.relations[ANN].history).toEqual(s.relations[ANN].history);
  });

  it('a task with no booking of its own is kept by any booking of hers that is played', () => {
    const s = withTask({ check: 'booking_kept', deadline: { day: 21 } });
    const r = after(s, [{ type: 'booking_played', bookingId: 'bk9', unitId: ANN }]);
    expect(t1(r.state).status).toBe('kept');
    expect(t1(after(s, [{ type: 'booking_played', bookingId: 'bk9', unitId: BEA }]).state).status).toBe('open');
  });

  it('an unplayed one is broken at the sweep', () => {
    expect(t1(sweep(booked({ deadline: { day: 20 } })).state).status).toBe('broken');
  });
});

describe('token_worn', () => {
  const worn = (isWorn: boolean) => {
    const s = withTask({ check: 'token_worn', deadline: { day: 21 } });
    s.personal = { seq: 4, tokens: { owned: [{ id: 'tk1', giverId: ANN, kindId: 'ribbon', label: 'her ribbon', day: 10, worn: isWorn }], given: [] } };
    return s;
  };

  it('worn at the day end through the deadline is kept', () => {
    const s = worn(true);
    expect(t1(sweep(s).state).status).toBe('open'); // day 20 of 21: still wearing it
    s.day = 21;
    expect(t1(sweep(s).state).status).toBe('kept');
  });

  it('taking it off is broken at once', () => {
    const r = run(worn(true), reg, { type: 'token/remove', payload: { tokenId: 'tk1' } });
    expect(errors(r.events)).toEqual([]);
    expect(t1(r.state).status).toBe('broken');
  });

  it('not worn at a day end is broken', () => {
    expect(t1(sweep(worn(false)).state).status).toBe('broken');
  });
});

describe('on_roster and not_on_roster', () => {
  it('judged at the deadline by the active roster', () => {
    const on = withTask({ check: 'on_roster', checkArg: BEA, field: true, deadline: { day: 20 } });
    on.roster.activeIds = [ANN, BEA];
    expect(t1(sweep(on).state).status).toBe('kept');
    on.roster.activeIds = [ANN];
    expect(t1(sweep(on).state).status).toBe('broken');
    const off = withTask({ check: 'not_on_roster', checkArg: BEA, field: true, deadline: { day: 20 } });
    off.roster.activeIds = [ANN, BEA];
    expect(t1(sweep(off).state).status).toBe('broken');
    off.roster.activeIds = [ANN];
    expect(t1(sweep(off).state).status).toBe('kept');
  });

  it('a roster task with no unit to judge is void', () => {
    const s = withTask({ check: 'on_roster', field: true, deadline: { day: 20 } });
    expect(t1(sweep(s).state).status).toBe('void');
  });
});

describe('dm_report', () => {
  it('no DM from the commander to her by the deadline is broken; a DM is the report and is kept', () => {
    const s = withTask({ check: 'dm_report', deadline: { day: 20 } });
    expect(t1(sweep(s).state).status).toBe('broken');
    const sent = run(s, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'It is done.' } });
    expect(errors(sent.events)).toEqual([]);
    expect(t1(sent.state)).toMatchObject({ status: 'open', report: { day: 20 } });
    expect(t1(sweep(sent.state).state).status).toBe('kept');
  });

  it('a DM to someone else is not a report', () => {
    const s = withTask({ check: 'dm_report', deadline: { day: 20 } });
    const sent = run(s, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'Hello.' } });
    expect(t1(sent.state).report).toBeUndefined();
  });
});

describe('no_scene_with', () => {
  it('a scene started with that unit is broken at once; with someone else it is not; none is kept at the deadline', () => {
    const s = withTask({ check: 'no_scene_with', checkArg: BEA, deadline: { day: 22 } });
    expect(t1(startScene(s, [BEA]).state).status).toBe('broken');
    expect(t1(startScene(s, [ANN]).state).status).toBe('open');
    s.day = 22;
    expect(t1(sweep(s).state).status).toBe('kept');
  });
});

describe('rule_kept_until', () => {
  it('a rule_broken of that rule is broken; none is kept at the deadline', () => {
    const s = withTask({ check: 'rule_kept_until', checkArg: 'r1', deadline: { day: 20 } });
    expect(t1(after(s, [{ type: 'rule_broken', ruleId: 'r1', unitId: ANN }]).state).status).toBe('broken');
    expect(t1(after(s, [{ type: 'rule_broken', ruleId: 'r2', unitId: ANN }]).state).status).toBe('open');
    expect(t1(sweep(s).state).status).toBe('kept');
  });
});

describe('field tasks', () => {
  it('are judged at expedition_ended by the report\'s party, and only then', () => {
    const s = withTask({ check: 'not_on_roster', checkArg: BEA, field: true, deadline: { day: 25 } });
    s.lastExpedition = { id: 'rep_1', party: [ANN, BEA] } as never;
    expect(t1(after(s, [{ type: 'expedition_ended', outcome: 'success', reportId: 'rep_1' }]).state).status).toBe('broken');
    s.lastExpedition = { id: 'rep_1', party: [ANN] } as never;
    expect(t1(after(s, [{ type: 'expedition_ended', outcome: 'success', reportId: 'rep_1' }]).state).status).toBe('kept');
    expect(t1(sweep(withTask({ check: 'not_on_roster', checkArg: BEA, field: true, deadline: { day: 25 } })).state).status).toBe('open');
  });
});

describe('what a verdict does', () => {
  it('kept lands task_kept (+3 hold through P15), track xp, favour and a reading sample', () => {
    const s = withTask({ tier: 2 });
    dynamicOf(s, ANN)!.hold = 50; // inside the frame's band: the floor would lift a lower one
    const before = dynamicOf(s, ANN)!;
    const readBefore = before.readOf.updates;
    const d = structuredClone(s);
    const events = settleTask(d, ctxOf(d), 'pt1', 'kept', 'engine');
    const dyn = dynamicOf(d, ANN)!;
    expect(t1(d).status).toBe('kept');
    expect(ofType(events, 'task_kept')).toMatchObject([{ taskId: 'pt1', holderId: ANN, via: 'engine' }]);
    expect(dyn.hold).toBeCloseTo(before.hold + 3 * compatibilityOf(s, reg, ANN), 3);
    expect(dyn.tracks.service.xp).toBe(TUNING.practice.xp.kept * 2);
    expect(dyn.favour).toBe(before.favour + 1);
    expect(dyn.readOf.updates).toBe(readBefore + 1);
    expect(d.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'task_kept' });
  });

  it('broken lands task_broken (-5 hold, trust and affinity by the stakes) and an offence', () => {
    const s = withTask({ stakes: 'major' });
    dynamicOf(s, ANN)!.hold = 55;
    const d = structuredClone(s);
    const trust = d.relations[ANN].trust;
    const events = settleTask(d, ctxOf(d), 'pt1', 'broken', 'engine');
    expect(t1(d).status).toBe('broken');
    expect(ofType(events, 'task_broken')).toMatchObject([{ taskId: 'pt1', holderId: ANN, stakes: 'major' }]);
    expect(dynamicOf(d, ANN)!.hold).toBeLessThan(55);
    expect(d.relations[ANN].trust).toBeLessThan(trust);
    expect(d.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'task_broken', severity: 'moderate' });
    expect(d.practices!.offences[ANN]).toEqual([20]);
  });

  it('the kept task\'s gist joins her recent forms (at most 8)', () => {
    const s = withTask({});
    const d = structuredClone(s);
    for (let i = 0; i < 10; i++) { t1(d).status = 'open'; settleTask(d, ctxOf(d), 'pt1', 'kept', 'engine'); }
    expect(dynamicOf(d, ANN)!.recent).toHaveLength(8);
  });

  it('a frozen holder\'s task is not settled and not swept', () => {
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20 } });
    s.relations[ANN].dynamic!.frame = 'equal';
    const d = structuredClone(s);
    expect(settleTask(d, ctxOf(d), 'pt1', 'broken', 'engine')).toEqual([]);
    expect(t1(sweep(s).state).status).toBe('open');
    expect(d).toEqual(s);
  });

  it('a void task costs nothing', () => {
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20 } });
    const d = structuredClone(s);
    const events = settleTask(d, ctxOf(d), 'pt1', 'void', 'engine');
    expect(t1(d).status).toBe('void');
    expect(ofType(events, 'task_void')).toMatchObject([{ taskId: 'pt1', holderId: ANN, what: 'task' }]);
    expect(d.relations).toEqual(s.relations);
  });

  it('only an open task is settled, once', () => {
    const d = structuredClone(withTask({}));
    expect(settleTask(d, ctxOf(d), 'pt1', 'kept', 'model').length).toBeGreaterThan(0);
    expect(settleTask(d, ctxOf(d), 'pt1', 'broken', 'model')).toEqual([]);
    expect(t1(d).status).toBe('kept');
    expect(settleTask(d, ctxOf(d), 'nope', 'kept', 'model')).toEqual([]);
  });

  it('an unanswered offer whose deadline has passed is void, not broken', () => {
    const s = withTask({ status: 'offered', deadline: { day: 19 } });
    const r = sweep(s);
    expect(t1(r.state).status).toBe('void');
    expect(r.state.relations).toEqual(s.relations);
  });

  it('a model task nobody judged is broken at its deadline; a model task with a report is kept', () => {
    expect(t1(sweep(withTask({ deadline: { day: 20 } })).state).status).toBe('broken');
    expect(t1(sweep(withTask({ deadline: { day: 20 }, report: { day: 20 } })).state).status).toBe('kept');
  });
});

describe('the day step runs the sweep and draws nothing', () => {
  it('sub-step 1 settles what has come due, and no rng is drawn', () => {
    const s = withTask({ check: 'slot_with_her', deadline: { day: 20 } });
    const d = structuredClone(s);
    const events = practiceDayStep(d, ctxOf(d));
    expect(t1(d).status).toBe('broken');
    expect(ofType(events, 'task_broken')).toHaveLength(1);
    expect(d.rng).toEqual(s.rng);
    const quiet = sweep(withTask({ check: 'slot_with_her', deadline: { day: 25 } }));
    expect(quiet.state.rng).toEqual(s.rng);
    expect(quiet.events).toEqual([]);
  });
});
