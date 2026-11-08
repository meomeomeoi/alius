import { describe, it, expect } from 'vitest';
import {
  SOCIAL_THRESHOLDS, addSocialPoints, meetsSocialRequirements, rankForPoints, socialRank,
} from '../../src/engine/social';
import { createCampaign } from '../../src/engine/state/create';

const fresh = () => {
  const s = createCampaign({ seed: 1, commanderName: 'Vale' });
  s.commander.socialStats = { authority: 1, insight: 1, empathy: 1, cunning: 1 };
  return s;
};

describe('social stats', () => {
  it('rankForPoints follows the thresholds', () => {
    expect(SOCIAL_THRESHOLDS).toEqual([0, 10, 25, 45, 70]);
    const at = (p: number) => rankForPoints(p);
    expect([at(0), at(9), at(10), at(24), at(25), at(44), at(45), at(69), at(70), at(999)]).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('addSocialPoints raises the rank and reports it', () => {
    const s = fresh();
    const r = addSocialPoints(s.commander, 'insight', 12);
    expect(r).toEqual({ rank: 2, gained: 12, rankedUp: true });
    expect(s.commander.socialStats.insight).toBe(2);
    expect(s.commander.socialPoints?.insight).toBe(12);
    expect(addSocialPoints(s.commander, 'insight', 1).rankedUp).toBe(false);
  });

  it('a start rank counts as its threshold', () => {
    const s = fresh();
    s.commander.socialStats.authority = 2; // set by a P1 start effect, no points stored
    const r = addSocialPoints(s.commander, 'authority', 15);
    expect(s.commander.socialPoints?.authority).toBe(25);
    expect(r.rank).toBe(3);
  });

  it('points stop at the top rank', () => {
    const s = fresh();
    addSocialPoints(s.commander, 'cunning', 500);
    expect(s.commander.socialStats.cunning).toBe(5);
    expect(s.commander.socialPoints?.cunning).toBe(70);
  });

  it('points follow a rank raised elsewhere', () => {
    const s = fresh();
    addSocialPoints(s.commander, 'empathy', 10); // 10 points, rank 2
    s.commander.socialStats.empathy = 4; // a P6 effect sets the rank directly
    addSocialPoints(s.commander, 'empathy', 5);
    expect(s.commander.socialPoints?.empathy).toBe(50); // threshold of rank 4 (45) + 5
    expect(s.commander.socialStats.empathy).toBe(4);
  });

  it('meetsSocialRequirements checks every stat', () => {
    const s = fresh();
    s.commander.socialStats.empathy = 2;
    expect(meetsSocialRequirements(s, { empathy: 3 })).toBe(false);
    s.commander.socialStats.empathy = 3;
    expect(meetsSocialRequirements(s, { empathy: 3 })).toBe(true);
    expect(meetsSocialRequirements(s, { empathy: 3, cunning: 2 })).toBe(false);
    expect(meetsSocialRequirements(s, {})).toBe(true);
    expect(socialRank(s, 'empathy')).toBe(3);
  });
});
