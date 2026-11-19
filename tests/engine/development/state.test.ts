import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import { developmentMode, developmentOf, ensureDevelopment, nextDevId } from '../../../src/engine/development/state';
import { buildCampaign, validateSetup, type SetupResult } from '../../../src/engine/setup';
import type { Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const setup = (over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea'].map((n) => unitSetup(n)), ...over,
});

describe('developmentMode', () => {
  it('absent setting is off', () => {
    expect(developmentMode({ settings: {} })).toBe('off');
    expect(developmentMode({ settings: { characterDevelopment: 'fast' } })).toBe('off');
    expect(developmentMode({ settings: { characterDevelopment: 'slow' } })).toBe('slow');
    expect(developmentMode({ settings: { characterDevelopment: 'normal' } })).toBe('normal');
  });
});

describe('developmentOf / ensureDevelopment / nextDevId', () => {
  it('developmentOf does not write', () => {
    const u = { development: undefined } as Pick<Unit, 'development'>;
    const d = developmentOf(u);
    expect(u.development).toBeUndefined();
    expect(d.drift).toEqual({});
    expect(d.acc).toEqual({});
    expect(d.pending).toEqual([]);
    expect(d.nextId).toBe(0);
    expect(d.anchors).toEqual([]);
    expect(d.facts).toEqual([]);
  });

  it('ensureDevelopment writes it on first use and returns the stored block', () => {
    const u = { development: undefined } as Unit;
    const a = ensureDevelopment(u);
    expect(u.development).toBe(a);
    expect(ensureDevelopment(u)).toBe(a);
  });

  it('nextDevId counts per unit', () => {
    const dev = ensureDevelopment({} as Unit);
    expect(nextDevId(dev, 'ap')).toBe('ap0');
    expect(nextDevId(dev, 'df')).toBe('df1');
    expect(nextDevId(dev, 'dm')).toBe('dm2');
    expect(dev.nextId).toBe(3);
  });

  it('the tuning has the drafted shape', () => {
    expect(TUNING.development.stepThreshold).toBe(3);
    expect(TUNING.development.scales.attachment).toEqual(['avoidant', 'slow', 'steady', 'intense']);
  });
});

describe('setup', () => {
  it('writes the mode only when present', () => {
    const on = buildCampaign(setup({ characterDevelopment: 'normal' }), reg, { desireBondDefects: false, seed: 5 });
    const off = buildCampaign(setup(), reg, { desireBondDefects: false, seed: 5 });
    if (!on.ok || !off.ok) throw new Error('build failed');
    expect(on.state.settings.characterDevelopment).toBe('normal');
    expect('characterDevelopment' in off.state.settings).toBe(false);
    expect(off.state.settings).toEqual({ desireBondDefects: false });
  });

  it('invalid mode is a setup error', () => {
    const errs = validateSetup(setup({ characterDevelopment: 'fast' as never }), reg, { desireBondDefects: false });
    expect(errs.filter((e) => /development/i.test(e))).toHaveLength(1);
  });
});

describe('development/set_mode', () => {
  it('stores the mode and keeps the blocks when it turns off', () => {
    const s = campaign(reg, 2);
    ensureDevelopment(s.squad[0]).drift.mercy = 0.5;
    const slow = run(s, reg, { type: 'development/set_mode', payload: { mode: 'slow' } });
    expect(errors(slow.events)).toEqual([]);
    expect(slow.state.settings.characterDevelopment).toBe('slow');
    const off = run(slow.state, reg, { type: 'development/set_mode', payload: { mode: 'off' } });
    expect(off.state.settings.characterDevelopment).toBe('off');
    expect(off.state.squad[0].development?.drift.mercy).toBe(0.5);
  });

  it('an unknown mode is rejected', () => {
    const s = campaign(reg, 2);
    const r = run(s, reg, { type: 'development/set_mode', payload: { mode: 'fast' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });
});
