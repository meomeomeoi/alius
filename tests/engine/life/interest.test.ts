import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import {
  bumpInterest, friendHobbies, interestTick, milestoneAt, practiceSlots, pushHobby, startHobby, takeUpHobbies,
} from '../../../src/engine/life';
import { decay } from '../../../src/engine/life/hobbies';
import { placesOf } from '../../../src/engine/life/places';
import { newLife } from '../../../src/engine/life/state';
import type { CampaignState, HobbyState, Unit } from '../../../src/engine/state/types';
import { campaign, loadCore, ofType } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const mine = (s: CampaignState, id = ANN): Unit => s.squad.find((u) => u.id === id)!;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [], ...over });

function world(hobbies: HobbyState[] = [take('reading')]): CampaignState {
  const s = campaign(reg, 4);
  s.day = 30;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  mine(s).hobbies = hobbies;
  return s;
}
/** The day on which the weekly tick of a hobby that started on `since` falls, `week` weeks in (0 = the first). */
const tickDay = (since: number, week: number): number => since + 6 + 7 * week;
const interestOf = (s: CampaignState, id = 'reading'): number => mine(s).hobbies!.find((h) => h.id === id)!.interest;

describe('the weekly tick', () => {
  it('happens once a week, on the seventh day of the hobby', () => {
    const s = world([take('reading', { interest: 50, since: 1 })]);
    for (let d = 1; d < 7; d++) interestTick(s, reg, ANN, d);
    expect(interestOf(s)).toBe(50);
    interestTick(s, reg, ANN, 7);
    expect(interestOf(s)).toBe(53);
    interestTick(s, reg, ANN, 8);
    expect(interestOf(s)).toBe(53);
  });

  it('novelty adds 3 for three weeks and then stops', () => {
    const s = world([take('reading', { interest: 50, since: 1 })]);
    const seen: number[] = [];
    for (let d = 1; d <= 28; d++) {
      interestTick(s, reg, ANN, d);
      if ((d - 1) % 7 === 6) seen.push(interestOf(s));
    }
    expect(seen).toEqual([53, 56, 59, 59]);
  });

  it('a plateau week costs 4', () => {
    const s = world([take('reading', { interest: 60, since: 1, plateau: { at: 7, since: 2 } })]);
    interestTick(s, reg, ANN, tickDay(1, 3)); // novelty is over
    expect(interestOf(s)).toBe(56);
  });

  it('stress of 50 or more costs 3', () => {
    const s = world([take('reading', { interest: 60, since: 1 })]);
    mine(s).stress = 49;
    interestTick(s, reg, ANN, tickDay(1, 3));
    expect(interestOf(s)).toBe(60);
    mine(s).stress = 50;
    interestTick(s, reg, ANN, tickDay(1, 3));
    expect(interestOf(s)).toBe(57);
  });

  it('a newer active hobby costs the older one 2, and not the newer one', () => {
    const s = world([take('reading', { interest: 60, since: 1 }), take('chess', { interest: 60, since: 5 })]);
    interestTick(s, reg, ANN, tickDay(1, 3));
    expect(interestOf(s, 'reading')).toBe(58);
    expect(interestOf(s, 'chess')).toBe(60); // its own tick has not come
    interestTick(s, reg, ANN, tickDay(5, 3));
    expect(interestOf(s, 'chess')).toBe(60); // nothing is newer than it
    // a cooling hobby, however new, costs nothing
    const c = world([take('reading', { interest: 60, since: 1 }), take('chess', { interest: 60, since: 5, state: 'cooling', coolingSince: 20 })]);
    interestTick(c, reg, ANN, tickDay(1, 3));
    expect(interestOf(c, 'reading')).toBe(60);
  });

  it('the terms add up', () => {
    const s = world([take('reading', { interest: 60, since: 1, plateau: { at: 7, since: 2 } }), take('chess', { interest: 60, since: 5 })]);
    mine(s).stress = 60;
    interestTick(s, reg, ANN, tickDay(1, 3));
    expect(interestOf(s, 'reading')).toBe(60 - 4 - 3 - 2);
  });

  it('draws no rng and does nothing while life is off', () => {
    const s = world();
    const rng = structuredClone(s.rng);
    interestTick(s, reg, ANN, 7);
    expect(s.rng).toEqual(rng);
    const off = world();
    off.settings.lifeEvents = 'off';
    const before = structuredClone(off);
    expect(interestTick(off, reg, ANN, 7)).toEqual([]);
    expect(off).toEqual(before);
  });
});

describe('cooling, dropping and taking it up again', () => {
  it('interest under 25 puts it in cooling', () => {
    const s = world([take('reading', { interest: 27 })]);
    expect(bumpInterest(s, ANN, 'reading', -2, 30)).toEqual([]);
    expect(mine(s).hobbies![0].state).toBe('active');
    const events = bumpInterest(s, ANN, 'reading', -1, 30);
    expect(ofType(events, 'hobby_cooling')).toEqual([{ type: 'hobby_cooling', unitId: ANN, hobbyId: 'reading' }]);
    expect(mine(s).hobbies![0]).toMatchObject({ state: 'cooling', coolingSince: 30, interest: 24 });
  });

  it('the weekly tick can cool it', () => {
    const s = world([take('reading', { interest: 26, since: 1, plateau: { at: 7, since: 2 } })]);
    const events = interestTick(s, reg, ANN, tickDay(1, 3));
    expect(ofType(events, 'hobby_cooling')).toHaveLength(1);
    expect(mine(s).hobbies![0].state).toBe('cooling');
  });

  it('thirty days in cooling and it is dropped: an event, a hidden fact and an item', () => {
    const s = world([take('reading', { interest: 20, state: 'cooling', coolingSince: 10, skill: 12, milestones: ['first_book'] })]);
    expect(interestTick(s, reg, ANN, 39)).toEqual([]); // 29 days
    expect(mine(s).hobbies![0].state).toBe('cooling');
    const events = interestTick(s, reg, ANN, 40);
    expect(ofType(events, 'hobby_dropped')).toEqual([{ type: 'hobby_dropped', unitId: ANN, hobbyId: 'reading' }]);
    expect(mine(s).hobbies![0].state).toBe('dropped');
    expect(mine(s).hobbies![0].coolingSince).toBeUndefined();
    const item = s.life!.queue.find((q) => q.what === 'dropped')!;
    expect(item).toMatchObject({ unitId: ANN, kind: 'hobby', ref: 'reading', category: 'hobby', day: 40 });
    const fact = s.memory.facts.find((f) => f.id === item.factId)!;
    expect(fact.hiddenFromCommander).toBe(true);
    expect(fact.tags).toContain('untold');
    expect(fact.knownBy).toEqual([ANN]);
    expect(fact.text).toContain('reading');
  });

  it('an event push of 40 or more takes it up again (cooling, and a dropped one too)', () => {
    const s = world([take('reading', { interest: 33, state: 'cooling', coolingSince: 20 }), take('chess', { interest: 33, state: 'dropped', since: 3 })]);
    const a = pushHobby(s, reg, ANN, 'reading', 30);
    expect(ofType(a, 'hobby_rekindled')).toEqual([{ type: 'hobby_rekindled', unitId: ANN, hobbyId: 'reading' }]);
    expect(mine(s).hobbies![0]).toMatchObject({ state: 'active', interest: 41 });
    expect(mine(s).hobbies![0].coolingSince).toBeUndefined();
    expect(ofType(pushHobby(s, reg, ANN, 'chess', 30), 'hobby_rekindled')).toHaveLength(1);
    // below 40 it stays put
    const low = world([take('reading', { interest: 20, state: 'cooling', coolingSince: 20 })]);
    expect(ofType(pushHobby(low, reg, ANN, 'reading', 30), 'hobby_rekindled')).toEqual([]);
    expect(mine(low).hobbies![0].state).toBe('cooling');
  });

  it('taking one up again past three active cools the least keen of the others', () => {
    const s = world([
      take('reading', { interest: 35, state: 'cooling', coolingSince: 20 }), take('chess', { interest: 70 }), take('cards', { interest: 50 }), take('plants', { interest: 65 }),
    ]);
    const events = pushHobby(s, reg, ANN, 'reading', 30);
    const states = Object.fromEntries(mine(s).hobbies!.map((h) => [h.id, h.state]));
    expect(states).toEqual({ reading: 'active', chess: 'active', cards: 'cooling', plants: 'active' });
    expect(ofType(events, 'hobby_cooling')).toEqual([{ type: 'hobby_cooling', unitId: ANN, hobbyId: 'cards' }]);
  });
});

describe('taking one up', () => {
  it('never more than three are active: a fourth start cools the lowest interest', () => {
    const s = world([take('reading', { interest: 70 }), take('chess', { interest: 45 }), take('cards', { interest: 60 })]);
    const events = startHobby(s, reg, ANN, 'plants', 30, 'event');
    const active = mine(s).hobbies!.filter((h) => h.state === 'active').map((h) => h.id).sort();
    expect(active).toEqual(['cards', 'plants', 'reading']);
    expect(mine(s).hobbies!.find((h) => h.id === 'chess')).toMatchObject({ state: 'cooling', coolingSince: 30 });
    expect(ofType(events, 'hobby_started')).toEqual([{ type: 'hobby_started', unitId: ANN, hobbyId: 'plants' }]);
    expect(ofType(events, 'hobby_cooling')).toHaveLength(1);
    expect(mine(s).hobbies!.find((h) => h.id === 'plants')).toMatchObject({ skill: 0, interest: 50, since: 30, state: 'active' });
  });

  it('she does not start one she has (in any state)', () => {
    const s = world([take('reading', { state: 'dropped' })]);
    expect(startHobby(s, reg, ANN, 'reading', 30, 'friend')).toEqual([]);
    expect(startHobby(s, reg, ANN, 'no_such_hobby', 30, 'friend')).toEqual([]);
    expect(mine(s).hobbies).toHaveLength(1);
  });

  it('a friend\'s hobby is news (a hidden fact and an item); an event\'s is its own news; an import\'s is silent', () => {
    const friend = world([]);
    startHobby(friend, reg, ANN, 'chess', 30, 'friend');
    expect(friend.life!.queue).toHaveLength(1);
    expect(friend.life!.queue[0]).toMatchObject({ unitId: ANN, kind: 'hobby', ref: 'chess', what: 'started', category: 'hobby' });
    const fact = friend.memory.facts.find((f) => f.id === friend.life!.queue[0].factId)!;
    expect(fact.hiddenFromCommander).toBe(true);
    expect(fact.tags).toEqual(expect.arrayContaining(['life', 'untold', 'chess']));
    for (const source of ['event', 'import'] as const) {
      const s = world([]);
      startHobby(s, reg, ANN, 'chess', 30, source);
      expect(s.life!.queue).toEqual([]);
    }
    const imp = world([]);
    startHobby(imp, reg, ANN, 'chess', 30, 'import');
    expect(imp.memory.facts.some((f) => f.tags.includes('chess'))).toBe(false);
  });

  it('several at once cool the excess once, the older ones first', () => {
    const s = world([take('reading', { interest: 55 }), take('chess', { interest: 52 }), take('cards', { interest: 90 })]);
    const unit = mine(s);
    const events = takeUpHobbies(unit, ['plants', 'music'], 30);
    const active = unit.hobbies!.filter((h) => h.state === 'active').map((h) => h.id);
    expect(active).toHaveLength(3);
    expect(active).toEqual(expect.arrayContaining(['plants', 'music', 'cards'])); // both new ones stay; the two least keen old ones cool
    expect(ofType(events, 'hobby_cooling')).toHaveLength(2);
    // nothing new is cooled while an older hobby could be
    const t = world([take('reading', { interest: 90 }), take('chess', { interest: 91 }), take('cards', { interest: 92 })]);
    takeUpHobbies(mine(t), ['plants'], 30);
    expect(mine(t).hobbies!.find((h) => h.id === 'plants')!.state).toBe('active');
    expect(mine(t).hobbies!.find((h) => h.id === 'reading')!.state).toBe('cooling');
  });
});

describe('decay', () => {
  it('a dropped hobby loses 1 a week and never goes below its last milestone', () => {
    const s = world([take('reading', { state: 'dropped', since: 1, skill: 36, milestones: ['first_book', 'shelf'] })]);
    const floor = milestoneAt(s.life!.salt, ANN, 'reading', 1);
    const h = mine(s).hobbies![0];
    for (let w = 0; w < 80; w++) interestTick(s, reg, ANN, tickDay(1, w));
    expect(floor).toBeLessThan(36);
    expect(h.skill).toBe(floor);
    expect(h.milestones).toEqual(['first_book', 'shelf']); // nothing is un-reached
  });

  it('with no milestone it stops at 0', () => {
    const s = world([take('reading', { state: 'dropped', since: 1, skill: 3 })]);
    for (let w = 0; w < 10; w++) interestTick(s, reg, ANN, tickDay(1, w));
    expect(mine(s).hobbies![0].skill).toBe(0);
  });

  it('only a dropped hobby decays, and by one a week', () => {
    const s = world([take('reading', { state: 'cooling', coolingSince: 25, skill: 20 }), take('chess', { state: 'dropped', since: 1, skill: 20 })]);
    decay(s, reg, ANN, 14);
    expect(mine(s).hobbies!.map((h) => h.skill)).toEqual([20, 19]);
  });
});

describe('a friend\'s hobby', () => {
  /** For each day, how many slots Ann practises a hobby of hers while Bea stands in the same room, in the same slot, on routine. */
  function sharedSlots(minTrials: number): Map<number, number> {
    const base = world([take('chess'), take('reading')]);
    const out = new Map<number, number>();
    let trials = 0;
    for (let day = 1; day <= 12000 && trials < minTrials; day++) {
      const cache = new Map();
      const slots = ['morning', 'afternoon', 'evening'];
      const bea = placesOf(base, reg, BEA, day, cache);
      for (const p of practiceSlots(base, reg, ANN, day, cache)) {
        const w = bea[slots.indexOf(p.slot)];
        if (w.reason === 'routine' && w.roomId === p.roomId) {
          out.set(day, (out.get(day) ?? 0) + 1);
          trials++;
        }
      }
    }
    return out;
  }

  it('about 2 % of shared slots, and never a hobby she has', () => {
    const shared = sharedSlots(1200);
    const trials = [...shared.values()].reduce((a, b) => a + b, 0);
    expect(trials).toBeGreaterThanOrEqual(1200);
    let picked = 0;
    for (const day of shared.keys()) {
      const s = world([take('chess'), take('reading')]);
      s.day = day;
      const events = friendHobbies(s, reg, day);
      for (const e of ofType(events, 'hobby_started')) {
        if (e.unitId === BEA) {
          picked++;
          expect(['chess', 'reading']).toContain(e.hobbyId); // what Ann practises
        }
        expect(e.unitId).not.toBe(ANN); // Ann has nobody to learn from
      }
    }
    const rate = picked / trials;
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.035);
  });

  it('is nothing for a woman who already has it, and nothing from a woman who did not practise', () => {
    const s = world([take('chess'), take('reading')]);
    for (const id of [BEA, 'unit_cat', 'unit_dee']) mine(s, id).hobbies = [take('chess'), take('reading')];
    for (let day = 1; day <= 300; day++) expect(ofType(friendHobbies(s, reg, day), 'hobby_started')).toEqual([]);
    const none = world([]);
    for (let day = 1; day <= 300; day++) expect(ofType(friendHobbies(none, reg, day), 'hobby_started')).toEqual([]);
  });

  it('is a news item for the one who learns it, and draws no rng', () => {
    const rng = structuredClone(world().rng);
    for (const day of sharedSlots(3000).keys()) {
      const s = world([take('chess'), take('reading')]);
      const started = ofType(friendHobbies(s, reg, day), 'hobby_started');
      if (started.length === 0) continue;
      expect(s.life!.queue).toHaveLength(started.length);
      expect(s.life!.queue[0]).toMatchObject({ kind: 'hobby', what: 'started', category: 'hobby' });
      expect(s.rng).toEqual(rng);
      return;
    }
    throw new Error('nobody picked a hobby up');
  });
});
