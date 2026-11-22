import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/warden';
import { cabinOf, roomOfPerson } from '../../../src/engine/basePlan';
import { practiceDirectives } from '../../../src/practice/directives';
import { hasCommanderPronoun } from '../../../src/engine/dynamic/pronoun';
import { requiresMet } from '../../../src/engine/dynamic/milestones';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { whereabouts } from '../../../src/engine/hub';
import { deadlineSweep } from '../../../src/engine/practice/checks';
import { kindsToday } from '../../../src/engine/practice/dayStep';
import { endHold, heldGuard, heldNow, holdSweep, startHold } from '../../../src/engine/practice/hold';
import { issuePractice } from '../../../src/engine/practice/issue';
import { blankPractices, type Task } from '../../../src/engine/practice/state';
import type { Booking, CampaignState } from '../../../src/engine/state/types';
import { ctxOf, errors, loadCore, ofType, run, stubExpedition } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, withBea, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const booking = (id: string, unitId: string, over: Partial<Booking> = {}): Booking => ({ id, unitId, kindId: 'train_together', day: 20, slot: 'afternoon', status: 'booked', source: 'roll', made: 19, ...over });

/** Ann at `role`, morning of day 20, nothing held yet. */
const calm = (frame: 'play' | 'role' | 'rule' = 'role'): CampaignState => {
  const s = world(reg, frame);
  s.slot = 'morning';
  dynamicOf(s, ANN)!.hold = 70;
  return s;
};
const held = (s: CampaignState, span: 1 | 2 | 'day' = 2, opts: Parameters<typeof startHold>[4] = {}) => {
  const d = structuredClone(s);
  const events = startHold(d, ctxOf(d, reg), ANN, span, opts);
  return { d, events };
};
const pass = (s: CampaignState, n = 1): CampaignState => {
  let cur = s;
  for (let i = 0; i < n; i++) {
    const r = run(cur, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    cur = r.state;
  }
  return cur;
};

describe('starting a hold', () => {
  it('books the held slots and lapses the rest: two held_in_quarters bookings; a rival\'s booking in a held slot is left in a conflict, any other lapses', () => {
    const s = withBea(calm(), 'play');
    s.personal = { seq: 9, bookings: [booking('bk1', CAT, { slot: 'afternoon' }), booking('bk2', BEA, { slot: 'morning', kindId: 'evening_with_me' }), booking('bk3', CAT, { slot: 'evening' })] } as never;
    const { d, events } = held(s, 2);
    const mine = d.personal!.bookings!.filter((b) => b.source === 'practice');
    expect(mine.map((b) => [b.kindId, b.unitId, b.day, b.slot, b.status])).toEqual([['held_in_quarters', ANN, 20, 'morning', 'booked'], ['held_in_quarters', ANN, 20, 'afternoon', 'booked']]);
    expect(d.practices!.held).toMatchObject({ by: ANN, since: { day: 20, slot: 'morning' }, until: { day: 20, slot: 'afternoon' }, sensory: false, extended: 0, bookingIds: mine.map((b) => b.id) });
    expect(d.personal!.bookings!.find((b) => b.id === 'bk1')!.status).toBe('lapsed'); // a soldier who is no holder
    expect(ofType(events, 'booking_lapsed')).toMatchObject([{ bookingId: 'bk1', unitId: CAT }]);
    const rival = d.personal!.bookings!.find((b) => b.id === 'bk2')!;
    expect(rival).toMatchObject({ status: 'booked', conflict: true }); // another holder's: P9c settles it
    expect(mine[0].conflict).toBe(true);
    expect(ofType(events, 'booking_conflict')).toHaveLength(1);
    expect(d.personal!.bookings!.find((b) => b.id === 'bk3')!.status).toBe('booked'); // an evening the hold does not take
    expect(ofType(events, 'hold_started')).toMatchObject([{ holderId: ANN, slots: 2, since: { day: 20, slot: 'morning' }, until: { day: 20, slot: 'afternoon' }, sensory: false }]);
    expect(ofType(events, 'hold_started')[0]).not.toHaveProperty('punitive');
  });

  it('the span is never the Night and starts at the first free slot: a day is what is left of it; an open scene spends this slot; the Night waits for the morning', () => {
    const afternoon = calm();
    afternoon.slot = 'afternoon';
    expect(held(afternoon, 'day').d.practices!.held).toMatchObject({ since: { day: 20, slot: 'afternoon' }, until: { day: 20, slot: 'evening' } });
    expect(held(afternoon, 2).d.practices!.held!.bookingIds).toHaveLength(2);
    const evening = calm();
    evening.slot = 'evening';
    expect(held(evening, 2).d.practices!.held).toMatchObject({ since: { day: 20, slot: 'evening' }, until: { day: 20, slot: 'evening' } });
    const inScene = calm();
    inScene.scene = { id: 's1', day: 20, slot: 'morning', locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
    expect(held(inScene, 1).d.practices!.held).toMatchObject({ since: { day: 20, slot: 'afternoon' } });
    const night = calm();
    night.slot = 'night';
    expect(held(night, 'day').d.practices!.held).toMatchObject({ since: { day: 21, slot: 'morning' }, until: { day: 21, slot: 'evening' } });
  });

  it('one hold at a time: a second asks for nothing; a punitive hold says so, a hidden one keeps its end out of the event', () => {
    const { d } = held(calm(), 1);
    const again = startHold(d, ctxOf(d, reg), ANN, 2);
    expect(again).toEqual([]);
    expect(d.practices!.held!.bookingIds).toHaveLength(1);
    const pun = held(calm(), 1, { punitive: true, punishmentId: 'pp1' });
    expect(ofType(pun.events, 'hold_started')).toMatchObject([{ punitive: true, punishmentId: 'pp1' }]);
    const hid = held(calm(), 2, { hidden: true });
    expect(hid.d.practices!.held!.hidden).toBe(true);
    const ev = ofType(hid.events, 'hold_started')[0];
    expect(ev).toMatchObject({ hidden: true });
    expect(ev).not.toHaveProperty('until');
    expect(ev).not.toHaveProperty('slots');
  });

  it('nothing is held for a holder who is not live, with the category off or in a pack with no held kind; no rng is drawn', () => {
    const off = calm();
    off.content = { enabled: [] };
    expect(held(off).events).toEqual([]);
    const equal = world(reg, 'equal');
    expect(held(equal).events).toEqual([]);
    const noKind = { ...reg, bookingKinds: new Map([...reg.bookingKinds].filter(([, k]) => k.held !== true)) } as unknown as Registries;
    const d = calm();
    expect(startHold(d, ctxOf(d, noKind), ANN, 1)).toEqual([]);
    const s = calm();
    const before = JSON.stringify(s.rng);
    const r = held(s, 2);
    expect(JSON.stringify(r.d.rng)).toBe(before);
  });
});

describe('the guard', () => {
  const heldState = (): CampaignState => held(calm(), 2).d;
  const scene = (locationId: string, participants: string[]) => ({ type: 'scene/start', payload: { origin: 'event', startIndex: 0, locationId, participants } });

  it('refuses an activity, a scene without her and intrigue/act with code held; a scene with her in her quarters and END SLOT go through', () => {
    const s = heldState();
    for (const action of [{ type: 'activity/do', payload: { activityId: 'rest' } }, scene('mess_hall', [BEA]), scene('mess_hall', [ANN]), scene('quarters_unit', [BEA]), { type: 'intrigue/act', payload: {} }, { type: 'life/time_together', payload: {} }]) {
      const r = run(s, reg, action as never);
      expect(errors(r.events), action.type).toMatchObject([{ code: 'held' }]);
      expect(r.state).toBe(s);
    }
    expect(errors(run(s, reg, scene('quarters_unit', [ANN])).events)).toEqual([]);
    expect(errors(run(s, reg, { type: 'calendar/consume_slot' }).events)).toEqual([]);
  });

  it('refuses a launch and a night knock with held_alarm; the same launch with no hold is not the guard\'s', () => {
    const s = heldState();
    const launch = { type: 'expedition/start', payload: { unitIds: [BEA], formation: { front: [BEA], back: [] }, supplies: 1 } };
    expect(errors(run(s, reg, launch as never).events)).toMatchObject([{ code: 'held_alarm' }]);
    expect(errors(run(s, reg, { type: 'night/open' }).events)).toMatchObject([{ code: 'held_alarm' }]);
    expect(heldGuard(calm(), reg, launch)).toBeNull();
    expect(heldGuard(calm(), reg, { type: 'activity/do' })).toBeNull();
    expect(errors(run(calm(), reg, launch as never).events)[0].code).not.toBe('held_alarm');
  });

  it('a launch without the commander passes the guard only while a keep alarm is open', () => {
    const s = heldState();
    const go = { type: 'expedition/start', payload: { unitIds: [BEA], formation: { front: [BEA], back: [] }, supplies: 1, withoutCommand: true } };
    expect(heldGuard(s, reg, go)).toMatchObject({ code: 'held_alarm' });
    s.practices!.alarm = { id: 'pa1', holderId: ANN, kind: 'launch', day: 20, slot: 'morning', answer: 'keep' };
    expect(heldGuard(s, reg, go)).toBeNull();
    expect(heldGuard(s, reg, { ...go, payload: { ...go.payload, withoutCommand: undefined } })).toMatchObject({ code: 'held_alarm' });
  });

  it('only while the commander is held now: before its first slot and after its last the guard is null', () => {
    const later = held(calm(), 1).d;
    later.slot = 'afternoon';
    expect(heldNow(later)).toBeNull();
    expect(heldGuard(later, reg, { type: 'activity/do' })).toBeNull();
    const lost = held(calm(), 2).d;
    lost.personal!.bookings!.find((b) => b.source === 'practice')!.status = 'cancelled'; // the slot went to another holder's booking
    expect(heldNow(lost)).toBeNull();
  });
});

describe('where she is', () => {
  it('is derived: the commander is drawn in her cabin during the hold and in her own after it; her whereabout is her quarters (holding); nothing is stored', () => {
    const s = withBea(calm(), 'play');
    const plain = roomOfPerson(s, reg, whereabouts(s, reg), 'commander')!;
    const d = held(s, 1).d;
    const stored = JSON.stringify(d);
    const here = whereabouts(d, reg);
    expect(roomOfPerson(d, reg, here, 'commander')!.id).toBe(cabinOf(d, reg, ANN)!.id);
    expect(roomOfPerson(d, reg, here, 'commander')!.id).not.toBe(plain.id);
    expect(here.find((w) => w.unitId === ANN)).toMatchObject({ roomId: 'quarters', reason: 'holding' });
    expect(JSON.stringify(d)).toBe(stored);
    const after = pass(d);
    expect(roomOfPerson(after, reg, whereabouts(after, reg), 'commander')!.id).toBe(plain.id);
    expect(whereabouts(after, reg).find((w) => w.unitId === ANN)!.reason).not.toBe('holding');
  });
});

describe('ending', () => {
  const ends = (mutate: (d: CampaignState) => void, reason: string) => {
    const d = held(calm(), 2).d;
    mutate(d);
    const events = holdSweep(d, ctxOf(d, reg));
    expect(ofType(events, 'hold_released'), reason).toMatchObject([{ holderId: ANN, reason }]);
    expect(d.practices!.held).toBeUndefined();
    expect(d.personal!.bookings!.filter((b) => b.source === 'practice').every((b) => b.status === 'cancelled')).toBe(true); // its future bookings are cancelled with no cost
    expect(heldNow(d)).toBeNull();
    expect(heldGuard(d, reg, { type: 'activity/do' })).toBeNull();
    return d;
  };

  it('when she goes on a run, is injured, leaves service, stops being live or restraint goes off: hold_released with the reason, no cost, no xp', () => {
    const before = calm();
    const rel = before.relations[ANN];
    const d = ends((x) => { x.expedition = stubExpedition(x, { party: [ANN] }); }, 'run');
    expect(d.relations[ANN].trust).toBe(rel.trust);
    expect(dynamicOf(d, ANN)!.tracks.restraint?.xp ?? 0).toBe(0);
    expect(dynamicOf(d, ANN)!.hold).toBe(70);
    ends((x) => { unitOf(x, ANN).status = 'injured'; }, 'injured');
    ends((x) => { unitOf(x, ANN).status = 'dead'; }, 'gone');
    ends((x) => { dynamicOf(x, ANN)!.frame = 'equal'; }, 'not_live');
    ends((x) => { x.content = { enabled: ['public_humiliation', 'denial'] }; }, 'content');
  });

  it('endHold ends it for a reason it is given and settles the task that started it', () => {
    const d = held(calm(), 1).d;
    d.practices!.tasks.push({ id: 'pt1', holderId: ANN, kind: 'hold', tags: ['restraint'], track: 'restraint', tier: 1, stakes: 'minor', check: 'model', proof: 'none', text: 't', summary: 's', status: 'open', acceptForm: 'button_cost', day: 20, slots: 1 } as Task);
    d.practices!.held!.taskId = 'pt1';
    expect(ofType(endHold(d, ctxOf(d, reg), 'asked'), 'hold_released')).toMatchObject([{ reason: 'asked' }]);
    expect(d.practices!.tasks[0].status).toBe('void');
    expect(endHold(d, ctxOf(d, reg), 'asked')).toEqual([]);
  });

  it('a full hold gives restraint xp (3 a slot) and hold; two of them put the track at level 1 and offer first_night_held', () => {
    let s = held(calm(), 2).d;
    const hold0 = dynamicOf(s, ANN)!.hold;
    s = pass(s, 1);
    expect(heldNow(s)).not.toBeNull();
    s = pass(s, 1); // the afternoon passes: the evening is hers again
    expect(heldNow(s)).toBeNull();
    expect(s.practices!.held).toBeUndefined();
    expect(dynamicOf(s, ANN)!.tracks.restraint).toMatchObject({ xp: 6, level: 0 });
    expect(dynamicOf(s, ANN)!.hold).toBeGreaterThan(hold0);
    expect(requiresMet(s, reg, ANN, reg.dynamicMilestones.get('first_night_held') as never)).toBe(false); // restraint level 0
    s = pass(s, 1); // the day turns
    expect(s.slot).toBe('morning');
    const second = held(s, 2).d;
    const done = pass(pass(second));
    expect(dynamicOf(done, ANN)!.tracks.restraint).toMatchObject({ xp: 12, level: 1 });
    expect(requiresMet(done, reg, ANN, reg.dynamicMilestones.get('first_night_held') as never)).toBe(true); // restraint level 1: P15's milestone can be offered
  });

  it('a hold that is ended early or defied gives no xp and no hold', () => {
    const d = held(calm(), 2).d;
    const h0 = dynamicOf(d, ANN)!.hold;
    endHold(d, ctxOf(d, reg), 'asked');
    expect(dynamicOf(d, ANN)!.tracks.restraint).toBeUndefined();
    expect(dynamicOf(d, ANN)!.hold).toBe(h0);
    const e = held(calm(), 1).d;
    e.practices!.held!.defied = true;
    endHold(e, ctxOf(e, reg), 'ran_out');
    expect(dynamicOf(e, ANN)!.tracks.restraint).toBeUndefined();
  });
});

describe('the directive', () => {
  it('practice:held tells the model, in the scene with her, that she keeps the commander in her quarters; a sensory hold only as what reaches the commander; no number, no pronoun', () => {
    const plain = practiceDirectives(held(calm(), 2).d, reg, [ANN]).find((d) => d.id === 'practice:held')!;
    expect(plain.expiresAfter).toBe('scene');
    expect(plain.text).toContain('keeping the commander in her quarters');
    expect(plain.text).not.toMatch(/dark|\d/);
    expect(hasCommanderPronoun(plain.text)).toBe(false);
    const dark = practiceDirectives(held(calm(), 2, { sensory: true }).d, reg, [ANN]).find((d) => d.id === 'practice:held')!;
    expect(dark.text).toContain('only what is heard and felt reaches the commander');
    expect(practiceDirectives(held(calm(), 2).d, reg, [BEA]).some((d) => d.id === 'practice:held')).toBe(false); // she is not in the room
    expect(practiceDirectives(calm(), reg, [ANN]).some((d) => d.id === 'practice:held')).toBe(false);
  });
});

describe('collisions', () => {
  it('a task made impossible by another holder\'s hold is void with no deltas', () => {
    const s = withBea(calm(), 'play');
    s.slot = 'evening';
    s.practices = {
      ...blankPractices(),
      tasks: [{ id: 'pt1', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'slot_with_her', proof: 'none', deadline: { day: 20, slot: 'evening' }, text: 't', summary: 's', status: 'open', acceptForm: 'button_cost', day: 19 } as Task,
        { id: 'pt2', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'minor', check: 'slot_with_her', proof: 'none', deadline: { day: 21, slot: 'evening' }, text: 't', summary: 's', status: 'open', acceptForm: 'button_cost', day: 19 } as Task],
    };
    const d = structuredClone(s);
    const before = JSON.stringify(d.relations[ANN]);
    const events = startHold(d, ctxOf(d, reg), BEA, 1);
    expect(ofType(events, 'task_void')).toMatchObject([{ taskId: 'pt1', holderId: ANN, reason: 'hold' }]);
    expect(d.practices!.tasks.map((t) => t.status)).toEqual(['void', 'open']);
    expect(JSON.stringify(d.relations[ANN])).toBe(before);
  });
});

describe('the hold card', () => {
  const request = (s: CampaignState, seed = 'hold_evening_in_quarters') => {
    s.practices = { ...blankPractices(), seq: 3, requests: [{ id: 'pq1', holderId: ANN, kind: 'hold', day: 20, seedIds: [seed] }] };
    return s;
  };

  it('a hold request writes a hold card: kind hold, the slots its stakes name, sensory when its seed is; ACCEPT starts the hold, and a full hold keeps the task', () => {
    const s = request(calm());
    const r = run(s, reg, { type: 'practice/issue', payload: { requestId: 'pq1' } });
    expect(errors(r.events)).toEqual([]);
    const card = r.state.practices!.tasks[0];
    expect(card).toMatchObject({ kind: 'hold', status: 'offered', slots: 1, holderId: ANN, requestId: 'pq1' });
    expect(card.sensory).toBeUndefined();
    expect(ofType(r.events, 'task_issued')).toMatchObject([{ kind: 'hold', taskId: card.id }]);
    const known = calm();
    dynamicOf(known, ANN)!.tracks.restraint = { xp: 10, level: 1 }; // a tier-2 seed is offered from level 1
    const sensory = run(request(known, 'hold_lights_out'), reg, { type: 'practice/issue', payload: { requestId: 'pq1' } }).state.practices!.tasks[0];
    expect(sensory.sensory).toBe(true);
    const a = run(r.state, reg, { type: 'practice/answer_task', payload: { taskId: card.id, answer: 'accept' } });
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'hold_started')).toHaveLength(1);
    expect(a.state.practices!.tasks[0].status).toBe('open');
    expect(a.state.practices!.held).toMatchObject({ by: ANN, taskId: card.id });
    const done = pass(a.state);
    expect(done.practices!.held).toBeUndefined();
    expect(done.practices!.tasks[0].status).toBe('kept');
  });

  it('a second hold request becomes a task: while a hold stands the card is a plain task with a deadline', () => {
    const { d } = held(calm(), 1);
    request(d);
    d.practices!.held = held(calm(), 1).d.practices!.held;
    const events = issuePractice(d, ctxOf(d, reg), 'pq1', 'fallback');
    expect(ofType(events, 'task_issued')).toMatchObject([{ kind: 'task' }]);
    expect(d.practices!.tasks[0]).toMatchObject({ kind: 'task', status: 'offered' });
    expect(d.practices!.tasks[0].deadline).toBeDefined();
  });

  it('an offered hold card that nobody answered is void the day after (an open one is the hold\'s, never the deadline\'s); no hold is requested while one stands', () => {
    const r = run(request(calm()), reg, { type: 'practice/issue', payload: { requestId: 'pq1' } });
    const d = structuredClone(r.state);
    expect(r.state.practices!.tasks[0].deadline).toEqual({ day: 21 });
    expect(deadlineSweep(d, ctxOf(d, reg))).toEqual([]);
    expect(d.practices!.tasks[0].status).toBe('offered'); // still the day it was offered... and the day after
    d.day = 22;
    expect(ofType(deadlineSweep(d, ctxOf(d, reg)), 'task_void')).toMatchObject([{ taskId: d.practices!.tasks[0].id, reason: 'expired' }]);
    const open = structuredClone(r.state);
    open.practices!.tasks[0].status = 'open';
    open.day = 25;
    expect(deadlineSweep(open, ctxOf(open, reg))).toEqual([]);
    expect(kindsToday(held(calm(), 1).d, reg, ANN)).not.toContain('hold');
    expect(kindsToday(calm(), reg, ANN)).toContain('hold');
  });

  it('an accepted answer that starts a hold is taken back by UNDO: the hold ends and what it pushed out is booked again', () => {
    const s = calm('role');
    dynamicOf(s, ANN)!.hold = 40; // inside the frame's band: a gain of 4 crosses no band, so no milestone is offered and UNDO stands
    s.practices = { ...blankPractices(), seq: 5, punishments: [{ id: 'pp1', holderId: ANN, entryId: 'kept_in_quarters', severity: 3, offence: { kind: 'task_broken', ref: 'pt1', stakes: 'major', day: 20 }, text: 't', summary: 's', status: 'offered', day: 20 }] };
    s.personal = { seq: 9, bookings: [booking('bk1', CAT, { slot: 'afternoon' })] } as never;
    const a = run(s, reg, { type: 'practice/answer_punishment', payload: { punishmentId: 'pp1', answer: 'accept' } });
    expect(errors(a.events)).toEqual([]);
    expect(ofType(a.events, 'hold_started')).toMatchObject([{ punitive: true, punishmentId: 'pp1', slots: 2 }]);
    expect(a.state.personal!.bookings!.find((b) => b.id === 'bk1')!.status).toBe('lapsed');
    const u = run(a.state, reg, { type: 'practice/undo', payload: { punishmentId: 'pp1' } });
    expect(errors(u.events)).toEqual([]);
    expect(u.state.practices!.held).toBeUndefined();
    expect(u.state.personal!.bookings!.find((b) => b.id === 'bk1')!.status).toBe('booked');
    expect(u.state.personal!.bookings!.filter((b) => b.source === 'practice').every((b) => b.status === 'cancelled')).toBe(true);
    expect(JSON.stringify(u.state.rng)).toBe(JSON.stringify(s.rng));
  });
});
