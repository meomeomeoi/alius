import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/headStart';
import '../../../src/engine/actions/memory';
import { applyDynamicHeadStart, pickProbeMoment } from '../../../src/engine/dynamic/headStart';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { Practice } from '../../../src/engine/dynamic/types';
import { headStartHash } from '../../../src/engine/headStart/hash';
import { recapPairs } from '../../../src/engine/headStart/recap';
import { buildCampaign, type SetupResult, type UnitSetup } from '../../../src/engine/setup';
import type { Bond, CampaignState } from '../../../src/engine/state/types';
import { errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const practice = (inclination: Practice['inclination']): Practice => ({
  categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination, fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
});
const bond = (inclination: Practice['inclination']): Bond => ({
  leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice: practice(inclination),
});
/** Ann is eager, Bea curious, Cat has no profile and Dee is a new arrival with a profile. */
const units = (): UnitSetup[] => [unitSetup('Ann', { bond: bond('eager') }), unitSetup('Bea', { bond: bond('curious') }), unitSetup('Cat'), unitSetup('Dee', { bond: bond('eager') })];
const result = (over: { days?: 0 | 7 | 14 | 30; underway?: boolean | string[]; units?: Record<string, object>; holders?: 1 | 'any'; content?: string[] } = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: units(), content: { enabled: over.content ?? ['restraint'] },
  dynamic: { holders: over.holders ?? 'any', pace: 'normal', frequency: 'normal', units: (over.units ?? {}) as never },
  ...((over.days ?? 14) > 0 ? { headStart: { days: (over.days ?? 14) as 14, newArrivals: ['dee.png'], ...(over.underway !== undefined ? { dynamicUnderway: over.underway } : {}) } } : {}),
});
const build = (r: SetupResult, seed = 7): CampaignState => {
  const b = buildCampaign(r, reg, { desireBondDefects: false, seed });
  if (!b.ok) throw new Error(b.errors.join('; '));
  return b.state;
};
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const probeKinds = () => new Set([...reg.headStartMoments.values()].filter((e) => ((e.tags as string[] | undefined) ?? []).includes('probe')).map((e) => String(e.id)));
const probeMomentsOf = (s: CampaignState, id: string) => recapPairs(s).filter((p) => p.unitId === id && probeKinds().has(p.kind));

describe('the dynamic is not underway by default', () => {
  it('a head start of 30 days with no dynamicUnderway: no dynamic on any relation and no probe moment in the recap', () => {
    const s = build(result({ days: 30 }));
    expect(s.dynamic).toBeDefined();
    for (const rel of Object.values(s.relations)) expect(rel.dynamic).toBeUndefined();
    expect(s.dynamic!.queue).toEqual([]);
    expect(recapPairs(s).filter((p) => probeKinds().has(p.kind))).toEqual([]);
    const off = build(result({ days: 30, underway: false }));
    expect(off).toEqual(s);
  });

  it('is nothing without a head start, and nothing while the dynamic is off', () => {
    expect(build(result({ days: 0, underway: true }))).toEqual(build(result({ days: 0 })));
    const dormant = build(result({ underway: true, content: ['worship'] }));
    expect(dormant.dynamic).toBeUndefined();
    for (const rel of Object.values(dormant.relations)) expect(rel.dynamic).toBeUndefined();
    expect(recapPairs(dormant).filter((p) => probeKinds().has(p.kind))).toEqual([]);
  });
});

describe('underway for all', () => {
  it('an eager unit over 14 days gets round(14 x 0.30) = 4 hashed answers, hold inside testing at most, her reading updated, first in the queue, no back-off', () => {
    const s = build(result({ underway: true }));
    const dyn = dynamicOf(s, ANN)!;
    expect(dyn.probes.issued).toBe(4);
    expect(dyn.readOf.updates).toBe(4);
    expect(dyn.hold).toBeLessThan(40); // never past testing
    expect(dyn.frame).toBe('equal');
    expect(dyn.probes.backoffUntil).toBeUndefined();
    expect(dyn.probes.answers).toEqual([]); // the head start's answers do not count toward a back-off
    expect(dyn.probes.pending).toBeUndefined();
    expect(dyn.recent).toHaveLength(4);
    expect(s.dynamic!.queue[0]).toBe(ANN);
    expect(dynamicOf(s, BEA)!.probes.issued).toBe(2); // round(14 x 0.15)
    expect(s.dynamic!.queue).toEqual([ANN, BEA]);
  });

  it('the unit with no profile and the new arrival get nothing', () => {
    const s = build(result({ underway: true }));
    expect(dynamicOf(s, CAT)).toBeUndefined();
    expect(dynamicOf(s, DEE)).toBeUndefined(); // she arrives today: she has no weeks behind her
    expect(s.dynamic!.queue).not.toContain(DEE);
  });

  it('a back-off is never started, however the hashed answers fall', () => {
    let refusedRun = false;
    for (let seed = 1; seed <= 40; seed++) {
      const s = build(result({ days: 30, underway: true }), seed);
      const dyn = dynamicOf(s, ANN)!;
      expect(dyn.probes.backoffUntil).toBeUndefined();
      expect(dyn.probes.answers).toEqual([]);
      expect(dyn.hold).toBeLessThan(40);
      // the same hashes the head start used: would three of the last five have been refusals?
      const answers = Array.from({ length: dyn.probes.issued }, (_, i) => headStartHash(seed, ANN, `probe:${i}`)).map((u) => (u < 0.4 ? 'yielded' : u < 0.6 ? 'returned' : u < 0.9 ? 'deflected' : 'resisted'));
      for (let i = 5; i <= answers.length; i++) if (answers.slice(i - 5, i).filter((a) => a === 'deflected' || a === 'resisted').length >= 3) refusedRun = true;
    }
    expect(refusedRun).toBe(true); // the sweep did cover a case the back-off would have caught
  });

  it('is deterministic: the same seed gives the same history, another seed another one', () => {
    expect(build(result({ underway: true }), 7)).toEqual(build(result({ underway: true }), 7));
    const holds = new Set([1, 2, 3, 4, 5, 6].map((seed) => dynamicOf(build(result({ days: 30, underway: true }), seed), ANN)!.hold));
    expect(holds.size).toBeGreaterThan(1);
  });
});

describe('a card list and a seed', () => {
  it('a card list limits it to those units', () => {
    const s = build(result({ underway: ['bea.png'] }));
    expect(dynamicOf(s, ANN)).toBeUndefined();
    expect(dynamicOf(s, BEA)!.probes.issued).toBe(2);
    expect(s.dynamic!.queue).toEqual([BEA]);
    expect(probeMomentsOf(s, ANN)).toEqual([]);
    expect(probeMomentsOf(s, BEA)).toHaveLength(1);
  });

  it('a seeded unit with a starting frame keeps her frame and her hold, and gains the probing history', () => {
    const s = build(result({ underway: ['ann.png'], units: { 'ann.png': { seeded: true, startFrame: 'role' } } }));
    const dyn = dynamicOf(s, ANN)!;
    expect(dyn.frame).toBe('role');
    expect(dyn.milestones).toEqual(['seeded:role']);
    expect(dyn.hold).toBe(40); // the floor of the frame, as without the option
    expect(dyn.probes.issued).toBe(4);
    expect(dyn.readOf.updates).toBe(4);
    const plain = build(result({ units: { 'ann.png': { seeded: true, startFrame: 'role' } } }));
    expect(dynamicOf(plain, ANN)!.hold).toBe(40);
    expect(dynamicOf(plain, ANN)!.probes.issued).toBe(0);
  });

  it('a seeded unit without a frame stays inside testing', () => {
    const s = build(result({ underway: ['ann.png'], units: { 'ann.png': { seeded: true } } }));
    const dyn = dynamicOf(s, ANN)!;
    expect(dyn.frame).toBe('equal');
    expect(dyn.probes.issued).toBe(4);
    expect(dyn.hold).toBeGreaterThan(0); // the seed's 25, moved by the answers as live ones would
    expect(dyn.hold).toBeLessThan(40);
  });

  it('the cap still counts: with one holder at play, another unit is not made to probe', () => {
    const s = build(result({ underway: true, holders: 1, units: { 'bea.png': { seeded: true, startFrame: 'play' } } }));
    expect(dynamicOf(s, BEA)!.frame).toBe('play');
    expect(dynamicOf(s, ANN)).toBeUndefined(); // the one place is taken
  });
});

describe('no rng draw', () => {
  it('state.rng equals a build without the option', () => {
    const withOption = build(result({ underway: true }));
    const without = build(result());
    expect(withOption.rng).toEqual(without.rng);
    expect(withOption.dynamic!.queue.length).toBeGreaterThan(0);
  });

  it('applyDynamicHeadStart on its own draws nothing and returns the events it made', () => {
    const s = build(result());
    const before = JSON.stringify(s.rng);
    const events = applyDynamicHeadStart(s, reg, result({ underway: true }));
    expect(JSON.stringify(s.rng)).toBe(before);
    expect(events.filter((e) => e.type === 'dynamic_started').length).toBeGreaterThan(0);
  });
});

describe('the probe moment of the recap', () => {
  it('at most one probe moment per unit is added to the recap pairs', () => {
    const s = build(result({ underway: true }));
    for (const id of [ANN, BEA]) {
      const mine = probeMomentsOf(s, id);
      expect(mine).toHaveLength(1);
    }
    expect(probeMomentsOf(s, CAT)).toEqual([]);
    expect(new Set(recapPairs(s).map((p) => `${p.unitId}|${p.kind}`)).size).toBe(recapPairs(s).length);
  });

  it('is written under head_start_moment, with her alone as the audience', () => {
    const s = build(result({ underway: true }));
    const units = s.headStart!.units.map((u) => ({ unitId: u.unitId, moments: u.moments.map((kind) => ({ kind, text: `${u.unitId} remembers ${kind}.` })) }));
    const r = run(s, reg, { type: 'head_start/recap', payload: { units, chronicle: 'The squad had two weeks with the commander.', source: 'model' } });
    expect(errors(r.events)).toEqual([]);
    const written = ofType(r.events, 'head_start_moment');
    const probe = written.filter((e) => probeKinds().has(String(e.kind)));
    expect(probe.map((e) => e.unitId).sort()).toEqual([ANN, BEA]);
    for (const e of probe) {
      const fact = r.state.memory.facts.find((f) => f.about.length === 1 && f.about[0] === e.unitId && f.text === `${String(e.unitId)} remembers ${String(e.kind)}.`);
      expect(fact).toBeDefined();
      expect(fact!.tags).toContain('head_start');
      expect(fact!.knownBy).not.toContain('*');
    }
  });

  it('pickProbeMoment: a hashed probe row whose axis fits, deterministic, null when there is none', () => {
    const ann = build(result()).squad.find((u) => u.id === ANN)!;
    const a = pickProbeMoment(reg, ann, 7);
    expect(a).not.toBeNull();
    expect(probeKinds().has(String(a!.id))).toBe(true);
    expect(pickProbeMoment(reg, ann, 7)!.id).toBe(a!.id);
    const tier1 = pickProbeMoment(reg, ann, 7, { maxTier: 1 })!;
    expect(reg.probeAxes.get(String(tier1.axis))!.tier).toBe(1);
    const only = pickProbeMoment(reg, ann, 7, { axes: ['claim'] })!;
    expect(only.axis).toBe('claim');
    expect(pickProbeMoment(reg, ann, 7, { axes: ['no_such_axis'] })).toBeNull();
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pickProbeMoment(reg, ann, seed)!.id));
    expect(seen.size).toBeGreaterThan(1);
  });
});
