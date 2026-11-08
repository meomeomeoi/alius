import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import {
  DAY_END_STEPS, clockText, registerDayEndStep, resetDayEndSteps, slotsLeftToday,
} from '../../src/engine/calendar';
import type { CampaignState, Slot } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetDayEndSteps());

const consume = (s: CampaignState, slots = 1, reason = 'test') =>
  run(s, reg, { type: 'calendar/consume_slot', payload: { slots, reason } });
const at = (slot: Slot, day = 1) => {
  const s = campaign(reg, 4);
  s.slot = slot;
  s.day = day;
  s.resources.supplies = 100;
  return s;
};

describe('slot flow', () => {
  it('morning to afternoon to evening', () => {
    let r = consume(at('morning'));
    expect(r.state.slot).toBe('afternoon');
    expect(r.state.day).toBe(1);
    r = consume(r.state);
    expect(r.state.slot).toBe('evening');
    expect(ofType(r.events, 'slot_advanced')[0]).toMatchObject({ from: 'afternoon', to: 'evening' });
  });

  it('evening without a night queue runs the pipeline and rolls to the next morning', () => {
    const r = consume(at('evening', 3));
    expect(r.state.day).toBe(4);
    expect(r.state.slot).toBe('morning');
    expect(ofType(r.events, 'day_started')[0]).toMatchObject({ day: 4 });
    expect(r.state.resources.supplies).toBe(95);
  });

  it('pipeline steps run in the documented order', () => {
    const r = consume(at('evening'));
    expect(ofType(r.events, 'day_end_step').map((e) => e.step)).toEqual([...DAY_END_STEPS]);
    expect(r.events.at(-1)).toMatchObject({ type: 'autosave' });
  });

  it('non-empty night queue gives a night slot, day unchanged, head moved to nightEvent', () => {
    const s = at('evening');
    s.calendar.nightEventsQueue = [{ id: 'a' }, { id: 'b' }];
    const r = consume(s);
    expect(r.state.slot).toBe('night');
    expect(r.state.day).toBe(1);
    expect(r.state.calendar.nightEvent).toEqual({ id: 'a' });
    expect(r.state.calendar.nightEventsQueue).toEqual([{ id: 'b' }]);
    expect(ofType(r.events, 'night_started')).toHaveLength(1);
  });

  it('ending night rolls over without a second pipeline', () => {
    const s = at('evening');
    s.calendar.nightEventsQueue = [{ id: 'a' }];
    const night = consume(s).state;
    const suppliesAtNight = night.resources.supplies;
    const r = consume(night);
    expect(r.state.slot).toBe('morning');
    expect(r.state.day).toBe(2);
    expect(r.state.calendar.nightEvent).toBeUndefined();
    expect(r.state.resources.supplies).toBe(suppliesAtNight);
    expect(ofType(r.events, 'day_end_step')).toHaveLength(0);
  });

  it('a 3-slot expedition from morning runs the pipeline once', () => {
    const r = consume(at('morning'), 3, 'expedition');
    expect(r.state.day).toBe(2);
    expect(r.state.slot).toBe('morning');
    expect(ofType(r.events, 'day_end_step').filter((e) => e.step === 'upkeep')).toHaveLength(1);
  });

  it('a 2-slot expedition from morning lands in the evening', () => {
    expect(consume(at('morning'), 2, 'expedition').state.slot).toBe('evening');
  });

  it('slots above what is left today are rejected and change nothing', () => {
    const s = at('afternoon');
    const r = consume(s, 3);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
    expect(errors(consume(at('evening'), 2).events)).toHaveLength(1);
    expect(errors(consume(at('morning'), 0).events)).toHaveLength(1);
    expect(errors(consume(at('morning'), 1.5).events)).toHaveLength(1);
    expect(slotsLeftToday('night')).toBe(1);
  });

  it('rollover zeroes dailyGain', () => {
    const s = at('evening');
    s.relations[s.squad[0].id].dailyGain = { trust: 5, affinity: 6, attraction: 7 };
    const r = consume(s);
    expect(r.state.relations[s.squad[0].id].dailyGain).toEqual({ trust: 0, affinity: 0, attraction: 0 });
  });

  it('clockText pads the day to three digits', () => {
    expect(clockText(12, 'evening')).toBe('DAY 012 // EVENING');
    expect(clockText(1, 'morning')).toBe('DAY 001 // MORNING');
    expect(clockText(1234, 'night')).toBe('DAY 1234 // NIGHT');
  });
});

describe('day-end steps', () => {
  it('facility timer completes on the right day and raises roster capacity', () => {
    const s = at('evening');
    s.base.upgrades = [{ facilityId: 'barracks', toLevel: 2, daysLeft: 2 }];
    const d1 = consume(s);
    expect(d1.state.base.upgrades).toEqual([{ facilityId: 'barracks', toLevel: 2, daysLeft: 1 }]);
    expect(d1.state.roster.capacity).toBe(6);
    const evening = { ...d1.state, slot: 'evening' as const };
    const d2 = consume(evening);
    expect(d2.state.base.upgrades).toEqual([]);
    expect(d2.state.base.facilities.barracks).toBe(2);
    expect(d2.state.roster.capacity).toBe(7);
    expect(ofType(d2.events, 'facility_upgraded')[0]).toMatchObject({ facilityId: 'barracks', level: 2 });
  });

  it('injured unit recovers after its days', () => {
    const s = at('evening');
    const u = s.squad[0];
    u.status = 'injured';
    u.injuries = ['wound'];
    u.injuryDays = 2;
    const d1 = consume(s);
    expect(d1.state.squad[0]).toMatchObject({ status: 'injured', injuryDays: 1 });
    const d2 = consume({ ...d1.state, slot: 'evening' });
    expect(d2.state.squad[0].status).toBe('active');
    expect(d2.state.squad[0].injuries).toEqual([]);
    expect(d2.state.squad[0].injuryDays).toBeUndefined();
    expect(ofType(d2.events, 'unit_recovered')[0]).toMatchObject({ unitId: u.id });
  });

  it('a medbay speeds recovery up', () => {
    const s = at('evening');
    s.base.facilities.medbay = 3; // injurySpeed 1
    s.squad[0].status = 'injured';
    s.squad[0].injuryDays = 2;
    expect(consume(s).state.squad[0].status).toBe('active');
  });

  it('passive stress recovery floors at 0', () => {
    const s = at('evening');
    s.squad[0].stress = 10;
    s.squad[1].stress = 0;
    const r = consume(s).state;
    expect(r.squad[0].stress).toBe(9);
    expect(r.squad[1].stress).toBe(0);
  });

  it('registered hook steps run in order, inside their slot of the pipeline', () => {
    const calls: string[] = [];
    registerDayEndStep('director_tick', () => (calls.push('director'), [{ type: 'director_ran' }]));
    registerDayEndStep('mission_deadlines', () => (calls.push('missions'), []));
    registerDayEndStep('dm_rumors', () => (calls.push('dm'), []));
    const r = consume(at('evening'));
    expect(calls).toEqual(['missions', 'director', 'dm']);
    const types = r.events.map((e) => e.type === 'day_end_step' ? `step:${e.step}` : e.type);
    expect(types.indexOf('director_ran')).toBe(types.indexOf('step:director_tick') + 1);
  });

  it('a hook cannot be registered for a built-in step', () => {
    expect(() => registerDayEndStep('upkeep' as never, () => [])).toThrow();
  });

  it('a P1-era state runs seven days without crashing and ends with sane numbers', () => {
    let s = campaign(reg, 4);
    expect(s.base.upgrades).toBeUndefined();
    for (let i = 0; i < 7; i++) {
      for (let k = 0; k < 3; k++) {
        const r = consume(s);
        expect(errors(r.events)).toEqual([]);
        s = r.state;
      }
    }
    expect(s.day).toBe(8);
    expect(s.slot).toBe('morning');
    expect(s.resources.supplies).toBeGreaterThanOrEqual(0);
    expect(s.squad.every((u) => u.stress >= 0 && u.stress <= 100)).toBe(true);
  });

  it('a failing hook fails the whole action and changes nothing', () => {
    registerDayEndStep('dm_rumors', () => {
      throw new Error('boom');
    });
    const s = at('evening');
    const r = consume(s);
    expect(r.state).toBe(s);
    expect(errors(r.events)[0]).toMatchObject({ code: 'handler_failed' });
  });
});
