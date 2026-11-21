import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { whereabouts } from '../../../src/engine/hub';
import { applyLifeEvent, eventPool, lifeDayStep, noteBusy, pickLifeEvent, requiresHold, revealFact, shareChance, writeLifeFact } from '../../../src/engine/life';
import { busySlot, effectiveShare } from '../../../src/engine/life/events';
import { enqueue } from '../../../src/engine/life/news';
import { newLife } from '../../../src/engine/life/state';
import type { LifeEventEntry, LifeRequires } from '../../../src/engine/life/types';
import { herFacts } from '../../../src/engine/memory/inputs';
import type { CampaignState, Slot } from '../../../src/engine/state/types';
import { ContextBuilder, type ContextProvider } from '../../../src/llm/context';
import { registerMemoryContext } from '../../../src/scene/memoryContext';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let all: LifeEventEntry[];
beforeAll(async () => {
  reg = await loadCore();
  all = [...reg.lifeEvents.values()] as unknown as LifeEventEntry[];
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const DAY = 40;
const entry = (id: string): LifeEventEntry => reg.lifeEvents.get(id) as unknown as LifeEventEntry;

/** Four soldiers at the base with life on; every number is explicit, so nothing depends on how the campaign happens to start. */
function world(mode: 'rare' | 'normal' | 'often' | null = 'normal', day = DAY): CampaignState {
  const s = campaign(reg, 4);
  s.day = day;
  s.world.clocks = [];
  if (mode !== null) {
    s.settings.lifeEvents = mode;
    s.life = newLife(7);
  }
  return s;
}
const holds = (s: CampaignState, req: LifeRequires, unitId = ANN, day = s.day): boolean => requiresHold(s, reg, unitId, req, day);
const step = (s: CampaignState) => lifeDayStep(s, ctxOf(s, reg));
const free = (): LifeEventEntry[] => all.filter((e) => e.requires === undefined);

describe('lifeDayStep with life off', () => {
  it('does nothing and writes nothing', () => {
    const s = world(null);
    const before = structuredClone(s);
    expect(step(s)).toEqual([]);
    expect(s).toEqual(before);
    expect(s.life).toBeUndefined();
    const off = world('normal');
    off.settings.lifeEvents = 'off';
    const kept = structuredClone(off);
    expect(step(off)).toEqual([]);
    expect(off).toEqual(kept);
    noteBusy(s, [ANN], 'talk'); // the bookkeeping is off too
    expect(s.life).toBeUndefined();
  });
});

describe('requires: every field of the closed vocabulary, true and false', () => {
  it('hobby', () => {
    const s = world();
    s.squad[0].hobbies = [{ id: 'reading', skill: 0, interest: 50, state: 'active', since: 1, milestones: [] }];
    expect(holds(s, { hobby: 'reading' })).toBe(true);
    expect(holds(s, { hobby: 'any' })).toBe(true);
    expect(holds(s, { hobby: 'chess' })).toBe(false);
    expect(holds(s, { hobby: 'any' }, BEA)).toBe(false);
    s.squad[0].hobbies[0].state = 'cooling';
    expect(holds(s, { hobby: 'reading' })).toBe(false);
    expect(holds(s, { hobby: 'any' })).toBe(false);
  });

  it('location', () => {
    const s = world();
    const mine = new Set<string>();
    for (const slot of ['morning', 'afternoon', 'evening'] as Slot[]) {
      const roomId = whereabouts({ ...s, slot }, reg).find((x) => x.unitId === ANN)!.roomId;
      if (roomId) mine.add(String(reg.hubRooms.get(roomId)!.sceneLocationId));
    }
    const elsewhere = [...new Set([...reg.hubRooms.values()].map((r) => String(r.sceneLocationId)))].filter((l) => !mine.has(l));
    expect(mine.size).toBeGreaterThan(0);
    expect(holds(s, { location: [...mine] })).toBe(true);
    expect(holds(s, { location: elsewhere })).toBe(false);
    s.squad[0].status = 'injured'; // no longer routine anywhere
    expect(holds(s, { location: [...mine, ...elsewhere] })).toBe(false);
  });

  it('activity', () => {
    const s = world();
    s.life!.busy.push({ unitId: ANN, slot: busySlot(DAY, 'morning'), activityId: 'talk' }, { unitId: BEA, slot: busySlot(DAY - 1, 'evening'), activityId: 'train' });
    expect(holds(s, { activity: ['talk', 'rest'] })).toBe(true);
    expect(holds(s, { activity: ['train'] })).toBe(false);
    expect(holds(s, { activity: ['train'] }, BEA)).toBe(false); // yesterday's is not today's
    expect(holds(s, { activity: ['talk'] }, BEA)).toBe(false);
  });

  it('afterRun', () => {
    const s = world();
    const last = { day: DAY - 1, party: [ANN, BEA], injuries: [BEA] } as unknown as NonNullable<CampaignState['lastExpedition']>;
    s.lastExpedition = last;
    expect(holds(s, { afterRun: {} })).toBe(true);
    expect(holds(s, { afterRun: { hurt: true } })).toBe(false);
    expect(holds(s, { afterRun: { hurt: true } }, BEA)).toBe(true);
    expect(holds(s, { afterRun: {} }, CAT)).toBe(false);
    last.day = DAY - 2;
    expect(holds(s, { afterRun: {} })).toBe(false);
  });

  it('noRunDays', () => {
    const s = world();
    expect(holds(s, { noRunDays: 10 })).toBe(true);
    const last = { day: DAY - 5, party: [ANN] } as unknown as NonNullable<CampaignState['lastExpedition']>;
    s.lastExpedition = last;
    expect(holds(s, { noRunDays: 10 })).toBe(false);
    expect(holds(s, { noRunDays: 5 })).toBe(true);
    expect(holds(s, { noRunDays: 10 }, BEA)).toBe(true);
    last.day = DAY - 20;
    expect(holds(s, { noRunDays: 10 })).toBe(true);
  });

  it('stressMin and stressMax (both inclusive)', () => {
    const s = world();
    s.squad[0].stress = 40;
    expect(holds(s, { stressMin: 40 })).toBe(true);
    expect(holds(s, { stressMin: 41 })).toBe(false);
    expect(holds(s, { stressMax: 40 })).toBe(true);
    expect(holds(s, { stressMax: 39 })).toBe(false);
  });

  it('defectCategory', () => {
    const s = world();
    const category = String(reg.defects.get(s.squad[0].defects[0].id)!.category);
    expect(holds(s, { defectCategory: category })).toBe(true);
    expect(holds(s, { defectCategory: `not_${category}` })).toBe(false);
  });

  it('injured', () => {
    const s = world();
    expect(holds(s, { injured: true })).toBe(false);
    s.squad[0].injuries = ['broken_arm' as never];
    expect(holds(s, { injured: true })).toBe(true);
  });

  it('otherNamed', () => {
    const s = world();
    expect(holds(s, { otherNamed: true })).toBe(true);
    for (const u of s.squad.slice(1)) u.status = 'dead';
    expect(holds(s, { otherNamed: true })).toBe(false);
    for (const u of s.squad.slice(1)) u.status = 'active';
    s.expedition = { party: s.squad.slice(1).map((u) => u.id) } as never; // out on a run: not at the base
    expect(holds(s, { otherNamed: true })).toBe(false);
  });

  it('affinityMin and trustMin', () => {
    const s = world();
    s.relations[ANN].affinity = 30;
    s.relations[ANN].trust = 55;
    expect(holds(s, { affinityMin: 30 })).toBe(true);
    expect(holds(s, { affinityMin: 31 })).toBe(false);
    expect(holds(s, { trustMin: 55 })).toBe(true);
    expect(holds(s, { trustMin: 56 })).toBe(false);
  });

  it('romantic reads the bond tier of her relationship state', () => {
    const s = world();
    expect(holds(s, { romantic: true })).toBe(false);
    s.relations[ANN].stateId = String([...reg.relationshipStates.values()].find((x) => x.bondTier === 'romantic')!.id);
    expect(holds(s, { romantic: true })).toBe(true);
    s.relations[ANN].stateId = String([...reg.relationshipStates.values()].find((x) => x.bondTier === 'close')!.id);
    expect(holds(s, { romantic: true })).toBe(false);
  });

  it('leaderNotHer', () => {
    const s = world();
    expect(holds(s, { leaderNotHer: true })).toBe(false); // no leader
    s.power = { votes: { log: [], seq: 0 }, hierarchy: { leaderId: BEA } } as never;
    expect(holds(s, { leaderNotHer: true })).toBe(true);
    expect(holds(s, { leaderNotHer: true }, BEA)).toBe(false);
  });

  it('gruntDiedDays', () => {
    const s = world();
    expect(holds(s, { gruntDiedDays: 7 })).toBe(false);
    s.life!.deaths.push({ unitId: 'g1', day: DAY - 3, grunt: true }, { unitId: 'n1', day: DAY - 1, grunt: false });
    expect(holds(s, { gruntDiedDays: 7 })).toBe(true);
    expect(holds(s, { gruntDiedDays: 2 })).toBe(false);
  });

  it('deathAgo fires on the anniversaries only', () => {
    const s = world();
    s.life!.deaths.push({ unitId: 'g1', day: DAY - 30, grunt: true });
    expect(holds(s, { deathAgo: 30 })).toBe(true);
    s.day = DAY + 1;
    expect(holds(s, { deathAgo: 30 })).toBe(false);
    s.day = DAY + 30;
    expect(holds(s, { deathAgo: 30 })).toBe(true); // two months
    s.life!.deaths = [{ unitId: 'g2', day: DAY - 10, grunt: false }];
    s.day = DAY;
    expect(holds(s, { deathAgo: 30 })).toBe(false); // too recent
  });

  it('rumour', () => {
    const s = world();
    expect(holds(s, { rumour: true })).toBe(false);
    s.rumors.push({ id: 'r1' } as never);
    expect(holds(s, { rumour: true })).toBe(true);
  });

  it('rationsShort: a policy that is not equal, or a shortage in the last 3 days', () => {
    const s = world();
    expect(holds(s, { rationsShort: true })).toBe(false);
    s.base.rations = 'fighters_first';
    expect(holds(s, { rationsShort: true })).toBe(true);
    s.base.rations = 'equal';
    s.life!.shortageDay = DAY - 3;
    expect(holds(s, { rationsShort: true })).toBe(true);
    s.life!.shortageDay = DAY - 4;
    expect(holds(s, { rationsShort: true })).toBe(false);
  });

  it('sparring reads her wagers of the last 2 days by game kind and winner', () => {
    const s = world();
    const sparring = [...reg.wagerGames.values()].find((g) => g.kind === 'sparring')!.id as string;
    const coin = [...reg.wagerGames.values()].find((g) => g.kind === 'coin')!.id as string;
    s.personal = { seq: 0, wagers: { open: [], log: [{ id: 'w1', unitId: ANN, gameId: sparring, stakeId: 'x', day: DAY - 1, winner: 'unit' }, { id: 'w2', unitId: BEA, gameId: coin, stakeId: 'x', day: DAY, winner: 'unit' }] } };
    expect(holds(s, { sparring: 'won' })).toBe(true);
    expect(holds(s, { sparring: 'lost' })).toBe(false);
    expect(holds(s, { sparring: 'won' }, BEA)).toBe(false); // a coin toss is not sparring
    s.personal.wagers!.log[0].day = DAY - 3;
    expect(holds(s, { sparring: 'won' })).toBe(false);
    s.personal.wagers!.log[0] = { ...s.personal.wagers!.log[0], day: DAY, winner: 'commander' };
    expect(holds(s, { sparring: 'lost' })).toBe(true);
  });

  it('bloomHalf', () => {
    const s = world();
    expect(holds(s, { bloomHalf: true })).toBe(false);
    s.world.clocks.push({ id: 'c', label: 'c', segments: 6, filled: 2, regionId: 'reg', visibleToPlayer: true });
    expect(holds(s, { bloomHalf: true })).toBe(false);
    s.world.clocks[0].filled = 3;
    expect(holds(s, { bloomHalf: true })).toBe(true);
    delete s.world.clocks[0].regionId; // a clock of no region is not the Bloom
    expect(holds(s, { bloomHalf: true })).toBe(false);
  });

  it('missionBoard', () => {
    const s = world();
    s.missions.offered = [];
    expect(holds(s, { missionBoard: true })).toBe(false);
    s.missions.offered.push({ id: 'm1' } as never);
    expect(holds(s, { missionBoard: true })).toBe(true);
  });

  it('afterEvent (hers, within 30 days)', () => {
    const s = world();
    s.life!.units[ANN] = { last: { nightmare: DAY - 30 } };
    expect(holds(s, { afterEvent: 'nightmare' })).toBe(true);
    s.life!.units[ANN].last.nightmare = DAY - 31;
    expect(holds(s, { afterEvent: 'nightmare' })).toBe(false);
    s.life!.units[BEA] = { last: { nightmare: DAY - 1 } };
    expect(holds(s, { afterEvent: 'nightmare' })).toBe(false); // somebody else's does not count
  });

  it('otherHadThisWeek (another woman, within 7 days)', () => {
    const s = world();
    s.life!.units[ANN] = { last: { nightmare: DAY - 1 } };
    expect(holds(s, { otherHadThisWeek: 'nightmare' })).toBe(false); // her own does not count
    s.life!.units[BEA] = { last: { nightmare: DAY - 7 } };
    expect(holds(s, { otherHadThisWeek: 'nightmare' })).toBe(true);
    s.life!.units[BEA].last.nightmare = DAY - 8;
    expect(holds(s, { otherHadThisWeek: 'nightmare' })).toBe(false);
  });

  it('every field must hold, an empty block always holds, and an unknown field never does', () => {
    const s = world();
    s.squad[0].stress = 50;
    expect(holds(s, {})).toBe(true);
    expect(holds(s, { stressMin: 40, stressMax: 60 })).toBe(true);
    expect(holds(s, { stressMin: 40, stressMax: 45 })).toBe(false);
    expect(requiresHold(s, reg, ANN, undefined, DAY)).toBe(true);
    expect(holds(s, { weather: 'rain' } as never)).toBe(false);
    expect(requiresHold(s, reg, 'nobody', {}, DAY)).toBe(false);
  });

  it('every field the registry uses is one the function knows', () => {
    const s = world();
    const used = new Set(all.flatMap((e) => Object.keys(e.requires ?? {})));
    for (const f of used) expect(() => holds(s, { [f]: f === 'hobby' ? 'any' : f === 'sparring' ? 'won' : f === 'afterRun' ? {} : ['x'] } as never), f).not.toThrow();
  });
});

describe('the weekly caps and the day', () => {
  /** Runs `days` day steps and returns the life events as `{ unitId, day, size }`. */
  function simulate(mode: 'rare' | 'normal' | 'often', days: number) {
    const s = world(mode, 1);
    const out: Array<{ unitId: string; day: number; size: string; eventId: string }> = [];
    for (let d = 1; d <= days; d++) {
      s.day = d;
      for (const e of ofType(step(s), 'life_event')) out.push({ unitId: String(e.unitId), day: d, size: String(e.size), eventId: String(e.eventId) });
    }
    return out;
  }
  /** The caps do not bind a yearly event (it is her day), so those are left out of the counts. */
  const perWeek = (ev: ReturnType<typeof simulate>, filter: (e: (typeof ev)[number]) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const e of ev.filter((x) => filter(x) && entry(x.eventId).yearly !== true)) m.set(`${e.unitId}|${Math.floor(e.day / 7)}`, (m.get(`${e.unitId}|${Math.floor(e.day / 7)}`) ?? 0) + 1);
    return [...m.values()];
  };

  it('normal: each woman at most one a week and one notable a week, one a day', () => {
    const ev = simulate('normal', 28);
    expect(ev.length).toBeGreaterThanOrEqual(8); // not vacuous: the allowance is usually used
    expect(Math.max(...perWeek(ev))).toBe(1);
    expect(Math.max(...perWeek(ev, (e) => e.size === 'notable'), 0)).toBeLessThanOrEqual(1);
    expect(new Set(ev.map((e) => `${e.unitId}|${e.day}`)).size).toBe(ev.length);
  });

  it('often: at most two a week, one notable, and some woman gets two', () => {
    const ev = simulate('often', 28);
    expect(Math.max(...perWeek(ev))).toBe(2);
    expect(Math.max(...perWeek(ev, (e) => e.size === 'notable'), 0)).toBeLessThanOrEqual(1);
    expect(ev.length).toBeGreaterThan(simulate('normal', 28).length);
  });

  it('rare: at most one every two weeks for each woman', () => {
    const ev = simulate('rare', 56);
    expect(ev.length).toBeGreaterThanOrEqual(3);
    for (const id of [ANN, BEA, CAT, DEE]) {
      for (let w = 0; w < 8; w++) {
        const n = ev.filter((e) => e.unitId === id && [w, w + 1].includes(Math.floor(e.day / 7))).length;
        expect(n, `${id} weeks ${w}-${w + 1}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a woman away on a run, a grunt and a dead soldier have no events', () => {
    const s = world('often', 1);
    s.expedition = { party: [ANN] } as never;
    s.squad[1].status = 'dead';
    s.squad[2].kind = 'grunt';
    for (let d = 1; d <= 28; d++) {
      s.day = d;
      for (const e of ofType(step(s), 'life_event')) expect(e.unitId).toBe(DEE);
    }
    expect(pickLifeEvent(s, reg, ANN, 5)).toBeNull();
    expect(eventPool(s, reg, BEA, 5)).toEqual([]);
  });
});

describe('cooldowns', () => {
  it('no kind twice for one woman within 21 days (45 for a notable), none for two women within 5 days', () => {
    const s = world('often', 1);
    const seen: Array<{ unitId: string; eventId: string; day: number; size: string }> = [];
    for (let d = 1; d <= 140; d++) {
      s.day = d;
      for (const e of ofType(step(s), 'life_event')) seen.push({ unitId: String(e.unitId), eventId: String(e.eventId), day: d, size: String(e.size) });
    }
    expect(seen.length).toBeGreaterThan(40);
    for (const a of seen) {
      for (const b of seen) {
        if (a === b || a.eventId !== b.eventId || b.day < a.day) continue;
        const gap = b.day - a.day;
        if (a.unitId === b.unitId) expect(gap, `${a.unitId} ${a.eventId}`).toBeGreaterThanOrEqual(entry(a.eventId).cooldownDays ?? (a.size === 'notable' ? 45 : 21));
        else expect(gap, `${a.eventId}: ${a.unitId} then ${b.unitId}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('eventPool drops a kind for its cooldown and returns it after', () => {
    const s = world();
    const e = free().find((x) => x.size === 'small' && x.cooldownDays === undefined)!;
    const poolIds = (day: number) => eventPool(s, reg, ANN, day).map((x) => x.id);
    expect(poolIds(DAY)).toContain(e.id);
    applyLifeEvent(s, reg, ANN, e, DAY);
    expect(poolIds(DAY + 1)).not.toContain(e.id);
    expect(poolIds(DAY + 20)).not.toContain(e.id);
    expect(poolIds(DAY + 21)).toContain(e.id);
    expect(eventPool(s, reg, BEA, DAY + 2)).not.toContain(e); // the squad-wide gap is 5 days
    expect(eventPool(s, reg, BEA, DAY + 2).map((x) => x.id)).not.toContain(e.id);
    expect(eventPool(s, reg, BEA, DAY + 5).map((x) => x.id)).toContain(e.id);
  });

  it('a notable is out of the pool once she has had one this week', () => {
    const s = world();
    const notable = free().find((x) => x.size === 'notable');
    const other = all.find((x) => x.size === 'notable' && x !== notable && x.requires === undefined);
    const day = 7 * 6;
    if (!notable || !other) return; // the pack has two unrequired notables, or this test says nothing
    applyLifeEvent(s, reg, ANN, notable, day);
    expect(eventPool(s, reg, ANN, day + 1).some((x) => x.size === 'notable')).toBe(false);
    expect(eventPool(s, reg, ANN, day + 7).some((x) => x.size === 'notable')).toBe(true);
  });

  it('a yearly event happens once in 360 days, on its own day', () => {
    const s = world('often', 1);
    const seen: Array<{ unitId: string; day: number }> = [];
    for (let d = 1; d <= 760; d++) {
      s.day = d;
      for (const e of ofType(step(s), 'life_event')) if (entry(String(e.eventId)).yearly === true) seen.push({ unitId: String(e.unitId), day: d });
    }
    expect(seen.length).toBeGreaterThanOrEqual(4);
    for (const id of [ANN, BEA, CAT, DEE]) {
      const mine = seen.filter((x) => x.unitId === id).map((x) => x.day);
      mine.forEach((d, i) => { if (i > 0) expect(d - mine[i - 1]).toBeGreaterThanOrEqual(360); });
      expect(new Set(mine.map((d) => d % 360)).size).toBeLessThanOrEqual(1); // always the same day of her year
    }
  });
});

describe('the fact', () => {
  const small = (): LifeEventEntry => free().find((e) => e.share === 'anyone' && e.size === 'small')!;

  it('is about her, known to her alone, hidden from the commander and untold', () => {
    const s = world();
    const e = small();
    const events = applyLifeEvent(s, reg, ANN, e, DAY);
    expect(ofType(events, 'life_event')).toEqual([{ type: 'life_event', unitId: ANN, eventId: e.id, size: e.size }]);
    const fact = s.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ about: [ANN], knownBy: [ANN], hiddenFromCommander: true, day: DAY });
    expect(fact.tags).toEqual(expect.arrayContaining(['life', 'untold', e.id]));
    expect(fact.text.startsWith('Ann: ')).toBe(true);
    expect(fact.text).not.toContain('AUTHOR TO WRITE');
    expect(fact.importance).toBe(1);
  });

  it('is not retrieved into the scene facts block (nor a DM) until it is revealed', () => {
    const s = world();
    const e = small();
    applyLifeEvent(s, reg, ANN, e, DAY);
    const fact = s.memory.facts.at(-1)!;
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const providers = new Map<string, ContextProvider>();
    registerMemoryContext({ register: (p: ContextProvider) => providers.set(p.id, p) } as unknown as ContextBuilder, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    const render = (st: CampaignState): string => providers.get('facts')!.render(st, 2000) ?? '';
    expect(render(started.state)).not.toContain(fact.text);
    expect(render(started.state)).not.toContain('Ann knows');
    expect(herFacts(started.state, ANN, [])).toEqual([]);
    const draft = structuredClone(started.state);
    expect(revealFact(draft, fact.id)).toBe(true);
    expect(draft.memory.facts.find((f) => f.id === fact.id)).toMatchObject({ tags: expect.not.arrayContaining(['untold']) });
    expect(draft.memory.facts.find((f) => f.id === fact.id)!.hiddenFromCommander).toBeUndefined();
    expect(render(draft)).toContain(`- ${fact.text}`);
    expect(herFacts(draft, ANN, []).map((f) => f.id)).toContain(fact.id);
    expect(revealFact(draft, fact.id)).toBe(false); // already told
    expect(revealFact(draft, 'f999')).toBe(false);
  });

  it('writeLifeFact is the one writer: the tags, the audience and the importance', () => {
    const s = world();
    const f = writeLifeFact(s, CAT, 'Cat: a thing.', ['x'], 2);
    expect(f).toMatchObject({ about: [CAT], knownBy: [CAT], hiddenFromCommander: true, importance: 2, tags: ['life', 'untold', 'x'] });
  });
});

describe('what she shares', () => {
  it('keeps never enters the queue and has no hub line', () => {
    const s = world();
    const keeps = all.filter((e) => e.share === 'keeps');
    expect(keeps.length).toBeGreaterThan(0);
    for (const e of keeps) {
      for (let d = 0; d < 60; d++) applyLifeEvent(s, reg, ANN, e, DAY + d * 50);
    }
    expect(s.life!.queue).toEqual([]);
    expect(s.life!.units[ANN].hub).toBeUndefined();
    expect(shareChance(s, reg, ANN, keeps[0])).toBe(0);
  });

  it('keepsUnless lifts a keeps event when ANY condition holds: Affinity 60, or a romance', () => {
    const e = entry('dreamt_of_commander');
    expect(e.share).toBe('keeps');
    const s = world();
    s.relations[ANN].affinity = 59;
    expect(effectiveShare(s, reg, ANN, e)).toBe('keeps');
    s.relations[ANN].affinity = 60;
    expect(effectiveShare(s, reg, ANN, e)).toBe('close');
    const romance = world();
    romance.relations[ANN].affinity = 0;
    romance.relations[ANN].stateId = String([...reg.relationshipStates.values()].find((x) => x.bondTier === 'romantic')!.id);
    expect(effectiveShare(romance, reg, ANN, e)).toBe('close'); // the other condition alone is enough
    // lifted, it has a hub line and can be told
    applyLifeEvent(s, reg, ANN, e, DAY);
    expect(s.life!.units[ANN].hub).toEqual({ eventId: e.id, day: DAY });
    expect(shareChance(s, reg, ANN, e)).toBeGreaterThan(0);
  });

  it('close needs Affinity 40 and halves the chance of anyone below it', () => {
    const s = world();
    const close = all.find((e) => e.share === 'close')!;
    const anyone = all.find((e) => e.share === 'anyone')!;
    s.relations[ANN].affinity = 39;
    expect(shareChance(s, reg, ANN, close)).toBe(0);
    expect(shareChance(s, reg, ANN, anyone)).toBeCloseTo(0.4 * 0.5);
    s.relations[ANN].affinity = 40;
    expect(shareChance(s, reg, ANN, close)).toBeCloseTo(0.4);
    expect(shareChance(s, reg, ANN, anyone)).toBeCloseTo(0.4);
  });

  it('by temperament: over 200 hashed days talkative shares more than terse than silent', () => {
    const e = all.find((x) => x.share === 'anyone')!;
    const count = (talkativeness: 'talkative' | 'terse' | 'silent'): number => {
      const s = world();
      s.relations[ANN].affinity = 40;
      s.squad[0].temperament = { talkativeness, volatility: 'steady', humor: 'dry' };
      let n = 0;
      for (let d = 1; d <= 200; d++) {
        s.life!.units = {};
        s.life!.queue = [];
        s.life!.kinds = [];
        n += ofType(applyLifeEvent(s, reg, ANN, e, d), 'life_shared').length;
      }
      return n;
    };
    const [talkative, terse, silent] = [count('talkative'), count('terse'), count('silent')];
    expect(talkative).toBeGreaterThan(terse);
    expect(terse).toBeGreaterThan(silent);
    expect(silent).toBeGreaterThan(0);
    expect(talkative / 200).toBeGreaterThan(0.55);
    expect(talkative / 200).toBeLessThan(0.85);
  });

  it('a share queues the item (urgent and notable flags from the entry) and says so', () => {
    const s = world();
    s.squad[0].temperament = { talkativeness: 'talkative', volatility: 'steady', humor: 'dry' };
    s.relations[ANN].affinity = 50;
    const e = entry('grunt_lost');
    let events: ReturnType<typeof applyLifeEvent> = [];
    for (let d = 100; d < 130 && ofType(events, 'life_shared').length === 0; d++) {
      s.life!.units = {};
      events = applyLifeEvent(s, reg, ANN, e, d);
    }
    expect(ofType(events, 'life_shared')).toEqual([{ type: 'life_shared', unitId: ANN, eventId: 'grunt_lost' }]);
    expect(ofType(events, 'news_queued')).toHaveLength(1);
    expect(s.life!.queue.at(-1)).toMatchObject({ unitId: ANN, kind: 'event', ref: 'grunt_lost', what: 'event', category: 'service', notable: true, urgent: true, factId: s.memory.facts.at(-1)!.id });
    expect(s.life!.queue.at(-1)!.id).toMatch(/^ln\d+$/);
  });
});

describe('enqueue', () => {
  it('numbers the items ln0, ln1 and appends them', () => {
    const s = world();
    const item = { unitId: ANN, kind: 'hobby' as const, ref: 'reading', what: 'milestone' as const, category: 'hobby', day: DAY };
    const first = enqueue(s, item);
    const second = enqueue(s, { ...item, unitId: BEA });
    expect(first).toEqual([{ type: 'news_queued', itemId: 'ln0', unitId: ANN }]);
    expect(second[0]).toMatchObject({ itemId: 'ln1' });
    expect(s.life!.queue.map((q) => q.id)).toEqual(['ln0', 'ln1']);
  });
});

describe('what an event becomes', () => {
  it('starts a hobby she lacks at skill 0 and interest 50, and says so', () => {
    const s = world();
    const e = entry('found_something');
    const events = applyLifeEvent(s, reg, ANN, e, DAY);
    expect(ofType(events, 'hobby_started')).toEqual([{ type: 'hobby_started', unitId: ANN, hobbyId: 'collecting' }]);
    expect(s.squad[0].hobbies).toEqual([{ id: 'collecting', skill: 0, interest: 50, state: 'active', since: DAY, milestones: [] }]);
  });

  it('pushes a hobby she has (interest +8, capped at 100) and starts nothing', () => {
    const s = world();
    s.squad[0].hobbies = [{ id: 'collecting', skill: 20, interest: 70, state: 'active', since: 1, milestones: [] }];
    const events = applyLifeEvent(s, reg, ANN, entry('found_something'), DAY);
    expect(ofType(events, 'hobby_started')).toEqual([]);
    expect(s.squad[0].hobbies).toHaveLength(1);
    expect(s.squad[0].hobbies![0]).toMatchObject({ skill: 20, interest: 78 });
    s.squad[0].hobbies![0].interest = 97;
    applyLifeEvent(s, reg, ANN, entry('found_something'), DAY + 60);
    expect(s.squad[0].hobbies![0].interest).toBe(100);
  });

  it('a fourth active hobby puts the one she cares least about to cooling', () => {
    const s = world();
    s.squad[0].hobbies = [
      { id: 'reading', skill: 0, interest: 80, state: 'active', since: 1, milestones: [] },
      { id: 'chess', skill: 0, interest: 30, state: 'active', since: 1, milestones: [] },
      { id: 'cooking', skill: 0, interest: 55, state: 'active', since: 1, milestones: [] },
    ];
    const events = applyLifeEvent(s, reg, ANN, entry('found_something'), DAY);
    expect(ofType(events, 'hobby_cooling')).toEqual([{ type: 'hobby_cooling', unitId: ANN, hobbyId: 'chess' }]);
    const h = s.squad[0].hobbies!;
    expect(h.filter((x) => x.state === 'active')).toHaveLength(3);
    expect(h.find((x) => x.id === 'chess')).toMatchObject({ state: 'cooling', coolingSince: DAY });
    expect(h.find((x) => x.id === 'collecting')!.state).toBe('active');
  });

  it('opens a topic for the opinion call, once, and not when she already has a view', () => {
    const s = world();
    const e = entry('things_touched'); // becomes the topic trust
    applyLifeEvent(s, reg, ANN, e, DAY);
    expect(s.life!.units[ANN].pendingTopics).toEqual(['trust']);
    applyLifeEvent(s, reg, ANN, e, DAY + 60);
    expect(s.life!.units[ANN].pendingTopics).toEqual(['trust']);
    const t = reg.opinionTopics.get('trust') as unknown as { positions: Array<{ id: string }> };
    s.squad[1].opinions = { trust: { position: t.positions[0].id, strength: 'held', formedDay: 1 } };
    applyLifeEvent(s, reg, BEA, e, DAY + 70);
    expect(s.life!.units[BEA].pendingTopics).toBeUndefined();
  });

  it('a hub line is her latest sharable event', () => {
    const s = world();
    applyLifeEvent(s, reg, ANN, entry('broke_favourite_thing'), DAY);
    expect(s.life!.units[ANN].hub).toEqual({ eventId: 'broke_favourite_thing', day: DAY });
  });
});

describe('the bookkeeping', () => {
  it('deaths are recorded once, with the kind of the soldier', () => {
    const s = world();
    s.squad[3].kind = 'grunt';
    s.squad[3].status = 'dead';
    s.squad[2].status = 'dead';
    step(s);
    step(s);
    s.day = DAY + 3;
    step(s);
    expect(s.life!.deaths).toEqual([{ unitId: CAT, day: DAY, grunt: false }, { unitId: DEE, day: DAY, grunt: true }]);
  });

  it('a shortage at the day end is noted (today, from the upkeep that just ran)', () => {
    const s = world();
    s.calendar.shortageStreak = 1;
    step(s);
    expect(s.life!.shortageDay).toBe(DAY);
    s.calendar.shortageStreak = 0;
    s.day = DAY + 1;
    step(s);
    expect(s.life!.shortageDay).toBe(DAY);
  });

  it('busy: noteBusy keeps today and yesterday, once per unit and slot', () => {
    const s = world();
    noteBusy(s, [ANN, BEA], 'talk');
    noteBusy(s, [ANN], 'talk');
    expect(s.life!.busy).toEqual([{ unitId: ANN, slot: busySlot(DAY, 'morning'), activityId: 'talk' }, { unitId: BEA, slot: busySlot(DAY, 'morning'), activityId: 'talk' }]);
    s.day = DAY + 1;
    noteBusy(s, [CAT]);
    expect(s.life!.busy).toHaveLength(3);
    s.day = DAY + 2;
    noteBusy(s, [DEE]);
    expect(s.life!.busy.map((b) => b.unitId)).toEqual([CAT, DEE]);
  });

  it('the activity hook notes the companion, and the roster of a roster activity; scene/start notes its participants', () => {
    const s = world();
    s.resources.supplies = 99;
    const talk = run(s, reg, { type: 'activity/do', payload: { activityId: 'train', companionId: ANN } });
    expect(errors(talk.events)).toEqual([]);
    expect(talk.state.life!.busy).toEqual([{ unitId: ANN, slot: busySlot(s.day, 'morning'), activityId: 'train' }]);
    const rest = run(talk.state, reg, { type: 'activity/do', payload: { activityId: 'rest' } });
    expect(errors(rest.events)).toEqual([]);
    const afternoon = rest.state.life!.busy.filter((b) => b.slot === busySlot(s.day, 'afternoon'));
    expect(afternoon.map((b) => b.unitId).sort()).toEqual(rest.state.roster.activeIds.slice().sort());
    expect(afternoon.every((b) => b.activityId === 'rest')).toBe(true);
    const scene = run(rest.state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA, CAT], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(scene.events)).toEqual([]);
    const evening = scene.state.life!.busy.filter((b) => b.slot === busySlot(s.day, 'evening'));
    expect(evening.map((b) => b.unitId)).toEqual([BEA, CAT]);
    // with life off the same steps write nothing
    const off = world(null);
    const done = run(run(off, reg, { type: 'activity/do', payload: { activityId: 'train', companionId: ANN } }).state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(done.state.life).toBeUndefined();
  });
});

describe('through the day end, and no rng draw', () => {
  it('the day step runs at the day end (the hook is registered) and leaves the rng where a campaign without life leaves it', () => {
    let on = world('often', 1);
    let off = world(null, 1);
    on.rng = off.rng = structuredClone(on.rng);
    const events: string[] = [];
    for (let i = 0; i < 30; i++) {
      const r = run(on, reg, { type: 'calendar/consume_slot', payload: {} });
      on = r.state;
      events.push(...r.events.map((e) => e.type));
    }
    for (let i = 0; i < 30; i++) off = run(off, reg, { type: 'calendar/consume_slot', payload: {} }).state;
    expect(events).toContain('life_event');
    expect(on.day).toBe(off.day);
    expect(on.rng).toEqual(off.rng);
    expect(off.life).toBeUndefined();
  });

  it('lifeDayStep alone draws nothing over 30 day ends', () => {
    const s = world('often', 1);
    const rng = structuredClone(s.rng);
    for (let d = 1; d <= 30; d++) {
      s.day = d;
      step(s);
    }
    expect(s.rng).toEqual(rng);
    expect(ctxOf(s, reg).rng.state).toEqual(rng);
  });

  it('the same state gives the same picks', () => {
    const picks = (): string[] => {
      const s = world('often', 1);
      const out: string[] = [];
      for (let d = 1; d <= 30; d++) {
        s.day = d;
        out.push(...ofType(step(s), 'life_event').map((e) => `${e.unitId}:${e.eventId}`));
      }
      return out;
    };
    expect(picks()).toEqual(picks());
    expect(picks().length).toBeGreaterThan(0);
  });
});
