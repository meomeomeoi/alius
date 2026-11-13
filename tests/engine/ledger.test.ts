import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { defaultFormation } from '../../src/engine/combat/stats';
import { dispatch } from '../../src/engine/dispatch';
import { recordLedger } from '../../src/engine/ledger';
import type { CampaignState, LedgerEntry } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const ANN = 'unit_ann';
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  return s;
};
const entry = (day: number, key = 'res:credits', delta = 1): LedgerEntry => ({ day, slot: 'morning', action: 'test', key, delta });

describe('change ledger', () => {
  it('an activity that pays credits records res:credits with action activity/do', () => {
    const s = fresh();
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'work' } });
    expect(errors(r.events)).toEqual([]);
    const gained = r.state.resources.credits - s.resources.credits;
    expect(gained).toBeGreaterThan(0);
    expect(r.state.ledger).toContainEqual({ day: s.day, slot: s.slot, action: 'activity/do', key: 'res:credits', delta: gained });
    expect(s.ledger).toBeUndefined(); // the input is never touched
  });

  it('a scene intent that moves Trust records axis:<id>:trust', () => {
    const s0 = fresh();
    s0.day = 5;
    for (const u of s0.squad) Object.assign(s0.relations[u.id], { stateId: 'comrade', trust: 40, affinity: 20, attraction: 0, stateSince: 1, flags: [] });
    const started = run(s0, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const events = [{ type: 'praised', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'ok', confidence: 1 }];
    const r = run(started, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events } } });
    expect(errors(r.events)).toEqual([]);
    const delta = r.state.relations[ANN].trust - started.relations[ANN].trust;
    expect(delta).not.toBe(0);
    expect(r.state.ledger).toContainEqual({ day: 5, slot: started.slot, action: 'intents/apply', key: `axis:${ANN}:trust`, delta });
  });

  it('day-end upkeep records res:supplies on the day it was eaten', () => {
    const s = fresh();
    s.day = 3;
    s.slot = 'evening';
    const r = run(s, reg, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.day).toBe(4);
    const supplies = r.state.ledger!.filter((e) => e.key === 'res:supplies');
    expect(supplies).toHaveLength(1);
    expect(supplies[0]).toMatchObject({ day: 3, slot: 'evening', action: 'calendar/consume_slot' });
    expect(supplies[0].delta).toBe(r.state.resources.supplies - s.resources.supplies);
    expect(supplies[0].delta).toBeLessThan(0);
  });

  it('stress changes record stress:<unitId> for units present before and after', () => {
    const s = fresh();
    const after = structuredClone(s);
    after.squad[0].stress += 12;
    after.squad.push({ ...structuredClone(after.squad[1]), id: 'unit_new', stress: 30 }); // a new unit has no "before"
    recordLedger(s, after, 'test/stress');
    expect(after.ledger).toEqual([{ day: s.day, slot: s.slot, action: 'test/stress', key: `stress:${s.squad[0].id}`, delta: 12 }]);
  });

  it('a rejected action records nothing', () => {
    const s = fresh();
    s.resources.credits = 0;
    const r = run(s, reg, { type: 'base/upgrade', payload: { facilityId: 'barracks' } });
    expect(errors(r.events).length).toBeGreaterThan(0);
    expect(r.state).toBe(s);
    expect(r.state.ledger).toBeUndefined();
    const unknown = run(s, reg, { type: 'nope/nothing' });
    expect(unknown.state).toBe(s);
  });

  it('combat/act inside an open combat records nothing', () => {
    const s = fresh();
    const started = run(s, reg, {
      type: 'combat/start',
      payload: { encounter: { enemies: [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds) },
    });
    expect(errors(started.events)).toEqual([]);
    expect(started.state.combat).toBeDefined();
    expect(started.state.ledger).toBeUndefined();
    const acted = run(started.state, reg, { type: 'combat/act', payload: { action: { kind: 'guard' } } });
    expect(acted.state.ledger).toBeUndefined();
  });

  it('entries older than 7 days are dropped and at most 150 kept', () => {
    expect(TUNING.ledger).toEqual({ days: 7, max: 150 });
    const before = fresh();
    before.day = 10;
    const after = structuredClone(before);
    after.ledger = [entry(3), entry(4, 'res:plyx'), entry(5), entry(10)];
    after.resources.credits += 5;
    recordLedger(before, after, 'test/x');
    // day 10 keeps days 4..10
    expect(after.ledger!.map((e) => e.day)).toEqual([4, 5, 10, 10]);

    const many = structuredClone(before);
    many.ledger = Array.from({ length: 160 }, (_, i) => entry(10, 'res:credits', i + 1));
    const next = structuredClone(many);
    next.resources.plyx += 1;
    recordLedger(many, next, 'test/y');
    expect(next.ledger).toHaveLength(150);
    expect(next.ledger![149]).toMatchObject({ key: 'res:plyx', delta: 1 }); // the newest survives
    expect(next.ledger![0].delta).toBe(12); // the oldest 11 were dropped
  });

  it('nothing changed leaves a missing ledger missing and an existing one pruned', () => {
    const s = fresh();
    const same = structuredClone(s);
    recordLedger(s, same, 'test/none');
    expect(same.ledger).toBeUndefined();
    const withOld = structuredClone(s);
    withOld.day = 20;
    withOld.ledger = [entry(1)];
    const after = structuredClone(withOld);
    recordLedger(withOld, after, 'test/none');
    expect(after.ledger).toEqual([]);
  });

  it('a save without ledger dispatches normally', () => {
    const s = fresh();
    expect('ledger' in s).toBe(false);
    const r = dispatch(s, { type: 'activity/do', payload: { activityId: 'work' } }, reg);
    expect(errors(r.events)).toEqual([]);
    expect(Array.isArray(r.state.ledger)).toBe(true);
    // and the next action appends to it
    const r2 = dispatch(r.state, { type: 'activity/do', payload: { activityId: 'work' } }, reg);
    expect(r2.state.ledger!.length).toBeGreaterThanOrEqual(r.state.ledger!.length);
  });
});
