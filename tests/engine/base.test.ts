import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const rich = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources = { credits: 1000, supplies: 100, plyx: 200 };
  return s;
};
const upgrade = (s: CampaignState, facilityId: string) => run(s, reg, { type: 'base/upgrade', payload: { facilityId } });
const nextDay = (s: CampaignState): CampaignState => {
  let cur = s;
  while (true) {
    const r = run(cur, reg, { type: 'calendar/consume_slot', payload: { reason: 'test' } });
    cur = r.state;
    if (r.events.some((e) => e.type === 'day_started')) return cur;
  }
};

describe('base/upgrade', () => {
  it('pays, starts a timer and does not raise the level yet', () => {
    const s = rich();
    const r = upgrade(s, 'barracks');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.resources).toMatchObject({ credits: 940, plyx: 195 });
    expect(r.state.base.upgrades).toEqual([{ facilityId: 'barracks', toLevel: 2, daysLeft: 2 }]);
    expect(r.state.base.facilities.barracks ?? 1).toBe(1);
    expect(r.state.roster.capacity).toBe(6);
    expect(ofType(r.events, 'upgrade_started')[0]).toMatchObject({ facilityId: 'barracks', toLevel: 2, days: 2 });
  });

  it('timer runs across days and capacity grows at barracks 2', () => {
    let s = upgrade(rich(), 'barracks').state;
    s = nextDay(s);
    expect(s.roster.capacity).toBe(6);
    s = nextDay(s);
    expect(s.base.facilities.barracks).toBe(2);
    expect(s.roster.capacity).toBe(7);
    expect(s.base.upgrades).toEqual([]);
  });

  it('can be chained up to the maximum, then is rejected', () => {
    let s = rich();
    s.base.facilities.mess_hall = 2;
    s = upgrade(s, 'mess_hall').state;
    s = nextDay(nextDay(nextDay(s)));
    expect(s.base.facilities.mess_hall).toBe(3);
    const r = upgrade(s, 'mess_hall');
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/max/i);
  });

  it('rejected while an upgrade of that facility is pending', () => {
    const once = upgrade(rich(), 'medbay').state;
    const r = upgrade(once, 'medbay');
    expect(r.state).toBe(once);
    expect(String(errors(r.events)[0].message)).toMatch(/already/i);
  });

  it('rejected without enough credits or plyx, state untouched', () => {
    const s = rich();
    s.resources.plyx = 4;
    const r = upgrade(s, 'barracks');
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/plyx/i);
    s.resources = { credits: 59, supplies: 1, plyx: 99 };
    expect(String(errors(upgrade(s, 'barracks').events)[0].message)).toMatch(/credits/i);
  });

  it('unknown facility is rejected', () => {
    const s = rich();
    const r = upgrade(s, 'nowhere');
    expect(r.state).toBe(s);
    expect(errors(r.events)).toHaveLength(1);
  });

  it('two different facilities can upgrade at once', () => {
    let s = rich();
    s = upgrade(s, 'barracks').state;
    s = upgrade(s, 'comms').state;
    expect(s.base.upgrades).toHaveLength(2);
    expect(s.resources.credits).toBe(1000 - 60 - 70);
  });
});

describe('base/requisition', () => {
  const req = (s: CampaignState, supplies: unknown) => run(s, reg, { type: 'base/requisition', payload: { supplies } });

  it('converts credits to supplies', () => {
    const r = req(rich(), 5);
    expect(r.state.resources).toMatchObject({ credits: 1000 - 15, supplies: 105 });
    expect(ofType(r.events, 'requisitioned')[0]).toMatchObject({ supplies: 5, credits: 15 });
  });

  it('rejects fractions, zero, negatives and too little credit', () => {
    const s = rich();
    for (const bad of [0, -1, 1.5, '3', undefined]) {
      const r = req(s, bad);
      expect(r.state, String(bad)).toBe(s);
      expect(errors(r.events)).toHaveLength(1);
    }
    s.resources.credits = 2;
    expect(errors(req(s, 1).events)).toHaveLength(1);
  });
});

describe('roster/set_active', () => {
  const set = (s: CampaignState, activeIds: unknown) => run(s, reg, { type: 'roster/set_active', payload: { activeIds } });
  const ids = (s: CampaignState) => s.squad.map((u) => u.id);

  it('accepts four, rejects five', () => {
    const s = campaign(reg, 6);
    expect(errors(set(s, ids(s).slice(0, 4)).events)).toEqual([]);
    const r = set(s, ids(s).slice(0, 5));
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/4/);
  });

  it('rejects duplicates, unknown and dead units, and non-arrays', () => {
    const s = campaign(reg, 4);
    s.squad[3].status = 'dead';
    for (const bad of [['unit_ann', 'unit_ann'], ['ghost'], ['unit_dee'], 'unit_ann']) {
      const r = set(s, bad);
      expect(r.state, JSON.stringify(bad)).toBe(s);
      expect(errors(r.events)).toHaveLength(1);
    }
  });

  it('an empty list is rejected while units are alive (it would switch upkeep off)', () => {
    const s = campaign(reg, 4);
    const r = set(s, []);
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/at least one/i);
    const dead = campaign(reg, 2);
    dead.squad.forEach((u) => (u.status = 'dead'));
    expect(errors(set(dead, []).events)).toEqual([]);
  });

  it('statuses follow the list, injured units keep theirs, order is kept', () => {
    const s = campaign(reg, 6);
    s.squad[0].status = 'reserve';
    s.squad[1].status = 'injured';
    s.roster.activeIds = ['unit_bea', 'unit_cat', 'unit_dee', 'unit_eve'];
    const r = set(s, ['unit_ann', 'unit_bea', 'unit_fay']);
    expect(r.state.roster.activeIds).toEqual(['unit_ann', 'unit_bea', 'unit_fay']);
    const st = Object.fromEntries(r.state.squad.map((u) => [u.id, u.status]));
    expect(st).toMatchObject({ unit_ann: 'active', unit_bea: 'injured', unit_cat: 'reserve', unit_fay: 'active' });
  });
});
