import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { gearFault, queueSabotage, sabotageDayStep } from '../../../src/engine/discipline/sabotage';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { depart, payload, withMission } from '../../helpers/expedition';
import { noPresence, withStance } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});

const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const fresh = (seed = 1): CampaignState => {
  const s = campaign(reg, 4);
  s.rng = seedRng(seed);
  s.resources.supplies = 20;
  s.resources.credits = 100;
  return s;
};
/** Runs the sabotage step on a draft with its own seeded rng; returns the events. */
const step = (s: CampaignState) => {
  const rng = new Rng(s.rng);
  const events = sabotageDayStep(s, { registries: reg, rng });
  s.rng = rng.state;
  return events;
};
const names = (s: CampaignState) => s.squad.map((u) => u.displayName);
/** A fresh campaign's units sit at Trust 20 and Impunity 43: all fearful. This makes everybody but `except` disciplined. */
const calm = (s: CampaignState, ...except: string[]): CampaignState => {
  for (const u of s.squad) if (!except.includes(u.id)) withStance(s, reg, u.id, 'disciplined');
  return s;
};

describe('queued sabotage', () => {
  it('fires at the next day end: supplies −2, credits −10 or a waiting gear fault', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const s = fresh(seed);
      queueSabotage(s, ANN);
      const before = { ...s.resources };
      const events = step(s);
      const e = ofType(events, 'covert_sabotage');
      expect(e, `seed ${seed}`).toHaveLength(1);
      const kind = String(e[0].kind);
      kinds.add(kind);
      if (kind === 'supplies') expect(s.resources.supplies).toBe(before.supplies - TUNING.impunity.sabotage.supplies);
      else if (kind === 'credits') expect(s.resources.credits).toBe(before.credits - TUNING.impunity.sabotage.credits);
      else expect(s.discipline!.sabotage!.gear).toEqual({ unitId: ANN, day: s.day });
      expect(s.discipline!.sabotage!.queued).toEqual([]);
    }
    expect([...kinds].sort()).toEqual(['credits', 'gear', 'supplies']);
  });

  it('writes one anonymous public fact', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = fresh(seed);
      queueSabotage(s, ANN);
      step(s);
      const facts = s.memory.facts.filter((f) => f.tags.includes('sabotage'));
      expect(facts, `seed ${seed}`).toHaveLength(1);
      expect(facts[0].knownBy).toEqual(['*']);
      expect(facts[0].about).not.toContain(ANN);
      for (const n of names(s)) expect(facts[0].text).not.toContain(n);
      expect(facts[0].text).not.toContain(ANN);
    }
  });

  it('the event never names who did it', () => {
    const s = fresh(3);
    queueSabotage(s, ANN);
    const e = ofType(step(s), 'covert_sabotage')[0];
    expect(Object.keys(e).sort()).toEqual(['kind', 'type']);
  });

  it('never takes a resource below 0', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = fresh(seed);
      s.resources.supplies = 1;
      s.resources.credits = 3;
      queueSabotage(s, ANN);
      step(s);
      expect(s.resources.supplies, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(s.resources.credits, `seed ${seed}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('at most one a day: three fearful units queued twice make one event', () => {
    const s = fresh();
    for (const id of [ANN, BEA, CAT]) {
      withStance(s, reg, id, 'fearful');
      queueSabotage(s, id);
      queueSabotage(s, id);
    }
    const events = step(s);
    expect(ofType(events, 'covert_sabotage')).toHaveLength(1);
    expect(s.discipline!.sabotage!.queued).toEqual([]);
    expect(s.memory.facts.filter((f) => f.tags.includes('sabotage'))).toHaveLength(1);
  });

  it('only one gear fault waits: with one waiting the kind is never gear', () => {
    for (let seed = 1; seed < 80; seed++) {
      const s = fresh(seed);
      s.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [], sabotage: { queued: [{ unitId: ANN, day: 1 }], gear: { unitId: BEA, day: 1 } } };
      const e = ofType(step(s), 'covert_sabotage');
      expect(e[0].kind, `seed ${seed}`).not.toBe('gear');
      expect(s.discipline!.sabotage!.gear).toEqual({ unitId: BEA, day: 1 });
    }
  });
});

describe('the daily roll of a fearful unit', () => {
  it('no fearful unit and nothing queued: no rng draw, nothing changes', () => {
    const s = calm(fresh());
    const rng = s.rng;
    const before = structuredClone(s);
    expect(step(s)).toEqual([]);
    expect(s.rng).toEqual(rng);
    expect(s).toEqual(before);
  });

  it('a fearful unit rolls 12 % a day (1000 seeded days stay within 0.08–0.16)', () => {
    let fired = 0;
    const s0 = calm(fresh(), ANN);
    withStance(s0, reg, ANN, 'fearful');
    for (let seed = 1; seed <= 1000; seed++) {
      const s = structuredClone(s0);
      s.rng = seedRng(seed);
      if (ofType(step(s), 'covert_sabotage').length > 0) fired += 1;
    }
    expect(fired / 1000).toBeGreaterThan(0.08);
    expect(fired / 1000).toBeLessThan(0.16);
  });

  it('a unit who is not fearful never rolls; a dead fearful unit neither', () => {
    const s0 = calm(fresh());
    withStance(s0, reg, ANN, 'defiant_loyal');
    for (let seed = 1; seed <= 200; seed++) {
      const s = structuredClone(s0);
      s.rng = seedRng(seed);
      expect(step(s)).toEqual([]);
    }
    const dead = calm(fresh(), ANN);
    withStance(dead, reg, ANN, 'fearful');
    dead.squad[0].status = 'dead';
    expect(step(dead)).toEqual([]);
  });

  it('the day step runs it (an old save with no discipline object included)', () => {
    const s = fresh(5);
    queueSabotage(s, ANN);
    const kept = structuredClone(s);
    const r = run(kept, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    let cur = r.state;
    for (let i = 0; i < 4 && cur.day === s.day; i++) cur = run(cur, reg, { type: 'calendar/consume_slot' }).state;
    expect(cur.day).toBe(s.day + 1);
    expect(cur.discipline!.sabotage!.queued).toEqual([]);
  });
});

describe('the gear fault at the next expedition start', () => {
  const setup = (seed: number) => {
    const { state, mission } = withMission(reg, campaign(reg, 4), {}, (s) => { s.resources.supplies = 20; });
    state.rng = seedRng(seed);
    state.discipline = { defiance: [], threats: [], applications: [], restrictions: [], demands: [], demandLog: [], sabotage: { queued: [], gear: { unitId: ANN, day: state.day } } };
    return { state, mission };
  };
  it('costs 2 carried supplies (floor 0) and a log line about half the time, and is cleared either way', () => {
    let hit = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { state, mission } = setup(seed);
      const after = depart(reg, state, mission.id, { supplies: 4 });
      const exp = after.expedition!;
      expect(after.discipline!.sabotage!.gear, `seed ${seed}`).toBeUndefined();
      const logged = exp.log.some((l) => l.text === 'Gear fault: a sealed pack turned out to be empty.');
      if (exp.supplies === 4 - TUNING.impunity.sabotage.gearSupplies) {
        hit += 1;
        expect(logged, `seed ${seed}`).toBe(true);
      } else {
        expect(exp.supplies, `seed ${seed}`).toBe(4);
        expect(logged, `seed ${seed}`).toBe(false);
      }
    }
    expect(hit / 400).toBeGreaterThan(0.4);
    expect(hit / 400).toBeLessThan(0.6);
  });

  it('the floor is 0: one carried supply becomes none', () => {
    const results = new Set<number>();
    for (let seed = 1; seed < 100; seed++) {
      const { state, mission } = setup(seed);
      results.add(depart(reg, state, mission.id, { supplies: 1 }).expedition!.supplies);
    }
    expect([...results].sort()).toEqual([0, 1]);
  });

  it('the event only says it bit', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const { state, mission } = setup(seed);
      const r = run(state, reg, { type: 'expedition/start', payload: payload(state, mission.id) });
      const gear = ofType(r.events, 'covert_sabotage');
      seen.add(gear.length === 0 ? 'quiet' : JSON.stringify(gear[0]));
    }
    expect([...seen].sort()).toEqual(['quiet', '{"type":"covert_sabotage","kind":"gear","fired":true}']);
  });

  it('with none waiting no draw is made at the start', () => {
    const { state, mission } = setup(3);
    delete state.discipline;
    const plain = depart(reg, state, mission.id);
    const same = setup(3);
    same.state.discipline!.sabotage = { queued: [] };
    expect(depart(reg, same.state, same.mission.id).rng).toEqual(plain.rng);
  });
});
