import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import { CommanderTraitSchema, TraitEffectSchema } from '../../src/content/schemas';
import type { Entry, Registries } from '../../src/content/types';
import { validateCommanderSetup, type CommanderSetup } from '../../src/engine/commander/profile';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const trait = (over: Record<string, unknown> = {}) => ({
  id: 't', name: 'T', kind: 'regular', description: 'D', upside: 'U', downside: 'W', effects: [], ...over,
});
const setup = (regular: string[], special?: string): CommanderSetup => ({
  body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular, ...(special ? { special } : {}) },
});
const errors = (c: CommanderSetup, r: Registries = reg, opts = { desireBondDefects: false }) => validateCommanderSetup(c, r, opts);
/** The core registry plus extra trait entries. */
const withTraits = (...extra: Array<Record<string, unknown>>): Registries => ({
  ...reg, commanderTraits: new Map([...reg.commanderTraits, ...extra.map((t) => [String(t.id), t as Entry] as const)]),
});

describe('CommanderTraitSchema', () => {
  it('a plain entry parses', () => {
    expect(CommanderTraitSchema.safeParse(trait({ effects: [{ type: 'night_slot' }], hooks: ['quiet_night'], exclusiveWith: ['x'] })).success).toBe(true);
  });

  it('an unknown effect type is rejected', () => {
    expect(CommanderTraitSchema.safeParse(trait({ effects: [{ type: 'free_lunch' }] })).success).toBe(false);
    expect(TraitEffectSchema.safeParse({ type: 'night_slot', extra: 1 }).success).toBe(false);
  });

  it('effect shapes are checked', () => {
    const ok = (e: unknown) => TraitEffectSchema.safeParse(e).success;
    expect(ok({ type: 'social_rank', stat: 'empathy', rank: 2 })).toBe(true);
    expect(ok({ type: 'social_rank', stat: 'empathy', rank: 6 })).toBe(false);
    expect(ok({ type: 'starting_trust', amount: -10, ifValue: { axis: 'corporate', sign: '-' } })).toBe(true);
    expect(ok({ type: 'social_growth', stat: 'cunning', mult: 1.5 })).toBe(true);
    expect(ok({ type: 'social_growth', stat: 'cunning' })).toBe(false);
    expect(ok({ type: 'relation_event_mult', event: 'lied_detected', mult: 1.5, ifTrigger: 'lies' })).toBe(true);
    expect(ok({ type: 'platonic_threshold', states: ['confidant'], pct: 15 })).toBe(true);
    expect(ok({ type: 'platonic_threshold', states: [], pct: 15 })).toBe(false);
    expect(ok({ type: 'activity_cost', activityId: 'medbay', resource: 'supplies', amount: 1 })).toBe(true);
    expect(ok({ type: 'unlock_state', stateId: 'sworn' })).toBe(true);
  });

  it('kind must be regular or special', () => {
    expect(CommanderTraitSchema.safeParse(trait({ kind: 'epic' })).success).toBe(false);
  });
});

describe('core traits', () => {
  it('core traits load with no errors: eight regular and one special', () => {
    const all = [...reg.commanderTraits.values()];
    expect(all.filter((t) => t.kind === 'regular').map((t) => t.id).sort()).toEqual([
      'bookish', 'corporate_polish', 'field_medic', 'insomniac', 'old_wound', 'pretty_face', 'silver_tongue', 'street_raised',
    ]);
    expect(all.filter((t) => t.kind === 'special').map((t) => t.id)).toEqual(['vow_of_distance']);
    for (const t of all) {
      expect(String(t.upside).length, t.id).toBeGreaterThan(0);
      expect(String(t.downside).length, t.id).toBeGreaterThan(0);
      expect(String(t.description).length, t.id).toBeGreaterThan(0);
    }
  });

  it('exclusive pairs are symmetric', () => {
    for (const t of reg.commanderTraits.values()) {
      for (const other of (t.exclusiveWith as string[] | undefined) ?? []) {
        expect((reg.commanderTraits.get(other)?.exclusiveWith as string[] | undefined) ?? [], `${t.id} / ${other}`).toContain(t.id);
      }
    }
  });
});

describe('validateCommanderSetup with traits', () => {
  it('three regular traits are rejected', () => {
    expect(errors(setup(['insomniac', 'old_wound', 'bookish']))).toEqual([expect.stringMatching(/At most 2 regular traits/)]);
  });

  it('a special id in regular is rejected, and a regular id as special', () => {
    expect(errors(setup(['vow_of_distance']))).toEqual([expect.stringMatching(/"vow_of_distance" is not a regular trait/)]);
    expect(errors(setup([], 'insomniac'))).toEqual([expect.stringMatching(/"insomniac" is not a special trait/)]);
  });

  it('an unknown trait id is rejected', () => {
    expect(errors(setup(['no_such_trait']))).toEqual([expect.stringMatching(/Unknown trait "no_such_trait"/)]);
    expect(errors(setup([], 'no_such_special'))).toEqual([expect.stringMatching(/Unknown trait "no_such_special"/)]);
  });

  it('two exclusive traits are rejected, in either order', () => {
    const r = withTraits(trait({ id: 'a', exclusiveWith: ['b'] }), trait({ id: 'b', exclusiveWith: ['a'] }));
    expect(errors(setup(['a', 'b']), r)).toEqual([expect.stringMatching(/"a" and "b" exclude each other/)]);
    expect(errors(setup(['b', 'a']), r)).toHaveLength(1);
    expect(errors(setup(['a']), r)).toEqual([]);
  });

  it('an exclusion reaches the special trait too', () => {
    const r = withTraits(trait({ id: 'sp', kind: 'special', exclusiveWith: ['insomniac'] }));
    expect(errors(setup(['insomniac'], 'sp'), r)).toHaveLength(1);
  });

  it('requiresSettings is honoured', () => {
    const r = withTraits(trait({ id: 'bond', requiresSettings: { desireBondDefects: true } }));
    expect(errors(setup(['bond']), r, { desireBondDefects: false })).toEqual([expect.stringMatching(/needs the Desire\/Bond setting/)]);
    expect(errors(setup(['bond']), r, { desireBondDefects: true })).toEqual([]);
  });

  it('every core trait alone, and a special with two regulars, is valid', () => {
    for (const id of ['insomniac', 'old_wound', 'silver_tongue', 'pretty_face', 'bookish', 'field_medic']) expect(errors(setup([id])), id).toEqual([]);
    expect(errors(setup(['insomniac', 'old_wound'], 'vow_of_distance'))).toEqual([]);
  });
});
