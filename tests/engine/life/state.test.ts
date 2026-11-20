import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import { fnv1a } from '../../../src/engine/hub';
import { ensureLife, lifeChance, lifeHash, lifeMode, lifeOf, nextLifeId, temperamentOf } from '../../../src/engine/life/state';
import { buildCampaign, validateSetup, type SetupResult } from '../../../src/engine/setup';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const setup = (over: Partial<SetupResult> = {}): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea'].map((n) => unitSetup(n)), ...over,
});

describe('lifeMode', () => {
  it('absent setting is off', () => {
    expect(lifeMode({ settings: {} })).toBe('off');
    expect(lifeMode({ settings: { lifeEvents: 'daily' } })).toBe('off');
    expect(lifeMode({ settings: { lifeEvents: 'rare' } })).toBe('rare');
    expect(lifeMode({ settings: { lifeEvents: 'normal' } })).toBe('normal');
    expect(lifeMode({ settings: { lifeEvents: 'often' } })).toBe('often');
  });
});

describe('temperamentOf', () => {
  it('defaults', () => {
    const s = campaign(reg, 2);
    expect(temperamentOf(s, s.squad[0].id)).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' });
    s.squad[0].temperament = { humor: 'warm' } as never; // a partial block
    expect(temperamentOf(s, s.squad[0].id)).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'warm' });
    expect(temperamentOf(s, 'nobody')).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' });
    const g = { ...s.squad[1], kind: 'grunt' as const, temperament: { talkativeness: 'talkative', volatility: 'moody', humor: 'warm' } as const };
    expect(temperamentOf({ squad: [g] }, g.id)).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' });
  });
});

describe('lifeChance', () => {
  it('is stable and salted', () => {
    const a = { salt: 7 };
    const b = { salt: 8 };
    expect(lifeChance(a, 'k', 0.5)).toBe(lifeChance(a, 'k', 0.5));
    expect(lifeChance(a, 'k', 0)).toBe(false);
    expect(lifeChance(a, 'k', 1)).toBe(true);
    let differs = 0;
    for (let i = 0; i < 100; i++) if (lifeChance(a, `k${i}`, 0.5) !== lifeChance(b, `k${i}`, 0.5)) differs++;
    expect(differs).toBeGreaterThan(0);
  });

  it('is the hub hash of the salt and the key', () => {
    expect(lifeHash({ salt: 42 }, 'x|y')).toBe(fnv1a('42|x|y'));
    expect(lifeChance({ salt: 1 }, 'z', 0.3)).toBe(fnv1a('1|z') % 1000 < 300);
  });
});

describe('the block', () => {
  it('lifeOf does not write; ensureLife does, and counts the news ids', () => {
    const s = campaign(reg, 2);
    expect(lifeOf(s)).toBeNull();
    expect(s.life).toBeUndefined();
    const life = ensureLife(s);
    expect(s.life).toBe(life);
    expect(life.salt).toBe(fnv1a(JSON.stringify(s.rng)));
    expect(ensureLife(s)).toBe(life);
    expect(nextLifeId(life, 'ln')).toBe('ln0');
    expect(nextLifeId(life, 'ln')).toBe('ln1');
    expect(life.nextId).toBe(2);
  });

  it('the tuning has the drafted shape', () => {
    expect(TUNING.life.perWeek).toEqual({ rare: 0.5, normal: 1, often: 2 });
    expect(TUNING.life.milestones).toEqual([10, 30, 60, 100]);
    expect(TUNING.life.interest.start).toBe(50);
  });
});

describe('setup', () => {
  it('writes the mode only when present', () => {
    const on = buildCampaign(setup({ lifeEvents: 'normal' }), reg, { desireBondDefects: false, seed: 5 });
    const off = buildCampaign(setup(), reg, { desireBondDefects: false, seed: 5 });
    if (!on.ok || !off.ok) throw new Error('build failed');
    expect(on.state.settings.lifeEvents).toBe('normal');
    expect(on.state.life?.salt).toBe(5);
    expect('lifeEvents' in off.state.settings).toBe(false);
    expect(off.state.settings).toEqual({ desireBondDefects: false });
    expect(off.state.life).toBeUndefined();
    expect('life' in off.state).toBe(false);
  });

  it('an explicit off is stored and makes no block', () => {
    const r = buildCampaign(setup({ lifeEvents: 'off' }), reg, { desireBondDefects: false, seed: 5 });
    if (!r.ok) throw new Error('build failed');
    expect(r.state.settings.lifeEvents).toBe('off');
    expect(r.state.life).toBeUndefined();
  });

  it('invalid mode is a setup error', () => {
    const errs = validateSetup(setup({ lifeEvents: 'daily' as never }), reg, { desireBondDefects: false });
    expect(errs.filter((e) => /life/i.test(e))).toHaveLength(1);
  });
});

describe('life/set_frequency', () => {
  it('on an old save it creates the block with a hash of the rng and leaves the rng alone', () => {
    const s = campaign(reg, 2);
    const rngBefore = structuredClone(s.rng);
    const r = run(s, reg, { type: 'life/set_frequency', payload: { mode: 'normal' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.map((e) => e.type)).toEqual(['life_frequency_set']);
    expect(r.state.settings.lifeEvents).toBe('normal');
    expect(r.state.life?.salt).toBe(fnv1a(JSON.stringify(rngBefore)));
    expect(r.state.rng).toEqual(rngBefore);
  });

  it('keeps the salt on a change, and off keeps the block', () => {
    const s = campaign(reg, 2);
    const a = run(s, reg, { type: 'life/set_frequency', payload: { mode: 'often' } }).state;
    const salt = a.life?.salt;
    a.life!.deaths.push({ unitId: 'x', day: 1, grunt: true });
    const b = run(a, reg, { type: 'life/set_frequency', payload: { mode: 'off' } }).state;
    expect(b.settings.lifeEvents).toBe('off');
    expect(b.life?.deaths).toHaveLength(1);
    const c = run(b, reg, { type: 'life/set_frequency', payload: { mode: 'rare' } }).state;
    expect(c.life?.salt).toBe(salt);
    expect(c.life?.deaths).toHaveLength(1);
  });

  it('an unknown mode is rejected and changes nothing', () => {
    const s = campaign(reg, 2);
    const r = run(s, reg, { type: 'life/set_frequency', payload: { mode: 'daily' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });
});
