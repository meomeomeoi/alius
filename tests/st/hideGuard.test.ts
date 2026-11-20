import { describe, expect, it } from 'vitest';
import { hideCommand, isIndexRun, unhideRuns } from '../../src/st/chat';
import { migrate } from '../../src/engine/state/migrations';
import { createCampaign } from '../../src/engine/state/create';

// A crafted save must never get text into a slash command: `memory.hidden` used to be pasted into `/unhide a-b` as is.
describe('hide runs from a save are numbers only', () => {
  it('isIndexRun accepts only two safe non-negative integers in order', () => {
    expect(isIndexRun([2, 7])).toBe(true);
    expect(isIndexRun([5, 5])).toBe(true);
    expect(isIndexRun(['0 | /delchat | /pass ', 1])).toBe(false);
    expect(isIndexRun([0, '1 | /echo x'])).toBe(false);
    expect(isIndexRun([3, 2])).toBe(false);
    expect(isIndexRun([-1, 2])).toBe(false);
    expect(isIndexRun([1.5, 2])).toBe(false);
    expect(isIndexRun([0, Infinity])).toBe(false);
    expect(isIndexRun([0, 1, 2])).toBe(false);
    expect(isIndexRun('0-1')).toBe(false);
  });

  it('hideCommand refuses anything that is not a run', () => {
    expect(() => hideCommand(true, ['0 | /delchat | /pass ', 1] as unknown as [number, number])).toThrow();
    expect(() => hideCommand(false, [4, 2])).toThrow();
    expect(hideCommand(true, [3, 4])).toBe('/unhide 3-4');
  });

  it('unhideRuns drops malformed and past-the-end runs and cuts one that ends past the chat', () => {
    expect(unhideRuns([[0, 2], ['0 | /delchat', 1], [8, 12], [20, 25], null], 10)).toEqual([[0, 2], [8, 9]]);
    expect(unhideRuns('nope', 10)).toEqual([]);
    expect(unhideRuns([[0, 3]], 0)).toEqual([]);
  });

  it('migrate drops malformed hidden runs from a loaded save', () => {
    const s = createCampaign({ seed: 1, commanderName: 'Vale' }) as unknown as Record<string, any>;
    s.memory = { ...s.memory, hidden: [[0, 2], ['0 | /delchat | /pass ', 1], [5, 4], [6, 9]] };
    const r = migrate(JSON.parse(JSON.stringify(s)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.memory.hidden).toEqual([[0, 2], [6, 9]]);
    const bad = JSON.parse(JSON.stringify(s));
    bad.memory.hidden = '0 | /delchat';
    const r2 = migrate(bad);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.state.memory.hidden).toBeUndefined();
  });
});
