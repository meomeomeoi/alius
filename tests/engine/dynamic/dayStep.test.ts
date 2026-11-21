import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { addTrackXp } from '../../../src/engine/dynamic/tracks';
import type { Frame } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` with `hold`, her last practice `idle` days ago. */
function world(frame: Frame, hold: number, idle = 4): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold, lastPracticeDay: s.day - idle };
  impunity(s, 10); // below the route: the slow term is off unless a test turns it on
  return s;
}
const step = (s: CampaignState) => dynamicDayStep(s, ctxOf(s, reg));
const holdOf = (s: CampaignState): number => dynamicOf(s, ANN)!.hold;
/** Sets her Impunity to exactly `target` through the stored term. */
function impunity(s: CampaignState, target: number): void {
  s.relations[ANN].impunityRecord = 0;
  s.relations[ANN].impunityRecord = target - impunityOf(s, reg, ANN)!.value;
  expect(impunityOf(s, reg, ANN)!.value).toBe(target);
}

describe('decay', () => {
  it('after three idle days: play -1, role -0.5, rule -0.3, equal nothing', () => {
    const play = world('play', 50);
    step(play);
    expect(holdOf(play)).toBe(49);
    const role = world('role', 50);
    step(role);
    expect(holdOf(role)).toBe(49.5);
    const rule = world('rule', 70);
    step(rule);
    expect(holdOf(rule)).toBe(69.7);
    const equal = world('equal', 30);
    step(equal);
    expect(holdOf(equal)).toBe(30);
  });

  it('waits out the idle days, and a gain resets them', () => {
    const three = world('play', 50, 3);
    step(three);
    expect(holdOf(three)).toBe(50);
    const fresh = world('play', 50, 0);
    step(fresh);
    expect(holdOf(fresh)).toBe(50);
  });

  it('never below the floor (role at 40 stays 40), and decay is not practice', () => {
    const s = world('role', 40);
    expect(step(s)).toEqual([]);
    expect(holdOf(s)).toBe(40);
    const p = world('play', 50);
    step(p);
    expect(dynamicOf(p, ANN)!.lastPracticeDay).toBe(p.day - 4);
  });

  it('reports the change with its cause', () => {
    const s = world('play', 35); // (at keeping a milestone would be offered too: Task 19)
    expect(step(s)).toEqual([{ type: 'hold_changed', unitId: ANN, from: 35, to: 34, cause: 'decay' }]);
  });

  it('scales by pace', () => {
    const s = world('play', 50);
    s.dynamic!.setup.pace = 'fast';
    step(s);
    expect(holdOf(s)).toBeCloseTo(48.6, 6);
  });
});

describe('the slow term', () => {
  it('Impunity 45 at play gives +0.5; the leader gets +0.3; at equal nothing', () => {
    const imp = world('play', 50, 0);
    impunity(imp, 45);
    step(imp);
    expect(holdOf(imp)).toBeCloseTo(50.5, 6);
    const lead = world('play', 50, 0);
    lead.power = { votes: { log: [], seq: 0 }, hierarchy: { leaderId: ANN } } as unknown as CampaignState['power'];
    impunity(lead, 30);
    step(lead);
    expect(holdOf(lead)).toBeCloseTo(50.3, 6);
    const both = world('role', 50, 0);
    both.power = { votes: { log: [], seq: 0 }, hierarchy: { leaderId: ANN } } as unknown as CampaignState['power'];
    impunity(both, 45);
    step(both);
    expect(holdOf(both)).toBeCloseTo(50.8, 6);
    const equal = world('equal', 30, 0);
    impunity(equal, 60);
    step(equal);
    expect(holdOf(equal)).toBe(30);
  });

  it('is not practice: the idle days run on', () => {
    const s = world('play', 50, 2);
    impunity(s, 45);
    step(s);
    expect(dynamicOf(s, ANN)!.lastPracticeDay).toBe(s.day - 2);
  });
});

describe('tracks and favour', () => {
  it('a track decays slowly after a long idle; favour is drawn toward 0 by 1 a day', () => {
    const s = world('play', 50, 3);
    addTrackXp(s, reg, ANN, 'restraint', 30);
    dynamicOf(s, ANN)!.favour = 3;
    step(s);
    expect(dynamicOf(s, ANN)!.tracks.restraint.xp).toBe(30); // three idle days are nothing to a track
    expect(dynamicOf(s, ANN)!.favour).toBe(2);
    dynamicOf(s, ANN)!.lastPracticeDay = s.day - 20;
    dynamicOf(s, ANN)!.favour = -1;
    step(s);
    expect(dynamicOf(s, ANN)!.tracks.restraint.xp).toBeCloseTo(29.9, 6);
    expect(dynamicOf(s, ANN)!.tracks.restraint.level).toBe(1); // 29.9 < 30: the level follows the xp
    expect(dynamicOf(s, ANN)!.favour).toBe(0);
    step(s);
    expect(dynamicOf(s, ANN)!.favour).toBe(0);
  });
});

describe('off', () => {
  it('the step returns [] and changes nothing', () => {
    const none = world('play', 50);
    delete none.dynamic;
    const noCategory = world('play', 50);
    noCategory.content = { enabled: [] };
    const zero = world('play', 50);
    zero.dynamic!.setup.holders = 0;
    for (const s of [none, noCategory, zero]) {
      const before = structuredClone(s);
      expect(step(s)).toEqual([]);
      expect(s).toEqual(before);
    }
  });

  it('a unit with no dynamic, or one who left, is not touched', () => {
    const s = world('play', 50);
    unitOf(s, ANN).status = 'dead';
    const before = structuredClone(s);
    expect(step(s)).toEqual([]);
    expect(s).toEqual(before);
    expect(dynamicOf(s, BEA)).toBeUndefined();
  });

  it('draws nothing (steps 1 to 4)', () => {
    const s = world('role', 60);
    impunity(s, 50);
    const ctx = ctxOf(s, reg);
    const rngBefore = [...ctx.rng.state];
    dynamicDayStep(s, ctx);
    expect([...ctx.rng.state]).toEqual(rngBefore);
  });
});
