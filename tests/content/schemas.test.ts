import { describe, it, expect } from 'vitest';
import {
  CorporationSchema, CrimeSchema, DefectSchema, EffectSchema, RoleSchema, SignatureSchema, StartSchema,
  ValuesSchema,
} from '../../src/content/schemas';

const role = {
  id: 'r', name: 'R', row: 'front', baseStats: { hp: 100, atk: 20, def: 10, spd: 12, crit: 5 },
  weaponClasses: ['rifle'], armorWeights: ['light'], identity: 'i', summary: 's', branches: [],
};
const defect = {
  id: 'd', name: 'D', category: 'neural', lore: 'l', upside: 'u', downside: 'd',
  breakdown: { name: 'b', text: 't' }, social: 's', arc: { cure: 'c', manage: 'm', embrace: 'e' },
};
const beat = (i: number) => ({ id: `beat_${i}`, title: 't', goal: 'g' });
const start = (n: number) => ({
  id: 's', name: 'S', corporationId: 'c', summary: 'x', situation: 'y', spine: Array.from({ length: n }, (_, i) => beat(i + 1)),
});

describe('content schemas', () => {
  it('role requires positive stats and at least one weapon class', () => {
    expect(RoleSchema.safeParse(role).success).toBe(true);
    expect(RoleSchema.safeParse({ ...role, baseStats: { ...role.baseStats, hp: 0 } }).success).toBe(false);
    expect(RoleSchema.safeParse({ ...role, weaponClasses: [] }).success).toBe(false);
  });

  it('defect category must be one of four', () => {
    for (const category of ['neural', 'somatic', 'cybernetic', 'desire_bond']) {
      expect(DefectSchema.safeParse({ ...defect, category }).success).toBe(true);
    }
    expect(DefectSchema.safeParse({ ...defect, category: 'spiritual' }).success).toBe(false);
  });

  it('signature id must start with sig_', () => {
    const sig = { id: 'sig_x', name: 'X', mechanic: 'm', fits: 'f' };
    expect(SignatureSchema.safeParse(sig).success).toBe(true);
    expect(SignatureSchema.safeParse({ ...sig, id: 'x' }).success).toBe(false);
  });

  it('values out of range are rejected', () => {
    const ok = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 3, corporate: -3, sacrifice: 0 };
    expect(ValuesSchema.safeParse(ok).success).toBe(true);
    expect(ValuesSchema.safeParse({ ...ok, mercy: 4 }).success).toBe(false);
  });

  it('known effect with bad params is rejected', () => {
    expect(EffectSchema.safeParse({ type: 'social_rank', stat: 'charm', rank: 2 }).success).toBe(false);
    expect(EffectSchema.safeParse({ type: 'social_rank', stat: 'authority', rank: 6 }).success).toBe(false);
    expect(EffectSchema.safeParse({ type: 'resource', resource: 'gold', amount: 1 }).success).toBe(false);
    expect(EffectSchema.safeParse({ type: 'starting_trust', amount: 41 }).success).toBe(false);
    expect(EffectSchema.safeParse({ type: 'starting_trust', amount: 5, ifValue: { axis: 'mercy', sign: '*' } }).success).toBe(false);
    expect(EffectSchema.safeParse({ type: 'starting_trust', amount: 5, ifValue: { axis: 'mercy', sign: '+' } }).success).toBe(true);
  });

  it('unknown effect type is accepted unchanged', () => {
    const fx = { type: 'cp_start', amount: 1 };
    const r = EffectSchema.safeParse(fx);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toEqual(fx);
  });

  it('start spine needs 5 to 8 beats', () => {
    expect(StartSchema.safeParse(start(4)).success).toBe(false);
    expect(StartSchema.safeParse(start(5)).success).toBe(true);
    expect(StartSchema.safeParse(start(8)).success).toBe(true);
    expect(StartSchema.safeParse(start(9)).success).toBe(false);
  });

  it('corporation and crime need their effect lists', () => {
    expect(CorporationSchema.safeParse({ id: 'c', name: 'C', summary: 's', values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 }, oversightStyle: 'o', playable: true }).success).toBe(false);
    expect(CrimeSchema.safeParse({ id: 'k', name: 'K', summary: 's', perk: { text: 'p', effects: [] }, flaw: { text: 'f', effects: [] }, valueReactions: [], knownByDefault: false }).success).toBe(true);
  });
});

import { ActivitySchema, FacilitySchema } from '../../src/content/schemas';

const activity = (over: Record<string, unknown> = {}) => ({
  id: 'a', name: 'A', summary: 's', slotRules: ['morning'], cost: {}, companion: 'optional', flavor: 'none',
  effects: [{ type: 'commander_stat', stat: 'authority', amount: 3 }],
  companionEffects: [{ type: 'unit_xp', target: 'companion', amount: 5 }],
  ...over,
});
const facility = (over: Record<string, unknown> = {}) => ({
  id: 'f', name: 'F', summary: 's', maxLevel: 2,
  levels: [{ effects: { cap: 1 } }, { effects: { cap: 2 }, upgrade: { credits: 10, plyx: 1, days: 2 } }],
  ...over,
});

describe('activity and facility schemas', () => {
  it('a valid activity passes', () => {
    expect(ActivitySchema.safeParse(activity()).success).toBe(true);
  });

  it('activity with companion none and companionEffects is rejected', () => {
    expect(ActivitySchema.safeParse(activity({ companion: 'none' })).success).toBe(false);
    expect(ActivitySchema.safeParse(activity({ companion: 'none', companionEffects: [] })).success).toBe(true);
  });

  it('required companion without companionEffects is rejected', () => {
    expect(ActivitySchema.safeParse(activity({ companion: 'required', companionEffects: [] })).success).toBe(false);
  });

  it('when.focus must be a declared focus', () => {
    const focus = [{ id: 'units', label: 'Units', units: { min: 1, max: 2 } }];
    const eff = (f: string) => [{ type: 'unit_xp', target: 'selected', amount: 5, when: { focus: f } }];
    expect(ActivitySchema.safeParse(activity({ focus, effects: eff('units') })).success).toBe(true);
    expect(ActivitySchema.safeParse(activity({ focus, effects: eff('nope') })).success).toBe(false);
    expect(ActivitySchema.safeParse(activity({ effects: eff('units') })).success).toBe(false);
  });

  it('unknown effect type is rejected', () => {
    expect(ActivitySchema.safeParse(activity({ effects: [{ type: 'teleport' }] })).success).toBe(false);
  });

  it('slot rules must name real slots and not be empty', () => {
    expect(ActivitySchema.safeParse(activity({ slotRules: [] })).success).toBe(false);
    expect(ActivitySchema.safeParse(activity({ slotRules: ['dawn'] })).success).toBe(false);
  });

  it('facility with a missing level is rejected', () => {
    expect(FacilitySchema.safeParse(facility()).success).toBe(true);
    expect(FacilitySchema.safeParse(facility({ levels: [{ effects: { cap: 1 } }] })).success).toBe(false);
  });

  it('facility levels need an upgrade from level 2 and the same effect keys', () => {
    expect(FacilitySchema.safeParse(facility({
      levels: [{ effects: { cap: 1 } }, { effects: { cap: 2 } }],
    })).success).toBe(false);
    expect(FacilitySchema.safeParse(facility({
      levels: [{ effects: { cap: 1 } }, { effects: { other: 2 }, upgrade: { credits: 1, plyx: 1, days: 1 } }],
    })).success).toBe(false);
    expect(FacilitySchema.safeParse(facility({
      levels: [{ effects: { cap: 1 }, upgrade: { credits: 1, plyx: 1, days: 1 } }, { effects: { cap: 2 }, upgrade: { credits: 1, plyx: 1, days: 1 } }],
    })).success).toBe(false);
  });

  it('start accepts startingResources and rejects negatives', () => {
    const b = start(5);
    expect(StartSchema.safeParse({ ...b, startingResources: { credits: 5, supplies: 1 } }).success).toBe(true);
    expect(StartSchema.safeParse({ ...b, startingResources: { credits: -5 } }).success).toBe(false);
  });
});
