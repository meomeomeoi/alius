import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCampaign } from '../../src/engine/state/create';
import { CURRENT_VERSION, migrate } from '../../src/engine/state/migrations';

// Top-level keys of overview §6 `Campaign` (+ `rng`, which holds the seed state).
// `expedition` and `combat` are optional and absent until a package creates them.
const V1_KEYS = [
  'version', 'rng', 'day', 'slot', 'difficulty', 'settings',
  'commander', 'squad', 'roster', 'relations', 'resources', 'base', 'inventory',
  'world', 'missions', 'rumors', 'dms', 'memory', 'calendar', 'leash',
].sort();

describe('campaign state', () => {
  it('createCampaign has version 1 and all top-level keys', () => {
    const s = createCampaign({ seed: 5, commanderName: 'Vale' });
    expect(s.version).toBe(1);
    expect(CURRENT_VERSION).toBe(1);
    expect(s.day).toBe(1);
    expect(s.slot).toBe('morning');
    expect(s.commander.name).toBe('Vale');
    expect(s.resources).toEqual({ credits: 0, supplies: 0, plyx: 0 });
    expect(Object.keys(s).sort()).toEqual(V1_KEYS);
  });

  it('v0 fixture migrates to v1', () => {
    const raw = JSON.parse(readFileSync('tests/fixtures/campaign-v0.json', 'utf8'));
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(0);
    expect(r.state.version).toBe(1);
    expect(r.state.day).toBe(3);
    expect(r.state.slot).toBe('evening');
    expect(Object.keys(r.state).sort()).toEqual(V1_KEYS);
  });

  it('a current-version state passes through unchanged', () => {
    const s = createCampaign({ seed: 5, commanderName: 'Vale' });
    const r = migrate(JSON.parse(JSON.stringify(s)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(1);
      expect(r.state).toEqual(s);
    }
  });

  it('missing version is treated as invalid', () => {
    const r = migrate({ day: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('future version is refused', () => {
    const r = migrate({ version: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('future_version');
      expect(r.version).toBe(99);
    }
  });

  it('non-object is invalid', () => {
    for (const raw of [null, 'x', []]) {
      const r = migrate(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid');
    }
  });

  it('a v1 state with a wrong shape is invalid with the zod message', () => {
    const s: any = createCampaign({ seed: 1, commanderName: '' });
    s.day = 0;
    const r = migrate(s);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('invalid');
      expect(r.detail).toContain('day');
    }
  });
});
