import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { enqueueNight, rollNight } from '../../src/engine/night';
import { Rng, seedRng } from '../../src/engine/rng';
import type { CampaignState, NightEntry } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];

/** Registries where every night spec fires for sure. */
const sure = (): Registries => {
  const r = structuredClone(reg);
  for (const st of r.relationshipStates.values()) {
    for (const n of (st.unlocks as { nightEvents: Array<{ chance: number }> }).nightEvents) n.chance = 1;
  }
  for (const d of r.defects.values()) for (const n of (d.nightEvents as Array<{ chance: number }> | undefined) ?? []) n.chance = 1;
  return r;
};
const entry = (id: string, unitId: string, priority: number, over: Partial<NightEntry> = {}): NightEntry => ({
  id, unitId, kind: 'visit', priority, framing: 'A knock.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99, ...over,
});
const evening = (): CampaignState => {
  const s = campaign(reg, 4);
  s.slot = 'evening';
  return s;
};
const consume = (s: CampaignState, r: Registries = reg) => run(s, r, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'x' } });

describe('queue', () => {
  it('enqueueNight sorts by priority (stable) and ignores a duplicate unit+kind', () => {
    const s = evening();
    expect(enqueueNight(s, entry('a', ANN, 10))).toBe(true);
    enqueueNight(s, entry('b', BEA, 50));
    enqueueNight(s, entry('c', CAT, 50));
    expect(enqueueNight(s, entry('d', ANN, 99))).toBe(false);
    expect(enqueueNight(s, entry('e', ANN, 99, { kind: 'need' }))).toBe(true);
    expect(s.calendar.nightEventsQueue.map((e) => e.id)).toEqual(['e', 'b', 'c', 'a']);
  });
});

describe('daily night rolls', () => {
  it('a lover queues a visit at the day end and the Night slot opens (acceptance 9)', () => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    const r = consume(s, sure());
    expect(r.state.slot).toBe('night');
    expect(r.state.day).toBe(1);
    expect(r.state.calendar.nightEvent).toMatchObject({ unitId: ANN, kind: 'visit', priority: 30, expiresDay: 3 });
    expect(r.state.calendar.nightEvent!.framing).toBe('Ann knocks on your door, late.');
    expect(ofType(r.events, 'night_started')).toHaveLength(1);
  });
  it('an empty queue skips the Night (acceptance 9)', () => {
    const r = consume(evening());
    expect(r.state.slot).toBe('morning');
    expect(r.state.day).toBe(2);
    expect(ofType(r.events, 'night_started')).toEqual([]);
  });
  it('one entry per night, highest priority first, the rest wait', () => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    s.relations[BEA].stateId = 'obsessed';
    Object.assign(s.relations[BEA], { affinity: 70, trust: 20 });
    const r = consume(s, sure());
    expect(r.state.calendar.nightEvent).toMatchObject({ unitId: BEA, priority: 70 });
    expect(r.state.calendar.nightEventsQueue.map((e) => e.unitId)).toEqual([ANN]);
  });
  it('entries expire after two days', () => {
    const s = evening();
    s.day = 10;
    s.calendar.nightEventsQueue = [entry('old', ANN, 5, { expiresDay: 11 }), entry('fresh', BEA, 4, { expiresDay: 12 })];
    const d = structuredClone(s);
    d.day = 12;
    rollNight(d, sure(), new Rng(d.rng), 'daily');
    expect(d.calendar.nightEventsQueue.map((e) => e.id)).toEqual(['fresh']);
  });
  it('romance off queues no visits', () => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const r = consume(s, sure());
    expect(r.state.slot).toBe('morning');
  });
  it('a defect night event fires without romance', () => {
    const s = evening();
    s.squad.find((u) => u.id === CAT)!.defects = [{ id: 'imprint_hunger' }];
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const r = consume(s, sure());
    expect(r.state.calendar.nightEvent).toMatchObject({ unitId: CAT, kind: 'withdrawal' });
  });
  it('dead and deserted units never visit', () => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    expect(consume(s, sure()).state.slot).toBe('morning');
  });
  it('the chance setting scales visit odds', () => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const d = structuredClone(s);
      d.rng = seedRng(i + 1);
      rollNight(d, reg, new Rng(d.rng), 'daily');
      hits += d.calendar.nightEventsQueue.length;
    }
    expect(hits).toBeGreaterThan(40); // 0.25 · 400 ≈ 100
    expect(hits).toBeLessThan(180);
  });
});

describe('night/open and night/ignore', () => {
  const night = (): CampaignState => {
    const s = evening();
    s.relations[ANN].stateId = 'lover';
    Object.assign(s.relations[ANN], { trust: 60, affinity: 60 });
    return consume(s, sure()).state;
  };
  it('night/open only in Night, with an entry', () => {
    const s = night();
    const r = run(s, reg, { type: 'night/open', payload: {} });
    expect(ofType(r.events, 'night_opened')).toMatchObject([{ entry: { unitId: ANN } }]);
    expect(errors(run(evening(), reg, { type: 'night/open', payload: {} }).events)).toHaveLength(1);
    const empty = night();
    delete empty.calendar.nightEvent;
    expect(errors(run(empty, reg, { type: 'night/open', payload: {} }).events)).toHaveLength(1);
  });
  it('ignore applies the entry\'s consequence and rolls the day over', () => {
    const s = night();
    const before = s.relations[ANN].affinity;
    const r = run(s, reg, { type: 'night/ignore', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].affinity).toBe(before - 1); // dismissed/minor
    expect(r.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'dismissed', severity: 'minor' });
    expect(r.state.day).toBe(2);
    expect(r.state.slot).toBe('morning');
    expect(r.state.calendar.nightEvent).toBeUndefined();
  });
  it('ignore needs a night entry and no open scene', () => {
    expect(errors(run(evening(), reg, { type: 'night/ignore', payload: {} }).events)).toHaveLength(1);
    const s = night();
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0 } }).state;
    expect(errors(run(open, reg, { type: 'night/ignore', payload: {} }).events)).toHaveLength(1);
  });
  it('a night scene ends the night and the day', () => {
    const s = night();
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0 } }).state;
    const r = run(open, reg, { type: 'scene/end', payload: {} });
    expect(r.state.day).toBe(2);
    expect(r.state.slot).toBe('morning');
  });
});

describe('commander injury', () => {
  it('queues visits for lover, devoted and dependent units', () => {
    const s = campaign(reg, 4);
    s.relations[ANN].stateId = 'lover';
    s.relations[BEA].stateId = 'devoted';
    s.relations[CAT].stateId = 'dependent';
    const r = run(s, sure(), { type: 'relations/commander_injured', payload: {} });
    const q = r.state.calendar.nightEventsQueue;
    expect(q.map((e) => e.unitId)).toEqual([BEA, ANN, CAT].sort((a, b) => q.find((e) => e.unitId === b)!.priority - q.find((e) => e.unitId === a)!.priority));
    expect(q.map((e) => e.unitId).sort()).toEqual([ANN, BEA, CAT]);
    expect(q.find((e) => e.unitId === BEA)!.priority).toBe(85);
    expect(ofType(r.events, 'night_queued')).toHaveLength(3);
    expect(r.state.calendar.nightEventsQueue.every((e) => e.expiresDay === 3)).toBe(true);
  });
  it('comrades do not visit, and romance off removes the romantic visits', () => {
    const s = campaign(reg, 4);
    s.relations[ANN].stateId = 'lover';
    s.relations[CAT].stateId = 'dependent';
    s.settings.intimacy = { romance: false, initiative: 'med' };
    const r = run(s, sure(), { type: 'relations/commander_injured', payload: {} });
    expect(r.state.calendar.nightEventsQueue.map((e) => e.unitId)).toEqual([CAT]);
    expect(DEE).toBeDefined();
  });
});
