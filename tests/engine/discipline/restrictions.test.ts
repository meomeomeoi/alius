import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { disciplineOf } from '../../../src/engine/discipline';
import { addRestriction, dutySlot, expireRestrictions, removeRestrictions, restrictionReason } from '../../../src/engine/discipline/restrictions';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState, Restriction } from '../../../src/engine/state/types';
import { depart, payload, withMission } from '../../helpers/expedition';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 50;
  s.day = 5;
  return s;
};
const restrict = (s: CampaignState, r: Restriction): CampaignState => { addRestriction(s, r); return s; };
const confined = (s: CampaignState, untilDay: number) => restrict(s, { unitId: ANN, kind: 'confined', untilDay });
const talk = (s: CampaignState, unit = BEA) => run(s, reg, { type: 'activity/do', payload: { activityId: 'talk', companionId: unit } });

describe('a night knock is not held back', () => {
  it('a confined unit still opens the night scene the engine queued, but not an ordinary scene', () => {
    const s = fresh();
    confined(s, 9);
    const ordinary = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(ordinary.events)).toHaveLength(1);
    s.slot = 'night';
    const night = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'night', startIndex: 0, nightEntryId: 'n1' } });
    expect(errors(night.events)).toEqual([]);
    expect(night.state.scene).toMatchObject({ origin: 'night', participants: [ANN] });
  });
});

describe('restrictionReason', () => {
  it('the exact reasons', () => {
    const s = fresh();
    confined(s, 7);
    expect(restrictionReason(s, reg, ANN, 'scene')).toBe('Ann is in the brig until day 7.');
    restrict(s, { unitId: BEA, kind: 'no_leave', untilDay: 8 });
    expect(restrictionReason(s, reg, BEA, 'companion', 'rest')).toBe('Bea has no leave until day 8.');
    restrict(s, { unitId: 'unit_cat', kind: 'benched' });
    expect(restrictionReason(s, reg, 'unit_cat', 'expedition')).toBe('Cat is benched for the next expedition.');
    restrict(s, { unitId: 'unit_dee', kind: 'duty', day: s.day, slot: s.slot });
    expect(restrictionReason(s, reg, 'unit_dee', 'scene')).toBe('Dee is on extra duty this slot.');
  });

  it('a free unit, a grunt and an unknown id have no reason', () => {
    const s = fresh();
    expect(restrictionReason(s, reg, ANN, 'scene')).toBeNull();
    expect(restrictionReason(s, reg, 'nobody', 'scene')).toBeNull();
    delete s.discipline;
    expect(restrictionReason(s, reg, ANN, 'expedition')).toBeNull();
  });

  it('what each kind blocks', () => {
    const s = fresh();
    restrict(s, { unitId: ANN, kind: 'confined', untilDay: 6 });
    restrict(s, { unitId: BEA, kind: 'no_leave', untilDay: 6 });
    restrict(s, { unitId: 'unit_cat', kind: 'benched' });
    restrict(s, { unitId: 'unit_dee', kind: 'duty', day: s.day, slot: s.slot });
    const blocked = (id: string, use: 'scene' | 'companion' | 'expedition', activity?: string) => restrictionReason(s, reg, id, use, activity) !== null;
    expect([ANN, BEA, 'unit_cat', 'unit_dee'].map((id) => blocked(id, 'scene'))).toEqual([true, false, false, true]);
    expect([ANN, BEA, 'unit_cat', 'unit_dee'].map((id) => blocked(id, 'expedition'))).toEqual([true, false, true, true]);
    expect([ANN, BEA, 'unit_cat', 'unit_dee'].map((id) => blocked(id, 'companion', 'rest'))).toEqual([true, true, false, true]);
    // no_leave still allows the two activities that are not leave
    expect([blocked(BEA, 'companion', 'talk'), blocked(BEA, 'companion', 'medbay')]).toEqual([false, false]);
    expect([blocked(ANN, 'companion', 'talk'), blocked(ANN, 'companion', 'medbay')]).toEqual([true, true]); // the brig allows nothing
  });

  it('a restriction of another slot or day does not block', () => {
    const s = fresh();
    restrict(s, { unitId: ANN, kind: 'duty', day: s.day, slot: 'evening' });
    expect(restrictionReason(s, reg, ANN, 'scene')).toBeNull(); // it is the morning
    s.slot = 'evening';
    expect(restrictionReason(s, reg, ANN, 'scene')).not.toBeNull();
    s.day += 1;
    expect(restrictionReason(s, reg, ANN, 'scene')).toBeNull();
  });
});

describe('where it is enforced', () => {
  it('a confined unit cannot join a scene, be a companion or leave on a run until the day after untilDay', () => {
    const s = confined(fresh(), 6);
    const scene = (state: CampaignState) => run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(String(errors(scene(s).events)[0]?.message)).toBe('Ann is in the brig until day 6.');
    expect(String(errors(talk(s, ANN).events)[0]?.message)).toBe('Ann is in the brig until day 6.');
    const { state, mission } = withMission(reg, campaign(reg, 4), {}, (x) => { x.resources.supplies = 50; x.day = 5; });
    confined(state, 6);
    const start = run(state, reg, { type: 'expedition/start', payload: payload(state, mission.id) });
    expect(String(errors(start.events)[0]?.message)).toBe('Ann is in the brig until day 6.');
    expect(start.state).toBe(state);
    // the day after untilDay she is free
    for (const x of [s, state]) x.day = 7;
    expect(errors(scene(s).events)).toEqual([]);
    expect(errors(run(state, reg, { type: 'expedition/start', payload: payload(state, mission.id) }).events)).toEqual([]);
  });

  it('no_leave blocks rest and mess with her and allows talk and medbay', () => {
    const s = restrict(fresh(), { unitId: BEA, kind: 'no_leave', untilDay: 7 });
    for (const activityId of ['rest', 'train']) {
      const r = run(s, reg, { type: 'activity/do', payload: { activityId, companionId: BEA } });
      expect(String(errors(r.events)[0]?.message), activityId).toBe('Bea has no leave until day 7.');
    }
    expect(errors(run(s, reg, { type: 'activity/do', payload: { activityId: 'medbay', companionId: BEA } }).events)).toEqual([]);
    expect(errors(talk(s).events)).toEqual([]);
  });

  it('benched ends when a run starts without her and stays when the start is refused', () => {
    const { state, mission } = withMission(reg, campaign(reg, 4), {}, (x) => { x.resources.supplies = 50; x.day = 5; });
    restrict(state, { unitId: 'unit_dee', kind: 'benched' });
    const ids = state.roster.activeIds.filter((id) => id !== 'unit_dee').slice(0, 3);
    // a refused start (bad supplies) keeps it
    const refused = run(state, reg, { type: 'expedition/start', payload: payload(state, mission.id, { unitIds: ids, supplies: 999 }) });
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state.discipline!.restrictions.map((r) => r.kind)).toEqual(['benched']);
    // a start without her ends it
    const started = depart(reg, state, mission.id, { unitIds: ids });
    expect(started.discipline!.restrictions).toEqual([]);
  });

  it('benched stays for a unit that is in the party of a start that is refused for the bench itself', () => {
    const { state, mission } = withMission(reg, campaign(reg, 4), {}, (x) => { x.resources.supplies = 50; x.day = 5; });
    restrict(state, { unitId: 'unit_dee', kind: 'benched' });
    const r = run(state, reg, { type: 'expedition/start', payload: payload(state, mission.id) });
    expect(String(errors(r.events)[0]?.message)).toBe('Dee is benched for the next expedition.');
    expect(r.state.discipline!.restrictions).toHaveLength(1);
  });
});

describe('dutySlot and duty restrictions', () => {
  it('duty covers the current slot', () => {
    const s = fresh();
    expect(dutySlot(s)).toEqual({ day: 5, slot: 'morning' });
    s.slot = 'afternoon';
    expect(dutySlot(s)).toEqual({ day: 5, slot: 'afternoon' });
  });

  it('or the next one while a scene or a pending talk holds the current slot', () => {
    const s = fresh();
    s.slot = 'morning';
    s.calendar.pendingScene = { unitId: ANN, day: 5, slot: 'morning' };
    expect(dutySlot(s)).toEqual({ day: 5, slot: 'afternoon' });
    s.slot = 'evening';
    expect(dutySlot(s)).toEqual({ day: 6, slot: 'morning' }); // applied in the evening with a scene open → next day's morning
    s.slot = 'night';
    expect(dutySlot(s)).toEqual({ day: 6, slot: 'morning' });
    delete s.calendar.pendingScene;
    s.slot = 'evening';
    expect(dutySlot(s)).toEqual({ day: 5, slot: 'evening' });
    const r = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(dutySlot(r.state)).toEqual({ day: 5, slot: 'afternoon' });
  });
});

describe('the list of restrictions', () => {
  it('addRestriction reports it and removeRestrictions returns what it took out', () => {
    const s = fresh();
    expect(addRestriction(s, { unitId: ANN, kind: 'confined', untilDay: 7 })).toEqual([{ type: 'restriction_started', unitId: ANN, kind: 'confined', untilDay: 7 }]);
    addRestriction(s, { unitId: BEA, kind: 'benched', applicationId: 'ap1' });
    const gone = removeRestrictions(s, (r) => r.applicationId === 'ap1');
    expect(gone.map((r) => r.unitId)).toEqual([BEA]);
    expect(disciplineOf(s).restrictions.map((r) => r.unitId)).toEqual([ANN]);
    expect(removeRestrictions(s, () => false)).toEqual([]);
  });

  it('expired restrictions are dropped by the day step', () => {
    const s = fresh();
    s.day = 5;
    restrict(s, { unitId: ANN, kind: 'confined', untilDay: 5 });
    restrict(s, { unitId: BEA, kind: 'no_leave', untilDay: 7 });
    restrict(s, { unitId: 'unit_cat', kind: 'duty', day: 5, slot: 'morning' });
    restrict(s, { unitId: 'unit_dee', kind: 'benched' });
    const after = endDay(s, reg);
    expect(after.day).toBe(6);
    expect(after.discipline!.restrictions.map((r) => r.unitId).sort()).toEqual([BEA, 'unit_dee']);
  });

  it('expireRestrictions reports each end', () => {
    const s = fresh();
    restrict(s, { unitId: ANN, kind: 'confined', untilDay: 4 });
    const events = expireRestrictions(s);
    expect(ofType(events, 'restriction_ended')).toEqual([{ type: 'restriction_ended', unitId: ANN, kind: 'confined' }]);
    expect(expireRestrictions(s)).toEqual([]);
  });

  it('removeFromService forgets her', () => {
    const s = fresh();
    restrict(s, { unitId: ANN, kind: 'confined', untilDay: 9 });
    restrict(s, { unitId: BEA, kind: 'no_leave', untilDay: 9 });
    const d = disciplineOf(s);
    d.defiance.push({ unitId: ANN, severity: 'minor', day: 5, source: 'intent' });
    d.threats.push({ id: 'th1', unitId: ANN, measure: 'brig', day: 5, deadlineDay: 6, believed: true, channel: 'dm', inverse: {} });
    removeFromService(s, ANN, 'deserted');
    expect(d.restrictions.map((r) => r.unitId)).toEqual([BEA]);
    expect(d.defiance).toEqual([]);
    expect(d.threats).toEqual([]);
  });
});
