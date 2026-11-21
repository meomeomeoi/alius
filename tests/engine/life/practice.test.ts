import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { whereaboutAt, whereabouts } from '../../../src/engine/hub';
import { applyLifeEvent, breakthrough, closeNews, grantMilestone, milestoneAt, practise, practiceSlots, lifeDayStep, sharePractice, staleSweep } from '../../../src/engine/life';
import { busySlot } from '../../../src/engine/life/events';
import { lifeChance, newLife } from '../../../src/engine/life/state';
import type { HobbyEntry, LifeEventEntry } from '../../../src/engine/life/types';
import type { CampaignState, HobbyState, Slot, Unit } from '../../../src/engine/state/types';
import { placesOf } from '../../../src/engine/life/places';
import { toldMilestones } from '../../../src/engine/life/known';
import { retrieveFacts } from '../../../src/engine/memory';
import { campaign, ctxOf, errors, loadCore, ofType, run, stubExpedition } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'night'];
const hobby = (id: string): HobbyEntry => reg.hobbies.get(id) as unknown as HobbyEntry;
const mine = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [], ...over });

function world(hobbies: HobbyState[] = [take('reading')], mode: 'normal' | null = 'normal'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 30;
  s.world.clocks = [];
  if (mode !== null) {
    s.settings.lifeEvents = mode;
    s.life = newLife(7);
  }
  mine(s).hobbies = hobbies;
  return s;
}
const at = (s: CampaignState, day: number, slot: Slot): CampaignState => ({ ...s, day, slot });
const ms = (s: CampaignState, hobbyId: string, n: 0 | 1 | 2 | 3, unitId = ANN): number => milestoneAt(s.life!.salt, unitId, hobbyId, n);

describe('whereaboutAt', () => {
  it('is the hub answer for any day and slot', () => {
    const s = campaign(reg, 4);
    for (let day = 1; day <= 7; day++) {
      for (const slot of SLOTS) {
        const all = whereabouts(at(s, day, slot), reg);
        for (const w of all) expect(whereaboutAt(s, reg, w.unitId, day, slot)).toEqual(w);
      }
    }
    expect(whereaboutAt(s, reg, 'nobody', 1, 'morning')).toEqual({ unitId: 'nobody', roomId: null, reason: 'nowhere' });
  });

  it('a unit without hobbies has the same whereabouts, life on or off', () => {
    const off = campaign(reg, 4);
    const on = structuredClone(off);
    on.settings.lifeEvents = 'normal';
    on.life = newLife(3);
    for (let day = 1; day <= 7; day++) {
      for (const slot of SLOTS) expect(whereabouts(at(on, day, slot), reg)).toEqual(whereabouts(at(off, day, slot), reg));
    }
  });

  it('hobbies are ignored while life is off', () => {
    const off = campaign(reg, 4);
    const withHobby = structuredClone(off);
    mine(withHobby).hobbies = [take('reading'), take('chess')];
    for (let day = 1; day <= 14; day++) {
      for (const slot of SLOTS) expect(whereabouts(at(withHobby, day, slot), reg)).toEqual(whereabouts(at(off, day, slot), reg));
    }
  });
});

describe('the hobby tilts her room', () => {
  it('an active hobby puts her in its room more often (28 days)', () => {
    const base = world([], 'normal');
    const tilted = world([take('reading')]);
    const count = (s: CampaignState): number => {
      let n = 0;
      for (let day = 1; day <= 28; day++) {
        for (const slot of ['morning', 'afternoon', 'evening'] as Slot[]) {
          const w = whereaboutAt(s, reg, ANN, day, slot);
          if (w.reason === 'routine' && reg.hubRooms.get(w.roomId!)?.sceneLocationId === 'quarters_unit') n++;
        }
      }
      return n;
    };
    expect(count(tilted)).toBeGreaterThan(count(base));
  });

  it('a cooling hobby does not tilt', () => {
    const base = world([], 'normal');
    const cooling = world([take('reading', { state: 'cooling' })]);
    for (let day = 1; day <= 14; day++) {
      for (const slot of ['morning', 'afternoon', 'evening'] as Slot[]) expect(whereaboutAt(cooling, reg, ANN, day, slot)).toEqual(whereaboutAt(base, reg, ANN, day, slot));
    }
  });
});

/** A day on which she has a practice slot of her hobby, found by looking (the hash decides where she is). */
function practiceDay(s: CampaignState): { day: number; slot: Slot } {
  for (let day = 1; day <= 60; day++) {
    const slots = practiceSlots(s, reg, ANN, day);
    if (slots.length > 0) return { day, slot: slots[0].slot };
  }
  throw new Error('no practice day');
}

describe('practice needs routine, free, at base, unrestricted, stress < 70', () => {
  it('lists her slot in the hobby room', () => {
    const s = world();
    const { day, slot } = practiceDay(s);
    const got = practiceSlots(s, reg, ANN, day).find((x) => x.slot === slot)!;
    expect(got.hobbyId).toBe('reading');
    expect(reg.hubRooms.get(got.roomId)!.sceneLocationId).toBe('quarters_unit');
    expect(whereaboutAt(s, reg, ANN, day, slot)).toEqual({ unitId: ANN, roomId: got.roomId, reason: 'routine' });
  });

  it('nothing while life is off', () => {
    const s = world([take('reading')], null);
    for (let day = 1; day <= 30; day++) expect(practiceSlots(s, reg, ANN, day)).toEqual([]);
  });

  it('busy as a companion', () => {
    const s = world();
    const { day, slot } = practiceDay(s);
    s.life!.busy.push({ unitId: ANN, slot: busySlot(day, slot), activityId: 'talk' });
    expect(practiceSlots(s, reg, ANN, day).some((x) => x.slot === slot)).toBe(false);
  });

  it('in a scene', () => {
    const s = world();
    const { day, slot } = practiceDay(s);
    s.life!.busy.push({ unitId: ANN, slot: busySlot(day, slot) }); // a scene writes no activity
    expect(practiceSlots(s, reg, ANN, day).some((x) => x.slot === slot)).toBe(false);
    expect(practiceSlots(s, reg, BEA, day)).toEqual([]); // she has no hobby
  });

  it('in a run that day, or out on one', () => {
    const s = world();
    const { day } = practiceDay(s);
    s.lastExpedition = { day, party: [ANN], injuries: [] } as unknown as CampaignState['lastExpedition'];
    expect(practiceSlots(s, reg, ANN, day)).toEqual([]);
    const out = world();
    out.expedition = stubExpedition(out, { party: [ANN, BEA] });
    for (let d = 1; d <= 20; d++) expect(practiceSlots(out, reg, ANN, d)).toEqual([]);
  });

  it('injured', () => {
    const s = world();
    const { day } = practiceDay(s);
    mine(s).status = 'injured';
    expect(practiceSlots(s, reg, ANN, day)).toEqual([]);
  });

  it('confined', () => {
    const s = world();
    const { day } = practiceDay(s);
    s.discipline = { ...(s.discipline ?? {}), restrictions: [{ unitId: ANN, kind: 'confined', untilDay: day + 3 }] } as unknown as CampaignState['discipline'];
    expect(practiceSlots(s, reg, ANN, day)).toEqual([]);
  });

  it('stress 70', () => {
    const s = world();
    const { day } = practiceDay(s);
    mine(s).stress = 69;
    expect(practiceSlots(s, reg, ANN, day).length).toBeGreaterThan(0);
    mine(s).stress = 70;
    expect(practiceSlots(s, reg, ANN, day)).toEqual([]);
  });

  it('two hobbies in one room: the one with more interest, a tie by registry order', () => {
    const s = world([take('reading', { interest: 40 }), take('knitting', { interest: 80 })]); // both in quarters_unit
    const day = practiceDay(s).day;
    for (const p of practiceSlots(s, reg, ANN, day)) if (reg.hubRooms.get(p.roomId)!.sceneLocationId === 'quarters_unit') expect(p.hobbyId).toBe('knitting');
    const tie = world([take('knitting', { interest: 60 }), take('reading', { interest: 60 })]);
    const first = [...reg.hobbies.keys()].indexOf('reading') < [...reg.hobbies.keys()].indexOf('knitting') ? 'reading' : 'knitting';
    for (const p of practiceSlots(tie, reg, ANN, practiceDay(tie).day)) if (reg.hubRooms.get(p.roomId)!.sceneLocationId === 'quarters_unit') expect(p.hobbyId).toBe(first);
  });
});

describe('practise: the gain', () => {
  const gained = (over: Partial<HobbyState>, aptitude?: 'high' | 'low'): number => {
    const s = world([take('reading', over)]);
    if (aptitude) mine(s).aptitudes = { high: aptitude === 'high' ? ['reading'] : [], low: aptitude === 'low' ? ['reading'] : [] };
    const events = practise(s, reg, ANN, 'reading', 31, 'morning');
    expect(ofType(events, 'hobby_progress')).toHaveLength(1);
    return mine(s).hobbies![0].skill;
  };

  it('standard at interest 60 adds 1', () => expect(gained({})).toBeCloseTo(1, 6));
  it('high aptitude adds 1.6 at interest 60', () => expect(gained({}, 'high')).toBeCloseTo(1.6, 6));
  it('low aptitude adds 0.5 at interest 60', () => expect(gained({}, 'low')).toBeCloseTo(0.5, 6));
  it('interest 90 is capped at 1.3', () => expect(gained({ interest: 90 })).toBeCloseTo(1.3, 6));
  it('interest 30 adds half', () => expect(gained({ interest: 30 })).toBeCloseTo(0.5, 6));
  it('records the day of the practice', () => {
    const s = world();
    practise(s, reg, ANN, 'reading', 31, 'evening');
    expect(mine(s).hobbies![0].lastPracticeDay).toBe(31);
  });
  it('a hobby she does not have is nothing', () => {
    const s = world();
    expect(practise(s, reg, ANN, 'chess', 31, 'morning')).toEqual([]);
    expect(practise(s, reg, 'unit_nobody', 'reading', 31, 'morning')).toEqual([]);
  });
});

describe('plateaus and breakthroughs', () => {
  const point = (s: CampaignState, prev: number, next: number): number => prev + 0.7 * (next - prev);

  it('skill reaching 70 % of a step stops there on a plateau', () => {
    const s = world();
    const m0 = ms(s, 'reading', 0);
    mine(s).hobbies![0].skill = point(s, 0, m0) - 0.4;
    const events = practise(s, reg, ANN, 'reading', 31, 'morning');
    const h = mine(s).hobbies![0];
    expect(h.skill).toBeCloseTo(point(s, 0, m0), 6);
    expect(h.plateau).toEqual({ at: h.skill, since: 31 });
    expect(ofType(events, 'hobby_plateau')).toHaveLength(1);
  });

  it('on a plateau practice adds nothing until a breakthrough', () => {
    const s = world();
    const m0 = ms(s, 'reading', 0);
    const h = mine(s).hobbies![0];
    h.skill = point(s, 0, m0);
    h.plateau = { at: h.skill, since: 30 };
    let broke = -1;
    for (let d = 31; d < 400 && broke < 0; d++) {
      const before = h.skill;
      const events = practise(s, reg, ANN, 'reading', d, 'morning');
      if (ofType(events, 'hobby_breakthrough').length > 0) broke = d;
      else {
        expect(h.skill).toBe(before);
        expect(h.plateau).toBeDefined();
      }
    }
    expect(broke).toBeGreaterThan(0);
    expect(h.skill).toBe(m0);
    expect(h.milestones).toEqual(['first_book']);
    expect(h.plateau).toBeUndefined();
  });

  it('a push breaks it at once', () => {
    const s = world();
    const m0 = ms(s, 'reading', 0);
    const h = mine(s).hobbies![0];
    h.skill = point(s, 0, m0);
    h.plateau = { at: h.skill, since: 30 };
    const events = practise(s, reg, ANN, 'reading', 31, 'morning', { push: true });
    expect(ofType(events, 'hobby_breakthrough')).toHaveLength(1);
    expect(ofType(events, 'hobby_milestone')).toHaveLength(1);
    expect(h.skill).toBe(m0);
    expect(h.plateau).toBeUndefined();
  });

  it('a push with no plateau is just a practice with more interest', () => {
    const s = world();
    const h = mine(s).hobbies![0];
    practise(s, reg, ANN, 'reading', 31, 'morning', { push: true });
    expect(h.skill).toBeCloseTo(1, 6);
    expect(h.interest).toBe(68);
  });

  it('the breakthrough chance is 0.06 x aptitude, a hashed roll per slot', () => {
    const rate = (aptitude: 'high' | 'standard'): number => {
      const s = world();
      const m0 = ms(s, 'reading', 0);
      let hit = 0;
      for (let d = 1; d <= 1000; d++) {
        const c = structuredClone(s);
        if (aptitude === 'high') mine(c).aptitudes = { high: ['reading'], low: [] };
        const h = mine(c).hobbies![0];
        h.skill = point(c, 0, m0);
        h.plateau = { at: h.skill, since: 1 };
        if (ofType(practise(c, reg, ANN, 'reading', d, 'afternoon'), 'hobby_breakthrough').length > 0) hit++;
      }
      return hit / 1000;
    };
    expect(Math.abs(rate('standard') - 0.06)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(rate('high') - 0.096)).toBeLessThanOrEqual(0.02);
  });

  it('is the same roll as lifeChance and draws no rng', () => {
    const s = world();
    const m0 = ms(s, 'reading', 0);
    const h = mine(s).hobbies![0];
    h.skill = point(s, 0, m0);
    h.plateau = { at: h.skill, since: 1 };
    const rng = structuredClone(s.rng);
    for (let d = 1; d <= 50; d++) {
      const c = structuredClone(s);
      const hit = ofType(practise(c, reg, ANN, 'reading', d, 'morning'), 'hobby_breakthrough').length > 0;
      expect(hit).toBe(lifeChance(s.life!, `${ANN}|reading|${d}|morning`, 0.06));
    }
    expect(s.rng).toEqual(rng);
  });

  it('breakthrough() grants the next milestone directly', () => {
    const s = world();
    const events = breakthrough(s, reg, ANN, 'reading', 31);
    expect(ofType(events, 'hobby_breakthrough')).toHaveLength(1);
    expect(mine(s).hobbies![0].milestones).toEqual(['first_book']);
    expect(mine(s).hobbies![0].skill).toBe(ms(s, 'reading', 0));
  });

  it('the last step plateaus too, and mastery is reached at a hundred or less', () => {
    const s = world();
    const h = mine(s).hobbies![0];
    h.milestones = ['first_book', 'shelf', 'favourite'];
    h.skill = ms(s, 'reading', 2);
    let plateaued = false;
    let d = 31;
    for (; d < 600 && !h.mastered; d++) {
      if (ofType(practise(s, reg, ANN, 'reading', d, 'morning'), 'hobby_plateau').length > 0) plateaued = true;
    }
    expect(plateaued).toBe(true);
    expect(h.mastered).toBe(true);
    expect(h.milestones).toHaveLength(4);
    expect(h.skill).toBe(ms(s, 'reading', 3));
    expect(h.skill).toBeLessThanOrEqual(100);
    // after mastery the cycle goes on: skill creeps up to a hundred and never past it
    for (let k = 0; k < 400; k++) practise(s, reg, ANN, 'reading', 700 + k, 'morning');
    expect(h.skill).toBe(100);
  });
});

describe('low aptitude stops at the third milestone', () => {
  it('skill never passes it; the ceiling is set once; interest falls 10 (20 when moody)', () => {
    for (const moody of [false, true]) {
      const s = world();
      const u = mine(s);
      u.aptitudes = { high: [], low: ['reading'] };
      if (moody) u.temperament = { talkativeness: 'terse', volatility: 'moody', humor: 'dry' };
      const h = u.hobbies![0];
      h.milestones = ['first_book', 'shelf'];
      h.skill = ms(s, 'reading', 1);
      h.interest = 70;
      const ceilingEvents: unknown[] = [];
      for (let d = 31; d < 600; d++) {
        const events = practise(s, reg, ANN, 'reading', d, 'morning', { push: true });
        ceilingEvents.push(...ofType(events, 'hobby_milestone'));
        h.interest = Math.min(h.interest, 70); // keep it keen so only the ceiling is under test
      }
      expect(h.milestones).toEqual(['first_book', 'shelf', 'favourite']);
      expect(h.ceiling).toBe(true);
      expect(h.skill).toBeLessThanOrEqual(ms(s, 'reading', 2));
      expect(h.mastered).toBeUndefined();
      expect(ceilingEvents).toHaveLength(1);
    }
  });

  it('the interest cost is 10, or 20 when moody, once', () => {
    for (const [moody, cost] of [[false, 10], [true, 20]] as const) {
      const s = world();
      const u = mine(s);
      u.aptitudes = { high: [], low: ['reading'] };
      if (moody) u.temperament = { talkativeness: 'terse', volatility: 'moody', humor: 'dry' };
      const h = u.hobbies![0];
      h.milestones = ['first_book', 'shelf'];
      h.skill = ms(s, 'reading', 1);
      h.interest = 80;
      grantMilestone(s, reg, ANN, 'reading', 2, {});
      expect(h.ceiling).toBe(true);
      expect(h.interest).toBe(80 + 15 - cost); // the milestone is +15
      grantMilestone(s, reg, ANN, 'reading', 2, {}); // already reached: nothing again
      expect(h.interest).toBe(80 + 15 - cost);
    }
  });
});

describe('milestones', () => {
  it('writes a hidden fact and queues an item', () => {
    const s = world();
    const events = grantMilestone(s, reg, ANN, 'reading', 0, {});
    const fact = s.memory.facts.find((f) => f.about.includes(ANN) && f.tags.includes('first_book'))!;
    expect(fact.hiddenFromCommander).toBe(true);
    expect(fact.tags).toEqual(expect.arrayContaining(['life', 'untold', 'reading']));
    expect(fact.knownBy).toEqual([ANN]);
    expect(s.life!.queue).toHaveLength(1);
    expect(s.life!.queue[0]).toMatchObject({ unitId: ANN, kind: 'hobby', ref: 'reading', what: 'milestone', milestoneId: 'first_book', factId: fact.id, category: 'hobby', day: 30 });
    expect(ofType(events, 'hobby_milestone')).toEqual([{ type: 'hobby_milestone', unitId: ANN, hobbyId: 'reading', milestoneId: 'first_book' }]);
    expect(mine(s).hobbies![0].milestones).toEqual(['first_book']);
    expect(mine(s).hobbies![0].interest).toBe(75);
  });

  it('a milestone is granted once', () => {
    const s = world();
    grantMilestone(s, reg, ANN, 'reading', 0, {});
    expect(grantMilestone(s, reg, ANN, 'reading', 0, {})).toEqual([]);
    expect(s.life!.queue).toHaveLength(1);
  });

  it('a caused one is not queued and adds a caused delivered row', () => {
    const s = world();
    grantMilestone(s, reg, ANN, 'reading', 0, { caused: true });
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.delivered).toEqual([{ day: 30, unitId: ANN, category: 'hobby', hobby: true, caused: true }]);
    expect(s.memory.facts.some((f) => f.tags.includes('first_book'))).toBe(true);
  });

  it('an opinion trace opens the hobby topic for her', () => {
    const s = world();
    expect(reg.hobbies.get('reading')!.opinionTopic).toBe('books');
    grantMilestone(s, reg, ANN, 'reading', 2, {});
    expect(s.life!.units[ANN].pendingTopics).toEqual(['books']);
    const done = world();
    mine(done).opinions = { books: { position: 'x', strength: 'strong', formedDay: 1 } };
    grantMilestone(done, reg, ANN, 'reading', 2, {});
    expect(done.life!.units[ANN]?.pendingTopics ?? []).toEqual([]);
  });

  it('a plateau is cleared by a milestone', () => {
    const s = world();
    mine(s).hobbies![0].plateau = { at: 5, since: 2 };
    grantMilestone(s, reg, ANN, 'reading', 0, {});
    expect(mine(s).hobbies![0].plateau).toBeUndefined();
  });
});

describe('mastery', () => {
  const master = (dev: 'off' | 'normal', opts: Parameters<typeof grantMilestone>[5] = {}): { s: CampaignState; events: ReturnType<typeof grantMilestone> } => {
    const s = world();
    if (dev !== 'off') s.settings.characterDevelopment = dev;
    mine(s).hobbies![0].milestones = ['first_book', 'shelf', 'favourite'];
    return { s, events: grantMilestone(s, reg, ANN, 'reading', 3, opts) };
  };
  const squadFact = (s: CampaignState) => s.memory.facts.find((f) => f.tags.includes('mastered'))!;
  const retrieved = (s: CampaignState) => retrieveFacts(s, { participants: [ANN], tags: [] }, 50);

  it('sets mastered and writes the squad fact hidden and untold until the item is told', () => {
    const { s, events } = master('off');
    expect(mine(s).hobbies![0].mastered).toBe(true);
    expect(ofType(events, 'hobby_mastered')).toEqual([{ type: 'hobby_mastered', unitId: ANN, hobbyId: 'reading' }]);
    const fact = squadFact(s);
    expect(fact.text).toContain('reading');
    expect(fact.hiddenFromCommander).toBe(true);
    expect(fact.tags).toContain('untold');
    expect(fact.knownBy).toEqual(s.squad.filter((u) => u.kind === 'named' && u.status !== 'dead').map((u) => u.id));
    expect(s.life!.queue[0]).toMatchObject({ what: 'mastered', ref: 'reading' });
    expect(retrieved(s).some((f) => f.id === fact.id)).toBe(false); // no prompt carries it yet
  });

  it('telling the mastered item reveals the fact (retrieved now) and, with development on, writes the DevFact; before that, no DevFact', () => {
    const { s } = master('normal');
    expect(mine(s).development?.facts ?? []).toEqual([]);
    const fact = squadFact(s);
    s.life!.outbox.push({ itemId: s.life!.queue[0].id, unitId: ANN, channel: 'dm', day: 30 });
    s.settings.unitDms = true;
    const r = run(s, reg, { type: 'life/share_done', payload: { itemId: s.life!.queue[0].id, text: 'They call me the reading hand now.' } });
    expect(errors(r.events)).toEqual([]);
    const after = r.state.memory.facts.find((f) => f.id === fact.id)!;
    expect(after.hiddenFromCommander).toBeUndefined();
    expect(after.tags).not.toContain('untold');
    expect(retrieveFacts(r.state, { participants: [ANN], tags: [] }, 50).some((f) => f.id === fact.id)).toBe(true);
    const facts = r.state.squad[0].development!.facts;
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ source: 'life', kind: 'skill', day: 30 });
    expect(facts[0].text).toContain('reading');
  });

  it('with development off the reveal writes no DevFact', () => {
    const { s } = master('off');
    closeNews(s, s.life!.queue[0].id);
    expect(squadFact(s).hiddenFromCommander).toBeUndefined();
    expect(s.squad[0].development).toBeUndefined();
  });

  it('a mastery the commander was there for is known at once', () => {
    const { s } = master('normal', { caused: true });
    expect(s.life!.queue).toEqual([]);
    expect(squadFact(s).hiddenFromCommander).toBeUndefined();
    expect(mine(s).development!.facts).toHaveLength(1);
  });

  it('a mastery a shared event brought stays hidden until that event is told (R13), then reveals with the trait', () => {
    const facts: string[] = [];
    const { s } = master('normal', { told: true, facts });
    expect(s.life!.queue).toEqual([]);
    expect(squadFact(s).hiddenFromCommander).toBe(true); // nothing was told yet
    expect(mine(s).development?.facts ?? []).toEqual([]);
    expect(facts).toContain(squadFact(s).id);
    s.life!.queue.push({ id: 'ln99', unitId: ANN, kind: 'event', ref: 'x', what: 'event', category: 'things', day: 30, alsoFacts: facts });
    closeNews(s, 'ln99');
    expect(squadFact(s).hiddenFromCommander).toBeUndefined();
    expect(mine(s).development!.facts).toHaveLength(1);
  });

  it('a mastery that goes stale untold stays hidden and writes no DevFact', () => {
    const { s } = master('normal');
    s.life!.news.push({ itemId: s.life!.queue[0].id, unitId: ANN, until: 33 });
    staleSweep(s, 33);
    expect(squadFact(s).hiddenFromCommander).toBe(true);
    expect(mine(s).development?.facts ?? []).toEqual([]);
  });
});

describe('the practice pass of the day step', () => {
  it('practises her slots at the day end and draws no rng', () => {
    const s = world();
    s.day = practiceDay(s).day;
    const rng = structuredClone(s.rng);
    const expected = practiceSlots(s, reg, ANN, s.day).length;
    const events = lifeDayStep(s, ctxOf(s, reg));
    expect(ofType(events, 'hobby_progress').length).toBeGreaterThanOrEqual(expected);
    expect(mine(s).hobbies![0].skill).toBeGreaterThan(0);
    expect(s.rng).toEqual(rng);
  });
});

/** Days on which both practise `hobbyId` in the same room in the same slot (the stand-ins' hobbies must be set). */
function sharedDays(s: CampaignState, a: string, b: string, max: number, from = 1): Array<{ day: number; slot: Slot; roomId: string }> {
  const out: Array<{ day: number; slot: Slot; roomId: string }> = [];
  for (let day = from; day <= from + 400 && out.length < max; day++) {
    for (const p of practiceSlots(s, reg, a, day)) if (practiceSlots(s, reg, b, day).some((q) => q.slot === p.slot && q.roomId === p.roomId)) out.push({ day, slot: p.slot, roomId: p.roomId });
  }
  return out;
}
const duo = (hobby: string, over: Partial<HobbyState> = {}, overB: Partial<HobbyState> = {}): CampaignState => {
  const s = world([take(hobby, over)]);
  mine(s, BEA).hobbies = [take(hobby, overB)];
  return s;
};

describe('a shared practice slot (once a week for the pair, never in her own quarters)', () => {
  it('is worth +5 interest to both and no more at the first, and not again within the week', () => {
    const s = duo('cooking'); // the mess hall: a room two women can share
    const days = sharedDays(s, ANN, BEA, 40);
    expect(days.length).toBeGreaterThan(5);
    expect(reg.locations.get(String(reg.hubRooms.get(days[0].roomId)!.sceneLocationId))!.perUnit).toBeUndefined();
    s.day = days[0].day;
    const [a0, b0] = [mine(s).hobbies![0].interest, mine(s, BEA).hobbies![0].interest];
    const events = sharePractice(s, reg, ANN, BEA, 'cooking', s.day);
    expect(mine(s).hobbies![0].interest).toBe(a0 + 5);
    expect(mine(s, BEA).hobbies![0].interest).toBe(b0 + 5);
    expect(s.life!.shared).toEqual({ [`${ANN}|${BEA}`]: Math.floor(s.day / 7) });
    expect(ofType(events, 'hobby_breakthrough')).toEqual([]); // nobody was on a plateau
    // the same week again (either order of the pair): nothing
    expect(sharePractice(s, reg, BEA, ANN, 'cooking', s.day)).toEqual([]);
    expect(mine(s).hobbies![0].interest).toBe(a0 + 5);
    // the next week again
    expect(ofType(sharePractice(s, reg, ANN, BEA, 'cooking', s.day + 7), 'hobby_breakthrough')).toEqual([]);
    expect(mine(s).hobbies![0].interest).toBe(a0 + 10);
  });

  it('the push goes to the woman who is less far along, and only to her', () => {
    const s = duo('cooking', { skill: 7, plateau: { at: 7, since: 3 } }, { skill: 3 });
    mine(s, BEA).hobbies![0].plateau = { at: 7, since: 3 };
    const events = sharePractice(s, reg, ANN, BEA, 'cooking', 30);
    expect(ofType(events, 'hobby_breakthrough')).toEqual([{ type: 'hobby_breakthrough', unitId: BEA, hobbyId: 'cooking' }]);
    expect(mine(s, BEA).hobbies![0].plateau).toBeUndefined();
    expect(mine(s).hobbies![0].plateau).toBeDefined(); // the other one stays on hers
    // and the other way round
    const t = duo('cooking', { skill: 3 }, { skill: 7 });
    mine(t).hobbies![0].plateau = { at: 7, since: 3 };
    mine(t, BEA).hobbies![0].plateau = { at: 7, since: 3 };
    expect(ofType(sharePractice(t, reg, ANN, BEA, 'cooking', 30), 'hobby_breakthrough')).toEqual([{ type: 'hobby_breakthrough', unitId: ANN, hobbyId: 'cooking' }]);
  });

  it('a tie of skill is broken by a hash of the pair and the week, the same every time', () => {
    const winners = new Set<string>();
    for (let week = 5; week < 45; week++) {
      const s = duo('cooking', { skill: 7, plateau: { at: 7, since: 3 } }, { skill: 7, plateau: { at: 7, since: 3 } });
      const out = ofType(sharePractice(s, reg, ANN, BEA, 'cooking', week * 7), 'hobby_breakthrough');
      expect(out).toHaveLength(1);
      winners.add(String(out[0].unitId));
      const again = duo('cooking', { skill: 7, plateau: { at: 7, since: 3 } }, { skill: 7, plateau: { at: 7, since: 3 } });
      expect(ofType(sharePractice(again, reg, BEA, ANN, 'cooking', week * 7), 'hobby_breakthrough')[0].unitId).toBe(out[0].unitId);
    }
    expect(winners.size).toBe(2);
  });

  it('the day step applies it: a shared mess-hall slot gives the pair one share in the week', () => {
    const s = duo('cooking');
    const days = sharedDays(s, ANN, BEA, 40);
    s.day = days[0].day;
    lifeDayStep(s, ctxOf(s, reg));
    expect(s.life!.shared![`${ANN}|${BEA}`]).toBe(Math.floor(days[0].day / 7));
    expect(mine(s, CAT).hobbies).toBeUndefined();
  });

  it('two women in their own quarters (a perUnit room) never share, however often they stand there together', () => {
    const s = duo('reading'); // quarters_unit only
    const quarters = [...reg.hubRooms.values()].find((r) => r.sceneLocationId === 'quarters_unit')!;
    expect(reg.locations.get('quarters_unit')!.perUnit).toBe(true);
    const days = sharedDays(s, ANN, BEA, 20);
    expect(days.length).toBeGreaterThan(10); // they do stand there together
    expect(days.every((d) => d.roomId === quarters.id)).toBe(true);
    for (const d of days) {
      const t = structuredClone(s);
      t.day = d.day;
      lifeDayStep(t, ctxOf(t, reg));
      expect(t.life!.shared).toBeUndefined();
    }
  });

  it('two women never reach the same milestone of the same hobby on one day', () => {
    const s = duo('cooking', { skill: 7, plateau: { at: 7, since: 3 } }, { skill: 7, plateau: { at: 7, since: 3 } });
    expect(ofType(breakthrough(s, reg, ANN, 'cooking', 30), 'hobby_milestone')).toHaveLength(1);
    expect(breakthrough(s, reg, BEA, 'cooking', 30)).toEqual([]); // she waits
    expect(mine(s, BEA).hobbies![0].plateau).toBeDefined();
    s.day = 31;
    expect(ofType(breakthrough(s, reg, BEA, 'cooking', 31), 'hobby_milestone')).toHaveLength(1); // the next day it is hers
  });
});

describe('a life event that moves a hobby on', () => {
  const events = (id: string) => reg.lifeEvents.get(id) as unknown as LifeEventEntry;

  /** A salt under which the event is told (`shared`) or not (the share roll is a hash of the salt). */
  const withSalt = (shared: boolean, make: () => CampaignState, id: string): CampaignState => {
    for (let salt = 1; salt < 400; salt++) {
      const s = make();
      s.life!.salt = salt;
      applyLifeEvent(s, reg, ANN, events(id), 30);
      if (s.life!.queue.some((q) => q.kind === 'event') === shared) { const t = make(); t.life!.salt = salt; return t; }
    }
    throw new Error('no salt');
  };

  it('a milestone event a shared event brings is told with the event (only the event is queued)', () => {
    const s = withSalt(true, () => world(), 'finished_book');
    const out = applyLifeEvent(s, reg, ANN, events('finished_book'), 30);
    expect(mine(s).hobbies![0].milestones).toEqual(['first_book']);
    expect(ofType(out, 'hobby_milestone')).toHaveLength(1);
    expect(s.life!.queue.every((q) => q.kind === 'event')).toBe(true);
    expect(s.life!.queue[0].alsoFacts).toHaveLength(1);
  });

  it('an unshared event that brings a milestone queues its own hobby item (R13), so the milestone can be told on schedule', () => {
    const s = withSalt(false, () => world(), 'finished_book');
    applyLifeEvent(s, reg, ANN, events('finished_book'), 30);
    expect(mine(s).hobbies![0].milestones).toEqual(['first_book']);
    expect(s.life!.queue).toHaveLength(1);
    expect(s.life!.queue[0]).toMatchObject({ kind: 'hobby', ref: 'reading', what: 'milestone', milestoneId: 'first_book' });
    expect(toldMilestones(s, ANN, mine(s).hobbies![0])).toEqual([]); // untold until the item is told
    closeNews(s, s.life!.queue[0].id);
    expect(toldMilestones(s, ANN, mine(s).hobbies![0])).toEqual(['first_book']);
  });

  it('a milestone event of any hobby picks one of hers by hash; none, no change', () => {
    const s = world([take('reading'), take('chess')]);
    applyLifeEvent(s, reg, ANN, events('learned_trick'), 30);
    expect(mine(s).hobbies!.reduce((n, h) => n + h.milestones.length, 0)).toBe(1);
    const none = world([]);
    expect(ofType(applyLifeEvent(none, reg, ANN, events('learned_trick'), 30), 'hobby_milestone')).toEqual([]);
    const ceiling = world([take('reading', { ceiling: true })]);
    expect(ofType(applyLifeEvent(ceiling, reg, ANN, events('finished_book'), 30), 'hobby_milestone')).toEqual([]);
  });

  it('an event that feeds a hobby she has breaks its plateau', () => {
    const s = world([take('music', { plateau: { at: 5, since: 2 }, skill: 5 })]);
    const out = applyLifeEvent(s, reg, ANN, events('music_found'), 30);
    expect(ofType(out, 'hobby_breakthrough')).toHaveLength(1);
    expect(mine(s).hobbies![0].plateau).toBeUndefined();
    expect(mine(s).hobbies![0].interest).toBe(60 + 15 + 8);
  });
});

describe('her day is derived once per pass', () => {
  it('a cache hands back the same answer without deriving it again', () => {
    const s = world();
    const cache = new Map<string, ReturnType<typeof placesOf>>();
    const first = placesOf(s, reg, ANN, 31, cache);
    expect(placesOf(s, reg, ANN, 31, cache)).toBe(first);
    expect(first).toEqual((['morning', 'afternoon', 'evening'] as Slot[]).map((slot) => whereaboutAt(s, reg, ANN, 31, slot)));
    expect(cache.size).toBe(1);
  });
});
