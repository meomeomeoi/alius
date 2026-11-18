import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { checkActivity } from '../../src/engine/activities';
import { leverageOf } from '../../src/engine/discipline/impunity';
import { removeFromService } from '../../src/engine/leash/use';
import { Rng } from '../../src/engine/rng';
import { burnImplant, frequencyDiscovered, syncFrequencyKnowers } from '../../src/engine/special/frequency/discovery';
import { leakCandidates } from '../../src/engine/special/frequency/leaks';
import { rollIntercepts } from '../../src/engine/special/frequency/intercepts';
import type { CampaignState } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, CAT, specialCampaign } from '../helpers/special';
import '../../src/engine/actions/memory';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const fresh = (): CampaignState => {
  const s = specialCampaign(reg, 'secret_frequency');
  for (const id of [ANN, BEA, CAT]) s.relations[id].trust = 90; // room to fall (a fresh unit's Trust would floor at 0)
  s.base.facilities.medbay = Math.max(1, s.base.facilities.medbay ?? 0);
  s.slot = 'morning';
  return s;
};
const hits = (s: CampaignState, id: string, type = 'frequency_exposed') => s.relations[id].history.filter((h) => h.type === type);
const freqFact = (s: CampaignState) => s.memory.facts.find((f) => f.tags.includes('frequency'));

describe('discovery', () => {
  it('suspicion 100 → flag, extreme hit, hidden spreading fact (at the day step)', () => {
    const s = fresh();
    s.special!.frequency!.suspicion[ANN] = 100;
    const trust = s.relations[ANN].trust;
    const next = endDay(s, reg);
    const rel = next.relations[ANN];
    expect(rel.flags).toContain('knows_frequency');
    expect(rel.trust).toBeLessThan(trust - 20);
    expect(hits(next, ANN)).toMatchObject([{ severity: 'extreme' }]);
    const fact = freqFact(next)!;
    expect(fact).toMatchObject({ hiddenFromCommander: true, spread: 'fast', pinned: true, knownBy: [ANN], about: [ANN] });
    expect(fact.text).toBe('Ann knows the commander hears thoughts.');
    expect(next.special!.frequency!.factId).toBe(fact.id);
    expect(leverageOf(next, reg, ANN)).toContain('knows_frequency');
    expect(next.special!.frequency!.suspicion[ANN]).toBeUndefined();
  });

  it('below 100 nothing happens', () => {
    const s = fresh();
    s.special!.frequency!.suspicion[ANN] = 99;
    const next = endDay(s, reg);
    expect(next.relations[ANN].flags).not.toContain('knows_frequency');
    expect(freqFact(next)).toBeUndefined();
  });

  it('frequencyDiscovered names the unit only and is idempotent', () => {
    const s = fresh();
    const c = ctxOf(s);
    const a = frequencyDiscovered(s, c, ANN);
    expect(a.find((e) => e.type === 'frequency_discovered')).toEqual({ type: 'frequency_discovered', unitId: ANN });
    expect(frequencyDiscovered(s, c, ANN)).toEqual([]);
    expect(s.special!.frequency!.discovered).toEqual([ANN]);
  });

  it('draws nothing', () => {
    const s = fresh();
    const c = ctxOf(s);
    frequencyDiscovered(s, c, ANN);
    expect(c.rng.state).toEqual(s.rng);
  });
});

describe('spread among the squad', () => {
  it('knowers sync after a rumor spread: a second unit in the fact gets the flag and the hit; a third pass changes nothing', () => {
    const s = fresh();
    const c = ctxOf(s);
    frequencyDiscovered(s, c, ANN);
    freqFact(s)!.knownBy.push(BEA);
    const events = syncFrequencyKnowers(s, c);
    expect(events.filter((e) => e.type === 'frequency_exposed' || e.type === 'frequency_discovered').length).toBeGreaterThan(0);
    expect(s.relations[BEA].flags).toContain('knows_frequency');
    expect(hits(s, BEA)).toMatchObject([{ severity: 'extreme' }]);
    const after = structuredClone(s);
    expect(syncFrequencyKnowers(s, c)).toEqual([]);
    expect(s).toEqual(after);
  });

  it('the day step runs it after the rumor spread, so a unit who heard gets the flag the same night', () => {
    const s = fresh();
    s.special!.frequency!.suspicion[ANN] = 100;
    let t = endDay(s, reg);
    freqFact(t)!.knownBy.push(CAT);
    t = endDay(t, reg);
    expect(t.relations[CAT].flags).toContain('knows_frequency');
    const once = hits(t, CAT);
    t = endDay(t, reg);
    expect(hits(t, CAT)).toEqual(once);
  });
});

describe('burning the implant', () => {
  it('burning stops intercepts and leak offers', () => {
    const s = fresh();
    s.special!.frequency!.intercepts.push({ id: 'fq1', unitId: ANN, day: s.day, kind: 'stance', value: 'fearful', true: true, partial: false });
    expect(leakCandidates(s, reg, [ANN])).toHaveLength(1);
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', focus: 'burn_implant' } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(r.events.find((e) => e.type === 'implant_burned')).toEqual({ type: 'implant_burned' });
    expect(r.state.special!.frequency!.burnedDay).toBe(s.day);
    expect(leakCandidates(r.state, reg, [ANN])).toEqual([]);
    const c = ctxOf(r.state);
    expect(rollIntercepts(r.state, c, [ANN], { private: true, dm: false })).toEqual([]);
    expect(c.rng.state).toEqual(r.state.rng);
  });

  it('burn focus is refused without the trait and when already burned', () => {
    const plain = specialCampaign(reg);
    plain.base.facilities.medbay = 1;
    plain.slot = 'morning';
    expect(checkActivity(plain, reg, { activityId: 'medbay', focus: 'burn_implant' })).toMatch(/not available/);
    const s = fresh();
    expect(checkActivity(s, reg, { activityId: 'medbay', focus: 'burn_implant' })).toBeNull();
    burnImplant(s);
    expect(checkActivity(s, reg, { activityId: 'medbay', focus: 'burn_implant' })).toBe('The implant is already burned.');
  });

  it('suspicion still decays after burning', () => {
    const s = fresh();
    s.special!.frequency!.suspicion[ANN] = 20;
    burnImplant(s);
    expect(endDay(s, reg).special!.frequency!.suspicion[ANN]).toBeLessThan(20);
  });

  it('discovery after burning is softened: a major hit instead of an extreme one, and decision_aligned for a unit who hates lies', () => {
    const wild = fresh();
    frequencyDiscovered(wild, ctxOf(wild), ANN);
    const burned = fresh();
    burnImplant(burned);
    burned.squad.find((u) => u.id === ANN)!.triggers = ['lies'];
    frequencyDiscovered(burned, ctxOf(burned), ANN);
    expect(hits(burned, ANN)).toMatchObject([{ severity: 'major' }]);
    expect(hits(burned, ANN, 'decision_aligned')).toHaveLength(1);
    expect(hits(wild, ANN, 'decision_aligned')).toHaveLength(0);
    expect(burned.relations[ANN].trust).toBeGreaterThan(wild.relations[ANN].trust);
    // a unit without the trigger gets no decision_aligned
    const other = fresh();
    burnImplant(other);
    frequencyDiscovered(other, ctxOf(other), BEA);
    expect(hits(other, BEA, 'decision_aligned')).toHaveLength(0);
  });
});

describe('a unit who leaves service', () => {
  it('a terminated unit leaves no frequency record', () => {
    const s = fresh();
    const f = s.special!.frequency!;
    f.intercepts.push({ id: 'fq1', unitId: ANN, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false }, { id: 'fq2', unitId: BEA, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false });
    f.suspicion = { [ANN]: 60, [BEA]: 10 };
    f.dmDay = { [ANN]: 1, [BEA]: 1 };
    f.staticFired = [ANN];
    removeFromService(s, ANN, 'terminated');
    expect(f.intercepts.map((x) => x.unitId)).toEqual([BEA]);
    expect(f.suspicion).toEqual({ [BEA]: 10 });
    expect(f.dmDay).toEqual({ [BEA]: 1 });
    expect(f.staticFired).toEqual([]);
    // nothing throws or opens later for her
    expect(() => endDay(s, reg)).not.toThrow();
  });

  it('a unit who dies in a fight is dropped at the day step too', () => {
    const s = fresh();
    const f = s.special!.frequency!;
    f.suspicion = { [ANN]: 60 };
    f.intercepts.push({ id: 'fq1', unitId: ANN, day: 1, kind: 'stance', value: 'fearful', true: true, partial: false });
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    const t = endDay(s, reg);
    expect(t.special!.frequency!.suspicion[ANN]).toBeUndefined();
    expect(t.special!.frequency!.intercepts).toEqual([]);
  });
});
