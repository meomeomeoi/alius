import { beforeAll, describe, expect, it } from 'vitest';
import type { PracticeSeedEntry } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/practice';
import { fallbackLine, pickSeeds, plainSummary, seedPool } from '../../../src/engine/practice/seeds';
import { PRACTICE_KINDS } from '../../../src/engine/practice/state';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const seedOf = (id: string) => reg.practiceSeeds.get(id) as unknown as PracticeSeedEntry;
const days = Array.from({ length: 50 }, (_, i) => i + 1);

/** Every seed id picked over 50 days of keys. */
function pickedOver(s: ReturnType<typeof world>, kind: (typeof PRACTICE_KINDS)[number], opts?: { minTier?: number }): Set<string> {
  const out = new Set<string>();
  for (const d of days) { s.day = d; for (const id of pickSeeds(s, reg, ANN, kind, opts)) out.add(id); }
  return out;
}

describe('seeds are gated', () => {
  it('a seed with a disabled tag is never picked, and is once it is on and her track allows it', () => {
    const off = withService(world(reg, 'role'));
    off.content = { enabled: ['restraint', 'denial', 'service'] }; // public_humiliation is off
    unitOf(off, ANN).bond!.practice!.categories.service = { as: 'enjoys', witness: 'indifferent' };
    off.relations[ANN].dynamic!.tracks.public_humiliation = { xp: 60, level: 3 };
    for (const kind of PRACTICE_KINDS) for (const id of pickedOver(off, kind)) expect(seedOf(id).contentTags, id).not.toContain('public_humiliation');
    const on = withService(world(reg, 'role'));
    on.relations[ANN].dynamic!.tracks.public_humiliation = { xp: 60, level: 3 };
    expect([...pickedOver(on, 'demonstration')].some((id) => seedOf(id).contentTags.includes('public_humiliation'))).toBe(true);
  });

  it('a seed in her own limits is never picked', () => {
    const s = withService(world(reg, 'role'));
    unitOf(s, ANN).bond!.ownLimits.categories = ['denial'];
    for (const id of pickedOver(s, 'denial')) throw new Error(`picked ${id}`);
    expect(seedPool(s, reg, ANN, 'denial')).toEqual([]);
    expect(pickSeeds(s, reg, ANN, 'denial')).toEqual([]);
  });

  it('a category she does not practise is not offered (as none)', () => {
    const s = withService(world(reg, 'role'));
    unitOf(s, ANN).bond!.practice!.categories.denial = { as: 'none', witness: 'indifferent' };
    expect(seedPool(s, reg, ANN, 'denial')).toEqual([]);
  });

  it('the tier is at most the track level plus one: track 0 gives tier 1', () => {
    const s = withService(world(reg, 'role'));
    for (const kind of PRACTICE_KINDS) for (const id of pickedOver(s, kind)) expect(seedOf(id).tier, id).toBeLessThanOrEqual(1);
    s.relations[ANN].dynamic!.tracks.service = { xp: 30, level: 2 };
    const high = pickedOver(s, 'task');
    expect([...high].every((id) => seedOf(id).track !== 'service' || seedOf(id).tier <= 3)).toBe(true);
    expect([...high].some((id) => seedOf(id).track === 'service' && seedOf(id).tier === 3)).toBe(false); // there is none at 3 in the core; the bound is the level + 1
    expect([...high].some((id) => seedOf(id).tier === 2)).toBe(true);
  });

  it('a chain floor (minTier) leaves out the lower seeds', () => {
    const s = withService(world(reg, 'role'));
    s.relations[ANN].dynamic!.tracks.service = { xp: 30, level: 2 };
    for (const id of pickedOver(s, 'task', { minTier: 2 })) expect(seedOf(id).tier).toBeGreaterThanOrEqual(2);
  });

  it('a romantic seed only at the romantic tier', () => {
    const s = withService(world(reg, 'role'));
    s.relations[ANN].dynamic!.tracks.restraint = { xp: 60, level: 3 };
    s.relations[ANN].stateId = 'friend';
    expect([...pickedOver(s, 'hold')].filter((id) => seedOf(id).romantic === true)).toEqual([]);
    s.relations[ANN].stateId = 'lover';
    expect([...pickedOver(s, 'hold')].some((id) => seedOf(id).romantic === true)).toBe(true);
  });

  it('three to six ids, no repeats, and the same on the same day', () => {
    const s = withService(world(reg, 'role'));
    for (const d of days) {
      s.day = d;
      const ids = pickSeeds(s, reg, ANN, 'task');
      expect(ids.length).toBeGreaterThanOrEqual(Math.min(3, seedPool(s, reg, ANN, 'task').length));
      expect(ids.length).toBeLessThanOrEqual(6);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pickSeeds(s, reg, ANN, 'task')).toEqual(ids);
    }
  });

  it('draws nothing and changes nothing', () => {
    const s = withService(world(reg, 'role'));
    const before = structuredClone(s);
    pickSeeds(s, reg, ANN, 'task');
    expect(s).toEqual(before);
  });
});

describe('the fallback words', () => {
  it('the line is the kind template with the gist, the summary the gist', () => {
    const seed = seedOf('task_report_at_dusk');
    expect(fallbackLine('task', seed.gist)).toBe(TUNING.practice.fallback.task.replaceAll('{gist}', seed.gist));
    expect(fallbackLine('task', seed.gist)).toContain(seed.gist);
    expect(plainSummary(seed)).toBe(seed.gist);
  });
});
