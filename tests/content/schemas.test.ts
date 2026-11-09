import { describe, it, expect } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import {
  ConditionsSchema, CorporationSchema, CrimeSchema, DefectSchema, EffectSchema, EventDeltaSchema, LocationSchema,
  RelationshipStateSchema, RoleSchema, SignatureSchema, StartSchema, ValuesSchema,
} from '../../src/content/schemas';

import { defect, role } from '../helpers/combatContent';
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
    const sig = { id: 'sig_x', name: 'X', mechanic: 'm', fits: 'f', skill: 'sig_x' };
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

  it('spine beat accepts conditions, completion and onComplete and still parses without them', () => {
    const full = {
      ...beat(1),
      conditions: { minDay: 4, flagsAll: ['a'], flagsNone: ['b'], clearanceMin: 1, threads: [{ id: 't', status: 'resolved' }] },
      completion: { kind: 'mission', templateId: 'tpl_x', regionId: 'r' },
      onComplete: [{ type: 'clearance', tier: 1 }],
    };
    const spine = (b: unknown) => ({ ...start(5), spine: [b, beat(2), beat(3), beat(4), beat(5)] });
    expect(StartSchema.safeParse(spine(full)).success).toBe(true);
    expect(StartSchema.safeParse(spine(beat(1))).success).toBe(true);
    expect(StartSchema.safeParse(spine({ ...beat(1), completion: { kind: 'auto' } })).success).toBe(true);
    expect(StartSchema.safeParse(spine({ ...beat(1), completion: { kind: 'flag', anyOf: ['f'] } })).success).toBe(true);
    expect(StartSchema.safeParse(spine({ ...beat(1), completion: { kind: 'flag', anyOf: [] } })).success).toBe(false);
    expect(StartSchema.safeParse(spine({ ...beat(1), completion: { kind: 'mission', templateId: 'x' } })).success).toBe(false);
    expect(StartSchema.safeParse(spine({ ...beat(1), conditions: { minDay: 0 } })).success).toBe(false);
    expect(StartSchema.safeParse(spine({ ...beat(1), onComplete: [{ type: 'bogus' }] })).success).toBe(false);
  });

  it('defect may declare an expedition reveal of exactly one step', () => {
    expect(DefectSchema.safeParse({ ...defect, expedition: { reveal: 1 } }).success).toBe(true);
    expect(DefectSchema.safeParse({ ...defect, expedition: { reveal: 2 } }).success).toBe(false);
    expect(DefectSchema.safeParse({ ...defect, expedition: { reveal: 1, extra: 1 } }).success).toBe(false);
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

describe('activity schema hardening', () => {
  it('emit_event may not use an event name the engine owns', () => {
    for (const event of ['error', 'autosave', 'activity_done', 'slot_advanced', 'day_started', 'resource_changed']) {
      expect(ActivitySchema.safeParse(activity({ effects: [{ type: 'emit_event', event }] })).success, event).toBe(false);
    }
    expect(ActivitySchema.safeParse(activity({ effects: [{ type: 'emit_event', event: 'rumors_requested' }] })).success).toBe(true);
  });

  it('a focus needs min <= max and focus ids must be unique', () => {
    const f = (min: number, max: number) => [{ id: 'units', label: 'U', units: { min, max } }];
    expect(ActivitySchema.safeParse(activity({ focus: f(3, 1), effects: [] })).success).toBe(false);
    expect(ActivitySchema.safeParse(activity({ focus: f(1, 2), effects: [] })).success).toBe(true);
    const dup = [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }];
    expect(ActivitySchema.safeParse(activity({ focus: dup, effects: [] })).success).toBe(false);
  });

  it('a scene-starting activity may only emit events (its slot is never consumed here)', () => {
    const talk = (companionEffects: unknown[]) => activity({ companion: 'required', startsScene: true, effects: [], companionEffects });
    expect(ActivitySchema.safeParse(talk([{ type: 'emit_event', event: 'scene_requested' }])).success).toBe(true);
    expect(ActivitySchema.safeParse(talk([{ type: 'unit_xp', target: 'companion', amount: 5 }])).success).toBe(false);
    expect(ActivitySchema.safeParse(activity({ startsScene: true, effects: [{ type: 'commander_stat', stat: 'authority', amount: 3 }] })).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// P3 registries

const rstate = (over: Record<string, unknown> = {}) => ({
  id: 'st', name: 'St', group: 'platonic', romance: false, glyph: '*', priority: 5,
  entry: { via: ['automatic'], when: { axes: { trust: [10, 100] } } }, exit: [],
  unlocks: { synergies: [], activities: [], nightEvents: [], defectArcStages: [] }, dmChance: 0.1, promptHint: 'h', ...over,
});
const row = { trust: 1 };
const delta = { id: 'praised', rows: { minor: row, moderate: row, major: row, extreme: row } };
const location = { id: 'roof', name: 'Roof', summary: 's', ascii: ['/\\'] };

describe('relationship state, event delta and location schemas', () => {
  it('a valid state passes', () => expect(RelationshipStateSchema.safeParse(rstate()).success).toBe(true));
  it('via event without events is rejected', () => {
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['event'] } })).success).toBe(false);
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['event'], events: ['praised'] } })).success).toBe(true);
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['automatic'], events: ['praised'] } })).success).toBe(false);
  });
  it('via proposal without proposals is rejected', () => {
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['proposal'] } })).success).toBe(false);
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['proposal'], proposals: ['date'] } })).success).toBe(true);
    expect(RelationshipStateSchema.safeParse(rstate({ entry: { via: ['proposal'], proposals: ['kiss'] } })).success).toBe(false);
  });
  it('nested anyOf validates', () => {
    const ok = { anyOf: [{ axes: { trust: [0, 10] } }, { anyOf: [{ stressMin: 80 }, { flagsAll: ['x'] }] }] };
    expect(ConditionsSchema.safeParse(ok).success).toBe(true);
    expect(ConditionsSchema.safeParse({ anyOf: [{ anyOf: [{ stressMin: 'x' }] }] }).success).toBe(false);
  });
  it('unknown condition key is rejected', () => {
    expect(ConditionsSchema.safeParse({ moodMin: 3 }).success).toBe(false);
    expect(ConditionsSchema.safeParse({ axes: { luck: [0, 1] } }).success).toBe(false);
    expect(ConditionsSchema.safeParse({ axes: { trust: [5] } }).success).toBe(false);
  });
  it('an event delta needs all four severities and a known event type', () => {
    expect(EventDeltaSchema.safeParse(delta).success).toBe(true);
    expect(EventDeltaSchema.safeParse({ ...delta, rows: { minor: row } }).success).toBe(false);
    expect(EventDeltaSchema.safeParse({ ...delta, id: 'hugged' }).success).toBe(false);
  });
  it('location without ascii is rejected', () => {
    expect(LocationSchema.safeParse(location).success).toBe(true);
    expect(LocationSchema.safeParse({ ...location, ascii: [] }).success).toBe(false);
    const { ascii: _a, ...bare } = location;
    expect(LocationSchema.safeParse(bare).success).toBe(false);
  });
  it('defect without the new optional fields still loads', () => {
    expect(DefectSchema.safeParse(defect).success).toBe(true);
    const full = {
      ...defect, relationModifiers: { gain: { trust: 1.5 }, events: { praised: 2 } },
      socialHooks: [{ activity: 'rest', who: 'companion', axis: 'affinity', amount: 2 }], dmChanceBonus: 0.1,
    };
    expect(DefectSchema.safeParse(full).success).toBe(true);
    expect(DefectSchema.safeParse({ ...defect, socialHooks: [{ activity: 'rest', who: 'nobody' }] }).success).toBe(false);
  });
});

describe('P3 cross-references', () => {
  const pack = (files: Record<string, unknown>) => async (path: string) => {
    const f = path.replace('p/', '');
    if (!(f in files)) throw new Error(`no ${f}`);
    return files[f];
  };
  const manifest = (reg: Record<string, string>) => ({ id: 'p', name: 'P', version: '1', priority: 0, files: reg });
  const load = (states: unknown[], extra: Record<string, unknown[]> = {}) =>
    loadPacks(['p'], pack({
      'manifest.json': manifest({ relationshipStates: 'rs.json', eventDeltas: 'ed.json', flags: 'fl.json', defects: 'df.json', ...Object.fromEntries(Object.keys(extra).map((k) => [k, `${k}.json`])) }),
      'rs.json': states, 'ed.json': [delta], 'fl.json': [], 'df.json': [],
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`${k}.json`, v])),
    }));
  const msgs = (r: Awaited<ReturnType<typeof load>>) => r.errors.map((e) => e.message).join('|');

  it('a consistent mini pack loads', async () => {
    expect((await load([rstate({ exit: [{ when: { axes: { trust: [0, 5] } }, to: 'st' }] })])).errors).toEqual([]);
  });
  it('exit to an unknown state is a load error', async () => {
    expect(msgs(await load([rstate({ exit: [{ when: {}, to: 'ghost' }] })]))).toContain('unknown relationshipStates id "ghost"');
  });
  it('entry fromStates and inStates must exist', async () => {
    const r = await load([rstate({ entry: { via: ['automatic'], fromStates: ['nope'], when: { inStates: ['nada'] } } })]);
    expect(msgs(r)).toContain('"nope"');
    expect(msgs(r)).toContain('"nada"');
  });
  it('eventCount of an unknown type is a load error, a history type is fine', async () => {
    const bad = await load([rstate({ entry: { via: ['automatic'], when: { eventCount: { type: 'hugged', min: 1 } } } })]);
    expect(msgs(bad)).toContain('"hugged"');
    const ok = await load([rstate({ entry: { via: ['automatic'], when: { eventCount: { type: 'stress_high', min: 3 } } } })]);
    expect(ok.errors).toEqual([]);
  });
  it('unknown flags, defects and night-spec events are load errors', async () => {
    const r = await load([rstate({
      entry: { via: ['automatic'], when: { anyOf: [{ flagsAll: ['f1'] }, { defectsAny: ['d1'] }] } },
      unlocks: { synergies: [], activities: [], defectArcStages: [], nightEvents: [{ id: 'n', kind: 'visit', chance: 0.1, priority: 1, trigger: 'daily', framing: 'x', ignore: { event: 'hugged', severity: 'minor' } }] },
    })]);
    expect(msgs(r)).toContain('flags id "f1"');
    expect(msgs(r)).toContain('defects id "d1"');
    expect(msgs(r)).toContain('eventDeltas id "hugged"');
  });
});
