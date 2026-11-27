import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import { dynamicDirectives } from '../../src/dynamic/directives';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import { bendBy, mannerMoodOf, mannerOf, MANNER_AXES, type MannerAxis } from '../../src/engine/dynamic/manner';
import type { LifeEventEntry } from '../../src/engine/life/types';
import { newLife } from '../../src/engine/life/state';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };

function world(over: { manner?: Partial<typeof ZERO> | null; volatility?: 'steady' | 'moody'; day?: number } = {}): CampaignState {
  const s = campaign(reg, 3);
  if (over.day !== undefined) s.day = over.day;
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      ...(over.manner === null ? {} : { manner: { ...ZERO, ...over.manner }, drawnBy: ['reaction'] as ['reaction'] }),
    },
  };
  unitOf(s, ANN).temperament = { talkativeness: 'terse', volatility: over.volatility ?? 'steady', humor: 'dry' };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 30 };
  return s;
}
/** The ids of the life events with this mood, read by field. */
const withMood = (m: string): string[] => [...reg.lifeEvents.values()].filter((e) => (e as unknown as LifeEventEntry).mood === m).map((e) => String(e.id));
const unmarked = (): string[] => [...reg.lifeEvents.values()].filter((e) => (e as unknown as LifeEventEntry).mood === undefined).map((e) => String(e.id));
function had(s: CampaignState, ...ids: string[]): void {
  s.life ??= newLife(1);
  s.life.units[ANN] = { last: Object.fromEntries(ids.map((id) => [id, s.day])) };
}
const mood = (s: CampaignState) => mannerMoodOf(s, reg, ANN, s.day);

describe('the content marks (spec §4)', () => {
  it('marks 17 good, 14 irritated and 13 low, and leaves seven rows unmarked', () => {
    expect([withMood('good').length, withMood('irritated').length, withMood('low').length, unmarked().length]).toEqual([17, 14, 13, 7]);
  });
});

describe('mannerMoodOf', () => {
  it('a steady woman with no event has no mood', () => {
    const s = world();
    expect(mood(s)).toEqual({});
    expect(mannerOf(s, reg, ANN)!.mood).toEqual({});
  });

  it('a good day: warmth +1, tempo -1', () => {
    const s = world();
    had(s, withMood('good')[0]);
    expect(mood(s)).toEqual({ warmth: 1, tempo: -1 });
  });
  it('an irritated day: warmth -1, intensity +1', () => {
    const s = world();
    had(s, withMood('irritated')[0]);
    expect(mood(s)).toEqual({ warmth: -1, intensity: 1 });
  });
  it('a low day: intensity -1, voice -1', () => {
    const s = world();
    had(s, withMood('low')[0]);
    expect(mood(s)).toEqual({ intensity: -1, voice: -1 });
  });
  it('an unmarked event, or an event of another day, moves nothing', () => {
    const s = world();
    had(s, unmarked()[0]);
    expect(mood(s)).toEqual({});
    s.life!.units[ANN]!.last[withMood('good')[0]] = s.day - 1;
    expect(mood(s)).toEqual({});
  });
  it('two moods add up', () => {
    const s = world();
    had(s, withMood('irritated')[0], withMood('low')[0]);
    expect(mood(s)).toEqual({ warmth: -1, voice: -1 });
    had(s, withMood('good')[0], withMood('good')[1]);
    expect(mood(s)).toEqual({ warmth: 2, tempo: -2 });
  });
  it('a failed run that day: warmth -1; another day or another outcome: nothing', () => {
    const s = world();
    s.lastExpedition = { day: s.day, outcome: 'failed' } as never;
    expect(mood(s)).toEqual({ warmth: -1 });
    s.lastExpedition = { day: s.day, outcome: 'success' } as never;
    expect(mood(s)).toEqual({});
    s.lastExpedition = { day: s.day - 1, outcome: 'failed' } as never;
    expect(mood(s)).toEqual({});
  });

  it('a moody woman: each of intensity, warmth, tempo is -1, 0 or +1, stable within a day and varying across days', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 40; day++) {
      const s = world({ volatility: 'moody', day });
      const m = mood(s);
      expect(mood(s)).toEqual(m);
      for (const [axis, v] of Object.entries(m)) {
        expect(['intensity', 'warmth', 'tempo']).toContain(axis);
        expect([-1, 1]).toContain(v);
      }
      seen.add(JSON.stringify(m));
    }
    expect(seen.size).toBeGreaterThan(3);
    // all three values turn up for each axis over the days
    for (const axis of ['intensity', 'warmth', 'tempo'] as MannerAxis[]) {
      const vs = new Set<number>();
      for (let day = 1; day <= 60; day++) vs.add(mood(world({ volatility: 'moody', day }))[axis] ?? 0);
      expect([...vs].sort()).toEqual([-1, 0, 1]);
    }
  });

  it('without a manner nothing: the mood is empty and mannerOf is null', () => {
    const s = world({ manner: null, volatility: 'moody' });
    had(s, withMood('irritated')[0]);
    s.lastExpedition = { day: s.day, outcome: 'failed' } as never;
    expect(mood(s)).toEqual({});
    expect(mannerOf(s, reg, ANN)).toBeNull();
  });

  it('draws nothing from the rng', () => {
    const s = world({ volatility: 'moody' });
    const before = JSON.stringify(s.rng);
    mood(s); mannerOf(s, reg, ANN);
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

describe('folded into mannerOf', () => {
  it('adds to the stored axes, never past ±2: manner +2 plus mood +1 reads +2', () => {
    const s = world({ manner: { intensity: 2, warmth: 2, tempo: -2 } });
    had(s, withMood('irritated')[0]); // warmth -1, intensity +1
    const m = mannerOf(s, reg, ANN)!;
    expect(m.axes.intensity).toBe(2);
    expect(m.axes.warmth).toBe(1);
    had(s, withMood('good')[0], withMood('good')[1]); // warmth +2, tempo -2
    const g = mannerOf(s, reg, ANN)!;
    expect(g.axes.warmth).toBe(2);
    expect(g.axes.tempo).toBe(-2);
    expect(g.mood).toEqual({ warmth: 2, tempo: -2 });
  });
  it('folds with the drift overlay and clamps the sum', () => {
    const s = world({ manner: { warmth: 1 } });
    unitOf(s, ANN).development = { practice: { manner: { warmth: 1 } } } as never;
    had(s, withMood('good')[0]);
    expect(mannerOf(s, reg, ANN)!.axes.warmth).toBe(2);
  });
  it('a bend moves with the day for a moody holder, and a steady holder with no event moves none', () => {
    const base = 1000;
    const readings = new Set<number>();
    for (let day = 1; day <= 30; day++) readings.add(bendBy(world({ volatility: 'moody', day }), reg, ANN, 'intensity', base, { scale: 0.15 }));
    expect(readings.size).toBeGreaterThan(1);
    for (let day = 1; day <= 30; day++) expect(bendBy(world({ day }), reg, ANN, 'intensity', base, { scale: 0.15 })).toBe(base);
    const s = world();
    had(s, withMood('irritated')[0]);
    expect(bendBy(s, reg, ANN, 'intensity', base, { scale: 0.15 })).toBe(1150);
  });
  it('every axis of the mood is a known axis', () => {
    const s = world({ volatility: 'moody' });
    had(s, withMood('irritated')[0], withMood('low')[0], withMood('good')[0]);
    for (const k of Object.keys(mood(s))) expect(MANNER_AXES as readonly string[]).toContain(k);
  });
});

describe('the directive clause', () => {
  function scene(s: CampaignState): CampaignState {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  }
  const line = (s: CampaignState): string => dynamicDirectives(s, reg, s.scene!.participants).find((d) => d.id === `dynamic:${ANN}`)!.text;

  it('appears only when an axis moved, in the words of the table', () => {
    const calm = scene(world());
    expect(line(calm)).not.toContain('Her state today');
    const s = world();
    had(s, withMood('irritated')[0]);
    const text = line(scene(s));
    expect(text).toContain('Her state today: she pushes hard; cool, little comfort.');
  });
  it('words a low day by intensity and voice', () => {
    const s = world();
    had(s, withMood('low')[0]);
    expect(line(scene(s))).toContain('Her state today: measured; few words.');
  });
  it('is never a number: the line carries no digit and no word "mood"', () => {
    const s = world({ volatility: 'moody' });
    had(s, withMood('irritated')[0], withMood('low')[0]);
    const text = line(scene(s));
    expect(text).toContain('Her state today');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/mood/i);
  });
  it('a holder without a manner gets no clause', () => {
    const s = world({ manner: null });
    had(s, withMood('irritated')[0]);
    expect(line(scene(s))).not.toContain('Her state today');
  });
});
