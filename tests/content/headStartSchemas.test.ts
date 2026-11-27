import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';
import { rememberEvents } from '../../src/engine/memory/remember';
import { campaign, loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const moment = (over: Record<string, unknown> = {}) => ({
  id: 't_moment', sign: 'positive', eventDelta: { type: 'listened', severity: 'minor', actor: 'commander' }, importance: 2,
  fallback: 'AUTHOR TO WRITE: {name} remembers a quiet hour.', description: 'AUTHOR TO WRITE: a quiet hour.', ...over,
});

/** Loads the core pack with a test pack that adds head start moments; returns the loader's error messages. */
async function loadWith(entries: unknown[]): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'alius-p11b-'));
  await mkdir(join(dir, 'p'));
  await writeFile(join(dir, 'p', 'manifest.json'), JSON.stringify({ id: 'p11b_test', name: 'P11b test', version: '0.0.1', priority: 5, files: { headStartMoments: 'headStartMoments.json' } }));
  await writeFile(join(dir, 'p', 'headStartMoments.json'), JSON.stringify(entries));
  const r = await loadPacks(['content/core', join(dir, 'p')], async (p) => JSON.parse(await readFile(p, 'utf8')));
  return r.errors.map((e) => e.message);
}

describe('headStartMoments registry (P11b)', () => {
  it('the core pack loads headStartMoments', () => {
    expect((REGISTRY_NAMES as readonly string[]).includes('headStartMoments')).toBe(true);
    expect(reg.headStartMoments).toBeInstanceOf(Map);
    expect(reg.headStartMoments.size).toBe(27); // ten remembered moments and, since P15, ten probe-like ones (one per probe axis), and P15b's seven
  });

  it("the draft kinds are the spec's", () => {
    const plain = [...reg.headStartMoments.values()].filter((e) => !((e.tags as string[] | undefined) ?? []).includes('probe'));
    expect(plain.map((e) => e.id).sort()).toEqual([
      'cold_shoulder', 'commander_mistake', 'covered_for_her', 'first_argument', 'learned_the_crime', 'night_talk', 'rule_reminder',
      'shared_meal', 'small_favour', 'sparring_bout',
    ]);
    const req = (id: string) => reg.headStartMoments.get(id)!.requires as { minDays?: number; knowsCrime?: boolean } | undefined;
    expect(req('night_talk')?.minDays).toBe(7);
    expect(req('covered_for_her')?.minDays).toBe(14);
    expect(req('learned_the_crime')?.knowsCrime).toBe(true);
    for (const e of reg.headStartMoments.values()) {
      expect(String(e.fallback).startsWith('AUTHOR TO WRITE:')).toBe(true);
      expect(String(e.description).startsWith('AUTHOR TO WRITE:')).toBe(true);
    }
    for (const e of plain) expect(e.axis).toBeUndefined();
  });

  it('the core carries one probe moment for each probe axis, tagged probe and naming its axis (P15, spec 15.14)', () => {
    const probes = [...reg.headStartMoments.values()].filter((e) => ((e.tags as string[] | undefined) ?? []).includes('probe'));
    expect(probes.map((e) => e.axis).sort()).toEqual([...reg.probeAxes.keys()].sort());
    for (const e of probes) {
      expect((e.tags as string[]).includes('head_start')).toBe(true);
      expect(e.sign).toBe('any');
      expect(String(e.fallback)).toContain('{name}');
    }
  });

  it('a probe moment needs an axis that exists, and only a probe moment has one', async () => {
    expect((await loadWith([moment({ tags: ['head_start', 'probe'] })])).join('\n')).toMatch(/axis/);
    expect((await loadWith([moment({ tags: ['head_start', 'probe'], axis: 'no_such_axis' })])).join('\n')).toMatch(/no_such_axis/);
    expect((await loadWith([moment({ axis: 'space' })])).join('\n')).toMatch(/axis/);
    expect(await loadWith([moment({ tags: ['head_start', 'probe'], axis: 'space' })])).toEqual([]);
  });

  it('a well-formed entry loads', async () => {
    expect(await loadWith([moment()])).toEqual([]);
    expect(await loadWith([moment({ requires: { values: { mercy: '+' }, knowsCrime: false, minDays: 14 }, tags: ['x'] })])).toEqual([]);
  });

  it('an unknown eventDelta type is a content error', async () => {
    expect((await loadWith([moment({ eventDelta: { type: 'hugged', severity: 'minor', actor: 'commander' } })])).join('\n')).toMatch(/hugged/);
  });

  it('an unknown value axis in requires is a content error', async () => {
    expect((await loadWith([moment({ requires: { values: { bravery: '+' } } })])).join('\n')).toMatch(/bravery/);
  });

  it('fallback over 240 characters is rejected', async () => {
    expect((await loadWith([moment({ fallback: 'x'.repeat(241) })])).join('\n')).toMatch(/fallback|240/);
    expect(await loadWith([moment({ fallback: 'x'.repeat(240) })])).toEqual([]);
  });
});

describe('remembered moments (P11b)', () => {
  const ANN = 'unit_ann';
  it('head_start_moment writes a fact with the rule of its importance', () => {
    const s = campaign(reg, 2);
    const nextId = s.memory.nextId;
    const before = s.memory.facts.length;
    rememberEvents(s, [{ type: 'head_start_moment', unitId: ANN, kind: 'shared_meal', text: 'Soup at 0200.', importance: 3 }], reg);
    const added = s.memory.facts.slice(before);
    expect(added).toHaveLength(1);
    const f = added[0];
    expect(f.about).toEqual([ANN]);
    expect(f.knownBy).toEqual([ANN]);
    expect(f.importance).toBe(3);
    expect(f.tags).toEqual(['head_start', 'hs_shared_meal']); // the rule's tag and the moment's own
    expect(f.text).toBe('Soup at 0200.');
    expect(f.spread).toBeUndefined();
    expect(f.hiddenFromCommander).toBeUndefined();
    expect(f.id).toMatch(/^fr/);
    expect(s.memory.nextId).toBe(nextId);
  });

  it('every importance 1…5 has its rule', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const s = campaign(reg, 2);
      const before = s.memory.facts.length;
      rememberEvents(s, [{ type: 'head_start_moment', unitId: ANN, kind: 'shared_meal', text: 'A day.', importance: n }], reg);
      expect(s.memory.facts.slice(before).map((f) => f.importance)).toEqual([n]);
    }
  });

  it('an unknown unit or an empty text writes nothing', () => {
    const s = campaign(reg, 2);
    const before = s.memory.facts.length;
    rememberEvents(s, [
      { type: 'head_start_moment', unitId: 'unit_nobody', kind: 'shared_meal', text: 'A day.', importance: 2 },
      { type: 'head_start_moment', unitId: ANN, kind: 'shared_meal', text: '', importance: 2 },
    ], reg);
    expect(s.memory.facts).toHaveLength(before);
  });

  it('head_start_applied has no rule', () => {
    const s = campaign(reg, 2);
    const before = s.memory.facts.length;
    rememberEvents(s, [{ type: 'head_start_applied', days: 14, units: [ANN] }], reg);
    expect(s.memory.facts).toHaveLength(before);
  });
});
