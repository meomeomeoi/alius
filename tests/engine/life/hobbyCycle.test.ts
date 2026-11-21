import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/squad';
import { hobbyPass, lifeDayStep, milestoneAt } from '../../../src/engine/life';
import { newLife } from '../../../src/engine/life/state';
import type { CampaignState, HobbyState, Unit } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const mine = (s: CampaignState, id: string): Unit => s.squad.find((u) => u.id === id)!;
const take = (id: string, over: Partial<HobbyState> = {}): HobbyState => ({ id, skill: 0, interest: 60, state: 'active', since: 1, milestones: [], ...over });

/** Five women, one hobby each, fixed aptitudes and stress: nobody is ever busy, so every slot she stands in her hobby's room is practised. */
const CAST: Array<{ id: string; hobby: string; aptitude: 'standard' | 'high' | 'low'; stress: number }> = [
  { id: 'unit_ann', hobby: 'cooking', aptitude: 'standard', stress: 0 },
  { id: 'unit_bea', hobby: 'chess', aptitude: 'standard', stress: 0 },
  { id: 'unit_cat', hobby: 'reading', aptitude: 'high', stress: 0 },
  { id: 'unit_dee', hobby: 'reading', aptitude: 'low', stress: 0 },
  { id: 'unit_eve', hobby: 'tinkering', aptitude: 'low', stress: 60 },
];

function simulate(salt: number, days = 120) {
  const s = campaign(reg, 5);
  s.settings.lifeEvents = 'normal';
  s.life = newLife(salt);
  s.world.clocks = [];
  for (const c of CAST) {
    const u = mine(s, c.id);
    u.status = 'active';
    u.stress = c.stress;
    u.hobbies = [take(c.hobby, { interest: 50 })];
    if (c.aptitude !== 'standard') u.aptitudes = { high: c.aptitude === 'high' ? [c.hobby] : [], low: c.aptitude === 'low' ? [c.hobby] : [] };
  }
  const reached: Record<string, number[]> = Object.fromEntries(CAST.map((c) => [c.id, []]));
  const log = { cooling: 0, dropped: 0, started: 0, mostActive: 0 };
  for (let day = 1; day <= days; day++) {
    s.day = day;
    const before = Object.fromEntries(CAST.map((c) => [c.id, mine(s, c.id).hobbies![0].milestones.length]));
    const events = hobbyPass(s, reg, day);
    log.cooling += ofType(events, 'hobby_cooling').length;
    log.dropped += ofType(events, 'hobby_dropped').length;
    log.started += ofType(events, 'hobby_started').length;
    for (const c of CAST) {
      const h = mine(s, c.id).hobbies![0];
      if (h.milestones.length > before[c.id]) reached[c.id].push(day);
      log.mostActive = Math.max(log.mostActive, mine(s, c.id).hobbies!.filter((x) => x.state === 'active').length);
    }
  }
  return { s, reached, log };
}

describe('120-day simulation (salt 2, pinned)', () => {
  let sim: ReturnType<typeof simulate>;
  beforeAll(() => {
    sim = simulate(2);
  });

  it('the milestone days are pinned', () => {
    expect(sim.reached).toEqual({
      unit_ann: [10, 26, 52, 87],
      unit_bea: [13, 22, 40, 59],
      unit_cat: [13, 25, 34, 65],
      unit_dee: [18, 56, 88],
      unit_eve: [],
    });
  });

  it('a standard woman reaches her first milestone between days 8 and 20', () => {
    for (const id of ['unit_ann', 'unit_bea']) {
      expect(sim.reached[id][0]).toBeGreaterThanOrEqual(8);
      expect(sim.reached[id][0]).toBeLessThanOrEqual(20);
    }
  });

  it('nobody reaches the fourth milestone with low aptitude', () => {
    for (const id of ['unit_dee', 'unit_eve']) expect(sim.reached[id].length).toBeLessThan(4);
    expect(mine(sim.s, 'unit_dee').hobbies![0].ceiling).toBe(true);
    expect(mine(sim.s, 'unit_dee').hobbies![0].skill).toBeLessThanOrEqual(milestoneAt(2, 'unit_dee', 'reading', 2)); // it never passed the third
    expect(mine(sim.s, 'unit_dee').hobbies![0].mastered).toBeUndefined();
  });

  it('at least one hobby cools in 120 days (the stressed woman\'s)', () => {
    expect(sim.log.cooling).toBeGreaterThanOrEqual(1);
    expect(mine(sim.s, 'unit_eve').hobbies!.some((h) => h.state === 'cooling' || h.state === 'dropped')).toBe(true);
  });

  it('no two women reach the same milestone of the same hobby on the same day', () => {
    const [cat, dee] = [sim.reached.unit_cat, sim.reached.unit_dee];
    dee.forEach((d, i) => expect(cat[i]).not.toBe(d));
  });

  it('never more than three hobbies are active, on any day', () => {
    expect(sim.log.mostActive).toBeLessThanOrEqual(3);
  });

  it('is the same every time (no rng, no hidden state)', () => {
    expect(simulate(2).reached).toEqual(sim.reached);
    const rng = structuredClone(sim.s.rng);
    expect(simulate(2).s.rng).toEqual(rng);
  });
});

describe('the day step runs the hobbies', () => {
  it('lifeDayStep practises, ticks and leaves life off alone', () => {
    const s = campaign(reg, 4);
    s.settings.lifeEvents = 'normal';
    s.life = newLife(5);
    s.world.clocks = [];
    mine(s, 'unit_ann').hobbies = [take('reading', { interest: 50, since: 1 })];
    for (let day = 1; day <= 14; day++) {
      s.day = day;
      lifeDayStep(s, ctxOf(s, reg));
    }
    const h = mine(s, 'unit_ann').hobbies![0];
    expect(h.skill).toBeGreaterThan(0);
    expect(h.lastPracticeDay).toBeDefined();
    expect(h.interest).not.toBe(50); // two weekly ticks happened (novelty), whatever else the days brought
    const off = structuredClone(s);
    off.settings.lifeEvents = 'off';
    const before = structuredClone(off);
    expect(hobbyPass(off, reg, 15)).toEqual([]);
    expect(off).toEqual(before);
  });
});

describe('a re-sync and the three active hobbies', () => {
  const resync = (s: CampaignState, patch: Record<string, unknown>) => run(s, reg, { type: 'squad/resync', payload: { unitId: 'unit_ann', patch } });
  const cardWorld = (hobbies: HobbyState[]): CampaignState => {
    const s = campaign(reg, 4);
    s.settings.lifeEvents = 'normal';
    s.life = newLife(5);
    mine(s, 'unit_ann').hobbies = hobbies;
    return s;
  };

  it('a woman with a cooling fourth hobby can be re-synced with the same four (only the active ones count)', () => {
    const s = cardWorld([take('reading'), take('chess'), take('cards'), take('plants', { state: 'cooling', coolingSince: 4, interest: 20 })]);
    const r = resync(s, { hobbies: ['reading', 'chess', 'cards', 'plants'] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.squad[0].hobbies!.map((h) => h.state)).toEqual(['active', 'active', 'active', 'cooling']);
    // four that would all be active is still refused
    expect(errors(resync(cardWorld([take('reading')]), { hobbies: ['reading', 'chess', 'cards', 'plants'] }).events)).toHaveLength(1);
  });

  it('adding several cools the excess once: from the older hobbies first, never a card hobby added in the same loop', () => {
    const s = cardWorld([take('reading', { interest: 55 }), take('chess', { interest: 52 }), take('cards', { interest: 90 })]);
    const r = resync(s, { hobbies: ['cards', 'plants', 'music'] });
    expect(errors(r.events)).toEqual([]);
    const states = Object.fromEntries(r.state.squad[0].hobbies!.map((h) => [h.id, h.state]));
    expect(states).toEqual({ reading: 'cooling', chess: 'cooling', cards: 'active', plants: 'active', music: 'active' });
    expect(ofType(r.events, 'hobby_cooling')).toHaveLength(2);
  });
});
