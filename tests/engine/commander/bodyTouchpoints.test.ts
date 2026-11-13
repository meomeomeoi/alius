import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { intimidationBonus } from '../../../src/engine/commander/profile';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
});

/** A run in progress with `slots` slots, started in the morning; the commander has the given endurance. */
function running(o: { slots: 2 | 3; endurance: number; party?: string[]; states?: Record<string, string> }): CampaignState {
  const { state, mission } = withMission(reg, base);
  const s = structuredClone(depart(reg, state, mission.id, { supplies: 3 }));
  s.expedition!.slots = o.slots;
  s.commander.body = { strength: 3, endurance: o.endurance, reflexes: 2 };
  if (o.party) s.expedition!.party = o.party;
  for (const [id, stateId] of Object.entries(o.states ?? {})) s.relations[id].stateId = stateId;
  return s;
}
const retreat = (s: CampaignState) => run(s, reg, { type: 'expedition/retreat', payload: {} });

describe('exhaustion after a long run', () => {
  it('endurance 2 after a 3-slot run loses the next morning', () => {
    const r = retreat(running({ slots: 3, endurance: 2 }));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'commander_exhausted')).toHaveLength(1);
    expect(r.state.slot).toBe('afternoon');
    expect(r.state.day).toBe(2);
    expect(r.state.calendar.loseMorning).toBeUndefined(); // spent by the rollover
  });

  it('endurance 1 is exhausted too', () => {
    expect(retreat(running({ slots: 3, endurance: 1 })).state.slot).toBe('afternoon');
  });

  it('a friend in the party covers him instead', () => {
    const r = retreat(running({ slots: 3, endurance: 2, states: { [BEA]: 'friend' } }));
    expect(ofType(r.events, 'commander_covered')).toEqual([{ type: 'commander_covered', unitId: BEA }]);
    expect(ofType(r.events, 'commander_exhausted')).toHaveLength(0);
    expect(r.state.slot).toBe('morning');
  });

  it('the first covering unit by party order wins, and closer states count', () => {
    const r = retreat(running({ slots: 3, endurance: 2, party: [CAT, ANN, BEA], states: { [ANN]: 'lover', [BEA]: 'friend', [CAT]: 'comrade' } }));
    expect(ofType(r.events, 'commander_covered')).toEqual([{ type: 'commander_covered', unitId: ANN }]);
  });

  it('a friend who is not in the party does not cover', () => {
    const r = retreat(running({ slots: 3, endurance: 2, party: [ANN, CAT], states: { [BEA]: 'friend' } }));
    expect(ofType(r.events, 'commander_covered')).toHaveLength(0);
    expect(r.state.slot).toBe('afternoon');
  });

  it('a dead friend does not cover', () => {
    const s = running({ slots: 3, endurance: 2, states: { [BEA]: 'friend' } });
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    expect(retreat(s).state.slot).toBe('afternoon');
  });

  it('a 2-slot run never exhausts', () => {
    const r = retreat(running({ slots: 2, endurance: 1 }));
    expect(ofType(r.events, 'commander_exhausted')).toHaveLength(0);
    expect(r.state.calendar.loseMorning).toBeUndefined();
  });

  it('endurance 3 never exhausts', () => {
    const r = retreat(running({ slots: 3, endurance: 3 }));
    expect(ofType(r.events, 'commander_exhausted')).toHaveLength(0);
    expect(r.state.slot).toBe('morning');
  });

  it('a night event is played before the lost morning', () => {
    const s = running({ slots: 3, endurance: 2 });
    s.calendar.nightEventsQueue.push({
      id: 'n1', unitId: ANN, kind: 'talk', priority: 50, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2,
    });
    const r = retreat(s);
    expect(r.state.slot).toBe('night');
    expect(r.state.day).toBe(1);
    expect(r.state.calendar.loseMorning).toBe(true);
    const after = run(r.state, reg, { type: 'night/ignore', payload: {} });
    expect(errors(after.events)).toEqual([]);
    expect(after.state.day).toBe(2);
    expect(after.state.slot).toBe('afternoon');
    expect(after.state.calendar.loseMorning).toBeUndefined();
  });

  it('a normal day rolls over to the morning', () => {
    const s = structuredClone(base);
    s.slot = 'evening';
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: {} });
    expect(r.state.slot).toBe('morning');
  });
});

describe('intimidation in talk-down', () => {
  const desertionAt = (strength: number, seasoning: number, stat: 'authority' | 'empathy' = 'authority'): number => {
    const s = structuredClone(base);
    s.rng = seedRng(1);
    setRelation(s, ANN, { trust: 8, band: 'breaking' });
    s.commander.body = { strength, endurance: 3, reflexes: 2 };
    s.commander.seasoning = seasoning;
    s.commander.socialStats.authority = 3;
    s.commander.socialStats.empathy = 3;
    const entry = { id: 'n_d', unitId: ANN, kind: 'desertion', priority: 95, framing: 'f', ignore: { event: 'dismissed', severity: 'moderate' as const }, expiresDay: s.day + 2 };
    s.calendar.nightEvent = entry;
    s.slot = 'night';
    loyaltyRecord(s, ANN).attempts = 1;
    s.disloyalty!.open = { kind: 'desertion', unitId: ANN, day: s.day, at: 'night', nightEntryId: entry.id };
    const r = run(s, reg, { type: 'loyalty/talk_down', payload: { stat } });
    return ofType(r.events, 'loyalty_talk_down')[0].chance as number;
  };

  it('intimidationBonus is 0.03 per point of strength and seasoning above 3', () => {
    const s = structuredClone(base);
    s.commander.body = { strength: 5, endurance: 3, reflexes: 2 };
    s.commander.seasoning = 5;
    expect(intimidationBonus(s)).toBeCloseTo(0.12);
    s.commander.body.strength = 1;
    s.commander.seasoning = 1;
    expect(intimidationBonus(s)).toBeCloseTo(-0.12);
    delete s.commander.body;
    delete s.commander.seasoning;
    expect(intimidationBonus(s)).toBe(0); // the defaults: strength 3, seasoning 3
  });

  it('strength 5 seasoning 5 adds 0.12 to authority talk-down, empathy unchanged', () => {
    const plain = desertionAt(3, 3);
    expect(plain).toBeCloseTo(0.7); // difficulty 2, rank 3
    expect(desertionAt(5, 5)).toBeCloseTo(plain + 0.12);
    expect(desertionAt(5, 5, 'empathy')).toBeCloseTo(plain);
  });

  it('strength 1 seasoning 1 subtracts 0.12', () => {
    expect(desertionAt(1, 1)).toBeCloseTo(0.7 - 0.12);
  });

  it('the bonus still passes through the clamp', () => {
    const s = (strength: number) => {
      const t = structuredClone(base);
      t.commander.body = { strength, endurance: 3, reflexes: 2 };
      t.commander.seasoning = 5;
      return intimidationBonus(t);
    };
    expect(s(5)).toBeCloseTo(0.12);
    expect(desertionAt(5, 5)).toBeLessThanOrEqual(0.95);
  });
});
