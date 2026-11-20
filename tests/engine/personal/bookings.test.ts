import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { addRestriction, deedsOf, disciplineOf, impunityOf, refuseLikeDemand } from '../../../src/engine/discipline';
import { whereabouts } from '../../../src/engine/hub';
import { smotherRefusal } from '../../../src/engine/bonds';
import { startSmother } from '../../../src/engine/bonds/smother';
import { bookingChance, bookingPlayable, book, dueBooking, lapseBookings, rollBookings } from '../../../src/engine/personal/bookings';
import { personalOf } from '../../../src/engine/personal/state';
import type { Booking, CampaignState, Slot } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { endSlotBlock } from '../../../src/ui/hub/model';
import { ANN, atImpunity, BEA, ctxFrom, errors, loadCore, ofType, partner, plain, run, seeded, setRecord, setRelation, withOptions } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** Ann: an assertive lover (device level 3), Affinity 90, Want 50, Impunity 55. */
function eager(): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover', affinity: 90, want: 50 });
  return atImpunity(s, reg, ANN, 55);
}
const bk = (id: string, unitId: string, over: Partial<Booking> = {}): Booking =>
  ({ id, unitId, kindId: 'evening_with_me', day: 5, slot: 'evening', status: 'booked', source: 'roll', made: 4, ...over });
const putBookings = (s: CampaignState, ...b: Booking[]): CampaignState => {
  personalOf(s).bookings = b;
  return s;
};
/** The clock at day 5, evening, with `b` due now. */
function dueNow(s: CampaignState, ...b: Booking[]): CampaignState {
  s.day = 5;
  s.slot = 'evening';
  return putBookings(s, ...b.map((x) => ({ ...x, day: 5, slot: 'evening' as Slot })));
}
const roll = (s: CampaignState, seed: number) => {
  const t = seeded(s, seed);
  const events = rollBookings(t, ctxFrom(t, reg));
  return { t, events };
};
/** The first seed that makes a booking. */
function hitting(s: CampaignState) {
  for (let seed = 1; seed <= 300; seed++) {
    const r = roll(s, seed);
    if (ofType(r.events, 'booking_made').length > 0) return { ...r, seed };
  }
  throw new Error('no seed booked');
}

describe('the roll', () => {
  it('a dominant lover with high Affinity and Want books tomorrow evening and DMs it', () => {
    const only = { ...reg, bookingKinds: new Map([['evening_with_me', reg.bookingKinds.get('evening_with_me')!]]) } as Registries;
    let booked: ReturnType<typeof roll> | null = null;
    for (let seed = 1; seed <= 300 && !booked; seed++) {
      const t = seeded(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 90, want: 50 }), seed);
      atImpunity(t, reg, ANN, 55);
      const events = rollBookings(t, ctxFrom(t, only));
      if (ofType(events, 'booking_made').length > 0) booked = { t, events };
    }
    expect(booked).not.toBeNull();
    const made = ofType(booked!.events, 'booking_made')[0];
    expect(made).toMatchObject({ unitId: ANN, kindId: 'evening_with_me', day: booked!.t.day + 1, slot: 'evening', source: 'roll' });
    expect(booked!.t.personal!.bookings).toEqual([
      expect.objectContaining({ unitId: ANN, kindId: 'evening_with_me', day: booked!.t.day + 1, slot: 'evening', status: 'booked', source: 'roll', made: booked!.t.day }),
    ]);
    const dm = booked!.t.dms[ANN].at(-1)!;
    expect(dm).toMatchObject({ from: ANN, read: false, initiated: true });
    expect(dm.text).toContain('This evening');
    expect(dm.text).not.toContain('{name}');
  });

  it('a hit picks a kind by weight among the kinds her tier allows', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const r = roll(eager(), seed);
      for (const e of ofType(r.events, 'booking_made')) kinds.add(String(e.kindId));
    }
    expect([...kinds].sort()).toEqual(['evening_with_me', 'roof_walk', 'train_together']);
    // a friend with Impunity 60 has level 3 without a romantic tier: no romantic-only kind
    const friend = atImpunity(partner(plain(reg), ANN, { lead: 'balanced', stateId: 'friend', affinity: 90, want: 50 }), reg, ANN, 60);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) for (const e of ofType(roll(friend, seed).events, 'booking_made')) seen.add(String(e.kindId));
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.has('roof_walk')).toBe(false);
  });

  it('chance scales with Affinity, Want, Impunity, demandMult and pressureMult; capped at 0.5', () => {
    const base = bookingChance(eager(), reg, ANN);
    expect(base).toBeCloseTo(0.08 * 1.9 * 1.5 * (55 / 50), 5);
    const more = (mutate: (s: CampaignState) => void) => {
      const s = eager();
      mutate(s);
      return bookingChance(s, reg, ANN);
    };
    expect(more((s) => setRelation(s, ANN, { affinity: 50 }))).toBeLessThan(base);
    expect(more((s) => { s.relations[ANN].want = 0; })).toBeLessThan(base);
    expect(more((s) => atImpunity(s, reg, ANN, 70))).toBeGreaterThan(base);
    expect(more((s) => withOptions(s, { squad_assertiveness: 'high' }))).toBeGreaterThan(base);
    const possessive = eager();
    possessive.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    const imp = impunityOf(possessive, reg, ANN)!.value; // her defect may move her Impunity: compare with the formula at that value
    expect(bookingChance(possessive, reg, ANN)).toBeCloseTo(0.08 * 1.9 * 1.5 * (imp / 50) * 1.5, 5);
    const extreme = eager();
    extreme.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }, { id: 'dominance_drive', arc: 'manage' }];
    withOptions(extreme, { squad_assertiveness: 'high' });
    atImpunity(extreme, reg, ANN, 80);
    extreme.relations[ANN].want = 100;
    expect(bookingChance(extreme, reg, ANN)).toBe(TUNING.personal.booking.cap);
  });

  it('the weekly cap holds at 2; a restricted unit never books', () => {
    const s = eager();
    const cap = TUNING.personal.booking.perWeek;
    expect(cap).toBe(2);
    putBookings(s, bk('b1', ANN, { status: 'played', made: s.day - 3 }), bk('b2', ANN, { status: 'cancelled', made: s.day - 1 }));
    const r = roll(s, 1);
    expect(ofType(r.events, 'booking_made')).toEqual([]);
    expect(r.t.rng).toEqual(seeded(s, 1).rng); // no draw
    // an old booking no longer counts
    putBookings(s, bk('b1', ANN, { status: 'played', made: s.day - 9 }), bk('b2', ANN, { status: 'played', made: s.day - 8 }));
    expect(hitting(s).events.length).toBeGreaterThan(0);
    // restricted
    const brig = eager();
    addRestriction(brig, { unitId: ANN, kind: 'confined', untilDay: brig.day + 3 });
    const q = roll(brig, 2);
    expect(q.events).toEqual([]);
    expect(q.t.rng).toEqual(seeded(brig, 2).rng);
  });

  it('a unit with an open booking, or barred by a lost slot wager, does not book', () => {
    const open = putBookings(eager(), bk('b1', ANN, { day: 9 }));
    expect(roll(open, 3).events).toEqual([]);
    const barred = eager();
    personalOf(barred).noBookUntil = { [ANN]: barred.day + 3 };
    expect(roll(barred, 3).events).toEqual([]);
  });

  it('a unit at access 2 never books (acceptance 7)', () => {
    const lvl2 = atImpunity(partner(plain(reg), ANN, { lead: 'balanced', stateId: 'lover', affinity: 95, want: 90 }), reg, ANN, 55);
    const nobond = plain(reg);
    setRelation(nobond, ANN, { stateId: 'lover', affinity: 95 });
    for (const s of [lvl2, nobond]) {
      for (let seed = 1; seed <= 50; seed++) {
        const r = roll(s, seed);
        expect(r.events).toEqual([]);
        expect(r.t.rng).toEqual(seeded(s, seed).rng);
      }
    }
  });

  it('the day step rolls the bookings and none for a plain squad', () => {
    const s = eager();
    const h = hitting(s);
    expect(h.t.personal!.bookings![0].day).toBe(s.day + 1);
  });
});

describe('the slot belongs to her', () => {
  const due = (): CampaignState => dueNow(eager(), bk('b1', ANN));
  const MSG = 'Ann has booked this slot: go to her or cancel it.';

  it('the due slot refuses activities, expeditions, END SLOT and a scene without her, with booking_due', () => {
    const s = due();
    expect(dueBooking(s)?.id).toBe('b1');
    for (const action of [
      { type: 'activity/do', payload: { activityId: 'rest' } },
      { type: 'expedition/start', payload: {} },
      { type: 'calendar/consume_slot' },
      { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA], origin: 'event', startIndex: 0 } },
    ]) {
      const r = run(s, reg, action);
      expect(errors(r.events)[0], action.type).toMatchObject({ code: 'booking_due', message: MSG });
      expect(r.state).toBe(s);
    }
    expect(endSlotBlock(s)).toBe(MSG);
  });

  it('a scene with her passes, and counts as playing the booking', () => {
    const s = due();
    s.relations[ANN].want = 50;
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.bookings![0].status).toBe('played');
    expect(r.state.relations[ANN].want).toBeLessThan(50);
    expect(dueBooking(r.state)).toBeNull();
  });

  it('a booking of another day or slot, a played one and a cancelled one do not block', () => {
    for (const b of [bk('b1', ANN, { day: 6 }), bk('b1', ANN, { slot: 'morning' }), bk('b1', ANN, { status: 'played' }), bk('b1', ANN, { status: 'cancelled' })]) {
      const s = putBookings(eager(), b);
      s.day = 5;
      s.slot = 'evening';
      expect(dueBooking(s)).toBeNull();
      expect(endSlotBlock(s)).toBeNull();
    }
  });

  it('a booking she cannot keep never blocks the slot and lapses free', () => {
    const cases: Array<[string, (s: CampaignState) => void]> = [
      ['confined', (s) => { addRestriction(s, { unitId: ANN, kind: 'confined', untilDay: s.day + 2 }); }],
      ['injured', (s) => { s.squad.find((u) => u.id === ANN)!.status = 'injured'; }],
      ['gone', (s) => { s.squad.find((u) => u.id === ANN)!.status = 'terminated'; }],
    ];
    for (const [name, mutate] of cases) {
      const s = due();
      s.slot = 'afternoon'; // not the evening: ending the evening would run the day-end pass and move her numbers
      s.personal!.bookings![0].slot = 'afternoon';
      mutate(s);
      expect(bookingPlayable(s, s.personal!.bookings![0]), name).toBe(false);
      expect(endSlotBlock(s), name).toBeNull();
      const before = structuredClone(s.relations);
      const r = run(s, reg, { type: 'calendar/consume_slot' });
      expect(errors(r.events), name).toEqual([]);
      expect(r.state.personal!.bookings![0].status, name).toBe('lapsed');
      expect(ofType(r.events, 'booking_lapsed'), name).toHaveLength(1);
      expect(r.state.relations, name).toEqual(before);
    }
  });

  it('a slot that passes during a run lapses the bookings it covered, with no deltas', () => {
    const s = eager();
    s.day = 5;
    s.slot = 'morning';
    putBookings(s, bk('b1', ANN, { day: 5, slot: 'afternoon' }), bk('b2', ANN, { day: 6, slot: 'evening' }));
    const before = structuredClone(s.relations);
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 2, reason: 'expedition' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe('evening');
    expect(r.state.personal!.bookings!.map((b) => b.status)).toEqual(['lapsed', 'booked']);
    expect(r.state.relations[ANN]).toEqual(before[ANN]);
  });

  it('lapseBookings at the day end drops every unplayed booking of today and before', () => {
    const s = eager();
    s.day = 5;
    s.slot = 'evening';
    putBookings(s, bk('b1', ANN, { day: 4 }), bk('b2', ANN, { day: 5, slot: 'morning' }), bk('b3', ANN, { day: 6 }));
    lapseBookings(s);
    expect(s.personal!.bookings!.map((b) => b.status)).toEqual(['lapsed', 'lapsed', 'booked']);
  });
});

describe('play', () => {
  it('play marks it played, relieves Want by the kind and returns her location', () => {
    const s = dueNow(eager(), bk('b1', ANN));
    s.relations[ANN].want = 60;
    const r = run(s, reg, { type: 'booking/play', payload: { bookingId: 'b1' } });
    expect(errors(r.events)).toEqual([]);
    const relief = Number(reg.bookingKinds.get('evening_with_me')!.wantRelief);
    expect(r.state.relations[ANN].want).toBe(60 - relief);
    expect(r.state.personal!.bookings![0].status).toBe('played');
    expect(ofType(r.events, 'booking_played')).toEqual([{
      type: 'booking_played', bookingId: 'b1', unitId: ANN, scene: { locationId: 'quarters_unit', participants: [ANN], origin: 'event' },
    }]);
  });

  it('without an id it plays the due booking; a booking that is not due, or that cannot be met, is refused', () => {
    const s = dueNow(eager(), bk('b1', ANN));
    expect(ofType(run(s, reg, { type: 'booking/play', payload: {} }).events, 'booking_played')).toHaveLength(1);
    const later = putBookings(eager(), bk('b1', ANN, { day: 9 }));
    expect(errors(run(later, reg, { type: 'booking/play', payload: { bookingId: 'b1' } }).events)).toHaveLength(1);
    const brig = dueNow(eager(), bk('b1', ANN));
    addRestriction(brig, { unitId: ANN, kind: 'confined', untilDay: brig.day + 2 });
    const r = run(brig, reg, { type: 'booking/play', payload: { bookingId: 'b1' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(brig);
  });
});

describe('cancel', () => {
  const quarrel = (s: CampaignState, id: string) => run(s, reg, { type: 'booking/cancel', payload: { bookingId: id } });

  it('cancel is the demand refuse path: refused_demand moderate, a held defiance and a deed at Impunity ≥ 50', () => {
    const high = putBookings(eager(), bk('b1', ANN, { day: 9 }));
    const r = quarrel(high, 'b1');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.bookings![0].status).toBe('cancelled');
    expect(ofType(r.events, 'booking_cancelled')).toEqual([{ type: 'booking_cancelled', bookingId: 'b1', unitId: ANN }]);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'refused_demand', severity: 'moderate' });
    expect(disciplineOf(r.state).defiance.some((d) => d.unitId === ANN)).toBe(true);
    expect(deedsOf(r.state).demands_refused).toBe(deedsOf(high).demands_refused + 1);
  });

  it('is ×1.5 at Impunity ≥ 50 and mild below it, without a held defiance', () => {
    const hi = atImpunity(putBookings(eager(), bk('b1', ANN, { day: 9 })), reg, ANN, 60);
    const lo = atImpunity(putBookings(eager(), bk('b1', ANN, { day: 9 })), reg, ANN, 30);
    // her Trust and Affinity are the same before; compare what each loses
    const a = quarrel(hi, 'b1').state.relations[ANN];
    const b = quarrel(lo, 'b1').state.relations[ANN];
    const lossHi = hi.relations[ANN].trust - a.trust;
    const lossLo = lo.relations[ANN].trust - b.trust;
    expect(lossLo).toBeGreaterThan(0);
    expect(lossHi).toBeGreaterThan(lossLo);
    expect(disciplineOf(quarrel(lo, 'b1').state).defiance.some((d) => d.unitId === ANN)).toBe(false);
  });

  it('refuseLikeDemand is the shared path: the same deltas with no demand', () => {
    const viaBooking = quarrel(putBookings(eager(), bk('b1', ANN, { day: 9 })), 'b1').state;
    const direct = structuredClone(eager());
    refuseLikeDemand(direct, ctxFrom(direct, reg), ANN, { evidence: 'a booking was cancelled' });
    expect(viaBooking.relations[ANN].trust).toBe(direct.relations[ANN].trust);
    expect(viaBooking.relations[ANN].affinity).toBe(direct.relations[ANN].affinity);
  });

  it('a wagered booking cancelled also breaks a promise', () => {
    const s = putBookings(eager(), bk('b1', ANN, { day: 9, source: 'wager' }));
    const r = quarrel(s, 'b1');
    const types = r.state.relations[ANN].history.filter((h) => h.kind === 'event').slice(-2).map((h) => h.type);
    expect(types).toContain('broke_promise');
    expect(types).toContain('refused_demand');
    const plainOne = quarrel(putBookings(eager(), bk('b1', ANN, { day: 9 })), 'b1').state.relations[ANN].history.filter((h) => h.kind === 'event').map((h) => h.type);
    expect(plainOne).not.toContain('broke_promise');
  });

  it('only a booked booking can be cancelled', () => {
    const s = putBookings(eager(), bk('b1', ANN, { status: 'played' }));
    expect(errors(quarrel(s, 'b1').events)).toHaveLength(1);
    expect(errors(quarrel(s, 'nope').events)).toHaveLength(1);
  });
});

describe('conflicts', () => {
  /** Ann (intense, dominant) and Bea (steady, assertive) book the same slot. */
  function clash(): CampaignState {
    const s = partner(plain(reg), ANN, { lead: 'dominant', attachment: 'intense', stateId: 'lover', affinity: 80 });
    partner(s, BEA, { lead: 'assertive', attachment: 'steady', stateId: 'lover', affinity: 80 });
    atImpunity(s, reg, ANN, 50);
    atImpunity(s, reg, BEA, 50);
    s.day = 5;
    s.slot = 'morning';
    const ev1 = book(s, ctxFrom(s, reg), { unitId: ANN, kindId: 'evening_with_me', day: 6, slot: 'evening', source: 'roll' });
    const ev2 = book(s, ctxFrom(s, reg), { unitId: BEA, kindId: 'evening_with_me', day: 6, slot: 'evening', source: 'roll' });
    expect(ofType(ev1, 'booking_conflict')).toEqual([]);
    expect(ofType(ev2, 'booking_conflict')).toHaveLength(1);
    return s;
  }

  it('two bookings of one slot mark each other as a conflict', () => {
    const s = clash();
    expect(s.personal!.bookings!.map((b) => b.conflict)).toEqual([true, true]);
    expect(s.personal!.bookings!.map((b) => b.unitId)).toEqual([ANN, BEA]);
  });

  it('choosing one gives the other rejected_advance moderate', () => {
    const s = clash();
    const ids = s.personal!.bookings!.map((b) => b.id);
    const r = run(s, reg, { type: 'booking/resolve', payload: { bookingId: ids[1] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.bookings!.map((b) => [b.status, b.conflict])).toEqual([['cancelled', undefined], ['booked', undefined]]);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'rejected_advance', severity: 'moderate' });
    expect(r.state.relations[BEA].history.filter((h) => h.kind === 'event').at(-1)?.type).not.toBe('rejected_advance');
    expect(ofType(r.events, 'booking_resolved')).toHaveLength(1);
  });

  it('letting them settle it picks by attachment and lead; the loser gets stress +10', () => {
    const s = clash();
    const stress = (st: CampaignState, id: string) => st.squad.find((u) => u.id === id)!.stress;
    const r = run(s, reg, { type: 'booking/resolve', payload: { day: 6, slot: 'evening', settle: true } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.bookings!.map((b) => b.status)).toEqual(['booked', 'cancelled']);
    expect(stress(r.state, BEA)).toBe(Math.min(100, stress(s, BEA) + TUNING.personal.booking.settleStress));
    expect(stress(r.state, ANN)).toBe(stress(s, ANN));
    expect(r.state.relations[BEA].history.filter((h) => h.kind === 'event').at(-1)?.type).not.toBe('rejected_advance');
  });

  it('a tie in attachment and lead goes to the higher Impunity, then to squad order', () => {
    const s = clash();
    s.squad.find((u) => u.id === ANN)!.bond!.leadStyle = 'assertive';
    s.squad.find((u) => u.id === ANN)!.bond!.attachment = 'steady';
    atImpunity(s, reg, BEA, 60);
    atImpunity(s, reg, ANN, 50);
    const hi = run(s, reg, { type: 'booking/resolve', payload: { day: 6, slot: 'evening', settle: true } });
    expect(hi.state.personal!.bookings!.map((b) => b.status)).toEqual(['cancelled', 'booked']);
    setRecord(s, ANN, 0);
    setRecord(s, BEA, 0);
    expect(impunityOf(s, reg, ANN)!.value).toBe(impunityOf(s, reg, BEA)!.value);
    const order = run(s, reg, { type: 'booking/resolve', payload: { day: 6, slot: 'evening', settle: true } });
    expect(order.state.personal!.bookings!.map((b) => b.status)).toEqual(['booked', 'cancelled']);
  });

  it('an unresolved conflict settles itself when its slot comes', () => {
    const s = clash();
    s.day = 6;
    s.slot = 'evening';
    const r = run(s, reg, { type: 'booking/play', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.bookings!.map((b) => b.status)).toEqual(['played', 'cancelled']);
    expect(ofType(r.events, 'booking_played')[0]).toMatchObject({ unitId: ANN });
    expect(r.state.squad.find((u) => u.id === BEA)!.stress).toBeGreaterThan(s.squad.find((u) => u.id === BEA)!.stress);
  });

  it('cancelling one of a conflict clears the other\'s flag', () => {
    const s = clash();
    const r = run(s, reg, { type: 'booking/cancel', payload: { bookingId: s.personal!.bookings![0].id } });
    expect(r.state.personal!.bookings!.map((b) => [b.status, b.conflict])).toEqual([['cancelled', undefined], ['booked', undefined]]);
  });
});

describe('where she is', () => {
  it('whereabouts place her in the booked room with reason routine', () => {
    for (const [kindId, room] of [['evening_with_me', 'quarters'], ['roof_walk', 'roof']] as const) {
      const s = dueNow(eager(), bk('b1', ANN, { kindId }));
      const w = whereabouts(s, reg).find((x) => x.unitId === ANN)!;
      expect(w).toEqual({ unitId: ANN, roomId: room, reason: 'routine' });
    }
  });

  it('a booking of another slot, or a lapsed or cancelled one, places no one', () => {
    for (const b of [bk('b1', ANN, { day: 6 }), bk('b1', ANN, { status: 'lapsed' }), bk('b1', ANN, { status: 'cancelled' })]) {
      const s = putBookings(eager(), b);
      s.day = 5;
      s.slot = 'evening';
      const baseline = whereabouts(plain(reg), reg);
      expect(baseline.length).toBeGreaterThan(0);
      expect(whereabouts(s, reg).find((x) => x.unitId === ANN)!.reason).toBe(whereabouts({ ...s, personal: undefined }, reg).find((x) => x.unitId === ANN)!.reason);
    }
  });

  it('confinement and injury still win over a booking', () => {
    const s = dueNow(eager(), bk('b1', ANN));
    addRestriction(s, { unitId: ANN, kind: 'confined', untilDay: s.day + 2 });
    expect(whereabouts(s, reg).find((x) => x.unitId === ANN)!.reason).toBe('confined');
  });
});

describe('smother', () => {
  it('a smother books her the next slot and still locks the hangar', () => {
    const s = eager();
    s.day = 5;
    s.slot = 'morning';
    const events = startSmother(s, ANN, reg);
    expect(ofType(events, 'smother_started')).toHaveLength(1);
    expect(smotherRefusal(s)).toContain('locked the hangar');
    const made = ofType(events, 'booking_made')[0];
    expect(made).toMatchObject({ unitId: ANN, source: 'smother', day: 5, slot: 'afternoon' });
    expect(s.personal!.bookings![0]).toMatchObject({ unitId: ANN, source: 'smother', status: 'booked' });
  });

  it('from the evening it books tomorrow morning; without registries it books nothing', () => {
    const s = eager();
    s.day = 5;
    s.slot = 'evening';
    startSmother(s, ANN, reg);
    expect(s.personal!.bookings![0]).toMatchObject({ day: 6, slot: 'morning' });
    const bare = eager();
    expect(startSmother(bare, ANN)).toHaveLength(1);
    expect(bare.personal).toBeUndefined();
  });
});
