import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { addFavour, addHold, bandIndex, compatibilityOf, frameEntry, holdBandOf } from '../../../src/engine/dynamic/hold';
import { addTrackXp, trackCap, trackLevel } from '../../../src/engine/dynamic/tracks';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Practice, ProfileStyle } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const ctx = () => ({ registries: reg });

const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
/** Ann can hold (dominant lead, curious, restraint on) and has the dynamic when `started`. */
function world(opts: { style?: ProfileStyle; pace?: 'slow' | 'normal' | 'fast'; started?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  const practice: Practice = {
    categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
    style: { primary: opts.style ?? 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
  };
  unitOf(s, ANN).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: opts.pace ?? 'normal', frequency: 'normal', units: {} });
  if (opts.started) s.relations[ANN].dynamic = blankDynamic(s.day);
  return s;
}
const holdOf = (s: CampaignState): number => dynamicOf(s, ANN)!.hold;

describe('addHold', () => {
  it('hold at equal stops at 39', () => {
    const s = world();
    for (let i = 0; i < 20; i++) addHold(s, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(s)).toBe(39);
  });

  it('never below the frame floor', () => {
    const s = world({ started: true });
    const d = dynamicOf(s, ANN)!;
    d.frame = 'role';
    d.hold = 60;
    addHold(s, ctx(), ANN, -50, 'refusal');
    expect(d.hold).toBe(40);
  });

  it('pace: +4 at fast gives +5.6, at slow +2.8 (a float; the bands read it)', () => {
    const fast = world({ pace: 'fast' });
    addHold(fast, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(fast)).toBeCloseTo(5.6, 6);
    const slow = world({ pace: 'slow' });
    addHold(slow, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(slow)).toBeCloseTo(2.8, 6);
    const loss = world({ pace: 'fast', started: true });
    dynamicOf(loss, ANN)!.hold = 20;
    addHold(loss, ctx(), ANN, -4, 'refusal');
    expect(holdOf(loss)).toBeCloseTo(14.4, 6); // a loss is paced too
  });

  it('romantic tier: affectionate +4 is 4.8 while romantic and 4 while close; cold gives 3.2; a loss is never multiplied', () => {
    const lover = world({ style: 'affectionate' });
    lover.relations[ANN].stateId = 'lover';
    addHold(lover, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(lover)).toBeCloseTo(4.8, 6);
    const friend = world({ style: 'affectionate' });
    friend.relations[ANN].stateId = 'confidant';
    addHold(friend, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(friend)).toBe(4);
    const cold = world({ style: 'cold' });
    cold.relations[ANN].stateId = 'lover';
    addHold(cold, ctx(), ANN, 4, 'followed_lead');
    expect(holdOf(cold)).toBeCloseTo(3.2, 6);
    const hurt = world({ style: 'affectionate', started: true });
    hurt.relations[ANN].stateId = 'lover';
    dynamicOf(hurt, ANN)!.hold = 10;
    addHold(hurt, ctx(), ANN, -4, 'refusal');
    expect(holdOf(hurt)).toBe(6);
  });

  it('hold_band_changed fires once on a crossing', () => {
    const s = world({ started: true });
    dynamicOf(s, ANN)!.hold = 18;
    const up = addHold(s, ctx(), ANN, 4, 'followed_lead');
    expect(up.filter((e) => e.type === 'hold_band_changed')).toEqual([{ type: 'hold_band_changed', unitId: ANN, from: 'interest', to: 'testing' }]);
    expect(up.filter((e) => e.type === 'hold_changed')).toEqual([{ type: 'hold_changed', unitId: ANN, from: 18, to: 22, cause: 'followed_lead' }]);
    expect(addHold(s, ctx(), ANN, 1, 'followed_lead').some((e) => e.type === 'hold_band_changed')).toBe(false);
  });

  it('lastPracticeDay is set on a gain only', () => {
    const s = world({ started: true });
    const d = dynamicOf(s, ANN)!;
    d.hold = 30;
    d.lastPracticeDay = -5;
    addHold(s, ctx(), ANN, -2, 'refusal');
    expect(d.lastPracticeDay).toBe(-5);
    addHold(s, ctx(), ANN, 2, 'followed_lead');
    expect(d.lastPracticeDay).toBe(s.day);
  });

  it('addHold on an ineligible unit with no dynamic does nothing', () => {
    const s = world();
    expect(addHold(s, ctx(), BEA, 4, 'followed_lead')).toEqual([]); // no practice profile
    expect(dynamicOf(s, BEA)).toBeUndefined();
    const off = world();
    delete off.dynamic;
    expect(addHold(off, ctx(), ANN, 4, 'followed_lead')).toEqual([]);
    expect(dynamicOf(off, ANN)).toBeUndefined();
    const loss = world();
    expect(addHold(loss, ctx(), ANN, -4, 'refusal')).toEqual([]); // a loss never starts a dynamic
    expect(dynamicOf(loss, ANN)).toBeUndefined();
  });

  it('an eligible unit gets her dynamic from her first gain', () => {
    const s = world();
    const events = addHold(s, ctx(), ANN, 4, 'followed_lead');
    expect(events.map((e) => e.type)).toEqual(['dynamic_started', 'hold_changed']);
    expect(holdOf(s)).toBe(4);
  });

  it('a dynamic that is off writes nothing to a holder either', () => {
    const s = world({ started: true });
    s.content = { enabled: [] };
    expect(addHold(s, ctx(), ANN, 4, 'followed_lead')).toEqual([]);
    expect(holdOf(s)).toBe(0);
  });
});

describe('bands and frames', () => {
  it('reads the band of a float hold', () => {
    expect(holdBandOf(reg, 0)).toBe('interest');
    expect(holdBandOf(reg, 19.5)).toBe('interest');
    expect(holdBandOf(reg, 20)).toBe('testing');
    expect(holdBandOf(reg, 59.9)).toBe('keeping');
    expect(holdBandOf(reg, 100)).toBe('possessing');
    expect(bandIndex(reg, 65)).toBe(3);
  });
  it('frameEntry reads the registry', () => {
    expect(frameEntry(reg, 'role')?.holdFloor).toBe(40);
    expect(frameEntry(reg, 'equal')?.holdCeiling).toBe(39);
  });
  it('compatibility is 1 until the position reads', () => {
    expect(compatibilityOf(world(), reg, ANN)).toBe(1);
  });
});

describe('tracks', () => {
  it('xp 30 is level 2 (thresholds 10 / 30 / ...); trackCap is 0 with the category off or limited', () => {
    const s = world({ started: true });
    addTrackXp(s, reg, ANN, 'restraint', 30);
    expect(dynamicOf(s, ANN)!.tracks.restraint).toEqual({ xp: 30, level: 2 });
    expect(trackLevel(s, ANN, 'restraint')).toBe(2);
    expect(trackCap(s, reg, ANN, 'restraint')).toBe(2);
    addTrackXp(s, reg, ANN, 'restraint', 200);
    expect(trackLevel(s, ANN, 'restraint')).toBe(5);

    const off = structuredClone(s);
    off.content = { enabled: ['denial'] }; // another practice category: the dynamic is on, restraint is not
    expect(trackCap(off, reg, ANN, 'restraint')).toBe(0);
    const limited = structuredClone(s);
    unitOf(limited, ANN).bond!.ownLimits = { categories: ['restraint'] };
    expect(trackCap(limited, reg, ANN, 'restraint')).toBe(0);
    const before = structuredClone(limited);
    expect(addTrackXp(limited, reg, ANN, 'restraint', 50)).toEqual([]);
    expect(limited).toEqual(before);
  });
  it('a track without a category is open while the dynamic is on; an unknown track or a unit with no dynamic does nothing', () => {
    const s = world({ started: true });
    addTrackXp(s, reg, ANN, 'discipline', 10);
    expect(trackCap(s, reg, ANN, 'discipline')).toBe(1);
    const before = structuredClone(s);
    addTrackXp(s, reg, ANN, 'nope', 10);
    addTrackXp(s, reg, BEA, 'restraint', 10);
    expect(s).toEqual(before);
    expect(trackLevel(s, BEA, 'restraint')).toBe(0);
    expect(trackCap(s, reg, BEA, 'restraint')).toBe(0);
  });
});

describe('favour', () => {
  it('clamps to ±20', () => {
    const s = world({ started: true });
    addFavour(s, ANN, 15);
    addFavour(s, ANN, 15);
    expect(dynamicOf(s, ANN)!.favour).toBe(20);
    addFavour(s, ANN, -100);
    expect(dynamicOf(s, ANN)!.favour).toBe(-20);
    addFavour(s, BEA, 5); // no dynamic: nothing
    expect(dynamicOf(s, BEA)).toBeUndefined();
  });
});
