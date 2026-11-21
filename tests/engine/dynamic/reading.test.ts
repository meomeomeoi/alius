import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/moments';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { addHold, compatibilityOf } from '../../../src/engine/dynamic/hold';
import { newReading, readMoments, regionOf, resettleReading, updateReading, distanceToPoint, type ReadingSample } from '../../../src/engine/dynamic/reading';
import { blankDynamic, dynamicOf, newDynamicCampaign, type HerReading } from '../../../src/engine/dynamic/state';
import type { Frame, Motive, ProfileStyle, RegionRank } from '../../../src/engine/dynamic/types';
import { fireMoment } from '../../../src/engine/moments/fire';
import { momentsOf } from '../../../src/engine/moments/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import type { PhysicsStyle } from '../../../src/engine/physics/state';
import type { CampaignState, Insight } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** A reading with these fields (the motive weights default to even). */
function reading(over: Partial<Omit<HerReading, 'motive'>> & { motive?: Partial<Record<Motive, number>> } = {}): HerReading {
  const m: Record<Motive, number> = { order: 0.2, fear: 0.2, her: 0.2, process: 0.2, gain: 0.2 };
  return { ...newReading(), ...over, motive: { ...m, ...over.motive } };
}
const big = (k: Motive): Partial<Record<Motive, number>> => ({ order: 0.1, fear: 0.1, her: 0.1, process: 0.1, gain: 0.1, [k]: 0.6 });

function world(over: { frame?: Frame; style?: ProfileStyle; secondary?: ProfileStyle; started?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
      style: over.secondary === undefined ? { primary: over.style ?? 'ritual' } : { primary: over.style ?? 'ritual', secondary: over.secondary },
      audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  if (over.started !== false) s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'equal' };
  return s;
}

describe('the region table', () => {
  it('the region table in order: hollow, elusive, cowed, double game, calculating, bratty, proud, hungry, reluctant, dutiful, devoted', () => {
    const cases: Array<[RegionRank, HerReading]> = [
      ['hollow', reading({ flat: 0.5, deflect: 0.9, r: 1, motive: big('fear') })], // hollow wins over everything below
      ['elusive', reading({ deflect: 0.4, motive: big('fear') })],
      ['cowed', reading({ motive: big('fear'), f: 0.9 })],
      ['double_game', reading({ f: 0.3, motive: big('gain') })],
      ['calculating', reading({ f: 0.29, motive: big('gain') })],
      ['bratty', reading({ f: 0.3, p: 0.5 })],
      ['proud', reading({ f: 0.3, p: 0.49 })],
      ['hungry', reading({ r: 0.3, f: 0, motive: big('process') })],
      ['reluctant', reading({ r: -0.1, f: 0.29 })],
      ['dutiful', reading({ r: 0.3, f: -0.2, motive: big('order') })],
      ['devoted', reading({ r: 0.1, motive: big('her') })],
    ];
    for (const [expected, r] of cases) expect(regionOf(r), expected).toBe(expected);
    // the ranks are the table's order, so every region of the registry is covered
    expect(cases.map(([k]) => k)).toEqual([...reg.positionRegions.values()].map((e) => e.rank));
  });

  it('a tie of the largest motive is nobody\'s; process needs the largest weight, and hungry also needs friction >= 0', () => {
    expect(regionOf(reading({ r: 0.5, f: 0, motive: { process: 0.3, order: 0.3 } }))).toBe('devoted');
    expect(regionOf(reading({ r: 0.5, f: -0.1, motive: big('process') }))).toBe('devoted');
    expect(regionOf(reading({ r: 0.5, f: 0, motive: big('process') }))).toBe('hungry');
  });

  it('a declaration blends into the motive while it has weight', () => {
    const r = reading({ r: 0.5, f: -0.2 });
    expect(regionOf(r)).toBe('devoted');
    expect(regionOf(r, { motive: 'order', weight: 0.5 })).toBe('dutiful');
    expect(regionOf(r, { motive: 'order', weight: 0 })).toBe('devoted');
  });
});

describe('updates', () => {
  const style: PhysicsStyle = { primary: 'clinical' };
  const mid: Insight = 'mid';

  it('every axis moves alpha of the way, and never past its range', () => {
    const rel = blankDynamic(1);
    updateReading(rel, { response: 'yielded' }, 0.1, style, mid);
    expect(rel.readOf.r).toBeCloseTo(0.1, 6);
    updateReading(rel, { response: 'resisted' }, 0.5, style, mid);
    expect(rel.readOf.r).toBeLessThan(0.1);
    expect(rel.readOf.f).toBeGreaterThan(0);
    updateReading(rel, { response: 'returned' }, 0.5, style, mid);
    expect(rel.readOf.p).toBeGreaterThan(0);
    updateReading(rel, { response: 'deflected' }, 0.5, style, mid);
    expect(rel.readOf.deflect).toBeGreaterThan(0);
    expect(rel.readOf.updates).toBe(4);
    for (let i = 0; i < 80; i++) updateReading(rel, { response: 'yielded', tone: 'flat' }, 0.5, style, mid);
    expect(rel.readOf.r).toBeLessThanOrEqual(1);
    expect(rel.readOf.flat).toBeLessThanOrEqual(1);
  });

  it('tone speaks for the motive: transactional gain, a sincere yield order, a yield after a threat fear; the weights stay at 1', () => {
    const t = blankDynamic(1);
    updateReading(t, { response: 'yielded', tone: 'transactional' }, 0.3, style, mid);
    expect(t.readOf.motive.gain).toBeGreaterThan(t.readOf.motive.order);
    const s = blankDynamic(1);
    updateReading(s, { response: 'yielded', tone: 'sincere' }, 0.3, style, mid);
    expect(s.readOf.motive.order).toBeGreaterThan(s.readOf.motive.gain);
    expect(s.readOf.sincere).toBeGreaterThan(0);
    const f = blankDynamic(1);
    updateReading(f, { response: 'yielded', afterThreat: true }, 0.3, style, mid);
    expect(f.readOf.motive.fear).toBeGreaterThan(f.readOf.motive.order);
    for (const rel of [t, s, f]) expect(Object.values(rel.readOf.motive).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });

  it('hysteresis: a region changes only after three updates in a row; one stray answer changes nothing', () => {
    const rel = blankDynamic(1);
    rel.readOf = reading({ region: 'devoted', r: 0.1 });
    const shifts: unknown[] = [];
    const feed = (response: ReadingSample['response']): void => { const x = updateReading(rel, { response }, 0.5, style, mid).region; if (x) shifts.push(x); };
    feed('resisted'); // r < 0: the reluctant picture, 1 of 3
    expect(rel.readOf.region).toBe('devoted');
    expect(rel.readOf.pending).toEqual({ region: 'reluctant', count: 1 });
    feed('yielded'); // a stray answer: back to devoted, the count is gone
    expect(rel.readOf.region).toBe('devoted');
    expect(rel.readOf.pending).toBeUndefined();
    feed('resisted');
    feed('resisted');
    expect(shifts).toEqual([]);
    feed('resisted');
    expect(rel.readOf.region).toBe('proud'); // the friction has risen past 0.3 by now; what counts is three in a row of the same picture
    expect(shifts).toHaveLength(1);
  });

  it('a shift carries from and to and clears the pending count', () => {
    const rel = blankDynamic(1);
    rel.readOf = reading({ region: 'devoted', r: -0.5, f: 0 });
    const events = [0, 1, 2].map(() => updateReading(rel, { response: 'deflected' }, 0, style, mid).region);
    expect(events[0]).toBeUndefined();
    expect(events[2]).toEqual({ from: 'devoted', to: 'reluctant' });
    expect(rel.readOf.pending).toBeUndefined();
    expect(resettleReading(rel)).toEqual({});
  });

  it('misreading: the same five answers read differently by clinical and possessive; a low insight doubles it; no draw', () => {
    const answers: ReadingSample[] = [
      { response: 'yielded', tone: 'sincere' }, { response: 'yielded', tone: 'transactional' }, { response: 'resisted' }, { response: 'yielded', tone: 'ironic' }, { response: 'yielded', tone: 'sincere' },
    ];
    const read = (primary: PhysicsStyle['primary'], insight: Insight): HerReading => {
      const rel = blankDynamic(1);
      for (const a of answers) updateReading(rel, a, 0.15, { primary }, insight);
      return rel.readOf;
    };
    const exact = read('clinical', 'mid');
    const possessive = read('possessive', 'mid');
    const low = read('possessive', 'low');
    expect(possessive.motive.her).toBeGreaterThan(exact.motive.her);
    expect(low.motive.her).toBeGreaterThan(possessive.motive.her);
    expect(read('obsessive', 'mid').motive.her).toBeCloseTo(possessive.motive.her, 6);
    // the cruel reading sees defiance: r is lower, and low insight lowers it further
    const cruel = read('cruel', 'mid');
    expect(cruel.r).toBeLessThan(exact.r);
    expect(read('vindictive', 'low').r).toBeLessThan(cruel.r);
    // same answers, same reading: nothing is rolled
    expect(read('possessive', 'mid')).toEqual(possessive);
    // a secondary that leads the phase colours the reading in its place
    const rel = blankDynamic(1);
    for (const a of answers) updateReading(rel, a, 0.15, { primary: 'clinical', secondary: 'possessive', phaseLead: 'secondary' }, 'mid');
    expect(rel.readOf.motive.her).toBeCloseTo(possessive.motive.her, 6);
  });
});

describe('declarations', () => {
  it('declarations fade: weight 0.5 → 0.25 after 5 days → 0 after 10', () => {
    const s = world();
    const r = run(s, reg, { type: 'dynamic/declare', payload: { unitId: ANN, motive: 'her' } });
    expect(errors(r.events)).toEqual([]);
    let state = r.state;
    expect(dynamicOf(state, ANN)!.declared).toMatchObject({ motive: 'her', weight: 0.5, day: s.day });
    for (let i = 0; i < 5; i++) {
      const d = structuredClone(state);
      dynamicDayStep(d, { registries: reg, rng: { chance: () => false } as never });
      state = d;
    }
    expect(dynamicOf(state, ANN)!.declared!.weight).toBeCloseTo(0.25, 6);
    for (let i = 0; i < 5; i++) {
      const d = structuredClone(state);
      dynamicDayStep(d, { registries: reg, rng: { chance: () => false } as never });
      state = d;
    }
    expect(dynamicOf(state, ANN)!.declared).toBeUndefined();
  });

  it('dynamic/declare needs her block and a motive', () => {
    expect(errors(run(world({ started: false }), reg, { type: 'dynamic/declare', payload: { unitId: ANN, motive: 'her' } }).events)).not.toEqual([]);
    expect(errors(run(world(), reg, { type: 'dynamic/declare', payload: { unitId: ANN, motive: 'love' } }).events)).not.toEqual([]);
  });
});

describe('compatibility', () => {
  const read = (s: CampaignState, over: Parameters<typeof reading>[0]): void => { dynamicOf(s, ANN)!.readOf = reading({ updates: 5, ...over }); };

  it('is 1 until she has read anything', () => {
    expect(compatibilityOf(world(), reg, ANN)).toBe(1);
    expect(compatibilityOf(world({ started: false }), reg, ANN)).toBe(1);
  });

  it('a ritual holder with a dutiful reading: 1.2; with a bratty reading: closer to 0.8; hold gains use it', () => {
    const dutiful = world({ style: 'ritual' });
    read(dutiful, { r: 0.6, f: -0.4, region: 'dutiful' });
    expect(compatibilityOf(dutiful, reg, ANN)).toBeCloseTo(1.2, 6);
    addHold(dutiful, { registries: reg }, ANN, 4, 'followed_lead');
    expect(dynamicOf(dutiful, ANN)!.hold).toBeCloseTo(4.8, 6);
    const bratty = world({ style: 'ritual' });
    read(bratty, { r: -0.2, f: 0.8, p: 1, region: 'bratty' });
    const c = compatibilityOf(bratty, reg, ANN);
    expect(c).toBeLessThan(1);
    expect(c).toBeGreaterThanOrEqual(0.8);
    addHold(bratty, { registries: reg }, ANN, 4, 'followed_lead');
    expect(dynamicOf(bratty, ANN)!.hold).toBeCloseTo(4 * c, 3);
    expect(c).toBeLessThan(compatibilityOf(dutiful, reg, ANN));
  });

  it('a loss is not scaled by it, and the distance is the plane distance', () => {
    const s = world({ style: 'ritual' });
    read(s, { r: -1, f: 1 });
    dynamicOf(s, ANN)!.hold = 30;
    addHold(s, { registries: reg }, ANN, -4, 'refusal');
    expect(dynamicOf(s, ANN)!.hold).toBe(26);
    expect(distanceToPoint({ r: 0, f: 0 }, { r: 0.3, f: 0.4 })).toBeCloseTo(0.5, 6);
  });

  it('her own offset moves her point', () => {
    const s = world({ style: 'ritual' });
    unitOf(s, ANN).expectations = { offset: { r: -0.3, f: 0.3 } };
    read(s, { r: 0.6, f: -0.4 });
    expect(compatibilityOf(s, reg, ANN)).toBeLessThan(1.2);
    read(s, { r: 0.3, f: -0.1 });
    expect(compatibilityOf(s, reg, ANN)).toBeCloseTo(1.2, 6);
  });

  it('clinical has no point: it values a sincere tone and dislikes a double game or a hollow reading', () => {
    const s = world({ style: 'clinical' });
    read(s, { sincere: 1, region: 'devoted' });
    expect(compatibilityOf(s, reg, ANN)).toBeCloseTo(1.2, 6);
    read(s, { sincere: 1, region: 'hollow' });
    expect(compatibilityOf(s, reg, ANN)).toBeCloseTo(1.0, 6);
    read(s, { sincere: 0, region: 'double_game' });
    expect(compatibilityOf(s, reg, ANN)).toBeCloseTo(0.8, 6);
  });

  it('notWith other women: a romantic bond with another woman takes 0.1 off an obsessive holder', () => {
    const s = world({ style: 'obsessive' });
    read(s, { r: 0.8, f: 0 }); // the obsessive point is devoted: close to it
    const alone = compatibilityOf(s, reg, ANN);
    setRelation(s, 'unit_bea', { stateId: 'lovers' });
    expect(compatibilityOf(s, reg, ANN)).toBeLessThanOrEqual(alone);
  });
});

describe('moment answers', () => {
  /** An open her_affection moment in a scene with Ann at frame `play`. */
  function momentWorld(): CampaignState {
    const s = world({ frame: 'play' });
    dynamicOf(s, ANN)!.hold = 30;
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    const d = structuredClone(r.state);
    d.scene!.exchanges = 2;
    fireMoment(d, { registries: reg }, 'her_affection', ANN);
    return d;
  }

  it('moment_answered feeds the reading but not hold', () => {
    const s = momentWorld();
    const open = momentsOf(s.scene).open!;
    const key = open.options.find((o) => o.type === 'yielded')!.key;
    const before = dynamicOf(s, ANN)!;
    const r = run(s, reg, { type: 'moment/answer', payload: { momentId: open.id, key, tone: 'sincere' } });
    expect(errors(r.events)).toEqual([]);
    const after = dynamicOf(r.state, ANN)!;
    expect(after.readOf.updates).toBe(before.readOf.updates + 1);
    expect(after.readOf.r).toBeGreaterThan(before.readOf.r);
    expect(after.hold).toBe(before.hold);
    expect(r.events.some((e) => e.type === 'hold_changed')).toBe(false);
  });

  it('a unit with no block, and the dynamic off, are not read', () => {
    const answered = [{ type: 'moment_answered', unitId: ANN, responseType: 'yielded' }];
    const none = world({ started: false });
    expect(readMoments(none, { registries: reg }, answered)).toEqual([]);
    expect(dynamicOf(none, ANN)).toBeUndefined();
    const off = world();
    delete off.dynamic;
    readMoments(off, { registries: reg }, answered);
    expect(dynamicOf(off, ANN)!.readOf.updates).toBe(0);
    const on = world();
    readMoments(on, { registries: reg }, answered);
    expect(dynamicOf(on, ANN)!.readOf.updates).toBe(1);
  });
});

describe('memory', () => {
  it('position_shifted writes the hidden memory fact (hers alone), in her region word', () => {
    const s = world();
    rememberEvents(s, [{ type: 'position_shifted', unitId: ANN, from: 'reluctant', to: 'bratty' }], reg);
    const fact = s.memory.facts[s.memory.facts.length - 1];
    expect(fact.text).toContain('bratty');
    expect(fact.hiddenFromCommander).toBe(true);
    expect(fact.knownBy).toEqual([ANN]);
    expect(fact.about).toEqual([ANN]);
  });
});
