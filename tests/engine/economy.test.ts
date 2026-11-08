import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import {
  facilityEffect, facilityLevel, rosterCapacityFor, runUpkeep, spread, upkeepNeeded,
} from '../../src/engine/economy';
import { Rng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, loadCore, ofType } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const upkeep = (s: CampaignState) => runUpkeep(s, reg);

describe('facility helpers', () => {
  it('an absent facility is level 1 and effects follow the level', () => {
    const s = campaign(reg);
    expect(facilityLevel(s, 'barracks')).toBe(1);
    expect(facilityEffect(s, reg, 'barracks', 'rosterCapacity')).toBe(6);
    s.base.facilities.barracks = 3;
    expect(facilityEffect(s, reg, 'barracks', 'restPct')).toBe(40);
    expect(rosterCapacityFor(reg, 5)).toBe(10);
    expect(facilityEffect(s, reg, 'nowhere', 'x')).toBe(0);
    expect(facilityEffect(s, reg, 'barracks', 'nope')).toBe(0);
  });
});

describe('upkeepNeeded', () => {
  it('counts active roster plus commander', () => {
    expect(upkeepNeeded(campaign(reg, 4), reg)).toEqual({ units: 4, needed: 5 });
  });

  it('hunger_loop unit eats double', () => {
    const s = campaign(reg, 4);
    s.squad[0].defects = [{ id: 'hunger_loop' }];
    expect(upkeepNeeded(s, reg).needed).toBe(6);
  });

  it('mess hall reduces upkeep, never below zero', () => {
    const s = campaign(reg, 4);
    s.base.facilities.mess_hall = 3;
    expect(upkeepNeeded(s, reg).needed).toBe(3);
    const empty = campaign(reg, 0);
    empty.base.facilities.mess_hall = 3;
    expect(upkeepNeeded(empty, reg).needed).toBe(0);
  });

  it('dead and deserted units do not eat; reserve units are not on the roster', () => {
    const s = campaign(reg, 4);
    s.squad[0].status = 'dead';
    s.squad[1].status = 'deserted';
    expect(upkeepNeeded(s, reg)).toEqual({ units: 2, needed: 3 });
    s.roster.activeIds = [s.squad[2].id];
    expect(upkeepNeeded(s, reg).units).toBe(1);
  });
});

describe('spread', () => {
  it('sums exactly and the remainder starts at the rotating offset', () => {
    expect(spread(12, 4, 0)).toEqual([3, 3, 3, 3]);
    expect(spread(3, 4, 0)).toEqual([1, 1, 1, 0]);
    expect(spread(3, 4, 2)).toEqual([1, 0, 1, 1]);
    expect(spread(0, 3, 1)).toEqual([0, 0, 0]);
    expect(spread(5, 0, 0)).toEqual([]);
  });
});

describe('runUpkeep', () => {
  it('full upkeep pays in full and resets the streak', () => {
    const s = campaign(reg, 4);
    s.resources.supplies = 9;
    s.calendar.shortageStreak = 2;
    const events = upkeep(s);
    expect(s.resources.supplies).toBe(4);
    expect(s.calendar.shortageStreak).toBe(0);
    expect(ofType(events, 'upkeep')[0]).toMatchObject({ needed: 5, paid: 5, shortage: 0 });
    expect(ofType(events, 'supply_shortage')).toHaveLength(0);
  });

  it('shortage takes all supplies and spreads stress and affinity exactly', () => {
    const s = campaign(reg, 4);
    s.resources.supplies = 2; // needs 5 → 3 short
    const before = s.squad.map((u) => u.stress);
    const aff = s.squad.map((u) => s.relations[u.id].affinity);
    const events = upkeep(s);
    expect(s.resources.supplies).toBe(0);
    const stressDelta = s.squad.map((u, i) => u.stress - before[i]);
    expect(stressDelta.reduce((a, b) => a + b, 0)).toBe(12);
    expect(s.squad.map((u, i) => s.relations[u.id].affinity - aff[i]).reduce((a, b) => a + b, 0)).toBe(-3);
    expect(ofType(events, 'supply_shortage')[0]).toMatchObject({ missing: 3, streak: 1 });
    expect(s.calendar.shortageStreak).toBe(1);
  });

  it('a hunger_loop unit takes a double share of the shortage', () => {
    const s = campaign(reg, 4);
    s.squad[0].defects = [{ id: 'hunger_loop' }];
    s.resources.supplies = 0; // needs 6 → 6 short → 24 stress over 5 slots
    upkeep(s);
    expect(s.squad.reduce((a, u) => a + u.stress, 0)).toBe(24);
    expect(s.squad[0].stress).toBeGreaterThan(s.squad[1].stress);
  });

  it('third shortage day applies the trust penalty once, sixth again', () => {
    const s = campaign(reg, 2);
    s.resources.supplies = 0;
    const trust0 = s.relations[s.squad[0].id].trust;
    const t = (): number => s.relations[s.squad[0].id].trust;
    upkeep(s);
    upkeep(s);
    expect(t()).toBe(trust0);
    const e3 = upkeep(s);
    expect(ofType(e3, 'trust_penalty_event')).toHaveLength(1);
    expect(t()).toBe(trust0 - 5);
    upkeep(s);
    upkeep(s);
    expect(t()).toBe(trust0 - 5);
    expect(ofType(upkeep(s), 'trust_penalty_event')).toHaveLength(1);
    expect(t()).toBe(trust0 - 10);
  });

  it('a fed day resets the streak', () => {
    const s = campaign(reg, 2);
    s.resources.supplies = 0;
    upkeep(s);
    upkeep(s);
    s.resources.supplies = 10;
    upkeep(s);
    expect(s.calendar.shortageStreak).toBe(0);
    s.resources.supplies = 0;
    upkeep(s);
    expect(s.calendar.shortageStreak).toBe(1);
  });

  it('supplies never go negative and stress is clamped at 100', () => {
    const s = campaign(reg, 4);
    s.squad.forEach((u) => (u.stress = 99));
    s.resources.supplies = 0;
    upkeep(s);
    expect(s.resources.supplies).toBe(0);
    expect(s.squad.every((u) => u.stress <= 100)).toBe(true);
  });

  it('is deterministic: no rng is used', () => {
    const s = campaign(reg, 4);
    s.resources.supplies = 0;
    const rngBefore = JSON.stringify(s.rng);
    upkeep(s);
    expect(JSON.stringify(s.rng)).toBe(rngBefore);
    void Rng;
  });
});
