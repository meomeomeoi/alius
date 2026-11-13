import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../src/content/loader';
import {
  DispositionLevelSchema, StanceEffectSchema, StanceEntrySchema, WorldOptionEffectSchema, WorldOptionSchema, WorldPresetSchema,
} from '../../src/content/schemas';
import { REGISTRY_NAMES, type Registries } from '../../src/content/types';

let reg: Registries;
beforeAll(async () => {
  const r = await loadPacks(['content/core'], async (p) => JSON.parse(await readFile(p, 'utf8')));
  expect(r.errors).toEqual([]);
  reg = r.registries;
});

describe('world option registries in core', () => {
  it('core loads the four registries without errors', () => {
    for (const n of ['worldOptions', 'dispositionLevels', 'stanceEffects', 'worldPresets']) expect(REGISTRY_NAMES).toContain(n);
    expect([...reg.worldOptions.keys()]).toEqual(['gender_norms', 'offspec_stigma', 'oversight', 'bloom_horror', 'tone', 'disposition']);
    expect([...reg.dispositionLevels.keys()]).toEqual(['kind', 'guarded', 'prickly', 'volatile', 'hazardous']);
    expect([...reg.worldPresets.keys()].sort()).toEqual(['brutal', 'gentle', 'standard']);
    expect(reg.stanceEffects.size).toBeGreaterThanOrEqual(8);
  });

  it('the spec marks: live only on bloom_horror, squadStance on gender_norms and offspec_stigma, neutral defaults', () => {
    const o = (id: string) => reg.worldOptions.get(id)!;
    expect([...reg.worldOptions.values()].filter((x) => x.live === true).map((x) => x.id)).toEqual(['bloom_horror']);
    expect([...reg.worldOptions.values()].filter((x) => x.squadStance === true).map((x) => x.id)).toEqual(['gender_norms', 'offspec_stigma']);
    expect(['gender_norms', 'offspec_stigma', 'oversight', 'bloom_horror', 'tone', 'disposition'].map((id) => o(id).default))
      .toEqual(['indifferent', 'tolerated', 'standard', 'restrained', 'grim', 'guarded']);
    const choices = (id: string) => (o(id).choices as Array<{ id: string }>).map((c) => c.id);
    expect(choices('gender_norms')).toEqual(['indifferent', 'corporate_machismo', 'inverted']);
    expect(choices('offspec_stigma')).toEqual(['tolerated', 'scorned', 'hunted']);
    expect(choices('oversight')).toEqual(['lenient', 'standard', 'brutal']);
    expect(choices('bloom_horror')).toEqual(['restrained', 'graphic']);
    expect(choices('tone')).toEqual(['grim_hope', 'grim', 'bleak']);
    expect(choices('disposition')).toEqual(['kind', 'guarded', 'prickly', 'volatile', 'hazardous']);
  });

  it('the presets are the spec presets', () => {
    expect(reg.worldPresets.get('gentle')!.choices).toEqual({
      gender_norms: 'indifferent', offspec_stigma: 'tolerated', oversight: 'lenient', bloom_horror: 'restrained', tone: 'grim_hope', disposition: 'kind',
    });
    expect(reg.worldPresets.get('standard')!.choices).toEqual({
      gender_norms: 'indifferent', offspec_stigma: 'tolerated', oversight: 'standard', bloom_horror: 'restrained', tone: 'grim', disposition: 'guarded',
    });
    expect(reg.worldPresets.get('brutal')!.choices).toEqual({
      gender_norms: 'corporate_machismo', offspec_stigma: 'hunted', oversight: 'brutal', bloom_horror: 'graphic', tone: 'bleak', disposition: 'hazardous',
    });
  });

  it('the choice effects carry the spec numbers', () => {
    const fx = (opt: string, choice: string) =>
      ((reg.worldOptions.get(opt)!.choices as Array<{ id: string; effects: unknown[] }>).find((c) => c.id === choice)!.effects);
    expect(fx('oversight', 'lenient')).toContainEqual({ type: 'leash_weekly', amount: 1 });
    expect(fx('oversight', 'brutal')).toContainEqual({ type: 'leash_weekly', amount: -1 });
    expect(fx('oversight', 'brutal')).toContainEqual({ type: 'terminate_approval', amount: -0.15 });
    expect(fx('oversight', 'brutal')).toContainEqual({ type: 'command_failure_mult', mult: 1.5 });
    expect(fx('oversight', 'lenient')).toContainEqual({ type: 'command_failure_mult', mult: 0.5 });
    expect(fx('offspec_stigma', 'scorned')).toContainEqual({ type: 'mission_reward_pct', pct: -10 });
    expect(fx('offspec_stigma', 'hunted')).toContainEqual({ type: 'enable_family', family: 'purge_sweep' });
    expect(fx('gender_norms', 'corporate_machismo')).toContainEqual(expect.objectContaining({ type: 'expression_norm', norm: 5, standingPerStep: -2 }));
    expect(fx('gender_norms', 'inverted')).toContainEqual(expect.objectContaining({ type: 'expression_norm', norm: 1 }));
    expect(fx('disposition', 'hazardous')).toEqual([{ type: 'disposition', levelId: 'hazardous' }]);
  });

  it('every stance entry targets a squadStance option and has a strength 1 or 2', () => {
    for (const s of reg.stanceEffects.values()) {
      expect(reg.worldOptions.get(s.option as string)!.squadStance, s.id).toBe(true);
      expect([1, 2]).toContain(s.strength);
      expect(['shares', 'opposes']).toContain(s.stance);
    }
    for (const opt of ['gender_norms', 'offspec_stigma']) {
      for (const stance of ['shares', 'opposes']) {
        for (const strength of [1, 2]) {
          expect([...reg.stanceEffects.values()].filter((s) => s.option === opt && s.stance === stance && s.strength === strength), `${opt}/${stance}/${strength}`).toHaveLength(1);
        }
      }
    }
  });
});

describe('levels carry the spec table', () => {
  // [id, rank, trust, affinity, lossMult, gainMult, minGain, minLoss, bandShift, bandExitExtra, stageDaysMult, refusalMult, desertionMult, bigGestureMult, breakdownTarget]
  const rows: Array<[string, number, number, number, number, number, number, number, number, number, number, number, number, number, string]> = [
    ['kind', 1, 10, 10, 0.7, 1.2, 0.5, 0.6, -5, 0, 0.8, 0.5, 0.5, 1, 'self'],
    ['guarded', 2, 0, 0, 1, 1, 0.5, 0.5, 0, 0, 1, 1, 1, 1, 'default'],
    ['prickly', 3, -10, -5, 1.3, 0.9, 0.6, 0.5, 3, 2, 1.2, 1.3, 1.3, 1.2, 'allies'],
    ['volatile', 4, -20, -10, 1.6, 0.8, 0.7, 0.45, 6, 5, 1.5, 1.7, 1.7, 1.5, 'allies_commander'],
    ['hazardous', 5, -30, -20, 2.0, 0.7, 0.75, 0.4, 10, 8, 2.0, 2.0, 2.0, 2, 'everyone'],
  ];
  it.each(rows)('%s', (id, rank, trust, affinity, lossMult, gainMult, minGain, minLoss, shift, exitExtra, stageMult, refusal, desertion, big, target) => {
    const l = reg.dispositionLevels.get(id)!;
    expect(l.rank).toBe(rank);
    expect(l.start).toEqual({ trust, affinity });
    expect([l.lossMult, l.gainMult]).toEqual([lossMult, gainMult]);
    expect(l.minConfidence).toEqual({ gain: minGain, loss: minLoss });
    expect([l.bandShift, l.bandExitExtra, l.stageDaysMult]).toEqual([shift, exitExtra, stageMult]);
    expect([l.refusalMult, l.desertionMult, l.bigGestureMult]).toEqual([refusal, desertion, big]);
    expect(l.breakdownTarget).toBe(target);
  });

  it('mutiny rows', () => {
    const m = (id: string) => reg.dispositionLevels.get(id)!.mutiny;
    expect(m('kind')).toMatchObject({ enabled: false });
    expect(m('guarded')).toEqual({ enabled: true, states: ['despises'], minDaysInState: 2, minSigns: 2 });
    expect(m('prickly')).toEqual({ enabled: true, states: ['despises'], minDaysInState: 2, minSigns: 2 });
    expect(m('volatile')).toEqual({ enabled: true, states: ['despises', 'resentful'], minDaysInState: 2, minSigns: 2 });
    expect(m('hazardous')).toEqual({ enabled: true, states: ['despises', 'resentful'], minDaysInState: 1, minSigns: 1 });
  });
});

describe('schemas', () => {
  const choice = (over: Record<string, unknown> = {}) => ({ id: 'c', label: 'C', description: 'D', lore: 'Short.', effects: [], ...over });
  const option = (over: Record<string, unknown> = {}) => ({
    id: 'o', label: 'O', group: 'g', live: false, default: 'c', description: 'D', choices: [choice(), choice({ id: 'd' })], ...over,
  });

  it('a lore line over 100 characters is rejected', () => {
    expect(WorldOptionSchema.safeParse(option()).success).toBe(true);
    const bad = WorldOptionSchema.safeParse(option({ choices: [choice({ lore: 'x'.repeat(101) }), choice({ id: 'd' })] }));
    expect(bad.success).toBe(false);
    expect(WorldOptionSchema.safeParse(option({ choices: [choice({ lore: 'x'.repeat(100) }), choice({ id: 'd' })] })).success).toBe(true);
  });

  it('the effect vocabulary is closed and bounded', () => {
    expect(WorldOptionEffectSchema.safeParse({ type: 'leash_weekly', amount: 1 }).success).toBe(true);
    expect(WorldOptionEffectSchema.safeParse({ type: 'leash_weekly', amount: 9 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ type: 'expression_norm', norm: 6, standingPerStep: -2 }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ type: 'made_up' }).success).toBe(false);
    expect(WorldOptionEffectSchema.safeParse({ type: 'grunt_stances', shares: 4, indifferent: 4, opposes: 2 }).success).toBe(true);
    expect(WorldOptionEffectSchema.safeParse({ type: 'grunt_stances', shares: -1, indifferent: 4, opposes: 2 }).success).toBe(false);
  });

  it('a level needs a rank 1..5 and a known breakdown target', () => {
    const base = { ...reg.dispositionLevels.get('guarded')! };
    expect(DispositionLevelSchema.safeParse(base).success).toBe(true);
    expect(DispositionLevelSchema.safeParse({ ...base, rank: 6 }).success).toBe(false);
    expect(DispositionLevelSchema.safeParse({ ...base, breakdownTarget: 'commander' }).success).toBe(false);
  });

  it('stance effects and entries', () => {
    expect(StanceEffectSchema.safeParse({ type: 'gain_damp', pctPerStep: 8 }).success).toBe(true);
    expect(StanceEffectSchema.safeParse({ type: 'start_offset', trust: -2, affinity: -1, perNormStep: true }).success).toBe(true);
    expect(StanceEffectSchema.safeParse({ type: 'value_shift', axis: 'honor', amount: -1 }).success).toBe(false);
    expect(StanceEffectSchema.safeParse({ type: 'value_shift', axis: 'corporate', amount: -4 }).success).toBe(false);
    expect(StanceEntrySchema.safeParse({ id: 's', option: 'gender_norms', stance: 'shares', strength: 3, effects: [] }).success).toBe(false);
    expect(WorldPresetSchema.safeParse({ id: 'p', name: 'P', description: 'D', choices: { a: 'b' } }).success).toBe(true);
  });
});

// ---- loader checks through an in-memory pack ------------------------------------------------------------------------

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
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The whole core pack as in-memory files (so cross references resolve); tests replace single registries. */
const worldPack = async (): Promise<Record<string, unknown[]>> => {
  const manifest = JSON.parse(await readFile('content/core/manifest.json', 'utf8')) as { files: Record<string, string> };
  const out: Record<string, unknown[]> = {};
  for (const [name, file] of Object.entries(manifest.files)) out[name] = JSON.parse(await readFile(`content/core/${file}`, 'utf8')) as unknown[];
  return out;
};

describe('world option loader checks', () => {
  it('the unmodified core world pack has no errors', async () => {
    expect(await errorsOf(await worldPack())).toEqual([]);
  });

  it('a preset missing an option is a content error', async () => {
    const pack = await worldPack();
    const presets = clone(pack.worldPresets) as Array<{ id: string; choices: Record<string, string> }>;
    delete presets[0].choices.tone;
    const errs = await errorsOf({ ...pack, worldPresets: presets });
    expect(errs.some((e) => e.file === 'worldPresets.json' && /tone/.test(e.message))).toBe(true);
  });

  it('a preset naming an unknown choice is a content error', async () => {
    const pack = await worldPack();
    const presets = clone(pack.worldPresets) as Array<{ id: string; choices: Record<string, string> }>;
    presets[0].choices.tone = 'sunny';
    const errs = await errorsOf({ ...pack, worldPresets: presets });
    expect(errs.some((e) => e.file === 'worldPresets.json' && /sunny/.test(e.message))).toBe(true);
  });

  it('a default that is not one of the choices is a content error', async () => {
    const pack = await worldPack();
    const opts = clone(pack.worldOptions) as Array<{ id: string; default: string }>;
    opts.find((o) => o.id === 'tone')!.default = 'sunny';
    const errs = await errorsOf({ ...pack, worldOptions: opts });
    expect(errs.some((e) => e.file === 'worldOptions.json' && /default/.test(e.path))).toBe(true);
  });

  it('two options with disposition effects are a content error', async () => {
    const pack = await worldPack();
    const opts = clone(pack.worldOptions) as Array<{ id: string; choices: Array<{ effects: unknown[] }> }>;
    opts.find((o) => o.id === 'tone')!.choices[0].effects.push({ type: 'disposition', levelId: 'kind' });
    const errs = await errorsOf({ ...pack, worldOptions: opts });
    expect(errs.some((e) => /exactly one option/.test(e.message))).toBe(true);
  });

  it('a disposition effect naming an unknown level is a content error', async () => {
    const pack = await worldPack();
    const opts = clone(pack.worldOptions) as Array<{ id: string; choices: Array<{ effects: Array<{ levelId?: string }> }> }>;
    opts.find((o) => o.id === 'disposition')!.choices[0].effects[0].levelId = 'ghost';
    const errs = await errorsOf({ ...pack, worldOptions: opts });
    expect(errs.some((e) => /unknown dispositionLevels id "ghost"/.test(e.message))).toBe(true);
  });

  it('duplicate level ranks are a content error', async () => {
    const pack = await worldPack();
    const lv = clone(pack.dispositionLevels) as Array<{ rank: number }>;
    lv[4].rank = 4;
    const errs = await errorsOf({ ...pack, dispositionLevels: lv });
    expect(errs.some((e) => e.file === 'dispositionLevels.json' && /rank/.test(e.message))).toBe(true);
  });

  it('a stance entry on an option without squadStance is a content error', async () => {
    const pack = await worldPack();
    const st = clone(pack.stanceEffects) as Array<{ option: string }>;
    st[0].option = 'tone';
    const errs = await errorsOf({ ...pack, stanceEffects: st });
    expect(errs.some((e) => e.file === 'stanceEffects.json' && /squadStance/.test(e.message))).toBe(true);
  });

  it('an unknown family on a clock is a content error', async () => {
    const pack = await worldPack();
    const extra = [{ id: 'c1', label: 'C', segments: 6, startFilled: 0, visibleToPlayer: true, onFill: [], family: 'ghost_family' }];
    const errs = await errorsOf({ ...pack, clocks: [...pack.clocks, ...extra] });
    expect(errs.some((e) => e.file === 'clocks.json' && /ghost_family/.test(e.message))).toBe(true);
    const ok = await errorsOf({ ...pack, clocks: [...pack.clocks, { ...extra[0], family: 'purge_sweep' }] });
    expect(ok).toEqual([]);
  });

  it('lore lines that together exceed the 120-token block are a content error', async () => {
    const pack = await worldPack();
    const opts = clone(pack.worldOptions) as Array<{ choices: Array<{ lore: string }> }>;
    for (const o of opts) for (const c of o.choices) c.lore = 'x'.repeat(100);
    const errs = await errorsOf({ ...pack, worldOptions: opts });
    expect(errs.some((e) => e.file === 'worldOptions.json' && /120 tokens/.test(e.message))).toBe(true);
  });

  it('core lore lines fit the block with room to spare', () => {
    const longest = [...reg.worldOptions.values()].map((o) => Math.max(...(o.choices as Array<{ lore: string }>).map((c) => c.lore.length)));
    expect(longest.reduce((a, b) => a + b, 0) / 4).toBeLessThanOrEqual(120);
  });
});
