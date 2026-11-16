import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { EventDeltaSchema, MemoryRuleSchema } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const rule = (over: Record<string, unknown> = {}) => ({
  id: 't_rule', event: 'rations_set', text: 'Rations are now {mode}.', importance: 2, about: 'world', audience: 'squad', spread: 'none', tags: [], ...over,
});

/** Loads the core pack with a test pack that adds memory rules; returns the loader's error messages. */
async function loadWith(rules: unknown[]): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'alius-p3b-'));
  await mkdir(join(dir, 'p'));
  await writeFile(join(dir, 'p', 'manifest.json'), JSON.stringify({ id: 'p3b_test', name: 'P3b test', version: '0.0.1', priority: 5, files: { memoryRules: 'memoryRules.json' } }));
  await writeFile(join(dir, 'p', 'memoryRules.json'), JSON.stringify(rules));
  const r = await loadPacks(['content/core', join(dir, 'p')], async (p) => JSON.parse(await readFile(p, 'utf8')));
  return r.errors.map((e) => e.message);
}

describe('memoryRules registry', () => {
  it('is a registry and core ships the file', () => {
    expect((REGISTRY_NAMES as readonly string[]).includes('memoryRules')).toBe(true);
    expect(reg.memoryRules).toBeInstanceOf(Map);
  });

  it('a rule parses', () => {
    expect(MemoryRuleSchema.safeParse(rule()).success).toBe(true);
    expect(MemoryRuleSchema.safeParse(rule({ when: { outcome: 'failed', dead: true }, audience: ['party', 'squad'], hiddenFromCommander: true })).success).toBe(true);
  });

  it('a rule for an event without a resolver is a content error', async () => {
    expect(await loadWith([rule()])).toEqual([]);
    expect((await loadWith([rule({ event: 'no_such_event' })])).join('\n')).toMatch(/no resolver/);
  });

  it('an unknown {var}, when key, about or audience group is a content error', async () => {
    expect((await loadWith([rule({ text: 'Rations are {mood}.' })])).join('\n')).toMatch(/\{mood\}/);
    expect((await loadWith([rule({ when: { color: 'red' } })])).join('\n')).toMatch(/color/);
    expect((await loadWith([rule({ about: 'everyone' })])).join('\n')).toMatch(/about/);
    expect((await loadWith([rule({ audience: 'everyone' })])).join('\n')).toMatch(/audience/);
    expect((await loadWith([rule({ audience: ['squad', 'nobody'] })])).join('\n')).toMatch(/nobody/);
    // the groups and vars of a resolver are accepted
    expect(await loadWith([rule({ event: 'vote_overruled', text: '{names} voted against.', about: 'against', audience: ['against', 'squad'], when: { against: true } })])).toEqual([]);
  });

  it('spread is a closed vocabulary; importance is 1–5', () => {
    for (const spread of ['none', 'slow', 'fast']) expect(MemoryRuleSchema.safeParse(rule({ spread })).success).toBe(true);
    expect(MemoryRuleSchema.safeParse(rule({ spread: 'medium' })).success).toBe(false);
    expect(MemoryRuleSchema.safeParse(rule({ importance: 0 })).success).toBe(false);
    expect(MemoryRuleSchema.safeParse(rule({ importance: 6 })).success).toBe(false);
  });

  it('eventDeltas rows may carry a journal phrase', () => {
    const row = { trust: 1 };
    const base = { id: 'praised', cause: 'You praised her', rows: { minor: row, moderate: row, major: row, extreme: row } };
    expect(EventDeltaSchema.safeParse({ ...base, journal: 'the commander praised her' }).success).toBe(true);
    expect(EventDeltaSchema.safeParse(base).success).toBe(true);
    expect(EventDeltaSchema.safeParse({ ...base, journal: 5 }).success).toBe(false);
  });
});
