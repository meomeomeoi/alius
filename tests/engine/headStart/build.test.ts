import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { headStartHash } from '../../../src/engine/headStart';
import { buildCampaign, type SetupResult, type UnitSetup } from '../../../src/engine/setup';
import { loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const result = (days: number, newArrivals: string[] = [], over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation',
  units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
  ...(days > 0 ? { headStart: { days: days as 7, newArrivals } } : {}), ...over,
});
const build = (r: SetupResult, seed = 7, registries: Registries = reg) => {
  const out = buildCampaign(r, registries, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};

describe('buildCampaign with a head start', () => {
  it('a head start draws nothing', () => {
    for (const days of [7, 14, 30]) expect(build(result(days)).rng).toEqual(build(result(0)).rng);
  });

  it('is deterministic', () => {
    expect(build(result(30, ['cat.png']))).toEqual(build(result(30, ['cat.png'])));
  });

  it('day 1 and every world clock stay as they are', () => {
    const plain = build(result(0));
    const s = build(result(30));
    expect(s.day).toBe(1);
    expect(s.slot).toBe(plain.slot);
    expect(s.world).toEqual(plain.world);
    expect(s.resources).toEqual(plain.resources);
    expect(s.missions).toEqual(plain.missions);
  });

  it('headStart lists the known units in squad order', () => {
    const s = build(result(14, ['bea.png']));
    expect(s.headStart!.days).toBe(14);
    expect(s.headStart!.units.map((u) => u.unitId)).toEqual(['unit_ann', 'unit_cat']);
    for (const u of s.headStart!.units) {
      expect(['positive', 'negative', 'neutral']).toContain(u.impression);
      expect(u.moments.length).toBeGreaterThanOrEqual(1);
      expect(u.moments.length).toBeLessThanOrEqual(2);
      for (const id of u.moments) expect(reg.headStartMoments.has(id)).toBe(true);
    }
    expect(s.headStart!.recap).toBeUndefined();
  });

  it('days 0 stores nothing', () => {
    expect(build(result(0)).headStart).toBeUndefined();
  });

  it('a known unit carries the moments in her history', () => {
    const s = build(result(14));
    for (const u of s.headStart!.units) {
      const types = s.relations[u.unitId].history.filter((h) => h.kind === 'event').map((h) => h.type);
      for (const id of u.moments) expect(types).toContain((reg.headStartMoments.get(id)!.eventDelta as { type: string }).type);
    }
  });

  it('a new arrival is untouched', () => {
    const plain = build(result(0));
    const s = build(result(30, ['bea.png']));
    expect(s.relations.unit_bea).toEqual(plain.relations.unit_bea);
    expect(s.squad.find((u) => u.id === 'unit_bea')).toEqual(plain.squad.find((u) => u.id === 'unit_bea'));
    expect(s.headStart!.units.map((u) => u.unitId)).not.toContain('unit_bea');
    expect(s.relations.unit_bea.metDay).toBe(1);
  });

  it('daily gains start at zero', () => {
    const s = build(result(30));
    for (const rel of Object.values(s.relations)) expect(rel.dailyGain).toEqual({ trust: 0, affinity: 0, attraction: 0 });
  });

  it('a crime known by default is not rolled', () => {
    const crime = reg.crimes.get('liquidation')!;
    const known = { ...reg, crimes: new Map(reg.crimes).set('liquidation', { ...crime, knownByDefault: true }) };
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = build(result(30), seed, known);
      for (const rel of Object.values(s.relations)) {
        expect(rel.flags).toContain('knows_crime');
        expect(rel.flags).not.toContain('crime_reaction_done');
      }
    }
  });

  it('the order is development, crime, moments, cap, transition', () => {
    // only learned_the_crime can be picked, and only once she knows: a moment here proves the crime was rolled before the picks
    const only = { ...reg, headStartMoments: new Map<string, Entry>([['learned_the_crime', reg.headStartMoments.get('learned_the_crime')!]]) };
    const one = (seed: number) => build(result(30, ['bea.png', 'cat.png']), seed, only);
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    const hit = seeds.find((seed) => headStartHash(seed, 'unit_ann', 'crime') < 0.6)!;
    const miss = seeds.find((seed) => headStartHash(seed, 'unit_ann', 'crime') >= 0.6)!;
    const learned = one(hit);
    expect(learned.relations.unit_ann.flags).toContain('knows_crime');
    expect(learned.headStart!.units[0].moments).toEqual(['learned_the_crime']);
    const ignorant = one(miss);
    expect(ignorant.relations.unit_ann.flags).not.toContain('knows_crime');
    expect(ignorant.headStart!.units[0].moments).toEqual([]);
    // the cap and the transition come last: a comrade at most (never past what the head start may give)
    for (const seed of seeds.slice(0, 20)) {
      const s = build(result(30), seed);
      for (const u of s.headStart!.units) {
        const rel = s.relations[u.unitId];
        expect(rel.stateSince === 1 || rel.stateSince === -29).toBe(true);
        expect(rel.trust).toBeLessThanOrEqual(Math.max(55, 20 + 10));
      }
    }
  });
});

const prologueResult = (days: number): SetupResult => ({
  ...result(days), startId: 'start_vesper', onboarding: { prologueId: 'prologue_vesper', veteran: false },
});

describe('the prologue under a head start', () => {
  it('is done on day 1: the campaign steps are skipped and the wizard steps completed', () => {
    const s = build(prologueResult(7));
    const o = s.onboarding!;
    expect(o.done).toBe(true);
    expect(o.skipped).toEqual(['lineup', 'first_words', 'tutorial', 'debrief', 'first_evening']);
    expect(o.completed).toEqual(['cold_open', 'intake', 'exam', 'dossier', 'free']);
  });

  it('every tab is unlocked', async () => {
    const { lockedTabs } = await import('../../../src/engine/onboarding');
    expect(lockedTabs(build(prologueResult(7)), reg).size).toBe(0);
  });

  it('no tutorial mission is offered', () => {
    const s = build(prologueResult(7));
    expect(s.onboarding!.tutorialMissionId).toBeUndefined();
    expect(s.missions.offered.some((m) => reg.missionTemplates.get(m.templateId)?.tutorial === true)).toBe(false);
  });

  it('without a head start the prologue starts as before', () => {
    const s = build(prologueResult(0));
    expect(s.onboarding!.done).toBe(false);
    expect(s.onboarding!.stepId).toBe('lineup');
    expect(s.onboarding!.skipped).toEqual([]);
  });

  it('a veteran intake with a head start is done too', () => {
    const s = build({ ...prologueResult(14), onboarding: { prologueId: 'prologue_vesper', veteran: true } });
    expect(s.onboarding!.done).toBe(true);
  });
});
