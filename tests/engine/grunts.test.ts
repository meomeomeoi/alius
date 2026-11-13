import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import {
  generateDesignation, generateGrunt, generatePortrait, gruntRelation,
} from '../../src/engine/grunts';
import { Rng, seedRng } from '../../src/engine/rng';
import { TUNING } from '../../src/engine/tuning';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const recruit = (s: CampaignState, r: Registries = reg) => run(s, r, { type: 'base/recruit_grunt', payload: {} });
const funded = (n = 4, opts: { crimeId?: string } = {}): CampaignState => {
  const s = campaign(reg, n, opts);
  s.resources.credits = 1000;
  return s;
};

describe('portrait and designation', () => {
  it('portrait is 7 lines of equal width and ASCII only', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lines = generatePortrait(new Rng(seedRng(seed))).split('\n');
      expect(lines).toHaveLength(7);
      expect(new Set(lines.map((l) => l.length))).toEqual(new Set([13]));
      expect(lines.join('')).toMatch(/^[\x20-\x7e]*$/);
      expect(lines[0]).toBe(`+${'-'.repeat(11)}+`);
      expect(lines[6]).toBe(lines[0]);
      expect(lines.slice(1, 6).every((l) => l.startsWith('|') && l.endsWith('|'))).toBe(true);
    }
  });

  it('different seeds give different portraits', () => {
    const set = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) set.add(generatePortrait(new Rng(seedRng(seed))));
    expect(set.size).toBeGreaterThanOrEqual(10);
  });

  it('the same seed gives the same portrait', () => {
    expect(generatePortrait(new Rng(seedRng(9)))).toBe(generatePortrait(new Rng(seedRng(9))));
  });

  it('designation matches X-### and avoids taken ones', () => {
    const rng = new Rng(seedRng(3));
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const d = generateDesignation(rng, taken);
      expect(d).toMatch(/^[A-Z]-[1-9]\d\d$/);
      expect(taken.has(d)).toBe(false);
      taken.add(d);
    }
  });
});

describe('generateGrunt', () => {
  it('the same state gives the same grunt', () => {
    const s = campaign(reg, 4);
    const a = generateGrunt(s, reg, new Rng(s.rng));
    const b = generateGrunt(structuredClone(s), reg, new Rng(structuredClone(s.rng)));
    expect(a).toEqual(b);
    expect(a.kind).toBe('grunt');
    expect(a.id).toBe(`grunt_${a.designation!.toLowerCase().replace('-', '_')}`);
    expect(a.displayName).toBe(a.designation);
    expect(reg.roles.has(a.roleId)).toBe(true);
    expect(a.baseStats).toEqual(reg.roles.get(a.roleId)!.baseStats);
    expect(a.currentHp).toBe(a.baseStats.hp);
    expect(a.asciiPortrait).toHaveLength(7 * 14 - 1);
    expect(a.cardRef).toBeUndefined();
    expect(Object.values(a.values).every((v) => v === 0)).toBe(true);
  });

  it('level is squad average minus one, never below 1; empty squad gives 1', () => {
    const s = campaign(reg, 4);
    s.squad.forEach((u) => (u.level = 5));
    expect(generateGrunt(s, reg, new Rng(s.rng)).level).toBe(4);
    s.squad.forEach((u, i) => (u.level = i < 2 ? 2 : 3)); // average 2.5 → 3 − 1
    expect(generateGrunt(s, reg, new Rng(s.rng)).level).toBe(2);
    s.squad.forEach((u) => (u.level = 1));
    expect(generateGrunt(s, reg, new Rng(s.rng)).level).toBe(1);
    expect(generateGrunt(campaign(reg, 0), reg, new Rng(s.rng)).level).toBe(1);
  });

  it('dead units do not count towards the level average', () => {
    const s = campaign(reg, 4);
    s.squad.forEach((u) => (u.level = 5));
    s.squad[0].level = 1;
    s.squad[0].status = 'dead';
    expect(generateGrunt(s, reg, new Rng(s.rng)).level).toBe(4);
  });

  it('lite defect has no arc and desire_bond is excluded by default', () => {
    const s = campaign(reg, 4);
    for (let seed = 1; seed <= 150; seed++) {
      const g = generateGrunt(s, reg, new Rng(seedRng(seed)));
      expect(g.defects).toHaveLength(1);
      expect(g.defects[0].lite).toBe(true);
      expect(g.defects[0].arc).toBeUndefined();
      expect(reg.defects.get(g.defects[0].id)!.category).not.toBe('desire_bond');
    }
  });

  it('desire_bond is allowed when the campaign setting is on', () => {
    const s = campaign(reg, 4);
    s.settings.desireBondDefects = true;
    const cats = new Set<unknown>();
    for (let seed = 1; seed <= 200; seed++) cats.add(reg.defects.get(generateGrunt(s, reg, new Rng(seedRng(seed))).defects[0].id)!.category);
    expect(cats.has('desire_bond')).toBe(true);
  });

  it('active when the roster has room, reserve when it is full', () => {
    const three = campaign(reg, 3);
    expect(generateGrunt(three, reg, new Rng(three.rng)).status).toBe('active');
    const four = campaign(reg, 4);
    expect(generateGrunt(four, reg, new Rng(four.rng)).status).toBe('reserve');
  });
});

describe('gruntRelation', () => {
  const GRUNT = { kind: 'grunt' as const }; // P8: the join site passes the grunt (the world disposition level applies)
  // no presence rows: the crime's own effect is what is under test (P7 presence is tested in commander/presence)
  const trustFor = (crimeId: string) => gruntRelation(campaign(reg, 1, { crimeId }), { ...reg, presence: new Map() }, GRUNT).trust;

  it('follows the crime: purge adds, experimentation subtracts', () => {
    expect(trustFor('mutiny')).toBe(TUNING.recruit.baseTrust);
    expect(trustFor('purge')).toBe(TUNING.recruit.baseTrust + TUNING.recruit.gruntCrimeBonus);
    expect(trustFor('experimentation')).toBe(TUNING.recruit.baseTrust - 10);
  });

  it('is trust-only: no affinity or attraction, stranger state, steady/wavering band from trust', () => {
    const r = gruntRelation(campaign(reg, 1), reg, GRUNT);
    expect(r).toMatchObject({ affinity: 0, attraction: 0, stateId: 'stranger', marks: [], loyaltyBand: 'steady' });
  });

  it('knows_crime follows the crime or start default', () => {
    expect(gruntRelation(campaign(reg, 1), reg, GRUNT).flags).toEqual([]);
    const known = { ...reg, crimes: new Map([...reg.crimes].map(([k, v]) => [k, { ...v, knownByDefault: true }])) };
    expect(gruntRelation(campaign(reg, 1), known, GRUNT).flags).toEqual(['knows_crime']);
  });
});

describe('base/recruit_grunt', () => {
  it('pays credits, adds the unit, its relation and a roster entry', () => {
    const s = funded(3);
    const r = recruit(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.resources.credits).toBe(1000 - TUNING.recruit.credits);
    const g = r.state.squad.at(-1)!;
    expect(g.kind).toBe('grunt');
    expect(r.state.relations[g.id]).toBeDefined();
    expect(r.state.roster.activeIds).toContain(g.id);
    expect(ofType(r.events, 'grunt_recruited')[0]).toMatchObject({ unitId: g.id, designation: g.designation });
  });

  it('a fifth unit goes to reserve, off the active roster', () => {
    const r = recruit(funded(4));
    const g = r.state.squad.at(-1)!;
    expect(g.status).toBe('reserve');
    expect(r.state.roster.activeIds).not.toContain(g.id);
    expect(r.state.roster.activeIds).toHaveLength(4);
  });

  it('is deterministic and advances the campaign rng, so the next grunt differs', () => {
    const s = funded(2);
    const a = recruit(s);
    const b = recruit(structuredClone(s));
    expect(a.state).toEqual(b.state);
    expect(a.state.rng).not.toEqual(s.rng);
    const next = recruit(a.state).state.squad.at(-1)!;
    const first = a.state.squad.at(-1)!;
    expect([next.id, next.asciiPortrait]).not.toEqual([first.id, first.asciiPortrait]);
  });

  it('a dead unit in activeIds neither blocks the grunt nor makes the roster longer than 4', () => {
    const s = funded(4);
    s.squad[3].status = 'dead';
    const r = recruit(s).state;
    expect(r.roster.activeIds).toHaveLength(4);
    expect(r.roster.activeIds).not.toContain('unit_dee');
    expect(r.roster.activeIds).toContain(r.squad.at(-1)!.id);
  });

  it('the relation of a grunt starts on the day it was recruited', () => {
    const s = funded(2);
    s.day = 12;
    const g = recruit(s).state;
    expect(g.relations[g.squad.at(-1)!.id].stateSince).toBe(12);
    expect(campaign(reg, 2).relations.unit_ann.stateSince).toBe(1);
  });

  it('rejected at capacity, state unchanged', () => {
    const s = funded(4);
    s.roster.capacity = 4;
    const r = recruit(s);
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/capacity|full|beds/i);
  });

  it('dead units still occupy ids but no longer count against capacity', () => {
    const s = funded(4);
    s.roster.capacity = 4;
    s.squad[0].status = 'dead';
    expect(errors(recruit(s).events)).toEqual([]);
  });

  it('rejected without enough credits, state unchanged', () => {
    const s = funded(2);
    s.resources.credits = TUNING.recruit.credits - 1;
    const r = recruit(s);
    expect(r.state).toBe(s);
    expect(String(errors(r.events)[0].message)).toMatch(/credits/i);
  });

  it('ids and designations never collide over many recruits', () => {
    let s = funded(0);
    s.roster.capacity = 200;
    s.resources.credits = 1_000_000;
    for (let i = 0; i < 120; i++) {
      if (i === 5) s.squad.find((u) => u.kind === 'grunt')!.status = 'dead';
      s = recruit(s).state;
    }
    const ids = s.squad.map((u) => u.id);
    expect(new Set(ids).size).toBe(120);
    expect(new Set(s.squad.map((u) => u.designation)).size).toBe(120);
  });

  it('works on a campaign made by an older build with no P2 fields', () => {
    const s = funded(2);
    expect(s.base.upgrades).toBeUndefined();
    expect(errors(recruit(s).events)).toEqual([]);
  });
});

describe('squad/set_flavor', () => {
  const flavor = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'squad/set_flavor', payload });
  const withGrunt = () => {
    const s = recruit(funded(2)).state;
    return { s, id: s.squad.at(-1)!.id, designation: s.squad.at(-1)!.designation };
  };

  it('renames, keeps the designation and stores the bio', () => {
    const { s, id, designation } = withGrunt();
    const r = flavor(s, { unitId: id, name: "Mara O'Dell-9", bio: 'Quiet. Counts exits.' });
    expect(errors(r.events)).toEqual([]);
    const g = r.state.squad.find((u) => u.id === id)!;
    expect(g).toMatchObject({ displayName: "Mara O'Dell-9", designation, bio: 'Quiet. Counts exits.', id });
  });

  it('rejects named units, unknown units and bad names or bios', () => {
    const { s, id } = withGrunt();
    const bad = [
      { unitId: 'unit_ann', name: 'Ann', bio: 'x' },
      { unitId: 'ghost', name: 'Ann', bio: 'x' },
      { unitId: id, name: '', bio: 'x' },
      { unitId: id, name: '<b>Rex</b>', bio: 'x' },
      { unitId: id, name: 'A'.repeat(25), bio: 'x' },
      { unitId: id, name: '1234', bio: 'x' },
      { unitId: id, name: 'Rex', bio: 'y'.repeat(121) },
      { unitId: id, name: 'Rex', bio: 5 },
      'nope',
    ];
    for (const payload of bad) {
      const r = flavor(s, payload);
      expect(r.state, JSON.stringify(payload)).toBe(s);
      expect(errors(r.events)).toHaveLength(1);
    }
  });
});
