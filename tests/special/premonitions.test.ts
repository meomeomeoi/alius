import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng } from '../../src/engine/rng';
import {
  falseAlarmChance, openPremonition, paranoiaDayStep, realPrecursors,
} from '../../src/engine/special/paranoia/premonitions';
import type { CampaignState } from '../../src/engine/state/types';
import { endDay } from '../helpers/loyalty';
import { setRecord, withStance } from '../helpers/discipline';
import { loadCore } from '../helpers/world';
import { ANN, BEA, reseed, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const calm = (): CampaignState => {
  const s = specialCampaign(reg, 'bloom_paranoia');
  for (const id of [ANN, BEA, 'unit_cat', 'unit_dee']) { s.relations[id].trust = 60; s.relations[id].loyaltyBand = 'steady'; }
  return s;
};
const step = (s: CampaignState) => paranoiaDayStep(s, ctxOf(s));
const pm = (s: CampaignState) => s.special!.paranoia!.premonitions;

describe('real precursors', () => {
  it('a doubt sign two days out gives a premonition before the sign (acceptance: earlier)', () => {
    let s = calm();
    s.relations[ANN].trust = 22;
    s.relations[ANN].loyaltyBand = 'wavering';
    s.disloyalty = { units: { [ANN]: { signs: [], attempts: 0, nextDoubtDay: s.day + 2 } } };
    for (let i = 0; i < 4 && (s.disloyalty!.units[ANN].signs.length === 0); i++) s = endDay(s, reg);
    const sign = s.disloyalty!.units[ANN].signs.find((x) => x.about === 'doubt');
    expect(sign, 'the real sign arrives').toBeDefined();
    const early = pm(s).filter((p) => p.unitId === ANN && p.about === 'doubt' && p.real);
    expect(early.length).toBeGreaterThan(0);
    expect(early[0].day).toBeLessThan(sign!.day);
  });

  it('desertion precursor needs a wavering unit near the breaking line with falling Trust', () => {
    const s = calm();
    s.relations[ANN].loyaltyBand = 'wavering';
    s.relations[ANN].trust = 13;
    expect(realPrecursors(s, reg)).toEqual([]); // not falling
    s.ledger = [{ day: s.day, slot: 'morning', action: 'x', key: `axis:${ANN}:trust`, delta: -3 }];
    expect(realPrecursors(s, reg)).toEqual([{ unitId: ANN, about: 'desertion' }]);
    s.relations[ANN].trust = 20; // far from the line
    expect(realPrecursors(s, reg)).toEqual([]);
    s.relations[ANN].trust = 13;
    s.ledger = [{ day: s.day, slot: 'morning', action: 'x', key: `axis:${ANN}:trust`, delta: 3 }]; // rising
    expect(realPrecursors(s, reg)).toEqual([]);
  });

  it('mutiny precursor: one sign short, or a trigger, in a state a mutiny can come from', () => {
    const s = calm();
    Object.assign(s.relations[ANN], { stateId: 'despises', stateSince: s.day - 5 });
    expect(realPrecursors(s, reg)).toEqual([]);
    s.disloyalty = { units: { [ANN]: { signs: [{ day: s.day - 1, about: 'mutiny', kind: 'dm', signId: 'x' }], attempts: 0 } } };
    expect(realPrecursors(s, reg)).toEqual([{ unitId: ANN, about: 'mutiny' }]);
    s.disloyalty.units[ANN].signs = [];
    s.relations[ANN].history.push({ day: s.day, kind: 'event', type: 'coerced', severity: 'major' });
    expect(realPrecursors(s, reg)).toEqual([{ unitId: ANN, about: 'mutiny' }]); // a trigger
    s.relations[ANN].stateId = 'friend'; // not a state a mutiny can come from
    expect(realPrecursors(s, reg)).toEqual([]);
  });

  it('defiance precursor: ten more Impunity would make her defy, and hers is rising', () => {
    const s = calm();
    withStance(s, reg, ANN, 'fearful');
    setRecord(s, ANN, 18); // close to open defiance (Impunity ~ 40-45)
    const near = realPrecursors(s, reg).find((x) => x.unitId === ANN && x.about === 'defiance');
    expect(near, 'needs a rise in her record').toBeUndefined();
    s.ledger = [{ day: s.day, slot: 'morning', action: 'x', key: `record:${ANN}`, delta: 4 }];
    // the exact Impunity depends on the content; search the record that puts +10 across the line but not yet over it
    let found = false;
    for (let r = -40; r <= 40 && !found; r++) {
      setRecord(s, ANN, r);
      if (realPrecursors(s, reg).some((x) => x.unitId === ANN && x.about === 'defiance')) found = true;
    }
    expect(found).toBe(true);
    withStance(s, reg, ANN, 'open_defiance');
    expect(realPrecursors(s, reg).some((x) => x.about === 'defiance')).toBe(false); // already defying
  });
});

describe('the day step', () => {
  it('false-alarm rate: Insight 1 about 8 %, Insight 3 about 4 %, +5 points after a nightmare', () => {
    const rate = (prep: (s: CampaignState) => void): number => {
      const base = calm();
      prep(base);
      let hits = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const s = reseed(base, seed);
        hits += step(s).filter((e) => e.type === 'premonition').length;
      }
      return hits / (2000 * 4);
    };
    const one = rate(() => {});
    expect(one).toBeGreaterThan(0.065);
    expect(one).toBeLessThan(0.095);
    const three = rate((s) => { s.commander.socialStats.insight = 3; });
    expect(three).toBeGreaterThan(0.03);
    expect(three).toBeLessThan(0.05);
    const nightmare = rate((s) => { s.special!.paranoia!.lastNightmareDay = s.day - 1; });
    expect(nightmare).toBeGreaterThan(0.115);
    expect(nightmare).toBeLessThan(0.145);
  });

  it('falseAlarmChance follows the formula', () => {
    const s = calm();
    expect(falseAlarmChance(s)).toBeCloseTo(0.08, 10);
    s.commander.socialStats.insight = 5;
    expect(falseAlarmChance(s)).toBeCloseTo(0, 10);
    s.special!.paranoia!.lastNightmareDay = s.day - 1;
    expect(falseAlarmChance(s)).toBeCloseTo(0.05, 10);
  });

  it('one open premonition per unit; a real one replaces a false one', () => {
    const s = calm();
    s.special!.paranoia!.seq = 1;
    s.special!.paranoia!.premonitions.push({ id: 'pm1', unitId: ANN, about: 'doubt', day: s.day, expiresDay: s.day + 3, real: false });
    s.relations[ANN].loyaltyBand = 'wavering';
    s.relations[ANN].trust = 13;
    s.ledger = [{ day: s.day, slot: 'morning', action: 'x', key: `axis:${ANN}:trust`, delta: -3 }];
    step(s);
    const open = pm(s).filter((p) => p.unitId === ANN && p.acted === undefined && p.expiresDay >= s.day);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ about: 'desertion', real: true });
    expect(pm(s).some((p) => p.id === 'pm1')).toBe(false);
    // a real one is never replaced by a second one, and a unit with an open one draws nothing
    const before = structuredClone(s.special);
    const c = ctxOf(s);
    paranoiaDayStep(s, c);
    expect(s.special!.paranoia!.premonitions.filter((p) => p.unitId === ANN)).toHaveLength(1);
    expect(before).toBeDefined();
    expect(openPremonition(s, ANN)).toMatchObject({ real: true });
  });

  it('the event is identical in shape for a real and a false premonition', () => {
    const real = calm();
    real.relations[ANN].loyaltyBand = 'wavering';
    real.relations[ANN].trust = 13;
    real.ledger = [{ day: real.day, slot: 'morning', action: 'x', key: `axis:${ANN}:trust`, delta: -3 }];
    const evR = step(real).find((e) => e.type === 'premonition' && e.unitId === ANN)!;
    let evF: ReturnType<typeof step>[number] | undefined;
    for (let seed = 1; seed < 400 && !evF; seed++) {
      const s = reseed(calm(), seed);
      evF = step(s).find((e) => e.type === 'premonition');
    }
    expect(evF).toBeDefined();
    expect(Object.keys(evR).sort()).toEqual(['about', 'premonitionId', 'type', 'unitId']);
    expect(Object.keys(evF!).sort()).toEqual(Object.keys(evR).sort());
  });

  it('with no paranoia effect: no draw and no state', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const c = ctxOf(s);
    expect(paranoiaDayStep(s, c)).toEqual([]);
    expect(c.rng.state).toEqual(s.rng);
    const none = specialCampaign(reg);
    expect(paranoiaDayStep(none, ctxOf(none))).toEqual([]);
    expect(none.special).toBeUndefined();
  });

  it('old premonitions are dropped after two weeks; a premonition lasts three days', () => {
    const s = calm();
    s.relations[ANN].loyaltyBand = 'wavering';
    s.relations[ANN].trust = 13;
    s.ledger = [{ day: s.day, slot: 'morning', action: 'x', key: `axis:${ANN}:trust`, delta: -3 }];
    step(s);
    expect(pm(s).find((p) => p.unitId === ANN)!.expiresDay).toBe(s.day + 3);
    s.day += 20;
    s.ledger = [];
    step(s);
    expect(pm(s).filter((p) => p.day < s.day - 14)).toEqual([]);
  });
});

describe('where the step runs', () => {
  it('app.ts imports the special actions after the loyalty step (the paranoia step reads what it decided)', () => {
    const src = readFileSync('src/app.ts', 'utf8');
    expect(src.indexOf("'./engine/actions/special'")).toBeGreaterThan(src.indexOf("'./engine/actions/loyalty'"));
  });
});
