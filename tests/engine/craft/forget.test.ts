import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/practice';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { forgetCraft } from '../../../src/engine/craft/forget';
import { removeFromService } from '../../../src/engine/leash/use';
import { pushHobby } from '../../../src/engine/life';
import { newLife } from '../../../src/engine/life/state';
import { book } from '../../../src/engine/personal/bookings';
import type { CampaignState, HobbyState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ctxOf, loadCore } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); });

/** Ann has written every trace of the craft: a pair book, a drill programme with a pending exam, praise, a sentence, bookings of the programmes and a posture run. */
function written(): CampaignState {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  s.relations[ANN].craft = {
    postures: { kneel_open: { xp: 20, day: 3 } }, records: { weight: { longest: 100, clean: 100, noTap: 100, day: 3 } }, rhythm: { xp: 10, day: 3 },
    drill: { norms: { 'endurance:weight': 100 }, examDay: 1, passes: 1, exam: { day: s.day, keys: ['endurance:weight'], results: {} } }, drillPending: { key: 'endurance:weight', mult: 1, day: s.day, exam: true },
    praise: [{ day: 3, text: 'You hold the line', words: ['you', 'hold', 'the', 'line'] }], sentence: { crimeId: 'purge', start: 1, until: 30, extended: 0 },
  };
  book(s, { registries: reg }, { unitId: ANN, kindId: 'drill_exam', day: s.day + 1, slot: 'afternoon', source: 'practice' });
  book(s, { registries: reg }, { unitId: ANN, kindId: 'drill_session', day: s.day + 2, slot: 'afternoon', source: 'practice' });
  book(s, { registries: reg }, { unitId: BEA, kindId: 'evening_with_me', day: s.day + 2, slot: 'evening', source: 'roll' });
  s.practices = { seq: 5, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [], postureRun: { id: 'pr1', holderId: ANN, presetId: 'kneel_open', startedAt: 0, present: [ANN], beats: 0, slips: 0, corrections: 0, source: 'take' } } as never;
  s.relations[BEA].craft = { rhythm: { xp: 5, day: 3 } };
  return s;
}

describe('forgetCraft', () => {
  it('drops her pair book, the bookings of her programmes and a running posture hold; nobody else\'s', () => {
    const s = written();
    forgetCraft(s, ANN);
    expect(s.relations[ANN].craft).toBeUndefined();
    const bookings = s.personal!.bookings!;
    expect(bookings.filter((b) => b.unitId === ANN).map((b) => b.status)).toEqual(['cancelled', 'cancelled']);
    expect(bookings.find((b) => b.unitId === BEA)!.status).toBe('booked');
    expect(s.practices!.postureRun).toBeUndefined();
    expect(s.relations[BEA].craft).toEqual({ rhythm: { xp: 5, day: 3 } });
  });

  it('keeps a booking of hers that is not the craft\'s (a practice\'s own hold, a roll)', () => {
    const s = written();
    book(s, { registries: reg }, { unitId: ANN, kindId: 'evening_with_me', day: s.day + 3, slot: 'evening', source: 'roll' });
    book(s, { registries: reg }, { unitId: ANN, kindId: 'held_in_quarters', day: s.day + 4, slot: 'evening', source: 'practice' });
    s.personal!.bookings!.at(-1)!.practiceId = 'ph1'; // a hold of P16's
    forgetCraft(s, ANN);
    expect(s.personal!.bookings!.slice(-2).map((b) => b.status)).toEqual(['booked', 'booked']);
  });

  it('writes nothing for a unit that has no trace: no craft key, no personal state, no practices', () => {
    const s = world(reg, 'play');
    const before = structuredClone(s);
    forgetCraft(s, ANN);
    expect(s).toEqual(before);
  });

  it('removeFromService calls it: every trace is gone, the sentence, her praise and a pending exam with them', () => {
    const s = written();
    const events = removeFromService(s, ANN, 'deserted', ctxOf(s, reg));
    expect(events).toBeDefined();
    expect(s.relations[ANN].craft).toBeUndefined();
    expect(s.personal!.bookings!.filter((b) => b.unitId === ANN && b.status === 'booked')).toEqual([]);
    expect(s.practices?.postureRun).toBeUndefined();
    expect(unitOf(s, ANN).status).toBe('deserted');
  });
});

describe('help with her goal', () => {
  const take = (id: string): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [] });
  function hobbyWorld(): CampaignState {
    registerFrameReader(() => 'play');
    const s = world(reg, 'play');
    s.settings.lifeEvents = 'normal';
    s.life = newLife(7);
    unitOf(s, ANN).hobbies = [take('reading')];
    return s;
  }
  const rises = (events: Array<{ type: string; [k: string]: unknown }>) => events.filter((e) => e.type === 'regard_changed' && e.cause === 'value');

  it('the commander helping with her hobby raises Regard by the goal value, once a week, for a craft-live holder', () => {
    const s = hobbyWorld();
    const before = s.relations[ANN].regard ?? 50;
    const first = pushHobby(s, reg, ANN, 'reading', s.day, { caused: true });
    expect(rises(first)).toEqual([expect.objectContaining({ unitId: ANN, from: before, to: before + TUNING.regard.value.goal })]);
    expect(rises(pushHobby(s, reg, ANN, 'reading', s.day + 3, { caused: true }))).toEqual([]); // the same week
    expect(rises(pushHobby(s, reg, ANN, 'reading', s.day + 7, { caused: true }))).toHaveLength(1);
  });

  it('not when the commander was not there (no `caused`), for a woman who is not craft-live, or for a hobby she has not', () => {
    const s = hobbyWorld();
    expect(rises(pushHobby(s, reg, ANN, 'reading', s.day))).toEqual([]);
    expect(s.relations[ANN].craft).toBeUndefined();
    const eq = hobbyWorld();
    registerFrameReader(() => 'equal');
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(rises(pushHobby(eq, reg, ANN, 'reading', eq.day, { caused: true }))).toEqual([]);
    expect(eq.relations[ANN].craft).toBeUndefined();
    expect(rises(pushHobby(hobbyWorld(), reg, ANN, 'chess', 30, { caused: true }))).toEqual([]);
  });
});
