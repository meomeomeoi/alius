import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/commander';
import { isQuietNight } from '../../../src/engine/calendar';
import { socialRank } from '../../../src/engine/social';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

function insomniac(traits: string[] = ['insomniac']): CampaignState {
  const s = campaign(reg, 3);
  s.commander.traits = { regular: traits };
  return s;
}
const endEvening = (s: CampaignState) => {
  s.slot = 'evening';
  return run(s, reg, { type: 'calendar/consume_slot', payload: {} });
};
/** A state inside a quiet night on day 5. */
function quiet(extra: (s: CampaignState) => void = () => {}): CampaignState {
  const s = insomniac();
  s.day = 5;
  extra(s);
  const r = endEvening(s);
  expect(r.state.slot).toBe('night');
  return r.state;
}

describe('entering a quiet night', () => {
  it("an insomniac's empty evening enters a quiet night", () => {
    const r = endEvening(insomniac());
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe('night');
    expect(r.state.day).toBe(1);
    expect(r.state.calendar.nightEvent).toBeUndefined();
    expect(isQuietNight(r.state)).toBe(true);
    expect(ofType(r.events, 'quiet_night_started')).toEqual([{ type: 'quiet_night_started', day: 1 }]);
  });

  it('without the trait the empty evening rolls over as before', () => {
    const r = endEvening(insomniac([]));
    expect(r.state.slot).toBe('morning');
    expect(r.state.day).toBe(2);
    expect(isQuietNight(r.state)).toBe(false);
  });

  it('a queued night event still comes first', () => {
    const s = insomniac();
    s.calendar.nightEventsQueue.push({ id: 'n1', unitId: 'unit_ann', kind: 'talk', priority: 50, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 });
    const r = endEvening(s);
    expect(r.state.slot).toBe('night');
    expect(r.state.calendar.nightEvent?.id).toBe('n1');
    expect(isQuietNight(r.state)).toBe(false);
    expect(ofType(r.events, 'quiet_night_started')).toHaveLength(0);
  });

  it('isQuietNight is false in the day slots', () => {
    expect(isQuietNight(insomniac())).toBe(false);
  });
});

describe('inside a quiet night', () => {
  it('a quiet night has no night event and night/open refuses', () => {
    const s = quiet();
    for (const type of ['night/open', 'night/ignore']) {
      const r = run(s, reg, { type, payload: {} });
      expect(errors(r.events), type).toHaveLength(1);
      expect(r.state, type).toEqual(s);
    }
  });

  it('an activity in a quiet night reads its slot rules as evening', () => {
    const s = quiet();
    // `work` is not offered at night in the data, only in the day slots
    expect(reg.activities.get('work')!.slotRules).not.toContain('night');
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'work' } });
    expect(errors(r.events)).toEqual([]);
  });

  it('an activity that is not allowed in the evening stays refused', () => {
    const s = quiet();
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'mess' } }); // afternoon / evening: allowed
    expect(errors(r.events)).toEqual([]);
    const noEvening = { ...reg, activities: new Map(reg.activities) };
    noEvening.activities.set('work', { ...reg.activities.get('work')!, slotRules: ['morning'] });
    expect(errors(run(s, noEvening, { type: 'activity/do', payload: { activityId: 'work' } }).events)).toHaveLength(1);
  });

  it('an activity in a quiet night makes the next day sleepless and Empathy reads one lower', () => {
    const s = quiet((t) => { t.commander.socialStats.empathy = 3; });
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'work' } });
    expect(r.state.day).toBe(6);
    expect(r.state.slot).toBe('morning');
    expect(r.state.commander.sleeplessDay).toBe(6);
    expect(r.state.commander.socialStats.empathy).toBe(3); // the stored rank never changes
    expect(socialRank(r.state, 'empathy')).toBe(2);
    expect(socialRank(r.state, 'cunning')).toBe(r.state.commander.socialStats.cunning);
    // one day later it is over
    const later = structuredClone(r.state);
    later.day = 7;
    expect(socialRank(later, 'empathy')).toBe(3);
  });

  it('the sleepless penalty never takes a rank below 1', () => {
    const s = quiet((t) => { t.commander.socialStats.empathy = 1; });
    const r = run(s, reg, { type: 'activity/do', payload: { activityId: 'work' } });
    expect(socialRank(r.state, 'empathy')).toBe(1);
  });

  it('sleep ends the night with no penalty', () => {
    const s = quiet((t) => { t.commander.socialStats.empathy = 3; });
    const r = run(s, reg, { type: 'calendar/sleep', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.day).toBe(6);
    expect(r.state.slot).toBe('morning');
    expect(r.state.commander.sleeplessDay).toBeUndefined();
    expect(socialRank(r.state, 'empathy')).toBe(3);
  });

  it('only a quiet night can be slept through', () => {
    for (const s of [insomniac(), campaign(reg, 1)]) {
      const r = run(s, reg, { type: 'calendar/sleep', payload: {} });
      expect(errors(r.events)).toMatchObject([{ message: 'There is nothing to sleep through.' }]);
      expect(r.state).toEqual(s);
    }
    const night = insomniac();
    night.slot = 'night';
    night.calendar.nightEvent = { id: 'n1', unitId: 'unit_ann', kind: 'talk', priority: 1, framing: 'f', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 };
    expect(errors(run(night, reg, { type: 'calendar/sleep', payload: {} }).events)).toHaveLength(1);
  });

  it('an exhausted insomniac still loses the morning after sleeping', () => {
    const s = quiet((t) => { t.calendar.loseMorning = true; });
    const r = run(s, reg, { type: 'calendar/sleep', payload: {} });
    expect(r.state.slot).toBe('afternoon');
    expect(r.state.calendar.loseMorning).toBeUndefined();
  });
});
