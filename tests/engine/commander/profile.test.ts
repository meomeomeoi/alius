import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import type { Registries } from '../../../src/content/types';
import {
  DESCRIPTORS, archetypeOf, commanderProfile, descriptor, poolSpent, validateCommanderSetup,
  type CommanderSetup,
} from '../../../src/engine/commander/profile';
import { TUNING } from '../../../src/engine/tuning';
import { createCampaign } from '../../../src/engine/state/create';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const body = (s: number, e: number, r: number) => ({ strength: s, endurance: e, reflexes: r });
const setup = (b = body(3, 3, 2), over: Partial<CommanderSetup> = {}): CommanderSetup => ({
  body: b, expression: 3, seasoning: 3, traits: { regular: [] }, ...over,
});
const errors = (c: CommanderSetup) => validateCommanderSetup(c, reg, { desireBondDefects: false });

describe('archetype', () => {
  // body sums 4, 5, 6, 7, 9, 10, 12, 13 (the last is reachable only through growth)
  it.each([
    [body(2, 1, 1), 'frail'], [body(2, 2, 1), 'slight'], [body(2, 2, 2), 'slight'], [body(3, 2, 2), 'average'],
    [body(3, 3, 3), 'average'], [body(4, 3, 3), 'fit'], [body(4, 4, 4), 'fit'], [body(5, 4, 4), 'hardened'],
  ])('archetype of %j is %s', (b, expected) => {
    expect(archetypeOf(b)).toBe(expected);
  });
});

describe('descriptors', () => {
  it('read 1 and 5 for every kind', () => {
    expect(descriptor('strength', 1)).toBe('Feeble');
    expect(descriptor('strength', 5)).toBe('Powerful');
    expect(descriptor('endurance', 1)).toBe('Fragile');
    expect(descriptor('endurance', 5)).toBe('Iron');
    expect(descriptor('reflexes', 1)).toBe('Sluggish');
    expect(descriptor('reflexes', 5)).toBe('Lightning');
    expect(descriptor('expression', 1)).toBe('Very feminine');
    expect(descriptor('expression', 5)).toBe('Very masculine');
    expect(descriptor('seasoning', 1)).toBe('Green');
    expect(descriptor('seasoning', 5)).toBe('Veteran');
    for (const list of Object.values(DESCRIPTORS)) expect(list).toHaveLength(5);
  });
});

describe('creation pool', () => {
  it('unspent points are valid', () => {
    expect(poolSpent(body(1, 1, 1))).toBe(0);
    expect(errors(setup(body(1, 1, 1)))).toEqual([]);
  });
  it('4/4/2 spends exactly 7 and is valid', () => {
    expect(poolSpent(body(4, 4, 2))).toBe(7);
    expect(errors(setup(body(4, 4, 2)))).toEqual([]);
  });
  it('a 5 at creation is rejected', () => {
    expect(errors(setup(body(5, 1, 1))).length).toBeGreaterThan(0);
  });
  it('spending 8 is rejected', () => {
    expect(poolSpent(body(4, 4, 3))).toBe(8);
    expect(errors(setup(body(4, 4, 3))).length).toBeGreaterThan(0);
  });
  it('expression 0 and seasoning 6 are rejected', () => {
    expect(errors(setup(body(3, 3, 2), { expression: 0 })).length).toBeGreaterThan(0);
    expect(errors(setup(body(3, 3, 2), { seasoning: 6 })).length).toBeGreaterThan(0);
  });
  it('a non-integer body stat is rejected', () => {
    expect(errors(setup(body(2.5, 1, 1))).length).toBeGreaterThan(0);
  });
  it('more than two regular traits or a repeated trait is rejected', () => {
    expect(errors(setup(body(3, 3, 2), { traits: { regular: ['a', 'a'] } })).length).toBeGreaterThan(0);
    expect(errors(setup(body(3, 3, 2), { traits: { regular: ['a', 'b', 'c'] } })).length).toBeGreaterThan(0);
  });
  it('tuning carries the spec numbers', () => {
    expect(TUNING.commander.pool).toBe(7);
    expect(TUNING.commander.creationMax).toBe(4);
    expect(TUNING.commander.defaults).toEqual({ body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3 });
  });
});

describe('commanderProfile', () => {
  it('fills defaults for a commander without P7 fields', () => {
    const s = createCampaign({ seed: 1, commanderName: 'Vale' });
    delete s.commander.body; delete s.commander.expression; delete s.commander.seasoning; delete s.commander.traits;
    const p = commanderProfile(s);
    expect(p.body).toEqual({ strength: 3, endurance: 3, reflexes: 2 });
    expect(p.expression).toBe(3);
    expect(p.seasoning).toBe(3);
    expect(p.traits).toEqual({ regular: [] });
    expect(p.archetype).toBe('average');
  });
});
