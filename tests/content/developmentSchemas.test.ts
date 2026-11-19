import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DESCRIBED_REGISTRIES, RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { CONTENT_GATED_REGISTRIES } from '../../src/engine/bonds/content';
import { axisEntry } from '../../src/engine/development/axes';
import { VALUE_AXES } from '../../src/engine/state/types';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Files = Partial<Record<'developmentAxes' | 'developmentRules' | 'habits' | 'memoryRules', unknown[]>>;
/** Loads the core pack plus a test pack; returns the loader's error messages. */
async function loadWith(files: Files): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'alius-p14b-'));
  await mkdir(join(dir, 'p'));
  const manifest = Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`]));
  await writeFile(join(dir, 'p', 'manifest.json'), JSON.stringify({ id: 'p14b_test', name: 'P14b test', version: '0.0.1', priority: 5, files: manifest }));
  for (const [k, v] of Object.entries(files)) await writeFile(join(dir, 'p', `${k}.json`), JSON.stringify(v));
  const r = await loadPacks(['content/core', join(dir, 'p')], async (p) => JSON.parse(await readFile(p, 'utf8')));
  return r.errors.map((e) => e.message);
}
const rule = (over: Record<string, unknown> = {}) => ({
  id: 't_rule', match: { kind: ['praised'], role: ['subject'] }, push: [{ axis: 'value:mercy', amount: 1 }], description: 'AUTHOR TO WRITE: a test rule.', ...over,
});

describe('the core pack (P14b)', () => {
  it('loads the three registries', () => {
    expect(reg.developmentAxes.size).toBe(13);
    expect(reg.developmentRules.size).toBe(16);
    expect(reg.habits.size).toBe(5);
  });

  it('every value axis and every bond field has an axis entry, and the wildcards exist', () => {
    for (const a of VALUE_AXES) expect(axisEntry(reg, `value:${a}`)?.kind).toBe('value');
    for (const b of ['attachment', 'desire', 'caretaker', 'lead_style']) expect(axisEntry(reg, `bond:${b}`)?.kind).toBe('bond');
    for (const k of ['taste', 'like', 'dislike']) expect(reg.developmentAxes.has(`${k}:.any`)).toBe(true);
    expect(axisEntry(reg, 'like:cooking')?.id).toBe('like:.any');
    expect(axisEntry(reg, 'bond:ownLimits')).toBeNull();
    expect(axisEntry(reg, 'value:greed')).toBeNull();
  });

  it('the registries are described and the texts are drafts', () => {
    for (const n of ['developmentAxes', 'developmentRules', 'habits'] as const) expect(DESCRIBED_REGISTRIES).toContain(n);
    for (const e of reg.developmentAxes.values()) for (const f of ['up', 'down', 'description']) expect(String(e[f]).startsWith('AUTHOR TO WRITE:')).toBe(true);
    for (const e of reg.habits.values()) expect(String(e.fallback).startsWith('AUTHOR TO WRITE:')).toBe(true);
  });

  it('developmentRules and habits are content-gated', () => {
    expect(CONTENT_GATED_REGISTRIES).toContain('developmentRules');
    expect(CONTENT_GATED_REGISTRIES).toContain('habits');
  });

  it('the seven event names are reserved', async () => {
    for (const t of ['appraisal_recorded', 'appraisal_revised', 'development_review', 'development_shift', 'development_moment', 'development_fact', 'habit_formed']) {
      expect(RESERVED_EVENT_TYPES).toContain(t);
    }
    const errs = await loadWith({ memoryRules: [{ id: 'dev_fact_rule', event: 'development_fact', kind: 'x', importance: 2, audience: 'subject', fallbackText: 'x' }] });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('eventDeltas appraisal rows are valid', () => {
    expect(reg.eventDeltas.get('commander_enforced')?.appraisal).toEqual({ wanted: 'no', initiator: 'actor', harm: 'minor', outcome: 'bad' });
    const rows = ['commander_enforced', 'threatened', 'coerced', 'protected', 'endangered', 'praised', 'insulted', 'comforted', 'physical_affection', 'accepted_advance', 'rejected_advance', 'granted_demand', 'refused_demand', 'shielded', 'overrode_her'];
    for (const id of rows) expect(reg.eventDeltas.get(id)?.appraisal, id).toBeDefined();
    expect([...reg.eventDeltas.values()].filter((e) => e.appraisal !== undefined)).toHaveLength(rows.length);
  });

  it('activities carry a reading and tags', () => {
    for (const id of ['train', 'rest', 'talk', 'medbay']) expect(reg.activities.get(id)?.appraisal).toEqual({ wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good' });
    expect(reg.activities.get('train')?.appraisalTags).toEqual(['training']);
    expect(reg.activities.get('talk')?.appraisalTags).toEqual(['talk']);
  });

  it('the glossary has the six entries', () => {
    for (const id of ['character_development', 'development_moment', 'development_fact', 'habit', 'development_hold', 'appraisal']) expect(reg.glossary.has(id), id).toBe(true);
  });
});

describe('content checks', () => {
  it('a well-formed rule loads', async () => {
    expect(await loadWith({ developmentRules: [rule(), rule({ id: 't_like', push: [{ axis: 'like:{tag}', amount: 0.5 }], match: { kind: ['activity:*'] } })] })).toEqual([]);
  });

  it('an unknown push axis is a content error', async () => {
    expect((await loadWith({ developmentRules: [rule({ push: [{ axis: 'value:greed', amount: 1 }] })] })).join('\n')).toMatch(/greed/);
  });

  it('a taste axis needs a tastes id', async () => {
    expect((await loadWith({ developmentRules: [rule({ push: [{ axis: 'taste:nope', amount: 1 }] })] })).join('\n')).toMatch(/taste:nope/);
  });

  it('bond:ownLimits is refused', async () => {
    expect((await loadWith({ developmentRules: [rule({ push: [{ axis: 'bond:ownLimits', amount: 1 }] })] })).join('\n')).toMatch(/ownLimits/);
    expect((await loadWith({ developmentAxes: [{ id: 'bond:own_limits', kind: 'bond', up: 'more', down: 'less', description: 'x' }] })).join('\n')).toMatch(/own_limits/);
    expect((await loadWith({ developmentAxes: [{ id: 'bond:publicity', kind: 'bond', up: 'more', down: 'less', description: 'x' }] })).length).toBeGreaterThan(0);
  });

  it('a rule names real event types, activities and contexts', async () => {
    expect((await loadWith({ developmentRules: [rule({ match: { kind: ['hugged'] } })] })).join('\n')).toMatch(/hugged/);
    expect((await loadWith({ developmentRules: [rule({ match: { kind: ['activity:nope'] } })] })).join('\n')).toMatch(/activity:nope/);
    expect(await loadWith({ developmentRules: [rule({ match: { kind: ['activity:train', 'dilemma:scapegoat'] } })] })).toEqual([]);
  });

  it('an unknown content tag on a rule is an error', async () => {
    expect((await loadWith({ developmentRules: [rule({ contentTags: ['nope'] })] })).join('\n')).toMatch(/nope/);
  });

  it('habits name real activities and regions', async () => {
    const h = (over: Record<string, unknown>) => ({ id: 't_habit', counter: { kind: 'activity', id: 'train' }, threshold: 5, fallback: 'AUTHOR TO WRITE: {name} did.', description: 'AUTHOR TO WRITE: x', ...over });
    expect(await loadWith({ habits: [h({})] })).toEqual([]);
    expect((await loadWith({ habits: [h({ counter: { kind: 'activity', id: 'nope' } })] })).join('\n')).toMatch(/nope/);
    expect((await loadWith({ habits: [h({ counter: { kind: 'region', id: 'nope' } })] })).join('\n')).toMatch(/nope/);
    expect((await loadWith({ habits: [h({ effect: { type: 'unit_xp', amount: 5, activityId: 'nope' } })] })).join('\n')).toMatch(/nope/);
  });
});
