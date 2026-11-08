import { describe, it, expect } from 'vitest';
import { connectionProfiles } from '../../src/st/profiles';

const settings = { connectionManager: { profiles: [{ id: 'p1', name: 'One', api: 'openrouter', model: 'm' }, { id: 'p2' }] } };

describe('connectionProfiles', () => {
  it('lists profiles with defaults for missing fields', () => {
    expect(connectionProfiles(settings, true)).toEqual([
      { id: 'p1', name: 'One', api: 'openrouter', model: 'm' },
      { id: 'p2', name: 'p2', api: '', model: '' },
    ]);
  });

  it('is empty when the Connection Manager extension is disabled (stale profiles must not count)', () => {
    expect(connectionProfiles({ ...settings, disabledExtensions: ['connection-manager'] }, true)).toEqual([]);
  });

  it('is empty when the request service is missing', () => {
    expect(connectionProfiles(settings, false)).toEqual([]);
  });

  it('is empty for missing or malformed settings', () => {
    expect(connectionProfiles(undefined, true)).toEqual([]);
    expect(connectionProfiles({ connectionManager: { profiles: 'x' } }, true)).toEqual([]);
  });
});
