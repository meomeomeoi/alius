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

type Cast = Array<{ id: string; hobby: string; aptitude: 'standard' | 'high' | 'low'; stress: number }>;

/** Five women, one hobby each, fixed aptitudes and stress: nobody is ever busy, so every slot she stands in her hobby's room is practised. */
const CAST: Cast = [
  { id: 'unit_ann', hobby: 'cooking', aptitude: 'standard', stress: 0 },
  { id: 'unit_bea', hobby: 'chess', aptitude: 'standard', stress: 0 },
  { id: 'unit_cat', hobby: 'reading', aptitude: 'high', stress: 0 },
  { id: 'unit_dee', hobby: 'reading', aptitude: 'low', stress: 0 },
  { id: 'unit_eve', hobby: 'tinkering', aptitude: 'low', stress: 60 },
];
/** Two equal standard women who share the mess hall for their one hobby (nobody else: nobody to pass hobbies on to). */
const PAIR: Cast = [
  { id: 'unit_ann', hobby: 'cooking', aptitude: 'standard', stress: 0 },
  { id: 'unit_bea', hobby: 'cooking', aptitude: 'standard', stress: 0 },
];

function simulate(salt: number, cast: Cast = CAST, days = 120) {
  const s = campaign(reg, Math.max(cast.length, 2));
  s.settings.lifeEvents = 'normal';
  s.life = newLife(salt);
  s.world.clocks = [];
  for (const u of s.squad) {
    u.status = 'active';
    u.stress = 0;
    u.hobbies = [];
  }
  for (const c of cast) {
    const u = mine(s, c.id);
    u.stress = c.stress;
    u.hobbies = [take(c.hobby, { interest: 50 })];
    if (c.aptitude !== 'standard') u.aptitudes = { high: c.aptitude === 'high' ? [c.hobby] : [], low: c.aptitude === 'low' ? [c.hobby] : [] };
  }
  const reached: Record<string, number[]> = Object.fromEntries(cast.map((c) => [c.id, []]));
  const log = { cooling: 0, dropped: 0, started: 0, mostActive: 0 };
  for (let day = 1; day <= days; day++) {
    s.day = day;
    const before = Object.fromEntries(cast.map((c) => [c.id, mine(s, c.id).hobbies!.find((h) => h.id === c.hobby)!.milestones.length]));
    const events = hobbyPass(s, reg, day);
    log.cooling += ofType(events, 'hobby_cooling').length;
    log.dropped += ofType(events, 'hobby_dropped').length;
    log.started += ofType(events, 'hobby_started').length;
    for (const c of cast) {
      const h = mine(s, c.id).hobbies!.find((x) => x.id === c.hobby)!;
      if (h.milestones.length > before[c.id]) reached[c.id].push(day);
      log.mostActive = Math.max(log.mostActive, mine(s, c.id).hobbies!.filter((x) => x.state === 'active').length);
    }
  }
  return { s, reached, log };
}
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Infinity;
/** One standard woman alone with her hobby in the mess hall: nobody to share the room with, nobody to pass hobbies on to or to take her slots. */
const SOLO: Cast = [{ id: 'unit_ann', hobby: 'cooking', aptitude: 'standard', stress: 0 }];
const SALTS = Array.from({ length: 30 }, (_, i) => i + 1);

describe('120-day simulation: the squad (salt 2 pinned as a regression check)', () => {
  let sim: ReturnType<typeof simulate>;
  beforeAll(() => {
    sim = simulate(2);
  });

  it('the milestone days are pinned', () => {
    expect(sim.reached).toMatchInlineSnapshot(`
      {
        "unit_ann": [
          10,
          42,
          67,
          98,
        ],
        "unit_bea": [
          13,
          22,
          40,
          59,
        ],
        "unit_cat": [
          29,
          43,
          60,
          92,
        ],
        "unit_dee": [],
        "unit_eve": [],
      }
    `);
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

describe('the pace over 30 salts (Review Focus 4)', () => {
  let squad: Array<ReturnType<typeof simulate>>;
  let pairs: Array<ReturnType<typeof simulate>>;
  let solos: Array<ReturnType<typeof simulate>>;
  beforeAll(() => {
    squad = SALTS.map((salt) => simulate(salt));
    pairs = SALTS.map((salt) => simulate(salt, PAIR, 180));
    solos = SALTS.map((salt) => simulate(salt, SOLO, 120));
  });

  it('nobody with low aptitude ever reaches the fourth milestone, and a low hobby stops at its ceiling', () => {
    for (const sim of squad) {
      for (const id of ['unit_dee', 'unit_eve']) {
        expect(sim.reached[id].length, id).toBeLessThan(4);
        expect(mine(sim.s, id).hobbies![0].mastered).toBeUndefined();
      }
    }
    expect(squad.some((sim) => mine(sim.s, 'unit_dee').hobbies![0].ceiling === true)).toBe(true);
  });

  // Target (a): the median day of a standard woman's first milestone is within 8 and 20, measured on each group (a woman who never gets there counts as Infinity).
  const firstDays = (sims: Array<ReturnType<typeof simulate>>, ids: string[]): number[] => sims.flatMap((sim) => ids.map((id) => sim.reached[id][0] ?? Infinity));
  const within = (m: number): void => {
    expect(m).toBeGreaterThanOrEqual(8);
    expect(m).toBeLessThanOrEqual(20);
  };

  it('(a) the pair: the median first-milestone day of a standard woman who shares her room is within 8 and 20', () => {
    within(median(firstDays(pairs, ['unit_ann', 'unit_bea'])));
  });

  // KNOWN GAP: it flips to a plain `it` once the author tunes the pace (TUNING.life is AUTHOR TO TUNE; no value was changed).
  it.fails('(a) the squad: the median first-milestone day of a standard woman is within 8 and 20', () => {
    within(median(firstDays(squad, ['unit_ann', 'unit_bea'])));
  });

  // KNOWN GAP: it flips to a plain `it` once the author tunes the pace (TUNING.life is AUTHOR TO TUNE; no value was changed).
  it.fails('(a) alone: the median first-milestone day of a standard woman is within 8 and 20', () => {
    within(median(firstDays(solos, ['unit_ann'])));
  });

  it('(a) the measured medians and the standard women with no first milestone (a regression pin for the report)', () => {
    const squadDays = firstDays(squad, ['unit_ann', 'unit_bea']);
    expect({
      pairMedian: median(firstDays(pairs, ['unit_ann', 'unit_bea'])),
      squadMedian: median(squadDays),
      squadNever: squadDays.filter((d) => d === Infinity).length,
      squadWomen: squadDays.length,
      soloMedian: median(firstDays(solos, ['unit_ann'])),
      soloNever: firstDays(solos, ['unit_ann']).filter((d) => d === Infinity).length,
    }).toMatchInlineSnapshot(`
      {
        "pairMedian": 10,
        "soloMedian": 22,
        "soloNever": 0,
        "squadMedian": 21,
        "squadNever": 6,
        "squadWomen": 60,
      }
    `);
  });

  it('two equal standard women who share a room reach the same milestone on the same day in no salt', () => {
    const clashes = pairs.filter((sim) => sim.reached.unit_ann.some((d, i) => sim.reached.unit_bea[i] === d));
    expect(clashes).toHaveLength(0);
  });

  it('never more than three hobbies are active, on any day, in any salt', () => {
    for (const sim of [...squad, ...pairs]) expect(sim.log.mostActive).toBeLessThanOrEqual(3);
  });

  // KNOWN GAP (reported to the controller, no TUNING value was changed): the target is that at most 20 % of standard women reach the fourth
  // milestone within 120 days (the spec says mastery takes 4 to 6 months). Measured: see the pinned numbers below. `it.fails` flips to a
  // failure when the pace is tuned into the target, which is the moment to turn it into a plain `it`.
  it.fails('at most 20 % of standard women reach the fourth milestone within 120 days', () => {
    const standard = [...squad.flatMap((sim) => ['unit_ann', 'unit_bea'].map((id) => sim.reached[id])), ...pairs.flatMap((sim) => ['unit_ann', 'unit_bea'].map((id) => sim.reached[id].filter((d) => d <= 120)))];
    expect(standard.filter((r) => r.length >= 4).length / standard.length).toBeLessThanOrEqual(0.2);
  });

  it('the measured share (a regression pin for the report): standard women at the fourth milestone by day 120', () => {
    const share = (sims: Array<ReturnType<typeof simulate>>): number => {
      const all = sims.flatMap((sim) => ['unit_ann', 'unit_bea'].map((id) => sim.reached[id].filter((d) => d <= 120).length >= 4));
      return Math.round((100 * all.filter(Boolean).length) / all.length);
    };
    expect({ squad: share(squad), pair: share(pairs) }).toMatchInlineSnapshot(`
      {
        "pair": 100,
        "squad": 68,
      }
    `);
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
