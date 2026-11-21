import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { dynamicOn } from '../../../src/engine/dynamic/gate';
import { seedProblem } from '../../../src/engine/dynamic/seeds';
import type { Practice } from '../../../src/engine/dynamic/types';
import { buildCampaign, validateSetup, type SetupResult, type UnitSetup } from '../../../src/engine/setup';
import type { Bond } from '../../../src/engine/state/types';
import { loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const OPTS = { desireBondDefects: false, seed: 7 };

const PRACTICE: Practice = {
  categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
  style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
};
const bond = (over: Partial<Bond> = {}, practice: Practice | undefined = PRACTICE): Bond => ({
  leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', ...(practice ? { practice: structuredClone(practice) } : {}), ...over,
});
/** Ann and Bea have a profile, Cat has none. */
const units = (): UnitSetup[] => [unitSetup('Ann', { bond: bond() }), unitSetup('Bea', { bond: bond() }), unitSetup('Cat')];
const result = (over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: units(), content: { enabled: ['restraint'] },
  dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: {} }, ...over,
});
const build = (r: SetupResult) => {
  const b = buildCampaign(r, reg, OPTS);
  if (!b.ok) throw new Error(b.errors.join('; '));
  return b.state;
};
const errs = (r: SetupResult) => validateSetup(r, reg, OPTS);

describe('SetupResult.dynamic', () => {
  it('a build without dynamic is byte-identical', () => {
    const plain = build(result({ dynamic: undefined }));
    expect(plain.dynamic).toBeUndefined();
    for (const rel of Object.values(plain.relations)) expect(rel.dynamic).toBeUndefined();
    // set, but no practice category on: still nothing is written, and the rest of the campaign is the same
    const dormant = build(result({ content: { enabled: ['worship'] }, dynamic: { holders: 2, pace: 'fast', frequency: 'often', units: {} } }));
    expect(dormant.dynamic).toBeUndefined();
    expect(dormant).toEqual(build(result({ content: { enabled: ['worship'] }, dynamic: undefined })));
    const noContent = build(result({ content: undefined }));
    expect(noContent.dynamic).toBeUndefined();
  });

  it('with a practice category on, the block is written and keyed by unit id', () => {
    const s = build(result({ dynamic: { holders: 2, pace: 'slow', frequency: 'rare', units: { 'ann.png': { mayHold: 'no', sensitivity: 'lively' } } } }));
    expect(dynamicOn(s, reg)).toBe(true);
    expect(s.dynamic!.salt).toBe(OPTS.seed);
    expect(s.dynamic!.setup).toEqual({ holders: 2, pace: 'slow', frequency: 'rare', units: { [s.squad[0].id]: { mayHold: 'no', sensitivity: 'lively' } } });
    for (const rel of Object.values(s.relations)) expect(rel.dynamic).toBeUndefined(); // nobody holds until a hold gain
    expect(dynamicOn(build(result({ dynamic: { holders: 0, pace: 'normal', frequency: 'normal', units: {} } })), reg)).toBe(false);
  });

  it('a hostile block is an error', () => {
    expect(errs(result({ dynamic: { holders: 9 as never, pace: 'normal', frequency: 'normal', units: {} } })).join()).toMatch(/holders/i);
    expect(errs(result({ dynamic: { holders: 1, pace: 'warp' as never, frequency: 'normal', units: {} } })).join()).toMatch(/pace/i);
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'daily' as never, units: {} } })).join()).toMatch(/frequency/i);
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'nobody.png': { mayHold: 'no' } } } })).join()).toMatch(/nobody\.png/);
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { mayHold: 'maybe' as never } } } })).join()).toMatch(/may hold/i);
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { sensitivity: 'wild' as never } } } })).join()).toMatch(/sensitivity/i);
  });

  it('more seeds than holders is an error', () => {
    const two = { 'ann.png': { seeded: true as const }, 'bea.png': { seeded: true as const } };
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: two } })).join()).toMatch(/at most 1 seeded/i);
    expect(errs(result({ dynamic: { holders: 2, pace: 'normal', frequency: 'normal', units: two } }))).toEqual([]);
    expect(errs(result({ dynamic: { holders: 'any', pace: 'normal', frequency: 'normal', units: two } }))).toEqual([]);
  });

  it('a seeded unit that cannot hold is an error naming the reason', () => {
    const e = errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'cat.png': { seeded: true } } } }));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/Cat/);
    expect(e[0]).toMatch(/cannot hold: she has no practice profile/);
    const no = errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { seeded: true, mayHold: 'no' } } } }));
    expect(no[0]).toMatch(/cannot hold: the setup says she may not hold/);
    const off = errs(result({ content: { enabled: ['humiliation'] }, dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { seeded: true } } } }));
    expect(off[0]).toMatch(/cannot hold: no enabled practice/);
    // with no practice category on the block is dormant: nothing to check
    expect(errs(result({ content: { enabled: ['worship'] }, dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'cat.png': { seeded: true } } } }))).toEqual([]);
  });

  it('startFrame without a seed is an error', () => {
    const e = errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { startFrame: 'role' } } } }));
    expect(e.join()).toMatch(/starting frame/i);
    expect(errs(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { seeded: true, startFrame: 'rule' as never } } } })).join()).toMatch(/starting frame/i);
  });

  it('seedProblem asks only about her profile', () => {
    const [ann, , cat] = units();
    expect(seedProblem(reg, ann)).toBeNull();
    expect(seedProblem(reg, cat)).toMatch(/profile/);
    expect(seedProblem(reg, ann, { mayHold: 'no' })).toMatch(/may not hold/);
    expect(seedProblem(reg, ann, { enabled: ['humiliation'] })).toMatch(/enabled practice/);
    const limited = unitSetup('Dee', { bond: bond({ ownLimits: { categories: ['restraint'] } }) });
    expect(seedProblem(reg, limited)).toMatch(/enabled practice/);
    const tolerant = unitSetup('Eve', { bond: bond({}, { ...PRACTICE, categories: { restraint: { as: 'tolerates', witness: 'indifferent' } } }) });
    expect(seedProblem(reg, tolerant)).toBeNull(); // dominant
    expect(seedProblem(reg, unitSetup('Fay', { bond: bond({ leadStyle: 'balanced' }, { ...PRACTICE, categories: { restraint: { as: 'tolerates', witness: 'indifferent' } } }) }))).toMatch(/enabled practice/);
  });

  it('a seed gets hold 25, a starting frame its frame and floor, and nothing is drawn', () => {
    const none = build(result());
    const seeded = build(result({ dynamic: { holders: 2, pace: 'normal', frequency: 'normal', units: { 'ann.png': { seeded: true }, 'bea.png': { seeded: true, startFrame: 'role' } } } }));
    const [ann, bea] = seeded.squad.map((u) => seeded.relations[u.id].dynamic);
    expect(ann).toMatchObject({ hold: 25, frame: 'equal', milestones: [] });
    expect(bea).toMatchObject({ hold: 40, frame: 'role', milestones: ['seeded:role'] });
    expect(seeded.relations[seeded.squad[2].id].dynamic).toBeUndefined();
    expect(seeded.rng).toEqual(none.rng);
    const play = build(result({ dynamic: { holders: 1, pace: 'normal', frequency: 'normal', units: { 'ann.png': { seeded: true, startFrame: 'play' } } } }));
    expect(play.relations[play.squad[0].id].dynamic).toMatchObject({ hold: 25, frame: 'play', milestones: ['seeded:play'] });
    // the floor of the frame is taken when it is higher: play is 20, so seedHold 25 stands
    expect(seeded.dynamic!.setup.units[seeded.squad[1].id]).toEqual({ seeded: true, startFrame: 'role' });
  });
});
