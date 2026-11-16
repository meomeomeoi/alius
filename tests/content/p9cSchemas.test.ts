import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import { DeviceAccessRuleSchema, DESCRIBED_REGISTRIES } from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

const rule = (over: Record<string, unknown> = {}) => ({
  id: 'x', level: 1, name: 'Decor', description: 'D', anyOf: [{ tiers: ['close'], minLeadRank: 1 }], ...over,
});
const parse = (v: unknown) => DeviceAccessRuleSchema.safeParse(v);
const issuePaths = (v: unknown): string[] => {
  const r = parse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

/** Loads the core pack with its deviceAccessRules replaced; returns the loader's errors. */
async function loadWith(rules: unknown[]): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'alius-p9c-'));
  await mkdir(join(dir, 'p'));
  await writeFile(join(dir, 'p', 'manifest.json'), JSON.stringify({ id: 'p9c_test', name: 'P9c test', version: '0.0.1', priority: 5, files: { deviceAccessRules: 'deviceAccessRules.json' } }));
  await writeFile(join(dir, 'p', 'deviceAccessRules.json'), JSON.stringify(rules));
  const r = await loadPacks(['content/core', join(dir, 'p')], async (p) => JSON.parse(await readFile(p, 'utf8')));
  return r.errors.map((e) => e.message);
}

describe('P9c registries: deviceAccessRules', () => {
  it('is a registry, described, with one rule per level 1 to 4', () => {
    expect((REGISTRY_NAMES as readonly string[]).includes('deviceAccessRules')).toBe(true);
    expect((DESCRIBED_REGISTRIES as readonly string[]).includes('deviceAccessRules')).toBe(true);
    const levels = [...reg.deviceAccessRules.values()].map((e) => Number(e.level)).sort();
    expect(levels).toEqual([1, 2, 3, 4]);
  });

  it('a rule needs at least one branch', () => {
    expect(parse(rule()).success).toBe(true);
    expect(issuePaths(rule({ anyOf: [] }))).toContain('anyOf');
  });

  it('the level is 1 to 4', () => {
    expect(parse(rule({ level: 0 })).success).toBe(false);
    expect(parse(rule({ level: 5 })).success).toBe(false);
  });

  it('editLines need {text}', () => {
    expect(parse(rule({ level: 4, editLines: ['{text} — {name} added this.'] })).success).toBe(true);
    expect(issuePaths(rule({ level: 4, editLines: ['No placeholder.'] }))).toContain('editLines.0');
  });

  it('tiers are romantic or close only', () => {
    expect(parse(rule({ anyOf: [{ tiers: ['friend'] }] })).success).toBe(false);
  });

  it('states must name relationshipStates', async () => {
    const errors = await loadWith([
      { id: 'bad_states', level: 1, name: 'D', description: 'D', anyOf: [{ states: ['no_such_state'] }] },
    ]);
    expect(errors.some((m) => m.includes('no_such_state'))).toBe(true);
  });

  it('two rules for one level are refused', async () => {
    const errors = await loadWith([{ id: 'dup', level: 2, name: 'Dup', description: 'D', anyOf: [{ minLeadRank: 1 }] }]);
    expect(errors.some((m) => /level 2/.test(m))).toBe(true);
  });
});
