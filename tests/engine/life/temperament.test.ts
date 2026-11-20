import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/squad';
import { temperamentOf } from '../../../src/engine/life/state';
import { makeNamedUnit, validateSetup, validateUnitProfile } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { ContextBuilder } from '../../../src/llm/context';
import { registerSceneContext } from '../../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { campaign, errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

const set = (s: CampaignState, unitId: string, temperament: unknown) => run(s, reg, { type: 'profile/set_temperament', payload: { unitId, temperament } });
const lock = (s: CampaignState, unitId: string, field: string, on: boolean) => run(s, reg, { type: 'profile/lock_temperament', payload: { unitId, field, on } });

describe('profile/set_temperament and profile/lock_temperament', () => {
  it('a set stores the fields over the defaults and says so', () => {
    const r = set(campaign(reg, 2), ANN, { humor: 'warm', talkativeness: 'talkative' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'temperament_set')).toHaveLength(1);
    expect(temperamentOf(r.state, ANN)).toEqual({ talkativeness: 'talkative', volatility: 'steady', humor: 'warm' });
    expect(temperamentOf(r.state, BEA)).toEqual({ talkativeness: 'terse', volatility: 'steady', humor: 'dry' }); // she is untouched
  });

  it('a lock refuses a set of that field and allows the others', () => {
    const locked = lock(campaign(reg, 2), ANN, 'humor', true);
    expect(errors(locked.events)).toEqual([]);
    expect(locked.state.squad.find((u) => u.id === ANN)!.temperamentLocks).toEqual(['humor']);
    const refused = set(locked.state, ANN, { humor: 'mocking' });
    expect(errors(refused.events).map((e) => (e as { message?: string }).message)).toEqual(['That trait is locked.']);
    expect(refused.state).toEqual(locked.state);
    const both = set(locked.state, ANN, { humor: 'mocking', volatility: 'moody' }); // one locked field refuses the whole set
    expect(errors(both.events)).toHaveLength(1);
    const ok = set(locked.state, ANN, { volatility: 'moody' });
    expect(errors(ok.events)).toEqual([]);
    expect(temperamentOf(ok.state, ANN)).toEqual({ talkativeness: 'terse', volatility: 'moody', humor: 'dry' });
    const unlocked = lock(ok.state, ANN, 'humor', false);
    expect(unlocked.state.squad.find((u) => u.id === ANN)!.temperamentLocks).toBeUndefined();
    expect(errors(set(unlocked.state, ANN, { humor: 'mocking' }).events)).toEqual([]);
  });

  it('a lock is kept once, and locking twice changes nothing', () => {
    const a = lock(campaign(reg, 2), ANN, 'volatility', true).state;
    const b = lock(a, ANN, 'volatility', true).state;
    expect(b.squad.find((u) => u.id === ANN)!.temperamentLocks).toEqual(['volatility']);
  });

  it('an unknown value, field or unit throws; so does a grunt', () => {
    const s = campaign(reg, 2);
    s.squad.push({ ...structuredClone(s.squad[1]), id: 'grunt_x', kind: 'grunt' });
    expect(errors(set(s, ANN, { humor: 'sarcastic' }).events)).toHaveLength(1);
    expect(errors(set(s, ANN, { mood: 'warm' }).events)).toHaveLength(1);
    expect(errors(set(s, ANN, {}).events)).toHaveLength(1);
    expect(errors(set(s, ANN, 'warm').events)).toHaveLength(1);
    expect(errors(set(s, 'nobody', { humor: 'warm' }).events)).toHaveLength(1);
    expect(errors(set(s, 'grunt_x', { humor: 'warm' }).events)).toHaveLength(1);
    expect(errors(lock(s, ANN, 'mood', true).events)).toHaveLength(1);
    expect(errors(lock(s, 'grunt_x', 'humor', true).events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'profile/lock_temperament', payload: { unitId: ANN, field: 'humor', on: 'yes' } }).events)).toHaveLength(1);
  });
});

describe('setup', () => {
  const base = () => unitSetup('Ann');
  it('writes the temperament and its locks only when present', () => {
    const plain = makeNamedUnit(base(), reg, new Set());
    expect('temperament' in plain).toBe(false);
    expect('temperamentLocks' in plain).toBe(false);
    const u = makeNamedUnit({ ...base(), temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'none' }, temperamentLocks: ['humor'] }, reg, new Set());
    expect(u.temperament).toEqual({ talkativeness: 'silent', volatility: 'moody', humor: 'none' });
    expect(u.temperamentLocks).toEqual(['humor']);
  });

  it('validateUnit checks the enums, the locks and the shape', () => {
    const errs = (extra: object) => validateSetup({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: [{ ...base(), ...extra } as never] }, reg, { desireBondDefects: false });
    expect(errs({ temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'warm' } })).toEqual([]);
    expect(errs({ temperament: { talkativeness: 'chatty', volatility: 'moody', humor: 'warm' } }).join('\n')).toMatch(/talkativeness/);
    expect(errs({ temperament: { talkativeness: 'silent', volatility: 'moody', humor: 'sarcastic' } }).join('\n')).toMatch(/humor/);
    expect(errs({ temperament: 'warm' }).join('\n')).toMatch(/temperament/);
    expect(errs({ temperamentLocks: ['humor'] })).toEqual([]);
    expect(errs({ temperamentLocks: ['mood'] }).join('\n')).toMatch(/lock/);
    expect(errs({ temperamentLocks: 'humor' }).join('\n')).toMatch(/lock/);
  });

  it('a re-sync patch may name some of the fields', () => {
    const { baseline: _b, ...profile } = base();
    expect(validateUnitProfile({ ...profile, temperament: { humor: 'warm' } as never }, 'Ann', reg, { desireBondDefects: false })).toEqual([]);
    expect(validateUnitProfile({ ...profile, temperament: { humor: 'loud' } as never }, 'Ann', reg, { desireBondDefects: false }).join('\n')).toMatch(/humor/);
  });
});

describe('squad/resync of the temperament', () => {
  const resync = (s: CampaignState, temperament: unknown) => run(s, reg, { type: 'squad/resync', payload: { unitId: ANN, patch: { temperament } } });

  it('replaces an unlocked field and keeps a locked one', () => {
    let s = set(campaign(reg, 2), ANN, { talkativeness: 'silent', humor: 'warm' }).state;
    s = lock(s, ANN, 'humor', true).state;
    const r = resync(s, { talkativeness: 'talkative', volatility: 'moody', humor: 'mocking' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'unit_resynced')).toMatchObject([{ unitId: ANN, sections: ['temperament'] }]);
    expect(temperamentOf(r.state, ANN)).toEqual({ talkativeness: 'talkative', volatility: 'moody', humor: 'warm' });
    expect(r.state.squad.find((u) => u.id === ANN)!.temperamentLocks).toEqual(['humor']);
  });

  it('writes it for a unit that had none, and refuses a bad value without a change', () => {
    const s = campaign(reg, 2);
    expect(temperamentOf(resync(s, { humor: 'warm' }).state, ANN).humor).toBe('warm');
    const bad = resync(s, { humor: 'loud' });
    expect(errors(bad.events)).toHaveLength(1);
    expect(bad.state).toEqual(s);
  });
});

describe('the units line of the scene context', () => {
  const builder = () => {
    const b = new ContextBuilder();
    registerSceneContext(b, { registries: () => reg, settings: () => ({ ...DEFAULT_SETTINGS }) });
    return b;
  };
  const inScene = (tweak: (s: CampaignState) => void = () => {}): CampaignState => {
    const s = campaign(reg, 4);
    s.day = 12;
    s.slot = 'evening';
    tweak(s);
    return run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
  };
  const line = (s: CampaignState) => builder().build(s, 5000).block.split('\n').find((l) => l.startsWith('Ann — '))!;

  it('carries the words with life on and nothing with life off', () => {
    const off = inScene((s) => { s.squad[0].temperament = { talkativeness: 'silent', volatility: 'moody', humor: 'warm' }; });
    expect(line(off)).not.toContain('temperament');
    const on = inScene((s) => { s.settings.lifeEvents = 'normal'; s.squad[0].temperament = { talkativeness: 'silent', volatility: 'moody', humor: 'warm' }; });
    expect(line(on)).toContain('; temperament: silent, moody, warm humor');
    // the defaults read too, for a woman with nothing stored
    const dflt = inScene((s) => { s.settings.lifeEvents = 'rare'; });
    expect(line(dflt)).toContain('temperament: terse, steady, dry humor');
  });

  it('is byte-identical with life off whether or not she has a temperament', () => {
    const plain = inScene();
    const withIt = inScene((s) => { s.squad[0].temperament = { talkativeness: 'talkative', volatility: 'moody', humor: 'mocking' }; });
    expect(builder().build(withIt, 5000).block).toBe(builder().build(plain, 5000).block);
  });

  it('sits before the defects and names nothing about the commander', () => {
    const s = inScene((w) => { w.settings.lifeEvents = 'normal'; w.squad[0].defects = [{ id: 'hunger_loop' }]; });
    const l = line(s);
    expect(l.indexOf('temperament:')).toBeGreaterThan(l.indexOf('stress '));
    expect(l.indexOf('temperament:')).toBeLessThan(l.indexOf('defect '));
    expect(l).not.toMatch(/\b(he|him|his)\b/i);
  });
});
