import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { addSecret } from '../../src/engine/personal';
import { Rng } from '../../src/engine/rng';
import { candidateTruths, catchChance, falseValue, rollIntercepts } from '../../src/engine/special/frequency/intercepts';
import { TUNING } from '../../src/engine/tuning';
import type { CampaignState } from '../../src/engine/state/types';
import { loadCore, run } from '../helpers/world';
import { ANN, BEA, reseed, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const SCENE = { private: true, dm: false };
const freq = (s: CampaignState) => s.special!.frequency!;
const last = (s: CampaignState) => freq(s).intercepts[freq(s).intercepts.length - 1];

describe('catchChance', () => {
  it('matches the formula: base 0.25, private +0.10, her stress 80 −0.10, a DM halves it', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    expect(catchChance(s, ANN, { private: false, dm: false })).toBeCloseTo(0.25, 10);
    expect(catchChance(s, ANN, { private: true, dm: false })).toBeCloseTo(0.35, 10);
    s.squad.find((u) => u.id === ANN)!.stress = 85;
    expect(catchChance(s, ANN, { private: true, dm: false })).toBeCloseTo(0.25, 10);
    s.squad.find((u) => u.id === ANN)!.stress = 0;
    expect(catchChance(s, ANN, { private: false, dm: true })).toBeCloseTo(0.125, 10);
  });
});

describe('candidateTruths', () => {
  it('lists the kinds in the closed order, read from live state', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const kinds = candidateTruths(s, reg, ANN).map((c) => c.kind);
    expect(kinds.slice(0, 3)).toEqual(['stance', 'impunity', 'attraction']);
    s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [{ id: 'dm1', unitId: ANN, templateId: 't', text: 'x', day: 1, expiresDay: 9, status: 'open', impunityDriven: false }] } as never;
    expect(candidateTruths(s, reg, ANN).map((c) => c.kind)).toContain('demand');
    expect(candidateTruths(s, reg, BEA).map((c) => c.kind)).not.toContain('demand');
  });

  it('a fact hidden from the commander, a kept secret she knows and a loyalty sign are candidates', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    s.memory.facts.push({ id: 'f1', about: [ANN], text: 'secret', tags: [], importance: 3, day: 1, knownBy: [ANN], hiddenFromCommander: true });
    s.memory.facts.push({ id: 'f2', about: [ANN], text: 'public', tags: [], importance: 3, day: 1, knownBy: ['*'], hiddenFromCommander: true });
    addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [ANN, BEA], subjectId: ANN, vars: { name: 'Ann' } });
    s.disloyalty = { units: { [ANN]: { signs: [{ day: 1, about: 'mutiny', kind: 'dm', signId: 'x' }], attempts: 0 } } };
    const c = candidateTruths(s, reg, ANN);
    expect(c.filter((x) => x.kind === 'fact').map((x) => x.refId)).toEqual(['f1']);
    expect(c.filter((x) => x.kind === 'secret')).toHaveLength(1);
    expect(c.find((x) => x.kind === 'loyalty')!.value).toBe('mutiny');
  });
});

describe('falseValue', () => {
  it('another band or stance from the same closed list, or none for a negation', () => {
    const rng = new Rng(specialCampaign(reg, 'secret_frequency').rng);
    for (let i = 0; i < 50; i++) {
      expect(falseValue('stance', 'fearful', rng)).not.toBe('fearful');
      expect(['cowed', 'low', 'high', 'brazen']).toContain(falseValue('impunity', 'low', rng));
      expect(falseValue('attraction', 'none', rng)).not.toBe('none');
    }
    expect(falseValue('demand', 'd1', rng)).toBe('none');
    expect(falseValue('fact', 'f1', rng)).toBe('none');
    expect(falseValue('secret', 'sx_1', rng)).toBe('none');
    expect(falseValue('loyalty', 'mutiny', rng)).toBe('none');
    expect(falseValue('refusal', 'refuses', rng)).toBe('none');
  });
});

describe('rollIntercepts rates', () => {
  it('intercept rate over seeds: a private scene hits about 35 %', () => {
    const base = specialCampaign(reg, 'secret_frequency');
    let hits = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const s = reseed(base, seed);
      const ev = rollIntercepts(s, ctxOf(s), [ANN], SCENE);
      if (ev.some((e) => e.type === 'frequency_intercept')) hits += 1;
    }
    expect(hits / 2000).toBeGreaterThan(0.32);
    expect(hits / 2000).toBeLessThan(0.38);
  });

  it('distortion rate: 25 % at stress 10, 40 % at stress 60', () => {
    const rate = (stress: number): number => {
      const base = specialCampaign(reg, 'secret_frequency');
      base.squad.find((u) => u.id === ANN)!.stress = stress;
      let n = 0;
      let wrong = 0;
      for (let seed = 1; seed <= 6000 && n < 2000; seed++) {
        const s = reseed(base, seed);
        rollIntercepts(s, ctxOf(s), [ANN], SCENE);
        if (!s.special?.frequency?.intercepts.length) continue;
        n += 1;
        if (!last(s).true) wrong += 1;
      }
      expect(n).toBe(2000);
      return wrong / n;
    };
    const low = rate(10);
    expect(low).toBeGreaterThan(0.22);
    expect(low).toBeLessThan(0.28);
    const high = rate(60);
    expect(high).toBeGreaterThan(0.37);
    expect(high).toBeLessThan(0.43);
  });
});

describe('rng discipline', () => {
  it('no trait: no draw, and nothing is stored', () => {
    const s = specialCampaign(reg);
    const before = structuredClone(s.rng);
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(r.state.rng).toEqual(before);
    expect(r.state.special).toBeUndefined();
  });

  it('burned or known: no draw', () => {
    const burned = specialCampaign(reg, 'secret_frequency');
    freq(burned).burnedDay = 1;
    expect(rollIntercepts(burned, ctxOf(burned), [ANN], SCENE)).toEqual([]);
    expect(burned.rng).toEqual(specialCampaign(reg, 'secret_frequency').rng);
    const known = specialCampaign(reg, 'secret_frequency');
    known.relations[ANN].flags.push('knows_frequency');
    const c = ctxOf(known);
    expect(rollIntercepts(known, c, [ANN], SCENE)).toEqual([]);
    expect(c.rng.state).toEqual(known.rng);
  });

  it('a scene rolls once per present unit through scene/start', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } });
    expect(r.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(r.state.rng).not.toEqual(s.rng);
  });

  it('a DM rolls once a day', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const dm = (st: CampaignState) => run(st, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'hello' } });
    const a = dm(s);
    expect(a.state.special!.frequency!.dmDay[ANN]).toBe(s.day);
    const rngAfterFirst = a.state.rng;
    const b = dm(a.state);
    expect(b.state.rng).toEqual(rngAfterFirst);
  });
});

describe('the frequency route for squad secrets', () => {
  it('an undistorted secret intercept discovers it; a distorted one never does', () => {
    const base = specialCampaign(reg, 'secret_frequency');
    addSecret(base, reg, { kindId: 'hidden_injury', knownBy: [ANN, BEA], subjectId: ANN, vars: { name: 'Ann' } });
    let found = false;
    let kept = false;
    for (let seed = 1; seed <= 3000 && !(found && kept); seed++) {
      const s = reseed(base, seed);
      rollIntercepts(s, ctxOf(s), [ANN], SCENE);
      const x = s.special!.frequency!.intercepts[0];
      if (!x || x.kind !== 'secret') continue;
      const secret = s.personal!.secrets![0];
      if (x.true) {
        expect(secret.status).toBe('found');
        expect(secret.foundRoute).toBe('frequency');
        found = true;
      } else {
        expect(secret.status).toBe('kept');
        kept = true;
      }
    }
    expect(found && kept).toBe(true);
  });
});

describe('what is stored and what leaves', () => {
  it('the event carries no truth: its keys are exactly type, unitId, interceptId', () => {
    const base = specialCampaign(reg, 'secret_frequency');
    for (let seed = 1; seed <= 200; seed++) {
      const s = reseed(base, seed);
      const ev = rollIntercepts(s, ctxOf(s), [ANN], SCENE).filter((e) => e.type === 'frequency_intercept');
      for (const e of ev) {
        expect(Object.keys(e).sort()).toEqual(['interceptId', 'type', 'unitId']);
        expect(e.interceptId).toBe(last(s).id);
      }
    }
  });

  it('the log keeps the newest 40', () => {
    const s = specialCampaign(reg, 'secret_frequency');
    const c = ctxOf(s);
    let made = 0;
    for (let i = 0; i < 400 && made < 60; i++) {
      s.relations[ANN].flags = [];
      made += rollIntercepts(s, c, [ANN], SCENE).filter((e) => e.type === 'frequency_intercept').length;
    }
    expect(made).toBeGreaterThanOrEqual(60);
    expect(freq(s).intercepts).toHaveLength(TUNING.special.frequency.logMax);
    const ids = freq(s).intercepts.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
