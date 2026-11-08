import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { checkActivity } from '../../src/engine/activities';
import { resetRelationGainHandler, setRelationGainHandler } from '../../src/engine/relationGain';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetRelationGainHandler());

type Req = { activityId: string; companionId?: string; unitIds?: string[]; focus?: string };
const act = (s: CampaignState, req: Req) => run(s, reg, { type: 'activity/do', payload: req });
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 200;
  return s;
};
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const rejected = (s: CampaignState, req: Req, match: RegExp) => {
  const r = act(s, req);
  expect(r.state, JSON.stringify(req)).toBe(s);
  expect(errors(r.events)).toHaveLength(1);
  expect(String(errors(r.events)[0].message)).toMatch(match);
  expect(checkActivity(s, reg, req)).toMatch(match);
};

describe('activity effects', () => {
  it('train alone: selected units gain xp', () => {
    const r = act(fresh(), { activityId: 'train', unitIds: [ANN, BEA], focus: 'units' });
    expect(r.state.squad.find((u) => u.id === ANN)!.xp).toBe(15);
    expect(r.state.squad.find((u) => u.id === BEA)!.xp).toBe(15);
    expect(r.state.squad.find((u) => u.id === CAT)!.xp).toBe(0);
    expect(ofType(r.events, 'xp_gained')).toHaveLength(2);
  });

  it('train alone, commander focus: authority points', () => {
    const r = act(fresh(), { activityId: 'train', focus: 'commander' });
    expect(r.state.commander.socialPoints?.authority).toBe(10 + 6); // mutiny starts at rank 2 = 10 points
    expect(r.state.commander.socialStats.authority).toBe(2);
    expect(ofType(r.events, 'social_gained')[0]).toMatchObject({ stat: 'authority', gained: 6 });
  });

  it('train with companion: commander authority, companion xp and a small affinity', () => {
    const r = act(fresh(), { activityId: 'train', companionId: ANN });
    expect(r.state.squad[0].xp).toBe(20);
    expect(r.state.commander.socialPoints?.authority).toBe(14);
    expect(r.state.relations[ANN].affinity).toBe(2);
    expect(ofType(r.events, 'activity_done')[0]).toMatchObject({ activityId: 'train', companionId: ANN, vignette: true });
  });

  it('workshop emits a workshop_session, affinity only if she likes tech', () => {
    const s = fresh();
    s.squad[0].likes = ['tech'];
    const liked = act(s, { activityId: 'workshop', companionId: ANN });
    expect(liked.state.relations[ANN].affinity).toBe(2);
    expect(ofType(liked.events, 'workshop_session')[0]).toMatchObject({ unitId: ANN });
    const other = act(s, { activityId: 'workshop', companionId: BEA });
    expect(other.state.relations[BEA].affinity).toBe(0);
    expect(ofType(act(s, { activityId: 'workshop' }).events, 'workshop_session')).toHaveLength(1);
  });

  it('medbay alone: stress down scaled by medbay level, injury days reduced, manage-arc upkeep stamped', () => {
    const s = fresh();
    s.day = 5;
    s.squad[0].stress = 40;
    s.squad[0].injuryDays = 3;
    s.squad[0].defects = [{ id: 'echo_bleed', arc: 'manage' }, { id: 'rage_governor', arc: 'cure' }];
    const flat = act(s, { activityId: 'medbay', unitIds: [ANN], focus: 'units' }).state;
    expect(flat.squad[0].stress).toBe(30);
    expect(flat.squad[0].injuryDays).toBe(2);
    expect(flat.squad[0].defects[0].upkeepDay).toBe(5);
    expect(flat.squad[0].defects[1].upkeepDay).toBeUndefined();
    s.base.facilities.medbay = 5; // +60 %
    expect(act(s, { activityId: 'medbay', unitIds: [ANN], focus: 'units' }).state.squad[0].stress).toBe(40 - 16);
  });

  it('medbay with companion: stronger relief and trust', () => {
    const s = fresh();
    s.squad[0].stress = 50;
    s.squad[0].status = 'injured';
    s.squad[0].injuryDays = 2;
    const trust = s.relations[ANN].trust;
    const r = act(s, { activityId: 'medbay', companionId: ANN }).state;
    expect(r.squad[0].stress).toBe(34);
    expect(r.squad[0].status).toBe('active'); // 2 injury days healed at once
    expect(r.relations[ANN].trust).toBe(trust + 2);
  });

  it('medbay commander focus shortens commander injury', () => {
    const s = fresh();
    s.day = 3;
    s.commander.injuredUntilDay = 5;
    expect(act(s, { activityId: 'medbay', focus: 'commander' }).state.commander.injuredUntilDay).toBe(4);
    s.commander.injuredUntilDay = 4;
    expect(act(s, { activityId: 'medbay', focus: 'commander' }).state.commander.injuredUntilDay).toBeUndefined();
  });

  it('work: credits scale with cunning rank', () => {
    const s = fresh();
    const c0 = s.resources.credits;
    expect(act(s, { activityId: 'work' }).state.resources.credits).toBe(c0 + 20 + 5 * 1);
    s.commander.socialStats.cunning = 4;
    expect(act(s, { activityId: 'work' }).state.resources.credits).toBe(c0 + 20 + 5 * 4);
  });

  it('scout_net: insight points and a rumors_requested event', () => {
    const r = act(fresh(), { activityId: 'scout_net' });
    expect(r.state.commander.socialPoints?.insight).toBe(4);
    expect(ofType(r.events, 'rumors_requested')).toHaveLength(1);
  });

  it('rest alone relieves the active roster, with companion relieves her and adds affinity', () => {
    const s = fresh();
    s.squad.forEach((u) => (u.stress = 20));
    s.roster.activeIds = [ANN, BEA];
    const alone = act(s, { activityId: 'rest' }).state;
    expect(alone.squad.map((u) => u.stress)).toEqual([17, 17, 20, 20]);
    const together = act(s, { activityId: 'rest', companionId: CAT }).state;
    expect(together.squad.map((u) => u.stress)).toEqual([20, 20, 12, 20]);
    expect(together.relations[CAT].affinity).toBe(2);
  });

  it('mess: costs supplies, relieves the roster, offers a group scene', () => {
    const s = fresh();
    s.squad.forEach((u) => (u.stress = 20));
    s.slot = 'evening';
    s.resources.supplies = 10;
    const r = act(s, { activityId: 'mess' });
    expect(r.state.resources.supplies).toBe(10 - 2 - 5); // meal cost, then the evening upkeep (4 units + commander)
    expect(r.state.squad.every((u) => u.stress === 15 - 1)).toBe(true); // meal −5, passive −1 at day end
    expect(ofType(r.events, 'group_scene_offered')).toHaveLength(1);
  });

  it('study: insight or empathy by focus', () => {
    const s = fresh();
    expect(act(s, { activityId: 'study', focus: 'insight' }).state.commander.socialPoints).toMatchObject({ insight: 5, empathy: 0 });
    expect(act(s, { activityId: 'study', focus: 'empathy' }).state.commander.socialPoints).toMatchObject({ insight: 0, empathy: 5 });
    expect(act(s, { activityId: 'study' }).state.commander.socialPoints?.insight).toBe(5); // first focus is the default
  });

  it('talk: requires a companion, emits scene_requested and does not consume the slot', () => {
    const s = fresh();
    const r = act(s, { activityId: 'talk', companionId: ANN });
    expect(ofType(r.events, 'scene_requested')[0]).toMatchObject({ unitId: ANN, origin: 'activity', activityId: 'talk' });
    expect(r.state.slot).toBe('morning');
    expect(ofType(r.events, 'slot_advanced')).toHaveLength(0);
  });
});

describe('review follow-ups', () => {
  it('a recovered reserve unit goes back to reserve, a roster unit to active', () => {
    const s = fresh();
    s.roster.activeIds = [BEA, CAT, 'unit_dee'];
    s.squad[0].status = 'injured';
    s.squad[0].injuryDays = 2;
    s.squad[1].status = 'injured';
    s.squad[1].injuryDays = 2;
    const r = act(s, { activityId: 'medbay', companionId: ANN }).state;
    expect(r.squad[0].status).toBe('reserve');
    const r2 = act(s, { activityId: 'medbay', companionId: BEA }).state;
    expect(r2.squad[1].status).toBe('active');
  });

  it('a grunt companion gains trust but no affinity (grunts are trust-only)', () => {
    let s = fresh();
    s.resources.credits = 500;
    s = run(s, reg, { type: 'base/recruit_grunt', payload: {} }).state;
    const g = s.squad.at(-1)!.id;
    const rested = act(s, { activityId: 'rest', companionId: g });
    expect(rested.state.relations[g].affinity).toBe(0);
    expect(ofType(rested.events, 'relation_changed')).toHaveLength(0);
    const treated = act(s, { activityId: 'medbay', companionId: g }).state;
    expect(treated.relations[g].trust).toBe(s.relations[g].trust + 2);
  });

  it('the resource event reports what was really applied', () => {
    const drain = { ...reg, activities: new Map(reg.activities).set('work', {
      ...reg.activities.get('work')!, effects: [{ type: 'resource', resource: 'credits', amount: -100 }],
    }) };
    const s = fresh();
    s.resources.credits = 30;
    const r = run(s, drain, { type: 'activity/do', payload: { activityId: 'work' } });
    expect(r.state.resources.credits).toBe(0);
    expect(ofType(r.events, 'resource_changed')[0]).toMatchObject({ resource: 'credits', amount: -30 });
  });
});

describe('slots and relation gain', () => {
  it('each ordinary activity consumes exactly one slot', () => {
    for (const [id, extra] of [
      ['train', { focus: 'commander' }], ['workshop', {}], ['medbay', { focus: 'commander' }], ['work', {}],
      ['scout_net', {}], ['rest', {}], ['study', {}],
    ] as Array<[string, Partial<Req>]>) {
      const r = act(fresh(), { activityId: id, ...extra });
      expect(errors(r.events), id).toEqual([]);
      expect(r.state.slot, id).toBe('afternoon');
    }
  });

  it('affinity gains go through the relation handler', () => {
    const calls: unknown[][] = [];
    setRelationGainHandler((_ctx, axis, amount, source) => (calls.push([axis, amount, source]), 0));
    act(fresh(), { activityId: 'rest', companionId: ANN });
    expect(calls).toEqual([['affinity', 2, 'activity:rest']]);
  });

  it('repeated companion rests diminish the affinity gain within a day', () => {
    let s = fresh();
    const gains: number[] = [];
    for (let i = 0; i < 3; i++) {
      s.slot = 'morning';
      const before = s.relations[ANN].affinity;
      s = act(s, { activityId: 'rest', companionId: ANN }).state;
      gains.push(s.relations[ANN].affinity - before);
    }
    expect(gains).toEqual([2, 2, 1]);
  });
});

describe('rejections leave the state untouched', () => {
  it('unknown activity', () => rejected(fresh(), { activityId: 'nap' }, /unknown activity/i));

  it('wrong slot', () => {
    const s = fresh();
    s.slot = 'night';
    rejected(s, { activityId: 'work' }, /night/i);
    rejected(s, { activityId: 'mess' }, /night/i);
  });

  it('not enough supplies for the meal', () => {
    const s = fresh();
    s.slot = 'afternoon';
    s.resources.supplies = 1;
    rejected(s, { activityId: 'mess' }, /supplies/i);
  });

  it('injured commander blocks train and work, not rest', () => {
    const s = fresh();
    s.day = 2;
    s.commander.injuredUntilDay = 4;
    rejected(s, { activityId: 'work' }, /injured/i);
    rejected(s, { activityId: 'train', focus: 'commander' }, /injured/i);
    expect(errors(act(s, { activityId: 'rest' }).events)).toEqual([]);
    s.day = 4;
    expect(errors(act(s, { activityId: 'work' }).events)).toEqual([]);
  });

  it('companion required but missing', () => rejected(fresh(), { activityId: 'talk' }, /companion/i));

  it('companion given to a no-companion activity', () => rejected(fresh(), { activityId: 'work', companionId: ANN }, /companion/i));

  it('dead, deserted or unknown companion', () => {
    const s = fresh();
    s.squad[0].status = 'dead';
    rejected(s, { activityId: 'rest', companionId: ANN }, /companion/i);
    rejected(s, { activityId: 'rest', companionId: 'ghost' }, /companion/i);
  });

  it('unknown or duplicate unit in unitIds', () => {
    rejected(fresh(), { activityId: 'train', unitIds: ['ghost'], focus: 'units' }, /unit/i);
    rejected(fresh(), { activityId: 'train', unitIds: [ANN, ANN], focus: 'units' }, /twice|duplicate/i);
  });

  it('focus units bound violated, or unknown focus', () => {
    rejected(fresh(), { activityId: 'train', unitIds: [], focus: 'units' }, /1 to 2/);
    rejected(fresh(), { activityId: 'train', unitIds: [ANN, BEA, CAT], focus: 'units' }, /1 to 2/);
    rejected(fresh(), { activityId: 'train', focus: 'dance' }, /focus/i);
  });

  it('facility requirement', () => {
    const s = fresh();
    const tight = { ...reg, activities: new Map(reg.activities).set('work', { ...reg.activities.get('work')!, facilityReq: { id: 'comms', level: 2 } }) };
    expect(checkActivity(s, tight, { activityId: 'work' })).toMatch(/comms/i);
  });

  it('a no-op request payload is rejected, not crashed on', () => {
    const s = fresh();
    const r = run(s, reg, { type: 'activity/do', payload: 'work' });
    expect(r.state).toBe(s);
    expect(errors(r.events)).toHaveLength(1);
  });
});

describe('a talk holds its slot until the scene ends', () => {
  const talk = (s: CampaignState) => act(s, { activityId: 'talk', companionId: ANN });
  const consume = (s: CampaignState, reason: string) => run(s, reg, { type: 'calendar/consume_slot', payload: { reason } });

  it('talk records the open scene with its slot and day', () => {
    const r = talk(fresh());
    expect(r.state.calendar.pendingScene).toEqual({ unitId: ANN, day: 1, slot: 'morning' });
  });

  it('while a scene is open every activity, including another talk, is rejected', () => {
    const open = talk(fresh()).state;
    rejected(open, { activityId: 'rest' }, /conversation/i);
    rejected(open, { activityId: 'talk', companionId: BEA }, /conversation/i);
  });

  it('while a scene is open the slot can only be consumed by its end', () => {
    const open = talk(fresh()).state;
    const blocked = consume(open, 'expedition');
    expect(blocked.state).toBe(open);
    expect(String(errors(blocked.events)[0].message)).toMatch(/conversation/i);
    const ended = consume(open, 'scene_end');
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.calendar.pendingScene).toBeUndefined();
    expect(ended.state.slot).toBe('afternoon');
  });

  it('the evening scene cannot be charged to the next day', () => {
    const s = fresh();
    s.slot = 'evening';
    const open = talk(s).state;
    expect(errors(act(open, { activityId: 'rest' }).events)).toHaveLength(1);
    const ended = consume(open, 'scene_end').state;
    expect(ended.day).toBe(2);
  });

  it('calendar/cancel_scene clears the scene without consuming the slot', () => {
    const open = talk(fresh()).state;
    const r = run(open, reg, { type: 'calendar/cancel_scene', payload: {} });
    expect(r.state.calendar.pendingScene).toBeUndefined();
    expect(r.state.slot).toBe('morning');
    expect(errors(act(r.state, { activityId: 'rest' }).events)).toEqual([]);
    expect(errors(run(fresh(), reg, { type: 'calendar/cancel_scene', payload: {} }).events)).toHaveLength(1);
  });
});

describe('commander/injure', () => {
  it('sets injuredUntilDay and emits commander_injured', () => {
    const s = fresh();
    s.day = 3;
    const r = run(s, reg, { type: 'commander/injure', payload: { days: 2 } });
    expect(r.state.commander.injuredUntilDay).toBe(5);
    expect(ofType(r.events, 'commander_injured')[0]).toMatchObject({ days: 2, until: 5 });
    expect(errors(run(s, reg, { type: 'commander/injure', payload: { days: 0 } }).events)).toHaveLength(1);
  });
});

describe('the supply loop is affordable', () => {
  it('one work slot pays for a day of upkeep of a full squad (about one slot a day)', async () => {
    const { TUNING } = await import('../../src/engine/tuning');
    const s = fresh();
    const before = s.resources.credits;
    const earned = act(s, { activityId: 'work' }).state.resources.credits - before;
    const upkeepToday = 4 * TUNING.upkeep.perUnit + TUNING.upkeep.commander;
    expect(earned).toBeGreaterThanOrEqual(upkeepToday * TUNING.requisition.creditsPerSupply);
  });
});

describe('a week of activities', () => {
  it('only changes resources, stress and stats per the tables', () => {
    let s = fresh();
    s.resources.supplies = 30;
    const credits0 = s.resources.credits;
    for (let day = 0; day < 7; day++) {
      for (const req of [{ activityId: 'work' }, { activityId: 'rest' }, { activityId: 'train', focus: 'commander' }] as Req[]) {
        const r = act(s, req);
        expect(errors(r.events), `${day} ${req.activityId}`).toEqual([]);
        s = r.state;
      }
    }
    expect(s.day).toBe(8);
    expect(s.resources.credits).toBe(credits0 + 7 * 25);
    expect(s.commander.socialPoints?.authority).toBe(10 + 7 * 6);
    expect(s.commander.socialStats.authority).toBe(4);
    expect(s.resources.supplies).toBe(0); // 30 supplies, 5 a day: empty on day 6, short on day 7
    expect(s.calendar.shortageStreak).toBe(1);
    expect(s.squad.map((u) => u.stress)).toEqual([4, 4, 4, 4]); // +5 shortage, −1 passive on the last day only
  });
});
