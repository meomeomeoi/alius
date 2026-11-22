import { describe, expect, it } from 'vitest';
import { blankPractices, practiceRoll, PRACTICE_EVENT_TYPES, PRACTICE_ID_PREFIXES, stakeRank, STAKES } from '../../../src/engine/practice/state';
import { seedRng } from '../../../src/engine/rng';

const state = (day = 3, salt = 7) => ({ day, dynamic: { salt } as never, rng: seedRng(11) });

describe('practiceRoll', () => {
  it('draws nothing and differs by key', () => {
    const s = state();
    const before = structuredClone(s.rng);
    const a = practiceRoll(s, 'unit_ann', 'a');
    const b = practiceRoll(s, 'unit_ann', 'b');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
    expect(a).not.toBe(b);
    expect(s.rng).toEqual(before);
  });

  it('is stable for one key and day, and moves with the day, the unit and the campaign salt', () => {
    expect(practiceRoll(state(), 'unit_ann', 'k')).toBe(practiceRoll(state(), 'unit_ann', 'k'));
    expect(practiceRoll(state(4), 'unit_ann', 'k')).not.toBe(practiceRoll(state(3), 'unit_ann', 'k'));
    expect(practiceRoll(state(), 'unit_bea', 'k')).not.toBe(practiceRoll(state(), 'unit_ann', 'k'));
    expect(practiceRoll(state(3, 8), 'unit_ann', 'k')).not.toBe(practiceRoll(state(3, 7), 'unit_ann', 'k'));
  });

  it('without a dynamic block it still answers (salt 0)', () => {
    expect(practiceRoll({ day: 1, dynamic: undefined }, 'unit_ann', 'k')).toBeGreaterThanOrEqual(0);
  });
});

describe('the leaf', () => {
  it('stakeRank is the order of STAKES', () => {
    expect(STAKES.map((s) => stakeRank(s))).toEqual([0, 1, 2, 3]);
  });

  it('the events are unique and the id prefixes are the plan\'s', () => {
    expect(new Set(PRACTICE_EVENT_TYPES).size).toBe(PRACTICE_EVENT_TYPES.length);
    expect([...PRACTICE_ID_PREFIXES]).toEqual(['pq', 'pt', 'pp', 'pd', 'pa', 'ps', 'pc', 'ph']);
  });

  it('a blank practice state has nothing open', () => {
    expect(blankPractices()).toEqual({ seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] });
  });
});
