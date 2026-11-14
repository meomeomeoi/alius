import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf, recordOf } from '../../../src/engine/discipline/record';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { setRecord } from '../../helpers/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  return s;
};
const ev = (type: string, over: Record<string, unknown> = {}) => ({
  type, actor: type === 'defied' ? ANN : 'commander', targets: type === 'defied' ? [] : [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.9, ...over,
});
const dayEvents = (s: CampaignState) => {
  const start = s.day;
  let cur = s;
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  for (let i = 0; i < 5 && cur.day === start; i++) {
    const r = run(cur, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    cur = r.state;
    events.push(...r.events);
  }
  return { state: cur, events };
};

describe('records decay', () => {
  it('record 5 is 4 after one day end, −3 is −2', () => {
    const s = fresh();
    setRecord(s, ANN, 5);
    setRecord(s, BEA, -3);
    const after = endDay(s, reg);
    expect(recordOf(after, ANN)).toBe(4);
    expect(recordOf(after, BEA)).toBe(-2);
  });

  it('a record of 1 reaches 0 and the key is gone', () => {
    const s = fresh();
    setRecord(s, ANN, 1);
    const after = endDay(s, reg);
    expect(recordOf(after, ANN)).toBe(0);
    expect('impunityRecord' in after.relations[ANN]).toBe(false);
  });

  it('the decay is a ledger entry', () => {
    const s = fresh();
    setRecord(s, ANN, 5);
    const after = endDay(s, reg);
    expect(after.ledger).toContainEqual(expect.objectContaining({ key: `record:${ANN}`, delta: -1 }));
  });
});

describe('the discipline day step', () => {
  it('an old save runs the day step', () => {
    const s = fresh();
    delete s.discipline;
    for (const r of Object.values(s.relations)) delete r.impunityRecord;
    const r = dayEvents(s);
    expect(ofType(r.events, 'day_end_step_failed')).toEqual([]);
    expect(r.state.day).toBe(s.day + 1);
  });

  it('a DM defiance settles at the day end (+5 for moderate, then the decay)', () => {
    const s = run(fresh(), reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [ev('defied')] } } }).state;
    expect(recordOf(s, ANN)).toBe(0);
    const r = dayEvents(s);
    expect(ofType(r.events, 'defiance_settled')).toEqual([{ type: 'defiance_settled', unitId: ANN, tolerated: true }]);
    expect(ofType(r.events, 'impunity_changed')).toMatchObject([{ unitId: ANN, delta: 5 }]);
    expect(recordOf(r.state, ANN)).toBe(4);
    expect(r.state.discipline!.defiance).toEqual([]);
  });

  it('a DM enforcement the same day cancels the held defiance', () => {
    let s = run(fresh(), reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [ev('defied')] } } }).state;
    s = run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [ev('commander_enforced', { measure: 'verbal' })] } } }).state;
    const r = dayEvents(s);
    expect(ofType(r.events, 'defiance_settled')).toEqual([]);
    expect(recordOf(r.state, ANN)).toBe(-7); // −8, then the decay
  });

  it("a scene's defiance whose scene is gone settles at the day end", () => {
    const s = fresh();
    disciplineOf(s).defiance.push({ unitId: ANN, severity: 'minor', day: s.day, source: 'intent', sceneId: 's_gone' });
    const r = dayEvents(s);
    expect(ofType(r.events, 'defiance_settled')).toHaveLength(1);
    expect(recordOf(r.state, ANN)).toBe(2); // +3, then the decay
  });

  it("an open scene's defiance is left for its scene end", () => {
    const open = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const s = run(open, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev('defied')] } } }).state;
    expect(s.discipline!.defiance).toHaveLength(1);
    const r = run(s, reg, { type: 'scene/end' });
    expect(errors(r.events)).toEqual([]);
    expect(recordOf(r.state, ANN)).toBe(5);
  });
});

describe('removeFromService forgets her', () => {
  it('her held defiance, threats and queued sabotage are gone, the others stay', () => {
    const s = fresh();
    const d = disciplineOf(s);
    d.defiance.push({ unitId: ANN, severity: 'minor', day: 1, source: 'intent' }, { unitId: BEA, severity: 'minor', day: 1, source: 'intent' });
    const threat = (unitId: string, id: string) => ({ id, unitId, measure: 'unspecified', day: 1, deadlineDay: 2, believed: true, channel: 'dm' as const, inverse: {} });
    d.threats.push(threat(ANN, 'th1'), threat(BEA, 'th2'));
    d.sabotage = { queued: [{ unitId: ANN, day: 1 }, { unitId: BEA, day: 1 }], gear: { unitId: ANN, day: 1 } };
    removeFromService(s, ANN, 'deserted');
    expect(s.discipline!.defiance.map((x) => x.unitId)).toEqual([BEA]);
    expect(s.discipline!.threats.map((x) => x.unitId)).toEqual([BEA]);
    expect(s.discipline!.sabotage).toEqual({ queued: [{ unitId: BEA, day: 1 }] });
  });

  it('a save without discipline is fine', () => {
    const s = fresh();
    delete s.discipline;
    expect(() => removeFromService(s, ANN, 'terminated')).not.toThrow();
    expect(s.discipline).toBeUndefined();
  });
});
