import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { newReading } from '../../../src/engine/dynamic/reading';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { defaultExpectation, leadingStyle, noteEvents, surfaceHolds } from '../../../src/engine/dynamic/style';
import type { ExpectationProfile } from '../../../src/engine/dynamic/expectations';
import { SURFACE_CONDITIONS, type Frame, type ProfileStyle, type SurfaceCondition } from '../../../src/engine/dynamic/types';
import { expectedOption, resetExpectations } from '../../../src/engine/moments/answer';
import { fireMoment } from '../../../src/engine/moments/fire';
import { momentsOf } from '../../../src/engine/moments/state';
import type { PhysicsRun } from '../../../src/engine/physics/state';
import { blendedStyle, physicsStyleOf, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
  resetExpectations();
  installDynamicHooks();
});
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** A scene with Ann (and `with`) where she holds at `frame` with the pair `primary` + `secondary`. */
function world(over: { primary?: ProfileStyle; secondary?: ProfileStyle; frame?: Frame; with?: string[]; expect?: ExpectationProfile; mode?: 'private' | 'group'; exchanges?: number } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
      style: over.secondary === undefined ? { primary: over.primary ?? 'cold' } : { primary: over.primary ?? 'cold', secondary: over.secondary },
      audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
  if (over.expect !== undefined) unitOf(s, ANN).expectations = over.expect;
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'play', hold: 30 };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, ...(over.with ?? [])], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  const d = r.state;
  d.scene!.exchanges = over.exchanges ?? 5;
  if (over.mode !== undefined) d.scene!.mode = over.mode;
  return d;
}
/** A physics run of hers at this share of its capacity. */
const withRun = (s: CampaignState, share: number): CampaignState => {
  s.scene!.physics = { id: 'p1', holderId: ANN, gauge: share * 100, capacity: 100 } as PhysicsRun;
  s.scene!.physicsCount = 1;
  return s;
};
const holds = (s: CampaignState, c: SurfaceCondition): boolean => surfaceHolds(s, reg, ANN, c);

describe('the style pair leads the phase', () => {
  it('the secondary leads while its condition holds: affectionate + cruel at the physics peak, the primary after the hold', () => {
    const s = world({ primary: 'affectionate', secondary: 'cruel' });
    expect(physicsStyleOf(s, ANN, reg)).toEqual({ primary: 'affectionate', secondary: 'cruel', phaseLead: 'primary' }); // no run yet
    withRun(s, 0.2); // the commander's reserve is nearly gone: the peak
    expect(physicsStyleOf(s, ANN, reg).phaseLead).toBe('secondary');
    expect(leadingStyle(s, reg, ANN)).toEqual({ key: 'cruel', phaseLead: 'secondary' });
    delete s.scene!.physics; // the hold is over
    expect(physicsStyleOf(s, ANN, reg).phaseLead).toBe('primary');
    expect(leadingStyle(s, reg, ANN)).toEqual({ key: 'affectionate', phaseLead: 'primary' });
  });

  it('a run that has not reached the peak leaves the primary in the lead', () => {
    const s = withRun(world({ primary: 'affectionate', secondary: 'cruel' }), 0.9);
    expect(physicsStyleOf(s, ANN, reg).phaseLead).toBe('primary');
  });

  it('drill and vindictive secondaries take the peak too (the tuned list), a playful one does not', () => {
    for (const secondary of ['drill', 'vindictive', 'cruel'] as const) expect(leadingStyle(withRun(world({ primary: 'regal', secondary }), 0.2), reg, ANN).phaseLead, secondary).toBe('secondary');
    expect(leadingStyle(withRun(world({ primary: 'regal', secondary: 'playful' }), 0.2), reg, ANN).phaseLead).toBe('primary');
  });

  it('affectionate comes through after the peak, as the secondary', () => {
    const s = world({ primary: 'cruel', secondary: 'affectionate' });
    expect(leadingStyle(s, reg, ANN).phaseLead).toBe('primary');
    s.scene!.physicsCount = 1; // a run this scene has ended
    expect(leadingStyle(s, reg, ANN)).toEqual({ key: 'affectionate', phaseLead: 'secondary' });
  });

  it('ritual surfaces before others (a group scene), and at the edges of a scene', () => {
    const group = world({ primary: 'cold', secondary: 'ritual', with: [BEA], mode: 'group' });
    expect(leadingStyle(group, reg, ANN).phaseLead).toBe('secondary');
    const alone = world({ primary: 'cold', secondary: 'ritual', exchanges: 5 });
    expect(leadingStyle(alone, reg, ANN).phaseLead).toBe('primary');
    expect(leadingStyle(world({ primary: 'cold', secondary: 'ritual', exchanges: 0 }), reg, ANN).phaseLead).toBe('secondary'); // the start
    expect(leadingStyle(world({ primary: 'cold', secondary: 'ritual', exchanges: 60 }), reg, ANN).phaseLead).toBe('secondary'); // the end
  });

  it('a unit without a secondary, without a scene or without a dynamic leads with the primary (neutral without a practice)', () => {
    expect(leadingStyle(world({ primary: 'cruel' }), reg, ANN)).toEqual({ key: 'cruel', phaseLead: 'primary' });
    const none = world({ secondary: 'cruel' });
    delete none.scene;
    expect(leadingStyle(none, reg, ANN).phaseLead).toBe('primary');
    expect(leadingStyle(world(), reg, BEA)).toEqual({ key: 'neutral', phaseLead: 'primary' });
  });

  it('numbers blend 65/35 through P15a: the reversed pair in the secondary\'s phase', () => {
    const s = world({ primary: 'affectionate', secondary: 'cruel' });
    const rows = TUNING.physics.style;
    const at = (): number => blendedStyle(physicsStyleOf(s, ANN, reg), 'windowMs');
    expect(at()).toBeCloseTo(0.65 * rows.affectionate.windowMs + 0.35 * rows.cruel.windowMs, 6);
    withRun(s, 0.2);
    expect(at()).toBeCloseTo(0.65 * rows.cruel.windowMs + 0.35 * rows.affectionate.windowMs, 6); // reversed at the peak
  });
});

describe('the conditions, one pure check each', () => {
  it('every condition of the closed list has a check, and none draws or writes', () => {
    const s = world({ primary: 'cold', secondary: 'ritual' });
    const before = JSON.stringify(s);
    for (const c of SURFACE_CONDITIONS) expect(typeof holds(s, c), c).toBe('boolean');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('peak and scene_edges: the physics gauge and the exchange count', () => {
    const s = world();
    expect(holds(s, 'peak')).toBe(false);
    expect(holds(withRun(s, 0.3), 'peak')).toBe(true);
    withRun(s, 0.31);
    expect(holds(s, 'peak')).toBe(false);
    for (const [n, edge] of [[0, true], [1, true], [2, false], [10, false], [TUNING.dynamic.style.edgeEnd, true]] as const) {
      s.scene!.exchanges = n;
      expect(holds(s, 'scene_edges'), `exchange ${n}`).toBe(edge);
    }
  });

  it('before_others and third_person: participants and a visitor', () => {
    const solo = world();
    expect(holds(solo, 'before_others')).toBe(false);
    expect(holds(solo, 'third_person')).toBe(false);
    const group = world({ with: [BEA], mode: 'group' });
    expect(holds(group, 'before_others')).toBe(true);
    expect(holds(group, 'third_person')).toBe(true);
    const visitor = world();
    visitor.scene!.moments = { fired: [], open: { id: 'm1', sourceId: 'third_party', exchange: 1, options: [], unitId: ANN, visitorId: BEA } };
    expect(holds(visitor, 'third_person')).toBe(true);
    expect(holds(visitor, 'before_others')).toBe(false);
  });

  it('displeased and low_stakes_good_mood read her satisfaction (frustrated, content), not the favour\'s sign; a run is not low stakes (M11)', () => {
    // chunk (h) encoded the favour stand-in here (-3 and 4); satisfaction needs -5 / 5, or a refusal of hers within two days
    const s = world();
    expect(holds(s, 'displeased')).toBe(false);
    expect(holds(s, 'low_stakes_good_mood')).toBe(false);
    dynamicOf(s, ANN)!.favour = -3;
    expect(holds(s, 'displeased')).toBe(false); // not frustrated yet
    dynamicOf(s, ANN)!.favour = -5;
    expect(holds(s, 'displeased')).toBe(true);
    dynamicOf(s, ANN)!.favour = 0;
    dynamicOf(s, ANN)!.refusals = [s.day]; // a refusal of hers within two days frustrates her whatever the favour says
    expect(holds(s, 'displeased')).toBe(true);
    dynamicOf(s, ANN)!.refusals = [];
    dynamicOf(s, ANN)!.favour = 4;
    expect(holds(s, 'low_stakes_good_mood')).toBe(false); // not content yet
    dynamicOf(s, ANN)!.favour = 5;
    expect(holds(s, 'low_stakes_good_mood')).toBe(true);
    expect(holds(withRun(s, 0.9), 'low_stakes_good_mood')).toBe(false);
  });

  it('threat: another holder in the scene', () => {
    const s = world({ with: [BEA], mode: 'group' });
    expect(holds(s, 'threat')).toBe(false);
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 30 };
    expect(holds(s, 'threat')).toBe(true);
    s.relations[BEA].dynamic!.frame = 'equal';
    expect(holds(s, 'threat')).toBe(false);
  });

  it('after_defiance: a refusal today, on her record or in the scene', () => {
    const s = world();
    expect(holds(s, 'after_defiance')).toBe(false);
    dynamicOf(s, ANN)!.refusals = [s.day - 1];
    expect(holds(s, 'after_defiance')).toBe(false);
    dynamicOf(s, ANN)!.refusals = [s.day];
    expect(holds(s, 'after_defiance')).toBe(true);
    const scene = world();
    scene.scene!.refusals = [{ unitId: ANN, exchange: 2 }];
    expect(holds(scene, 'after_defiance')).toBe(true);
  });

  it('after_peak_or_wound: a run that has ended, or the commander injured', () => {
    const s = world();
    expect(holds(s, 'after_peak_or_wound')).toBe(false);
    expect(holds(withRun(s, 0.2), 'after_peak_or_wound')).toBe(false); // still at the peak
    delete s.scene!.physics;
    expect(holds(s, 'after_peak_or_wound')).toBe(true);
    const hurt = world();
    hurt.commander.injuredUntilDay = hurt.day + 2;
    expect(holds(hurt, 'after_peak_or_wound')).toBe(true);
  });

  it('new_practice: the latest of recent, a practice (not a probe axis) not used before', () => {
    const s = world();
    dynamicOf(s, ANN)!.recent = ['space', 'touch'];
    expect(holds(s, 'new_practice')).toBe(false);
    dynamicOf(s, ANN)!.recent = ['space', 'kneel'];
    expect(holds(s, 'new_practice')).toBe(true);
    dynamicOf(s, ANN)!.recent = ['kneel', 'space', 'kneel'];
    expect(holds(s, 'new_practice')).toBe(false);
  });

  it('stagnation: an endurance gain was noted, and none for seven days', () => {
    const s = world();
    expect(holds(s, 'stagnation')).toBe(false);
    s.dynamic!.noted = { enduranceDay: s.day - 6 };
    expect(holds(s, 'stagnation')).toBe(false);
    s.dynamic!.noted = { enduranceDay: s.day - 7 };
    expect(holds(s, 'stagnation')).toBe(true);
  });

  it('training_start: the scene\'s activity drills someone', () => {
    const s = world();
    expect(holds(s, 'training_start')).toBe(false);
    s.scene!.activityId = 'train';
    expect(holds(s, 'training_start')).toBe(true);
    s.scene!.activityId = 'talk';
    expect(holds(s, 'training_start')).toBe(false);
  });

  it('praised_or_ignored: no contact for three days', () => {
    const s = world();
    s.relations[ANN].contactDay = s.day;
    expect(holds(s, 'praised_or_ignored')).toBe(false);
    s.relations[ANN].contactDay = s.day - 3;
    expect(holds(s, 'praised_or_ignored')).toBe(true);
  });

  it('praised_or_ignored reads both halves: praised or agreed with today, as well as ignored for three days', () => {
    for (const landed of ['praised', 'opinion_agreed']) {
      const s = world();
      s.relations[ANN].contactDay = s.day; // she is not being ignored
      expect(holds(s, 'praised_or_ignored'), landed).toBe(false);
      noteEvents(s, { registries: reg }, [{ type: 'intents_applied', landed: [landed] }]);
      expect(s.dynamic!.noted).toEqual({ praisedDay: s.day });
      expect(holds(s, 'praised_or_ignored'), landed).toBe(true);
      s.day += 1; // only today
      s.relations[ANN].contactDay = s.day;
      expect(holds(s, 'praised_or_ignored'), landed).toBe(false);
    }
    const off = world();
    off.content = { enabled: [] };
    noteEvents(off, { registries: reg }, [{ type: 'intents_applied', landed: ['praised'] }]);
    expect(off.dynamic!.noted).toBeUndefined();
  });

  it('crime_mentioned: the crime was revealed today; failed_run: the last expedition failed within two days', () => {
    const s = world();
    expect(holds(s, 'crime_mentioned')).toBe(false);
    s.dynamic!.noted = { crimeDay: s.day };
    expect(holds(s, 'crime_mentioned')).toBe(true);
    s.dynamic!.noted = { crimeDay: s.day - 1 };
    expect(holds(s, 'crime_mentioned')).toBe(false);
    expect(holds(s, 'failed_run')).toBe(false);
    s.lastExpedition = { day: s.day - 1, outcome: 'failed' } as never;
    expect(holds(s, 'failed_run')).toBe(true);
    s.lastExpedition = { day: s.day - 1, outcome: 'success' } as never;
    expect(holds(s, 'failed_run')).toBe(false);
    s.lastExpedition = { day: s.day - 9, outcome: 'failed' } as never;
    expect(holds(s, 'failed_run')).toBe(false);
  });

  it('arrival_anniversary: every 30th campaign day', () => {
    const s = world();
    for (const [day, expected] of [[29, false], [30, true], [31, false], [60, true], [0, false]] as const) {
      s.day = day;
      expect(holds(s, 'arrival_anniversary'), `day ${day}`).toBe(expected);
    }
  });

  it('a caller with no registry leaves the primary in the lead (the P15a call sites all pass theirs)', () => {
    const s = withRun(world({ primary: 'affectionate', secondary: 'cruel' }), 0.2);
    expect(physicsStyleOf(s, ANN).phaseLead).toBe('primary');
    expect(physicsStyleOf(s, ANN, reg).phaseLead).toBe('secondary');
  });
});

describe('her default expectation', () => {
  /** An open her_affection moment (yielded · returned · resisted) with her reading `r`, `f`. */
  function moment(s: CampaignState, at: { r?: number; f?: number } = {}) {
    const d = structuredClone(s);
    d.scene!.exchanges = 2;
    dynamicOf(d, ANN)!.readOf = { ...newReading(), ...at, updates: 3 };
    fireMoment(d, { registries: reg }, 'her_affection', ANN);
    return { state: d, open: momentsOf(d.scene).open! };
  }
  const typeOf = (m: ReturnType<typeof moment>, key: string): string => m.open.options.find((o) => o.key === key)!.type;

  it('default expectation: a ritual holder (point dutiful) expects the yielded option', () => {
    const m = moment(world({ primary: 'ritual', frame: 'play' }));
    const e = defaultExpectation(m.state, reg, m.open);
    expect(typeOf(m, e.key)).toBe('yielded');
    expect(e.strength).toBe(1);
    expect(expectedOption(m.state, reg, m.open)).toEqual(e); // through the P15a reader
  });

  it('a playful holder (point bratty) expects the option that takes the lead back', () => {
    const m = moment(world({ primary: 'playful', frame: 'play' }));
    expect(typeOf(m, defaultExpectation(m.state, reg, m.open).key)).toBe('returned');
  });

  it('with no point (clinical) it is a tie: yielded in a dynamic at play or beyond, returned between equals', () => {
    const play = moment(world({ primary: 'clinical', frame: 'play' }));
    expect(typeOf(play, defaultExpectation(play.state, reg, play.open).key)).toBe('yielded');
    const equal = moment(world({ primary: 'clinical', frame: 'equal' }));
    expect(typeOf(equal, defaultExpectation(equal.state, reg, equal.open).key)).toBe('returned');
  });

  it('her reading matters: a holder whose point is still far on the other side wants the move that closes the gap', () => {
    const m = moment(world({ primary: 'cruel', frame: 'play' }), { r: 0.9, f: -0.5 }); // cruel's point is r -0.4, f 0.5
    const type = typeOf(m, defaultExpectation(m.state, reg, m.open).key);
    expect(['resisted', 'returned']).toContain(type);
  });

  it('preferences come from the profile: a profile value beats the style default', () => {
    const s = world({ primary: 'ritual', frame: 'play', expect: { moments: { her_affection: { type: 'resisted', strength: 2 } } } });
    const m = moment(s);
    const e = expectedOption(m.state, reg, m.open);
    expect(typeOf(m, e.key)).toBe('resisted');
    expect(e.strength).toBe(2);
    expect(typeOf(m, defaultExpectation(m.state, reg, m.open).key)).toBe('yielded'); // the default itself is the style's
  });

  it('a profile value of a type the moment does not offer falls back to the style default', () => {
    const s = world({ primary: 'ritual', frame: 'play', expect: { moments: { her_affection: { type: 'deflected', strength: 3 } } } });
    const m = moment(s);
    const offered = m.open.options.map((o) => o.type);
    if (!offered.includes('deflected')) {
      const e = expectedOption(m.state, reg, m.open);
      expect(typeOf(m, e.key)).toBe('yielded');
      expect(e.strength).toBe(1);
    }
  });
});

describe('what the surfacing notes from the events', () => {
  it('an endurance gain and a revealed crime are noted by day, only while the dynamic is on', () => {
    const s = world();
    noteEvents(s, { registries: reg }, [{ type: 'endurance_gained', physicsId: 'breath' }, { type: 'intents_applied', landed: ['praised', 'crime_revealed'] }]);
    expect(s.dynamic!.noted).toEqual({ enduranceDay: s.day, crimeDay: s.day, praisedDay: s.day });
    const quiet = world();
    noteEvents(quiet, { registries: reg }, [{ type: 'intents_applied', landed: ['protected'] }]);
    expect(quiet.dynamic!.noted).toBeUndefined();
    const off = world();
    delete off.dynamic;
    expect(noteEvents(off, { registries: reg }, [{ type: 'endurance_gained' }])).toEqual([]);
    expect(off.dynamic).toBeUndefined();
  });
});
