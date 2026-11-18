import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import type { Entry, Registries } from '../../src/content/types';
import { traitBlockReason, validateCommanderSetup, type CommanderSetup } from '../../src/engine/commander/profile';
import { hasTraitEffect } from '../../src/engine/commander/traits';
import { Rng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import { seedSpecialTraits, specialOf } from '../../src/engine/special';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, loadCore, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const setup = (regular: string[], special?: string): CommanderSetup => ({
  body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular, ...(special ? { special } : {}) },
});
const opts = { desireBondDefects: false };
const build = (c: CommanderSetup): CampaignState => {
  const r = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann')], commander: c }, reg, { ...opts, seed: 5 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};

describe('special traits: validation', () => {
  it('two special traits are rejected', () => {
    const errs = validateCommanderSetup(setup(['web_of_debts'], 'secret_frequency'), reg, opts);
    expect(errs.join('|')).toContain('is not a regular trait');
  });

  it('bloom_paranoia and insomniac exclude each other', () => {
    expect(traitBlockReason(reg, { regular: ['insomniac'] }, 'bloom_paranoia', opts)).toMatch(/^Excluded by /);
    expect(traitBlockReason(reg, { regular: [], special: 'bloom_paranoia' }, 'insomniac', opts)).toMatch(/^Excluded by /);
    expect(validateCommanderSetup(setup(['insomniac'], 'bloom_paranoia'), reg, opts).join('|')).toContain('exclude each other');
  });

  it('web_of_debts needs a rival corporation', () => {
    const alone: Registries = { ...reg, corporations: new Map([['vesper', reg.corporations.get('vesper') as Entry]]) };
    const o = { ...opts, corporationId: 'vesper' };
    expect(traitBlockReason(alone, { regular: [] }, 'web_of_debts', o)).toBe('Needs a rival corporation in the world.');
    expect(validateCommanderSetup(setup([], 'web_of_debts'), alone, o).join('|')).toContain('Needs a rival corporation in the world.');
    expect(traitBlockReason(reg, { regular: [] }, 'web_of_debts', o)).toBeNull();
    // no corporation chosen yet: allowed
    expect(traitBlockReason(alone, { regular: [] }, 'web_of_debts', opts)).toBeNull();
  });

  it('the three special traits are valid alone and carry a WHAT THIS CHANGES list', () => {
    for (const id of ['secret_frequency', 'bloom_paranoia', 'web_of_debts']) {
      expect(validateCommanderSetup(setup([], id), reg, { ...opts, corporationId: 'vesper' }), id).toEqual([]);
      const t = reg.commanderTraits.get(id)!;
      expect(t.kind).toBe('special');
      const changes = t.changes as string[];
      expect(changes.length, id).toBeGreaterThanOrEqual(1);
      for (const line of changes) expect(line.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('seedSpecialTraits', () => {
  it('seed sets the flag and the state blocks', () => {
    const s = build(setup([], 'bloom_paranoia'));
    expect(s.commander.flags).toContain('commander_bloom_exposed');
    expect(s.special?.paranoia).toBeDefined();
    expect(s.special?.frequency).toBeUndefined();
    expect(hasTraitEffect(s, reg, 'paranoia')).toBe(true);
    const before = structuredClone(s);
    const d = structuredClone(s);
    seedSpecialTraits(d, { registries: reg, rng: new Rng(d.rng) });
    expect(d).toEqual(before);
  });

  it('each trait seeds only its own block', () => {
    expect(Object.keys(build(setup([], 'secret_frequency')).special ?? {})).toEqual(['frequency']);
    expect(Object.keys(build(setup([], 'web_of_debts')).special ?? {})).toEqual(['debts']);
  });

  it('no special trait: no special block', () => {
    expect(campaign(reg, 2).special).toBeUndefined();
    expect(build(setup(['insomniac'])).special).toBeUndefined();
  });

  it('specialOf creates the block on first write', () => {
    const s = campaign(reg, 1);
    expect(specialOf(s)).toEqual({});
    expect(s.special).toEqual({});
  });
});

describe('unlock_order reference', () => {
  it('an unknown orderId is a load error naming the path', async () => {
    const bad = { id: 'x', name: 'X', kind: 'special', description: 'D', upside: 'U', downside: 'W', effects: [{ type: 'unlock_order', orderId: 'no_such_order' }] };
    const r = await loadPacks(['content/core'], async (p) => {
      const v = JSON.parse(await readFile(p, 'utf8'));
      return p.endsWith('commanderTraits.json') ? [...v, bad] : v;
    });
    expect(r.errors.map((e) => `${e.path}: ${e.message}`).join('|')).toMatch(/effects\[0\]\.orderId.*orders id "no_such_order"/);
  });

  it('the new effect types parse', async () => {
    const { TraitEffectSchema } = await import('../../src/content/schemas');
    for (const e of [{ type: 'frequency' }, { type: 'paranoia' }, { type: 'debts' }, { type: 'commander_flag', flag: 'f' }, { type: 'unlock_order', orderId: 'o' }]) {
      expect(TraitEffectSchema.safeParse(e).success, e.type).toBe(true);
    }
    expect(TraitEffectSchema.safeParse({ type: 'commander_flag' }).success).toBe(false);
  });
});
