import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { driftRates, loudnessOf, selfFeeding, temptations, withinHold, type Temptation } from '../../../src/engine/craft/posture';
import type { PostureRun } from '../../../src/engine/craft/state';
import { blankPractices } from '../../../src/engine/practice/state';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, holdScene } from './world';

/**
 * P16b, Task 11: how hard a posture is to hold (`driftRates`: the preset's rates times the day's fatigue, a load, a hard floor, her weight, the commander's skill and the pair's mastery
 * of the posture) and what tempts the gaze (`temptations`: an impulse of 30 per event in the scene, a visitor 50, placed by a hash, never drawn). The threshold and the slip are the
 * instrument's business in real time; the numbers are `TUNING.craft.posture` (AUTHOR TO TUNE, G1 draft).
 */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const P = TUNING.craft.posture;
const rates = (s: CampaignState, preset: string, mods = {}) => driftRates(s, reg, ANN, preset, mods);
const near = (a: number | undefined, b: number): void => expect(a).toBeCloseTo(b, 9);
const setLevel = (s: CampaignState, key: string, level: number): void => { (s.commander.craft ??= {})[key] = { xp: 0, level, lastDay: s.day }; };

/** The preset's own rates are the ones of the spec TUNING, for a body at skill 0 with nothing else on it. */
describe('driftRates', () => {
  it('is the preset\'s rates when nothing else bears on the body (points per 10 s at skill 0)', () => {
    const s = holdScene(reg);
    const mods = { hardFloor: false, weight: false, earlierHolds: 0 };
    expect(rates(s, 'kneel_hands_behind_head', mods)).toEqual({ ...(reg.servicePostures.get('kneel_hands_behind_head')!.drift as object) });
    expect(rates(s, 'kneel_upright', mods)).toEqual({ hips: 5, knees: 3, head: 4, gaze: 0 });
    expect(rates(s, 'arms_out', mods)).toEqual({ arms: 10 });
  });

  it('an old base name reads as the base\'s default preset (the same rates)', () => {
    const s = holdScene(reg);
    expect(rates(s, 'kneeling_upright')).toEqual(rates(s, 'kneel_upright'));
    expect(rates(s, 'no_such')).toEqual({});
  });

  it('fatigue: x (1 + 0.1) for each hold earlier the same day', () => {
    const s = holdScene(reg);
    const base = { hardFloor: false, weight: false };
    near(rates(s, 'kneel_upright', { ...base, earlierHolds: 0 }).hips, 5);
    near(rates(s, 'kneel_upright', { ...base, earlierHolds: 2 }).hips, 5 * (1 + 2 * P.fatigue));
    expect(P.fatigue).toBeCloseTo(0.1, 9);
  });

  it('fatigue is read from the day\'s holds when not given (and not from yesterday\'s)', () => {
    const s = holdScene(reg);
    s.practices = { ...blankPractices(), postureDay: { day: s.day, holds: 3 } };
    near(driftRates(s, reg, ANN, 'kneel_upright', { hardFloor: false, weight: false }).hips, 5 * 1.3);
    s.practices!.postureDay = { day: s.day - 1, holds: 3 };
    near(driftRates(s, reg, ANN, 'kneel_upright', { hardFloor: false, weight: false }).hips, 5);
  });

  it('a load x 1.3 and a hard floor x 1.2', () => {
    const s = holdScene(reg);
    const base = { weight: false, earlierHolds: 0 };
    near(rates(s, 'kneel_upright', { ...base, hardFloor: false, load: true }).hips, 5 * 1.3);
    near(rates(s, 'kneel_upright', { ...base, hardFloor: true }).hips, 5 * 1.2);
    near(rates(s, 'kneel_upright', { ...base, hardFloor: true, load: true }).hips, 5 * 1.3 * 1.2);
    expect(P.load).toBe(1.3);
    expect(P.hardFloor).toBe(1.2);
  });

  it('the floor is hard under an anchor that is not furniture, soft on a bunk, and not asked about when no place is set', () => {
    const s = holdScene(reg);
    const at = (anchor?: string): CampaignState => {
      const d = structuredClone(s);
      if (anchor !== undefined) setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: anchor }, { at: 1, source: 'engine' });
      return d;
    };
    const hips = (d: CampaignState) => driftRates(d, reg, ANN, 'kneel_upright', { weight: false, earlierHolds: 0 }).hips;
    near(hips(at('floor')), 5 * 1.2); // bare floor
    near(hips(at('at_her_feet')), 5 * 1.2); // at her feet: the floor
    expect(hips(at())).toBe(5);
  });

  it('her weight: a physics the posture supports, running, bears down (x 1.25)', () => {
    const s = holdScene(reg);
    const base = { hardFloor: false, earlierHolds: 0 };
    near(rates(s, 'kneel_present', { ...base, weight: true }).arms, 8 * P.weight);
    expect(P.weight).toBeGreaterThan(1);
    // read from the run: a weight run on a contact the preset supports
    const d = structuredClone(s);
    d.scene!.physics = { id: 'p1', physicsId: 'weight', sourceKind: 'contact', sourceId: 'on_hands', holderId: ANN } as never;
    near(driftRates(d, reg, ANN, 'kneel_present', { hardFloor: false, earlierHolds: 0 }).arms, 8 * P.weight);
    near(driftRates(d, reg, ANN, 'kneel_upright', { hardFloor: false, earlierHolds: 0 }).hips, 5); // a posture that does not support it carries none of it
    d.scene!.physics = { id: 'p1', physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN } as never;
    near(driftRates(d, reg, ANN, 'kneel_present', { hardFloor: false, earlierHolds: 0 }).arms, 8); // a contact it does not support
  });

  it('skill slows the drift by 8 % a level of posture capacity, mastery of the posture by 5 % a level', () => {
    const s = holdScene(reg);
    const mods = { hardFloor: false, weight: false, earlierHolds: 0 };
    setLevel(s, 'posture', 3);
    near(rates(s, 'kneel_upright', mods).hips, 5 * (1 - 3 * 0.08));
    s.relations[ANN].craft = { postures: { kneel_upright: { xp: 80, day: s.day } } }; // 80 xp: level 2
    near(rates(s, 'kneel_upright', mods).hips, 5 * (1 - 3 * 0.08) * (1 - 2 * 0.05));
    near(rates(s, 'kneel_open', mods).knees, 3 * (1 - 3 * 0.08)); // the mastery is of one posture: this one has none
    expect(P.mastery).toBe(0.05);
  });

  it('the body route adds capacity (the commander\'s endurance above 3) and a faint skill never makes a rate negative', () => {
    const s = holdScene(reg);
    s.commander.body = { ...(s.commander.body ?? { strength: 3, endurance: 3, reflexes: 2 }), endurance: 5 } as never;
    setLevel(s, 'posture', 5);
    const r = driftRates(s, reg, ANN, 'kneel_upright', { hardFloor: false, weight: false, earlierHolds: 0 });
    near(r.hips, 5 * (1 - 0.08 * (5 + 2 * 0.5))); // capacity 6: the level and half a level for each point of endurance above 3
    expect(r.hips!).toBeGreaterThan(0);
  });

  it('the gaze has no fatigue term: the day\'s holds, a load, the floor and her weight do not move it (skill and mastery do)', () => {
    const s = holdScene(reg);
    const custom = { ...reg, servicePostures: new Map(reg.servicePostures) } as Registries;
    custom.servicePostures.set('kneel_upright', { ...reg.servicePostures.get('kneel_upright')!, drift: { hips: 5, gaze: 7 } });
    const tired = driftRates(s, custom, ANN, 'kneel_upright', { earlierHolds: 9, load: true, hardFloor: true, weight: true });
    const fresh = driftRates(s, custom, ANN, 'kneel_upright', { earlierHolds: 0, load: false, hardFloor: false, weight: false });
    expect(tired.gaze).toBe(7);
    expect(fresh.gaze).toBe(7);
    expect(tired.hips!).toBeGreaterThan(fresh.hips!);
    setLevel(s, 'posture', 2);
    near(driftRates(s, custom, ANN, 'kneel_upright', {}).gaze, 7 * (1 - 2 * 0.08));
    // a registry preset's own gaze rate is 0: it drifts only by temptation
    expect(rates(holdScene(reg), 'kneel_upright', { earlierHolds: 9 }).gaze).toBe(0);
  });

  it('draws nothing and writes nothing', () => {
    const s = holdScene(reg);
    const before = JSON.stringify(s);
    rates(s, 'kneel_upright');
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the terms inside one hold (the instrument plays them)', () => {
  it('a hold tires the body as it goes: +40 % over the first two minutes; past half way a drift feeds itself', () => {
    expect(withinHold(0)).toBe(1);
    near(withinHold(60), 1.2);
    near(withinHold(120), 1.4);
    near(withinHold(900), 1.4);
    expect(selfFeeding(0)).toBe(1);
    expect(selfFeeding(50)).toBe(1);
    near(selfFeeding(80), 1.3);
    near(selfFeeding(100), 1.5);
  });

  it('a correction sounds as (drift / 100)^1.4: small early corrections are quiet', () => {
    near(loudnessOf(100), 1);
    near(loudnessOf(50), Math.pow(0.5, 1.4));
    expect(loudnessOf(20)).toBeLessThan(0.15);
    expect(loudnessOf(0)).toBe(0);
    expect(P.loudExp).toBe(1.4);
    expect(P.correctStep).toBe(38);
    expect(P.slipAt).toBe(100);
  });
});

describe('temptations', () => {
  const run = (over: Partial<PostureRun> = {}): PostureRun => ({
    id: 'pr1', holderId: ANN, presetId: 'kneel_upright', startedAt: 0, present: [ANN], beats: 0, slips: 0, corrections: 0, ...over,
  } as PostureRun);

  /** The scene with Ann and Bea in the room as a run began at exchange 0: now Bea comes in and Ann takes a thing off. */
  function eventful(): CampaignState {
    const s = holdScene(reg);
    s.scene!.exchanges = 4;
    return s;
  }
  const kinds = (t: Temptation[]) => t.map((x) => x.kind);

  it('a quiet scene tempts nothing: impulses come only with events', () => {
    expect(temptations(holdScene(reg), reg, run())).toEqual([]);
  });

  it('a participant who joined is a visitor: an impulse of 50 over 4.5 s', () => {
    const s = eventful();
    s.scene!.participants = [ANN, BEA];
    const t = temptations(s, reg, run());
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: 'visitor', size: 50, len: 4.5 });
    expect(P.impulse.visitor).toBe(50);
    expect(P.impulse.event).toBe(30);
  });

  it('a worn item of hers taken off is her undressing: 30 over 3.5 s, only after the run began and only her own', () => {
    const s = eventful();
    s.scene!.stagingLog = [
      { at: 1, blocking: {}, person: ANN, field: 'removed', value: 'blindfold', source: 'engine', exchange: 2 },
      { at: 1, blocking: {}, person: COMMANDER, field: 'removed', value: 'blindfold', source: 'chip', exchange: 3 }, // the commander's own: no one undresses
      { at: 1, blocking: {}, person: ANN, field: 'removed', value: 'blindfold', source: 'engine', exchange: 0 }, // before the run began
    ] as never;
    const t = temptations(s, reg, run({ startedAt: 1 }));
    expect(kinds(t)).toEqual(['undress']);
    expect(t[0]).toMatchObject({ size: 30, len: 3.5 });
  });

  it('a moment source that is a visitor (third_party) fired during the run is a visitor too', () => {
    const s = eventful();
    s.scene!.moments = { fired: [{ sourceId: 'third_party', exchange: 2 }, { sourceId: 'her_offer', exchange: 3 }] } as never;
    const t = temptations(s, reg, run({ startedAt: 1 }));
    expect(kinds(t)).toEqual(['visitor']); // read by the source's `live` kind, never by its id
  });

  it('is placed by a hash of the run and the event: the same run and events give the same impulses, another run gives other places; nothing is drawn', () => {
    const s = eventful();
    s.scene!.participants = [ANN, BEA];
    s.scene!.moments = { fired: [{ sourceId: 'third_party', exchange: 2 }] } as never;
    const rng = JSON.stringify(s.rng);
    const a = temptations(s, reg, run());
    const b = temptations(s, reg, run());
    expect(b).toEqual(a);
    expect(a).toHaveLength(2);
    const other = temptations(s, reg, run({ id: 'pr2' }));
    expect(other.map((x) => x.delay)).not.toEqual(a.map((x) => x.delay));
    for (const x of a) { expect(x.delay).toBeGreaterThanOrEqual(0); expect(x.delay).toBeLessThanOrEqual(P.impulse.delayMax); }
    expect(new Set(a.map((x) => x.key)).size).toBe(2);
    expect(JSON.stringify(s.rng)).toBe(rng);
    const spy = vi.spyOn(Rng.prototype as unknown as { next: () => number }, 'next');
    temptations(s, reg, run());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
