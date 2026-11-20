import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/engine/state/migrations';
import { createCampaign } from '../../src/engine/state/create';

// A save is untrusted (a shared chat file): an id or key like `__proto__` would make `relations[id]` the page's Object.prototype.
const save = (): Record<string, any> => JSON.parse(JSON.stringify(createCampaign({ seed: 1, commanderName: 'Vale' })));

describe('migrate refuses prototype keys and ids', () => {
  it('a `__proto__` key anywhere (as JSON.parse makes it) is invalid', () => {
    const s = save();
    s.relations = {};
    const raw = JSON.parse(JSON.stringify(s).replace('"relations":{}', '"relations":{"__proto__":{"trust":1}}'));
    expect(Object.keys(raw.relations)).toContain('__proto__');
    const r = migrate(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toMatch(/relations\.__proto__/);
  });

  it('constructor / prototype keys deep inside are invalid', () => {
    const s = save();
    s.memory.facts = [{ id: 'f1', nested: { constructor: 1 } }];
    expect(migrate(s).ok).toBe(false);
    const t = save();
    t.world.prototype = {};
    expect(migrate(t).ok).toBe(false);
  });

  it('an id that names a prototype key is invalid', () => {
    for (const bad of ['__proto__', 'constructor', 'prototype']) {
      const s = save();
      s.squad = [{ id: bad, kind: 'named', displayName: 'X' }];
      expect(migrate(s).ok, bad).toBe(false);
      const t = save();
      t.roster.activeIds = [bad];
      expect(migrate(t).ok, `activeIds ${bad}`).toBe(false);
      const u = save();
      u.memory.facts = [{ id: 'f1', about: ['unit_a'], knownBy: [bad] }];
      expect(migrate(u).ok, `knownBy ${bad}`).toBe(false);
    }
  });

  it('ordinary text that happens to say "constructor" is fine, and a normal save loads', () => {
    const s = save();
    s.commander.notes = 'constructor';
    expect(migrate(save()).ok).toBe(true);
    s.memory.facts = [{ id: 'f1', text: 'prototype' }];
    expect(migrate(s).ok).toBe(true);
  });
});
