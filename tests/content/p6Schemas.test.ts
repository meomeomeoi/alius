import { describe, it, expect } from 'vitest';
import { loadPacks } from '../../src/content/loader';
import {
  CorporationSchema, DefectSchema, DilemmaTemplateSchema, LoyaltySignSchema, WorldEffectSchema, isCostEffect,
} from '../../src/content/schemas';
import { REGISTRY_NAMES } from '../../src/content/types';
import { WORLD_EFFECT_TYPES } from '../../src/engine/world/types';
import { DILEMMA_CONTEXTS } from '../../src/engine/dilemma/types';
import { defect } from '../helpers/combatContent';

const option = (label: string, effects: unknown[]) => ({ label, effects });
const cost = { type: 'party_stress', amount: 5 };
const fixed = {
  title: 'T',
  setup: 'S',
  options: [option('A', [cost]), option('B', [{ type: 'resource', resource: 'credits', amount: -10 }])],
};
const tpl = { id: 'dil_x', scale: 'major', contexts: ['base'], fixed, generate: { brief: 'A brief.' } };

const corp = {
  id: 'corp', name: 'C', summary: 's', values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 },
  oversightStyle: 'o', playable: true, startingBonus: { text: 't', effects: [] },
};

describe('P6 schemas', () => {
  it('registers the loyaltySigns registry', () => {
    expect(REGISTRY_NAMES).toContain('loyaltySigns');
  });

  it('a generate block without a fixed block is rejected', () => {
    expect(DilemmaTemplateSchema.safeParse(tpl).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, fixed: undefined }).success).toBe(false);
    // a flavor fixed block is not a fallback
    const flavor = { title: 'T', setup: 'S', options: [option('OK', [])] };
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, flavor: true, fixed: flavor }).success).toBe(false);
    // fewer than two options
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, fixed: { ...fixed, options: [fixed.options[0]] } }).success).toBe(false);
  });

  it('flagPerOption needs enough allowed flags', () => {
    const base = { ...tpl, optionCount: 3, constraints: { flagPerOption: true } };
    expect(DilemmaTemplateSchema.safeParse({ ...base, allowedFlags: ['a', 'b'] }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...base }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...base, allowedFlags: ['a', 'b', 'c'] }).success).toBe(true);
    // the default option count is 3
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, constraints: { flagPerOption: true }, allowedFlags: ['a', 'b'] }).success).toBe(false);
  });

  it('a base template may not carry carried_supplies, party_hp or loot', () => {
    for (const fx of [
      { type: 'carried_supplies', amount: -1 },
      { type: 'party_hp', pct: -10 },
      { type: 'loot', tableId: 'loot_standard' },
    ]) {
      const bad = { ...tpl, fixed: { ...fixed, options: [option('A', [cost, fx]), fixed.options[1]] } };
      expect(DilemmaTemplateSchema.safeParse(bad).success, fx.type).toBe(false);
      const ok = { ...bad, contexts: ['expedition_event'] };
      expect(DilemmaTemplateSchema.safeParse(ok).success, `${fx.type} in an expedition event`).toBe(true);
    }
  });

  it('an unknown context is rejected', () => {
    expect(DILEMMA_CONTEXTS).toEqual(['expedition_event', 'base', 'mission_outcome', 'defect_arc', 'director']);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, contexts: ['base', 'tavern'] }).success).toBe(false);
    for (const c of DILEMMA_CONTEXTS) expect(DilemmaTemplateSchema.safeParse({ ...tpl, contexts: [c] }).success, c).toBe(true);
  });

  it('optionCount is 2 to 4 and requiredRefs.units 1 to 4', () => {
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, optionCount: 1 }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, optionCount: 5 }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, optionCount: 2 }).success).toBe(true);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, requiredRefs: { units: 0 } }).success).toBe(false);
    expect(DilemmaTemplateSchema.safeParse({ ...tpl, requiredRefs: { units: 2, factions: ['vesper'] } }).success).toBe(true);
  });

  it('thread_flag needs the thread namespace', () => {
    expect(WORLD_EFFECT_TYPES).toContain('thread_flag');
    const fx = { type: 'thread_flag', threadId: 't1', flagId: 'thread:t1:saw_it', description: 'Saw it.' };
    expect(WorldEffectSchema.safeParse(fx).success).toBe(true);
    expect(WorldEffectSchema.safeParse({ ...fx, flagId: 'saw_it' }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...fx, flagId: 'thread:t2:saw_it' }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...fx, flagId: 'thread:t1:Saw It' }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...fx, description: 'x'.repeat(121) }).success).toBe(false);
    expect(WorldEffectSchema.safeParse({ ...fx, bogus: 1 }).success).toBe(false);
    expect(isCostEffect(WorldEffectSchema.parse(fx))).toBe(false);
  });

  it('a corporation without leash is rejected', () => {
    expect(CorporationSchema.safeParse(corp).success).toBe(false);
    expect(CorporationSchema.safeParse({ ...corp, leash: { weekly: 3, approval: 0.7 } }).success).toBe(true);
    expect(CorporationSchema.safeParse({ ...corp, leash: { weekly: 6, approval: 0.7 } }).success).toBe(false);
    expect(CorporationSchema.safeParse({ ...corp, leash: { weekly: 3, approval: 1.2 } }).success).toBe(false);
    expect(CorporationSchema.safeParse({ ...corp, leash: { weekly: 3, approval: 0.7, extra: 1 } }).success).toBe(false);
  });

  it('defect leash, desertionMod and arcFlag are bounded', () => {
    expect(DefectSchema.safeParse(defect).success).toBe(true);
    const ok = { ...defect, leash: { costMult: 2, failChance: 0.25 }, desertionMod: 0.1, arcFlag: 'arc_raised' };
    expect(DefectSchema.safeParse(ok).success).toBe(true);
    expect(DefectSchema.safeParse({ ...ok, leash: { costMult: 5 } }).success).toBe(false);
    expect(DefectSchema.safeParse({ ...ok, leash: { costMult: 1, failChance: 1.5 } }).success).toBe(false);
    expect(DefectSchema.safeParse({ ...ok, desertionMod: 0.5 }).success).toBe(false);
    expect(DefectSchema.safeParse({ ...ok, desertionMod: -0.31 }).success).toBe(false);
  });

  it('a mutiny sign needs a level', () => {
    const sign = { id: 'sign_m', about: 'mutiny', kind: 'fact', text: 'Something.' };
    expect(LoyaltySignSchema.safeParse(sign).success).toBe(false);
    expect(LoyaltySignSchema.safeParse({ ...sign, level: 1 }).success).toBe(true);
    expect(LoyaltySignSchema.safeParse({ ...sign, level: 3 }).success).toBe(false);
    expect(LoyaltySignSchema.safeParse({ ...sign, about: 'doubt' }).success).toBe(true);
    expect(LoyaltySignSchema.safeParse({ ...sign, about: 'doubt', kind: 'shout' }).success).toBe(false);
    expect(LoyaltySignSchema.safeParse({ ...sign, level: 1, text: 'x'.repeat(201) }).success).toBe(false);
  });
});

// ---- cross references through the loader -------------------------------------------------------------------------

const memFetch = (files: Record<string, unknown>) => async (path: string) => {
  if (!(path in files)) throw new Error(`404 ${path}`);
  return files[path];
};
async function errorsOf(files: Record<string, unknown[]>) {
  const out: Record<string, unknown> = {
    'p/manifest.json': { id: 'p', name: 'P', version: '1', priority: 0, files: Object.fromEntries(Object.keys(files).map((k) => [k, `${k}.json`])) },
  };
  for (const [k, v] of Object.entries(files)) out[`p/${k}.json`] = v;
  return (await loadPacks(['p'], memFetch(out))).errors;
}

describe('P6 content refs', () => {
  it('unknown allowedFlags, requiredRefs and arcFlag ids are reported as broken references', async () => {
    const errs = await errorsOf({
      dilemmaTemplates: [{
        ...tpl, id: 'dil_refs', optionCount: 3, allowedFlags: ['ghost_flag1', 'ghost_flag2', 'ghost_flag3'],
        requiredRefs: { factions: ['ghost_corp'], regions: ['ghost_region'], clocks: ['ghost_clock'] },
      }],
      defects: [{ ...defect, id: 'd_ghost', arcFlag: 'ghost_arc_flag' }],
    });
    const at = (file: string, path: string) => errs.find((e) => e.file === file && e.path === path);
    const wanted: Array<[string, string, string]> = [
      ['dilemmaTemplates.json', '[0].allowedFlags[0]', 'flags'],
      ['dilemmaTemplates.json', '[0].allowedFlags[2]', 'flags'],
      ['dilemmaTemplates.json', '[0].requiredRefs.factions[0]', 'corporations'],
      ['dilemmaTemplates.json', '[0].requiredRefs.regions[0]', 'regions'],
      ['dilemmaTemplates.json', '[0].requiredRefs.clocks[0]', 'clocks'],
      ['defects.json', '[0].arcFlag', 'flags'],
    ];
    for (const [file, path, registry] of wanted) {
      expect(at(file, path)?.message, `${file} ${path}`).toContain(`unknown ${registry} id`);
    }
  });
});
