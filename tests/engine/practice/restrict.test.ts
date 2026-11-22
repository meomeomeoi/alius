import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { checkActivity } from '../../../src/engine/activities';
import '../../../src/engine/actions/calendar';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/warden';
import { restrictionReason } from '../../../src/engine/discipline/restrictions';
import { rollInitiative } from '../../../src/engine/dms';
import { Rng, seedRng } from '../../../src/engine/rng';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { applyCommanderPunishment, commanderRestriction, wardenOf } from '../../../src/engine/warden';
import { practiceDayStep } from '../../../src/engine/practice/dayStep';
import { blankPractices } from '../../../src/engine/practice/state';
import { errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { ANN, BEA, holderBond, unitOf, withWant, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const withRestriction = (what: 'no_dms_others' | 'no_free_activities' | 'room', over: { arg?: string; untilDay?: number } = {}): CampaignState => {
  const s = world(reg, 'role');
  s.practices = { ...blankPractices(), restrictions: [{ holderId: ANN, what, untilDay: over.untilDay ?? 21, ...(over.arg !== undefined ? { arg: over.arg } : {}) }] };
  return s;
};
const withCold = (until = 21): CampaignState => {
  const s = world(reg, 'role');
  s.practices = { ...blankPractices(), cold: { [ANN]: until } };
  return s;
};

describe('the readers', () => {
  it('without a warden or a practice they answer null', () => {
    const s = world(reg, 'role'); // `practices` is absent
    expect(commanderRestriction(s, reg, 'dm', undefined, ANN)).toBeNull();
    expect(commanderRestriction(s, reg, 'dm', undefined, BEA)).toBeNull();
    expect(commanderRestriction(s, reg, 'companion', 'rest')).toBeNull();
    expect(commanderRestriction(s, reg, 'scene', undefined, undefined, 'quarters_commander')).toBeNull();
    expect(restrictionReason(s, reg, ANN, 'scene')).toBeNull();
    s.practices = blankPractices();
    expect(commanderRestriction(s, reg, 'dm', undefined, BEA)).toBeNull();
    expect(restrictionReason(s, reg, ANN, 'scene')).toBeNull();
  });
});

describe('what she set binds only while she is live (I5)', () => {
  const startWith = (st: CampaignState, ids: string[], locationId = 'quarters_commander') => run(st, reg, { type: 'scene/start', payload: { locationId, participants: ids, origin: 'event', consumesSlot: false, startIndex: 0 } });
  const off = (s: CampaignState): CampaignState => { delete s.dynamic; return s; }; // the player's opt-out
  const fallen = (s: CampaignState): CampaignState => { s.relations[ANN].dynamic!.frame = 'equal'; return s; };

  it('with the dynamic switched off the commander can write again, spend free time and enter the room', () => {
    const dms = withRestriction('no_dms_others');
    expect(errors(run(dms, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'hello' } }).events)).toHaveLength(1);
    expect(errors(run(off(dms), reg, { type: 'dm/send', payload: { unitId: BEA, text: 'hello' } }).events)).toEqual([]);
    const free = off(withRestriction('no_free_activities'));
    expect(checkActivity(free, reg, { activityId: 'rest', companionId: BEA })).toBeNull();
    const room = off(withRestriction('room', { arg: 'quarters_commander' }));
    expect(commanderRestriction(room, reg, 'scene', undefined, undefined, 'quarters_commander')).toBeNull();
    expect(errors(startWith(room, [BEA]).events)).toEqual([]);
  });

  it('with the dynamic switched off her cold shoulder is gone: a DM to her and a scene with her open again', () => {
    const cold = off(withCold());
    expect(errors(run(cold, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'hello' } }).events)).toEqual([]);
    expect(restrictionReason(cold, reg, ANN, 'scene')).toBeNull();
    expect(errors(startWith(cold, [ANN]).events)).toEqual([]);
  });

  it('a holder who fell to equal binds nothing; the rows come back when she holds again', () => {
    expect(commanderRestriction(fallen(withRestriction('no_dms_others')), reg, 'dm', undefined, BEA)).toBeNull();
    expect(restrictionReason(fallen(withCold()), reg, ANN, 'scene')).toBeNull();
    const back = withRestriction('no_dms_others');
    expect(commanderRestriction(back, reg, 'dm', undefined, BEA)).not.toBeNull(); // live again: nothing was dropped
    expect(withCold().practices!.cold[ANN]).toBe(21);
  });

  it('only her own rows are frozen: another live holder\'s bar still holds', () => {
    const s = withRestriction('no_dms_others');
    s.practices!.restrictions.push({ holderId: BEA, what: 'no_dms_others', untilDay: 21 });
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond!);
    s.relations[BEA].dynamic = structuredClone(s.relations[ANN].dynamic!);
    fallen(s);
    expect(commanderRestriction(s, reg, 'dm', undefined, ANN)).toMatch(/Bea/);
  });
});

describe('no DMs to others', () => {
  it('a DM to anyone but her is refused with the reason; a DM to her is allowed; it ends after its last day', () => {
    const s = withRestriction('no_dms_others');
    const other = run(s, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'hello' } });
    expect(errors(other.events)).toHaveLength(1);
    expect(JSON.stringify(other.events)).toContain(unitOf(s, ANN).displayName);
    expect(JSON.stringify(other.events)).toMatch(/day 21/);
    expect(other.state).toBe(s);
    expect(errors(run(s, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'hello' } }).events)).toEqual([]);
    expect(commanderRestriction({ ...s, day: 21 }, reg, 'dm', undefined, BEA)).not.toBeNull();
    expect(commanderRestriction({ ...s, day: 22 }, reg, 'dm', undefined, BEA)).toBeNull();
  });
});

describe('no free activities', () => {
  it('a companion activity is refused except talk and medbay; an activity with no companion is not one', () => {
    const s = withRestriction('no_free_activities');
    expect(checkActivity(s, reg, { activityId: 'rest', companionId: BEA })).toMatch(/free time/);
    expect(checkActivity(s, reg, { activityId: 'talk', companionId: BEA })).toBeNull();
    expect(checkActivity(s, reg, { activityId: 'medbay', companionId: BEA })).toBeNull();
    expect(commanderRestriction(s, reg, 'dm', undefined, BEA)).toBeNull();
  });
});

describe('a room', () => {
  it('scene/start at the barred location is refused; another location is not', () => {
    const s = withRestriction('room', { arg: 'quarters_commander' });
    const start = (st: CampaignState, locationId: string) => run(st, reg, { type: 'scene/start', payload: { locationId, participants: [BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const barred = start(s, 'quarters_commander');
    expect(errors(barred.events)).toHaveLength(1);
    expect(JSON.stringify(barred.events)).toContain(unitOf(s, ANN).displayName);
    expect(errors(start(s, 'mess_hall').events)).toEqual([]);
    // the reader says so for that location only
    expect(commanderRestriction(s, reg, 'scene', undefined, undefined, 'quarters_commander')).not.toBeNull();
    expect(commanderRestriction(s, reg, 'scene', undefined, undefined, undefined)).toBeNull();
  });
});

describe('the cold shoulder', () => {
  it('a DM to her is refused ("She is not answering."), a scene with her is refused through restrictionReason, and DMs to others are free', () => {
    const s = withCold();
    const dm = run(s, reg, { type: 'dm/send', payload: { unitId: ANN, text: 'hello' } });
    expect(errors(dm.events)).toHaveLength(1);
    expect(JSON.stringify(dm.events)).toContain('She is not answering.');
    expect(errors(run(s, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'hello' } }).events)).toEqual([]);
    expect(restrictionReason(s, reg, ANN, 'scene')).toMatch(/not seeing the commander until day 21/);
    expect(restrictionReason(s, reg, BEA, 'scene')).toBeNull();
    expect(restrictionReason(s, reg, ANN, 'companion', 'rest')).toBeNull();
    const scene = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(scene.events)).toHaveLength(1);
    expect(restrictionReason({ ...s, day: 22 }, reg, ANN, 'scene')).toBeNull(); // it ends on its day
  });

  it('she starts no DM while it lasts, and draws no rng for it', () => {
    const s = withCold();
    unitOf(s, ANN).bond!.desire = 'high';
    const rng = new Rng(seedRng(7));
    expect(rollInitiative(s, reg, rng)).not.toContain(ANN);
    const plain = world(reg, 'role');
    unitOf(plain, ANN).bond!.desire = 'high';
    const a = new Rng(seedRng(7));
    const b = new Rng(seedRng(7));
    expect(rollInitiative(plain, reg, a)).toEqual(rollInitiative({ ...plain, practices: blankPractices() }, reg, b)); // a campaign with no shoulder draws exactly the same
  });

  it('both Wants rise each day and it ends on its day', () => {
    const s = withWant(withCold(21), 10);
    const d = structuredClone(s);
    const ctx = { registries: reg, rng: new Rng(d.rng) };
    const day20 = practiceDayStep(d, ctx);
    expect(d.relations[ANN].want).toBe(15);
    expect(ofType(day20, 'want_changed')).toMatchObject([{ unitId: ANN, cause: 'cold_shoulder' }]);
    d.day = 21;
    practiceDayStep(d, ctx);
    expect(d.relations[ANN].want).toBe(20);
    expect(d.practices!.cold[ANN]).toBe(21); // its last day: still there
    d.day = 22;
    practiceDayStep(d, ctx);
    expect(d.relations[ANN].want).toBe(20);
    expect(d.practices!.cold[ANN]).toBeUndefined();
  });
});

describe('the warden comes first', () => {
  it('a P13 campaign with both: the warden\'s message is the one given', () => {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed: 9 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    const s = out.state;
    applyCommanderPunishment(s, { registries: reg, rng: new Rng(seedRng(3)) }, 'privilege_revoked');
    expect(wardenOf(s)!.restrictions.length).toBeGreaterThan(0);
    // Ann holds (the dynamic is on, she is at `role`): a bar of hers binds only then
    unitOf(s, 'unit_ann').bond = holderBond();
    s.content = { enabled: ['restraint'] };
    s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    s.relations.unit_ann.dynamic = { ...blankDynamic(s.day), frame: 'role', hold: 30 };
    s.practices = { ...blankPractices(), restrictions: [{ holderId: 'unit_ann', what: 'no_dms_others', untilDay: s.day + 3 }, { holderId: 'unit_ann', what: 'no_free_activities', untilDay: s.day + 3 }] };
    expect(commanderRestriction(s, reg, 'dm', undefined, 'unit_ann')).toMatch(/The warden has revoked the commander's messages/);
    expect(commanderRestriction(s, reg, 'companion', 'rest')).toMatch(/The warden has revoked the commander's leave/);
    // once the warden's restriction has run out the holder's is the one given
    s.day = wardenOf(s)!.restrictions[0].untilDay + 1;
    s.practices.restrictions[0].untilDay = s.day + 3;
    s.practices.restrictions[1].untilDay = s.day + 3;
    expect(commanderRestriction(s, reg, 'dm', undefined, 'unit_cat')).toMatch(/barred/);
  });
});
