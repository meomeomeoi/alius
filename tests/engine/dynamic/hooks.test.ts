import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { blockingLive, entryAllowed, frameOf, resetBlockingHooks } from '../../../src/engine/blocking';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { ExpectationProfile } from '../../../src/engine/dynamic/expectations';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { expectedOption, resetExpectations } from '../../../src/engine/moments/answer';
import { fireMoment } from '../../../src/engine/moments/fire';
import { momentsOf } from '../../../src/engine/moments/state';
import { effectiveHoldsUntil, holdsUntilOf, physicsStyleOf, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** The three hooks, as `installDynamicHooks` leaves them (a test of P15a elsewhere resets them; this file puts them back). */
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
  resetExpectations();
  installDynamicHooks();
});

const EXPECT: ExpectationProfile = { holdsUntil: 'limit', moments: { her_affection: { type: 'yielded', strength: 3 } } };

/** A scene with Ann (not close: a comrade); Ann has a full practice and expectations; the dynamic is set up, her block per `frame`. */
function world(over: { frame?: Frame; started?: boolean; secondary?: ProfileStyle; expect?: ExpectationProfile; on?: string[] } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  const unit = unitOf(s, ANN);
  unit.bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } },
      style: over.secondary === undefined ? { primary: 'cold' } : { primary: 'cold', secondary: over.secondary },
      audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    },
  };
  unit.expectations = over.expect ?? EXPECT;
  s.content = { enabled: over.on ?? ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  if (over.started !== false) s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'equal' };
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
/** An open her_affection moment (yielded · returned · resisted, or whatever the source offers). */
function moment(s: CampaignState) {
  const d = structuredClone(s);
  d.scene!.exchanges = 2;
  fireMoment(d, { registries: reg }, 'her_affection', ANN);
  return { state: d, open: momentsOf(d.scene).open! };
}

describe('readers answer null when off', () => {
  it('with no state.dynamic or with holders 0, every reader defers to P15a', () => {
    const none = world({ frame: 'role' });
    delete none.dynamic;
    const zero = world({ frame: 'role' });
    zero.dynamic!.setup.holders = 0;
    for (const s of [none, zero]) {
      expect(frameOf(s, ANN)).toBe('equal');
      expect(physicsStyleOf(s, ANN)).toEqual({ primary: 'neutral' });
      expect(holdsUntilOf(s, ANN)).toBe('signal');
      const m = moment(s);
      expect(expectedOption(m.state, reg, m.open).strength).toBe(1); // P15a's default
      expect(entryAllowed(s, reg, { scope: 'dynamic' }, [ANN])).toBe(false);
      expect(blockingLive(s, reg)).toBe(false);
    }
  });

  it('with no practice category on, the readers that get a registry defer (the frame, style and holds readers see only the state)', () => {
    const s = world({ frame: 'role', on: ['worship'] });
    expect(blockingLive(s, reg)).toBe(false);
    const m = moment(s);
    expect(expectedOption(m.state, reg, m.open).strength).toBe(1);
  });

  it('a unit with no dynamic of her own is not read either', () => {
    const s = world({ started: false });
    expect(frameOf(s, ANN)).toBe('equal');
    expect(physicsStyleOf(s, ANN)).toEqual({ primary: 'neutral' });
    expect(holdsUntilOf(s, ANN)).toBe('signal');
    const m = moment(s);
    expect(expectedOption(m.state, reg, m.open).strength).toBe(1);
    expect(blockingLive(s, reg)).toBe(false);
  });
});

describe('the frame reader and the blocking gate', () => {
  it('a unit at role is at role, and a scope: dynamic entry passes', () => {
    const s = world({ frame: 'role' });
    expect(frameOf(s, ANN)).toBe('role');
    expect(entryAllowed(s, reg, { scope: 'dynamic' }, [ANN])).toBe(true);
    const equal = world({ frame: 'equal' });
    expect(frameOf(equal, ANN)).toBe('equal');
    expect(entryAllowed(equal, reg, { scope: 'dynamic' }, [ANN])).toBe(false);
  });

  it('a scene with a holder at play and no close tier is live; at equal it is not', () => {
    expect(blockingLive(world({ frame: 'play' }), reg)).toBe(true);
    expect(blockingLive(world({ frame: 'rule' }), reg)).toBe(true);
    expect(blockingLive(world({ frame: 'equal' }), reg)).toBe(false);
    const gone = world({ frame: 'play' });
    unitOf(gone, ANN).status = 'dead';
    expect(blockingLive(gone, reg)).toBe(false);
  });
});

describe('the physics style, what she holds until and her expectation', () => {
  it('her style pair comes from the profile; the primary leads the phase until the position reads', () => {
    expect(physicsStyleOf(world({ frame: 'play' }), ANN)).toEqual({ primary: 'cold', phaseLead: 'primary' });
    expect(physicsStyleOf(world({ frame: 'play', secondary: 'playful' }), ANN)).toEqual({ primary: 'cold', secondary: 'playful', phaseLead: 'primary' });
    const drift = world({ frame: 'play', secondary: 'playful' });
    unitOf(drift, ANN).development = { practice: { secondary: 'cruel' } } as never; // P14b: what she has become sits on top
    expect(physicsStyleOf(drift, ANN).secondary).toBe('cruel');
  });

  it('holdsUntil comes from her expectations; blackout without breath_play acts as limit', () => {
    expect(holdsUntilOf(world({ frame: 'play' }), ANN)).toBe('limit');
    const none = world({ frame: 'play', expect: { tells: [] } as ExpectationProfile });
    expect(holdsUntilOf(none, ANN)).toBe('signal'); // nothing of her own: P15a's default
    const blackout = world({ frame: 'play', expect: { holdsUntil: 'blackout' } });
    expect(holdsUntilOf(blackout, ANN)).toBe('blackout');
    expect(effectiveHoldsUntil(blackout, reg, ANN)).toBe('limit');
    const allowed = world({ frame: 'play', expect: { holdsUntil: 'blackout' }, on: ['restraint', 'breath_play'] });
    expect(effectiveHoldsUntil(allowed, reg, ANN)).toBe('blackout');
  });

  it('expectation: her profile moments.her_affection = yielded, strength 3, gives the yielded option', () => {
    const s = world({ frame: 'play' });
    const m = moment(s);
    const yielded = m.open.options.find((o) => o.type === 'yielded')!;
    expect(expectedOption(m.state, reg, m.open)).toEqual({ key: yielded.key, strength: 3 });
    // no value for this source: P15a's default (Task 16 gives the default expectation)
    const other = world({ frame: 'play', expect: { holdsUntil: 'limit' } });
    const o = moment(other);
    expect(expectedOption(o.state, reg, o.open).strength).toBe(1);
    // a profile value of a type the moment does not offer is ignored
    const odd = world({ frame: 'play', expect: { moments: { her_affection: { type: 'deflected', strength: 2 } } } });
    const od = moment(odd);
    const offered = od.open.options.map((x) => x.type);
    const e = expectedOption(od.state, reg, od.open);
    expect(od.open.options.some((x) => x.key === e.key)).toBe(true);
    if (!offered.includes('deflected')) expect(e.strength).toBe(1);
  });
});

describe('installing', () => {
  it('twice changes nothing', () => {
    const s = world({ frame: 'play', secondary: 'playful' });
    const m = moment(s);
    const read = () => [frameOf(s, ANN), physicsStyleOf(s, ANN), holdsUntilOf(s, ANN), expectedOption(m.state, reg, m.open), blockingLive(s, reg)];
    const once = read();
    installDynamicHooks();
    installDynamicHooks();
    expect(read()).toEqual(once);
    expect(dynamicOf(s, ANN)!.frame).toBe('play');
  });
});
