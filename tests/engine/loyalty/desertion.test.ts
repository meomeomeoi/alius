import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { desertionChance, loyaltyDayStep } from '../../../src/engine/loyalty/desertion';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';
import { seedRng } from '../../../src/engine/rng';
import { checkExpedition } from '../../../src/engine/world/expedition';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run, setRelation, withDefect } from '../../helpers/loyalty';
import { payload, withMission } from '../../helpers/expedition';
import { clockById } from '../../../src/engine/world/state';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const CAT = 'unit_cat';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4, { crimeId: 'purge' });
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' });
    u.defects = [{ id: 'echo_bleed', arc: 'manage' }];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  }
  base.leash.authorizationsLeft = 3;
});

const clone = (seed = 1): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(seed);
  return s;
};
const unit = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const step = (s: CampaignState) => loyaltyDayStep(s, ctxOf(s, reg));
const breaking = (s: CampaignState, over: { trust?: number; affinity?: number } = {}): CampaignState =>
  setRelation(s, ANN, { trust: over.trust ?? 3, affinity: over.affinity ?? -10, band: 'breaking' });
/** A desertion sign from `daysAgo` days back, so the unit may be checked. */
function signed(s: CampaignState, daysAgo = 1): CampaignState {
  loyaltyRecord(s, ANN).signs.push({ day: s.day - daysAgo, about: 'desertion', kind: 'fact', signId: 'sign_desertion_fact_1' });
  return s;
}
/** A night confrontation for ANN, as the day step would open it. */
function atNight(s: CampaignState, over: Partial<NonNullable<CampaignState['disloyalty']>['open']> = {}): CampaignState {
  const entry = { id: 'n_d', unitId: ANN, kind: 'desertion', priority: 95, framing: 'f', ignore: { event: 'dismissed', severity: 'moderate' as const }, expiresDay: s.day + 2 };
  s.calendar.nightEvent = entry;
  s.slot = 'night';
  loyaltyRecord(s, ANN).attempts = Math.max(1, loyaltyRecord(s, ANN).attempts);
  s.disloyalty!.open = { kind: 'desertion', unitId: ANN, day: s.day, at: 'night', nightEntryId: entry.id, ...over };
  return s;
}
const act = (s: CampaignState, type: string, payload?: unknown) => run(s, reg, { type, payload });
/** The first seed in 1…200 for which `pick` returns a state whose event list satisfies `ok`. */
function seeded<T>(make: (seed: number) => T, ok: (t: T) => boolean): T {
  for (let seed = 1; seed <= 200; seed++) {
    const t = make(seed);
    if (ok(t)) return t;
  }
  throw new Error('no seed found');
}

describe('desertionChance', () => {
  const at = (trust: number, affinity: number, stress: number, tweak: (s: CampaignState) => void = () => {}): number => {
    const s = clone();
    setRelation(s, ANN, { trust, affinity });
    unit(s).stress = stress;
    tweak(s);
    return desertionChance(s, reg, ANN);
  };

  it('trust 5, affinity 0, stress 50 → 0.25', () => expect(at(5, 0, 50)).toBeCloseTo(0.25));
  it('trust 0, affinity −100, stress 100 → 0.6 (clamped)', () => expect(at(0, -100, 100)).toBe(0.6));
  it('trust 9, affinity 100, stress 0 → 0.03 (clamped)', () => expect(at(9, 100, 0)).toBe(0.03));
  it('imprint_fracture adds 0.1', () => {
    expect(at(5, 0, 50, (s) => withDefect(s, ANN, 'imprint_fracture'))).toBeCloseTo(0.35);
    expect(at(5, 0, 50, (s) => withDefect(s, ANN, 'compliance_craving'))).toBeCloseTo(0.15);
  });
});

describe('telegraph', () => {
  it('the first breaking day only leaves a sign', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = breaking(clone(seed));
      s.day += 1;
      const events = step(s);
      expect(ofType(events, 'desertion_attempt'), `seed ${seed}`).toEqual([]);
      expect(s.disloyalty!.open).toBeUndefined();
      expect(s.disloyalty!.units[ANN].signs.filter((x) => x.about === 'desertion')).toHaveLength(1);
      expect(ofType(events, 'loyalty_sign').filter((e) => e.about === 'desertion')).toHaveLength(1);
    }
  });

  it('over 300 seeded days no attempt ever happens without a sign at least one day older', () => {
    let attempts = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = clone(seed);
      for (let i = 0; i < 300; i++) {
        s.day += 1;
        breaking(s);
        const events = step(s);
        if (ofType(events, 'desertion_attempt').length > 0) {
          attempts += 1;
          const rec = s.disloyalty!.units[ANN];
          expect(rec.signs.some((x) => x.about === 'desertion' && x.day <= s.day - 1), `seed ${seed} day ${s.day}`).toBe(true);
          // answer it so the simulation goes on
          delete s.disloyalty!.open;
          rec.attempts = 0;
          delete rec.cause;
          delete rec.nextCheckDay;
        }
        s.calendar.nightEventsQueue = [];
        delete s.calendar.nightEvent;
      }
    }
    expect(attempts).toBeGreaterThan(20); // the rule is exercised, not vacuous
  });

  it('a breaking attempt queues a night entry and opens the confrontation', () => {
    const s = seeded((seed) => {
      const t = signed(breaking(clone(seed)));
      t.day += 1;
      return { t, events: step(t) };
    }, (r) => ofType(r.events, 'desertion_attempt').length > 0);
    const { t, events } = s;
    expect(ofType(events, 'desertion_attempt')).toEqual([{ type: 'desertion_attempt', unitId: ANN, at: 'night' }]);
    const entry = t.calendar.nightEventsQueue.find((n) => n.kind === 'desertion')!;
    expect(entry).toMatchObject({ unitId: ANN, priority: 95, expiresDay: t.day + 2 });
    expect(t.disloyalty!.open).toEqual({ kind: 'desertion', unitId: ANN, day: t.day, at: 'night', nightEntryId: entry.id });
    expect(t.disloyalty!.units[ANN].attempts).toBe(1);
    expect(t.disloyalty!.units[ANN].cause).toBeUndefined();
  });

  it('a pause from Suppress or a talk-down holds the checks back', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const t = signed(breaking(clone(seed)));
      t.day += 1;
      loyaltyRecord(t, ANN).nextCheckDay = t.day + 2;
      expect(ofType(step(t), 'desertion_attempt'), `seed ${seed}`).toEqual([]);
    }
  });

  it('only one confrontation is open at a time', () => {
    const t = signed(atNight(clone()));
    t.day += 1;
    t.disloyalty!.open!.day = t.day;
    t.calendar.nightEventsQueue = [{ ...t.calendar.nightEvent!, id: 'q' }];
    breaking(t);
    expect(ofType(step(t), 'desertion_attempt')).toEqual([]);
  });

  it('the second attempt gives cause for Terminate', () => {
    const t = seeded((seed) => {
      const s = signed(breaking(clone(seed), { trust: 0, affinity: -100 }));
      loyaltyRecord(s, ANN).attempts = 1;
      s.day += 1;
      return { s, events: step(s) };
    }, (r) => ofType(r.events, 'desertion_attempt').length > 0).s;
    expect(t.disloyalty!.units[ANN].attempts).toBe(2);
    expect(t.disloyalty!.units[ANN].cause).toEqual({ kind: 'desertion', day: t.day });
  });
});

describe('answers', () => {
  it('talk down succeeds with a high rank, raises Trust by 8, re-evaluates the band and pauses checks for 3 days', () => {
    const base2 = clone();
    base2.commander.socialStats.empathy = 5;
    setRelation(base2, ANN, { trust: 14, affinity: -10, band: 'breaking' });
    signed(base2);
    atNight(base2);
    const done = seeded((seed) => {
      const t = structuredClone(base2);
      t.rng = seedRng(seed);
      return act(t, 'loyalty/talk_down', { stat: 'empathy' });
    }, (r) => ofType(r.events, 'loyalty_talk_down')[0]?.success === true);
    expect(errors(done.events)).toEqual([]);
    const s = done.state;
    expect(ofType(done.events, 'loyalty_talk_down')).toEqual([{ type: 'loyalty_talk_down', unitId: ANN, stat: 'empathy', success: true, chance: 0.95 }]);
    expect(s.relations[ANN].trust).toBe(22);
    expect(s.relations[ANN].loyaltyBand).toBe('wavering');
    expect(s.disloyalty!.open).toBeUndefined();
    expect(s.disloyalty!.units[ANN].nextCheckDay).toBe(base2.day + 3);
    expect(unit(s).status).toBe('active');
    expect(s.slot).toBe('morning');
    expect(s.day).toBe(base2.day + 1);
  });

  it('the difficulty grows with low Trust and high stress and the chance follows the rank gap', () => {
    const chanceOf = (trust: number, stress: number, rank: number): number => {
      const s = atNight(setRelation(clone(), ANN, { trust, band: 'breaking' }));
      unit(s).stress = stress;
      s.commander.socialStats.authority = rank;
      return ofType(act(s, 'loyalty/talk_down', { stat: 'authority' }).events, 'loyalty_talk_down')[0].chance as number;
    };
    expect(chanceOf(8, 0, 3)).toBeCloseTo(0.7); // difficulty 2
    expect(chanceOf(4, 0, 3)).toBeCloseTo(0.5); // difficulty 3
    expect(chanceOf(4, 85, 3)).toBeCloseTo(0.3); // difficulty 4
    expect(chanceOf(4, 85, 1)).toBeCloseTo(0.1); // clamped
    expect(chanceOf(8, 0, 5)).toBeCloseTo(0.95); // clamped
  });

  it('a failed talk down cannot be tried again but the other answers remain', () => {
    const base2 = atNight(setRelation(clone(), ANN, { trust: 4, band: 'breaking' }));
    unit(base2).stress = 85;
    base2.commander.socialStats.authority = 1;
    const failed = seeded((seed) => {
      const t = structuredClone(base2);
      t.rng = seedRng(seed);
      return act(t, 'loyalty/talk_down', { stat: 'authority' });
    }, (r) => ofType(r.events, 'loyalty_talk_down')[0]?.success === false);
    const s = failed.state;
    expect(s.disloyalty!.open!.talkTried).toBe(true);
    expect(s.slot).toBe('night'); // she is still at the door
    expect(s.relations[ANN].trust).toBe(4);
    const again = act(s, 'loyalty/talk_down', { stat: 'empathy' });
    expect(again.state).toBe(s);
    expect(errors(again.events)).toHaveLength(1);
    expect(errors(act(s, 'leash/suppress', { unitId: ANN }).events)).toEqual([]);
    expect(errors(act(s, 'loyalty/let_go').events)).toEqual([]);
  });

  it('let her go sets deserted, frees the roster slot and the items, and the squad reacts by values', () => {
    const s0 = atNight(clone());
    unit(s0).equipment = { weapon: 'it1' };
    s0.inventory.push({ uid: 'it1', itemId: 'x', rarity: 'standard', upgrade: 0, affixes: [] });
    Object.assign(unit(s0, BEA).values, { autonomy: 3, mercy: 3 });
    Object.assign(unit(s0, CAT).values, { autonomy: -3, mercy: -3 });
    setRelation(s0, ANN, { affinity: -10 });
    const r = act(s0, 'loyalty/let_go');
    expect(errors(r.events)).toEqual([]);
    const s = r.state;
    expect(unit(s).status).toBe('deserted');
    expect(s.roster.activeIds).not.toContain(ANN);
    expect(unit(s).equipment).toEqual({});
    expect(s.inventory.map((i) => i.uid)).toEqual(['it1']);
    expect(s.relations[BEA].trust).toBeGreaterThan(s0.relations[BEA].trust);
    expect(s.relations[CAT].trust).toBeLessThan(s0.relations[CAT].trust);
    expect(s.disloyalty!.open).toBeUndefined();
    expect(s.disloyalty!.units[ANN]).toMatchObject({ desertedDay: s0.day, stance: 'ally' });
    expect(ofType(r.events, 'unit_deserted')).toEqual([{ type: 'unit_deserted', unitId: ANN, stance: 'ally' }]);
    // an answer at night ends the Night slot
    expect(s.slot).toBe('morning');
    expect(s.day).toBe(s0.day + 1);
  });

  it('a hostile leaving (Affinity under −30) is remembered as such', () => {
    const s0 = atNight(setRelation(clone(), ANN, { affinity: -50 }));
    expect(act(s0, 'loyalty/let_go').state.disloyalty!.units[ANN].stance).toBe('hostile');
  });

  it('suppress keeps her, costs 25 Trust and one authorization', () => {
    const s0 = atNight(clone());
    const r = act(s0, 'leash/suppress', { unitId: ANN });
    expect(errors(r.events)).toEqual([]);
    expect(unit(r.state).status).toBe('active');
    expect(r.state.relations[ANN].trust).toBe(60 - 25);
    expect(r.state.leash.authorizationsLeft).toBe(2);
    expect(r.state.slot).toBe('morning');
  });

  it('an answer needs an open desertion confrontation', () => {
    const s = clone();
    for (const type of ['loyalty/let_go', 'loyalty/take_back', 'loyalty/turn_away']) expect(act(s, type).state, type).toBe(s);
    expect(errors(act(s, 'loyalty/talk_down', { stat: 'authority' }).events)).toHaveLength(1);
    expect(errors(act(atNight(clone()), 'loyalty/talk_down', { stat: 'cunning' }).events)).toHaveLength(1);
    expect(errors(act(atNight(clone()), 'loyalty/take_back').events)).toHaveLength(1);
  });

  it('the knock actions refuse a confrontation entry', () => {
    for (const kind of ['desertion', 'mutiny', 'deserter_return']) {
      const s = atNight(clone());
      s.calendar.nightEvent = { ...s.calendar.nightEvent!, kind };
      for (const type of ['night/open', 'night/ignore']) {
        const r = act(s, type);
        expect(errors(r.events), `${type} ${kind}`).toHaveLength(1);
        expect(r.state).toBe(s);
      }
    }
    const normal = atNight(clone());
    normal.calendar.nightEvent = { ...normal.calendar.nightEvent!, kind: 'we_need_to_talk' };
    expect(errors(act(normal, 'night/open').events)).toEqual([]);
  });

  it('an expired confrontation resolves as let go', () => {
    const s = atNight(clone());
    // the night passed without an answer: the entry is gone
    delete s.calendar.nightEvent;
    s.slot = 'morning';
    s.day += 1;
    const events = step(s);
    expect(unit(s).status).toBe('deserted');
    expect(s.disloyalty!.open).toBeUndefined();
    expect(ofType(events, 'unit_deserted')).toHaveLength(1);
  });

  it('an open confrontation whose entry is still waiting is kept', () => {
    const s = atNight(clone());
    s.slot = 'morning';
    s.calendar.nightEventsQueue = [s.calendar.nightEvent!];
    delete s.calendar.nightEvent;
    s.day += 1;
    step(s);
    expect(unit(s).status).toBe('active');
    expect(s.disloyalty!.open).toBeDefined();
  });
});

describe('mission start', () => {
  const missionState = (seed: number) => {
    const { state, mission } = withMission(reg, clone(seed));
    signed(breaking(state, { trust: 0, affinity: -100 }));
    return { state, mission };
  };

  it('a breaking party member can stop the departure with a confrontation and nothing else changes', () => {
    const hit = seeded((seed) => {
      const { state, mission } = missionState(seed);
      return { state, mission, r: act(state, 'expedition/start', payload(state, mission.id)) };
    }, (x) => ofType(x.r.events, 'desertion_attempt').length > 0);
    const { state, mission, r } = hit;
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'desertion_attempt')).toEqual([{ type: 'desertion_attempt', unitId: ANN, at: 'mission_start' }]);
    expect(r.state.expedition).toBeUndefined();
    expect(r.state.resources.supplies).toBe(state.resources.supplies);
    expect(r.state.missions.offered.map((m) => m.id)).toContain(mission.id);
    expect(r.state.missions.active).toEqual([]);
    expect(r.state.disloyalty!.open).toEqual({ kind: 'desertion', unitId: ANN, day: state.day, at: 'mission_start' });
    expect(r.state.disloyalty!.units[ANN].attempts).toBe(1);
    expect(r.state.calendar.nightEventsQueue.filter((n) => n.kind === 'desertion')).toEqual([]);
  });

  it('a steady party member never stops the departure', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { state, mission } = withMission(reg, clone(seed));
      const r = act(state, 'expedition/start', payload(state, mission.id));
      expect(errors(r.events)).toEqual([]);
      expect(r.state.expedition).toBeDefined();
    }
  });

  it('no expedition starts while a confrontation is open', () => {
    const { state, mission } = missionState(1);
    state.disloyalty!.open = { kind: 'desertion', unitId: ANN, day: state.day, at: 'mission_start' };
    const problem = checkExpedition(state, reg, payload(state, mission.id));
    expect(problem).toBe('Ann is about to walk: deal with it first.');
    const r = act(state, 'expedition/start', payload(state, mission.id));
    expect(r.state).toBe(state);
    expect(errors(r.events)).toMatchObject([{ message: 'Ann is about to walk: deal with it first.' }]);
  });

  it('a mission-start answer spends no slot; letting her go leaves the others free to depart', () => {
    const { state } = missionState(1);
    state.disloyalty!.open = { kind: 'desertion', unitId: ANN, day: state.day, at: 'mission_start' };
    const r = act(state, 'loyalty/let_go');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe(state.slot);
    expect(r.state.day).toBe(state.day);
    expect(unit(r.state).status).toBe('deserted');
  });
});

describe('returns', () => {
  const left = (stance: 'ally' | 'hostile', ago = 5): CampaignState => {
    const s = clone();
    const rec = loyaltyRecord(s, ANN);
    Object.assign(rec, { desertedDay: s.day - ago, stance });
    unit(s).status = 'deserted';
    s.roster.activeIds = s.roster.activeIds.filter((id) => id !== ANN);
    return s;
  };
  const returned = (stance: 'ally' | 'hostile') =>
    seeded((seed) => {
      const s = left(stance);
      s.rng = seedRng(seed);
      return { s, events: step(s) };
    }, (r) => ofType(r.events, 'deserter_returned').length > 0);

  it('an ally deserter comes back as a night offer and can be taken back into the reserve', () => {
    const { s, events } = returned('ally');
    expect(ofType(events, 'deserter_returned')).toEqual([{ type: 'deserter_returned', unitId: ANN, stance: 'ally' }]);
    const entry = s.calendar.nightEventsQueue.find((n) => n.kind === 'deserter_return')!;
    expect(entry).toMatchObject({ unitId: ANN, priority: 50 });
    expect(s.disloyalty!.open).toEqual({ kind: 'return', unitId: ANN, day: s.day, at: 'night', nightEntryId: entry.id });
    atNight(s, { kind: 'return', nightEntryId: entry.id });
    const r = act(s, 'loyalty/take_back');
    expect(errors(r.events)).toEqual([]);
    expect(unit(r.state).status).toBe('reserve');
    expect(r.state.roster.activeIds).not.toContain(ANN);
    expect(r.state.relations[ANN].trust).toBe(15);
    expect(r.state.disloyalty!.units[ANN]).toBeUndefined();
    expect(ofType(r.events, 'deserter_answered')).toEqual([{ type: 'deserter_answered', unitId: ANN, stance: 'ally', taken: true }]);
    expect(r.state.slot).toBe('morning');
  });

  it('taking her back needs a free bed', () => {
    const { s } = returned('ally');
    atNight(s, { kind: 'return' });
    s.roster.capacity = s.squad.filter((u) => u.status !== 'deserted').length;
    const r = act(s, 'loyalty/take_back');
    expect(r.state).toBe(s);
    expect(errors(r.events)).toMatchObject([{ message: expect.stringContaining('barracks are full') }]);
    expect(errors(act(s, 'loyalty/turn_away').events)).toEqual([]);
  });

  it('turning her away keeps her gone for good', () => {
    const { s } = returned('ally');
    atNight(s, { kind: 'return' });
    const r = act(s, 'loyalty/turn_away');
    expect(errors(r.events)).toEqual([]);
    expect(unit(r.state).status).toBe('deserted');
    expect(r.state.disloyalty!.units[ANN].returned).toBe(true);
    expect(ofType(r.events, 'deserter_answered')).toEqual([{ type: 'deserter_answered', unitId: ANN, stance: 'ally', taken: false }]);
    expect(r.state.disloyalty!.open).toBeUndefined();
  });

  it('a hostile one raises the oversight clock and posts a rumor', () => {
    const before = left('hostile');
    const oversight = clockById(before, 'oversight')?.filled ?? 0;
    const { s, events } = returned('hostile');
    expect(ofType(events, 'deserter_returned')).toEqual([{ type: 'deserter_returned', unitId: ANN, stance: 'hostile' }]);
    expect(clockById(s, 'oversight')!.filled).toBe(oversight + 1);
    expect(s.rumors.length).toBe(before.rumors.length + 1);
    expect(s.rumors.at(-1)!.text).toContain('Ann');
    expect(s.memory.facts.some((f) => f.text.includes('Ann') && f.tags.includes('deserter') && f.knownBy.includes('*'))).toBe(true);
    expect(s.disloyalty!.units[ANN].returned).toBe(true);
    expect(s.disloyalty!.open).toBeUndefined();
    expect(unit(s).status).toBe('deserted');
  });

  it('nobody returns before five days', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = left('ally', 4);
      s.rng = seedRng(seed);
      expect(ofType(step(s), 'deserter_returned'), `seed ${seed}`).toEqual([]);
    }
  });

  it('each deserter returns at most once', () => {
    const { s } = returned('hostile');
    let again = 0;
    for (let i = 0; i < 200; i++) {
      s.day += 1;
      again += ofType(step(s), 'deserter_returned').length;
    }
    expect(again).toBe(0);
  });
});
