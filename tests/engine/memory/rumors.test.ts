import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import { DAY_END_STEPS } from '../../../src/engine/calendar';
import { addFact } from '../../../src/engine/memory';
import { hashDay, spreadRumors } from '../../../src/engine/memory/rumors';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { campaign, ctxOf, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const ALL = [ANN, BEA, CAT, DEE];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const spreading = (s: CampaignState, over: Partial<Omit<Fact, 'id'>> = {}): Fact =>
  addFact(s, { about: [ANN], text: `rumor ${s.memory.facts.length}`, tags: [], importance: 3, day: s.day, knownBy: [ANN], spread: 'fast', ...over });
/** One day end of the rumor step, then the day rolls over. */
function dayEnd(s: CampaignState) {
  const events = spreadRumors(s, ctxOf(s, reg));
  s.day += 1;
  return events;
}
const known = (s: CampaignState, f: Fact): string[] => s.memory.facts.find((x) => x.id === f.id)!.knownBy;

describe('hashDay', () => {
  it('is a stable function of the ids, inside the window', () => {
    expect(hashDay('fr1', ANN, 2)).toBe(hashDay('fr1', ANN, 2));
    for (const w of [1, 2, 4]) for (const id of ['fr1', 'fr2', 'f9']) for (const u of ALL) expect(hashDay(id, u, w)).toBeGreaterThanOrEqual(0), expect(hashDay(id, u, w)).toBeLessThan(w);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => hashDay(`fr${i}`, ANN, 4)));
    expect(seen.size).toBe(4); // it spreads over the whole window
  });
});

describe('spreadRumors', () => {
  it('a fast rumor reaches every squad member within 2 days', () => {
    const s = fresh();
    const f = spreading(s);
    expect(dayEnd(s)).toBeDefined(); // the day it happened: nobody hears yet
    expect(known(s, f)).toEqual([ANN]);
    dayEnd(s);
    dayEnd(s);
    expect(known(s, f).sort()).toEqual(ALL);
  });

  it('nobody hears on the day it happened, and everybody has by day + window', () => {
    for (const [spread, window] of [['fast', 2], ['slow', 4]] as const) {
      const s = fresh();
      const f = spreading(s, { spread });
      dayEnd(s);
      expect(known(s, f), spread).toEqual([ANN]);
      for (let i = 0; i < window; i++) dayEnd(s);
      expect(known(s, f).sort(), spread).toEqual(ALL);
    }
  });

  it('a slow one within 4', () => {
    const s = fresh();
    const f = spreading(s, { spread: 'slow' });
    for (let i = 0; i < 5; i++) dayEnd(s); // the fact's own day end, then four more
    expect(known(s, f).sort()).toEqual(ALL);
    // some hear later than 2 days: the spread is not all at once
    const late = Array.from({ length: 30 }, (_, i) => {
      const t = fresh();
      const g = spreading(t, { spread: 'slow', text: `late ${i}` });
      for (let d = 0; d < 3; d++) dayEnd(t); // the fact's day end and two more
      return known(t, g).length < ALL.length;
    });
    expect(late.some(Boolean)).toBe(true);
  });

  it('importance 4 halves the window', () => {
    const fast = fresh();
    const f = spreading(fast, { importance: 4 });
    dayEnd(fast);
    dayEnd(fast); // the fact's day end and one more: window 1
    expect(known(fast, f).sort()).toEqual(ALL);
    const slow = fresh();
    const g = spreading(slow, { spread: 'slow', importance: 5 });
    for (let i = 0; i < 3; i++) dayEnd(slow); // window 2
    expect(known(slow, g).sort()).toEqual(ALL);
  });

  it('heard records the day, and one rumor_heard event names who heard', () => {
    const s = fresh();
    const f = spreading(s);
    dayEnd(s); // day 10 ends
    const events: ReturnType<typeof dayEnd> = [];
    while (s.day < 14) events.push(...dayEnd(s));
    const fact = s.memory.facts.find((x) => x.id === f.id)!;
    expect(Object.keys(fact.heard ?? {}).sort()).toEqual([BEA, CAT, DEE]);
    for (const day of Object.values(fact.heard!)) expect([11, 12]).toContain(day); // the day end that carried it, 1 or 2 days after
    const heard = ofType(events, 'rumor_heard');
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.length).toBeLessThanOrEqual(2); // one per fact and day
    expect(heard.flatMap((e) => e.unitIds as string[]).sort()).toEqual([BEA, CAT, DEE]);
    for (const e of heard) expect(e.factId).toBe(f.id);
  });

  it('a dead or deserted unit never hears', () => {
    const s = fresh();
    s.squad.find((u) => u.id === CAT)!.status = 'dead';
    s.squad.find((u) => u.id === DEE)!.status = 'deserted';
    const f = spreading(s);
    for (let i = 0; i < 4; i++) dayEnd(s);
    expect(known(s, f).sort()).toEqual([ANN, BEA]);
    expect(s.memory.facts.find((x) => x.id === f.id)!.spread).toBeUndefined(); // everybody who could hear has
  });

  it('spread is cleared when done', () => {
    const s = fresh();
    const f = spreading(s);
    expect(s.memory.facts.find((x) => x.id === f.id)!.spread).toBe('fast');
    for (let i = 0; i < 4; i++) dayEnd(s);
    expect(s.memory.facts.find((x) => x.id === f.id)!.spread).toBeUndefined();
    const after = ofType(dayEnd(s), 'rumor_heard');
    expect(after).toEqual([]); // nothing left to say
  });

  it('the same save gives the same days', () => {
    const play = () => {
      const s = fresh();
      for (let i = 0; i < 6; i++) spreading(s, { text: `fact ${i}`, spread: i % 2 ? 'slow' : 'fast' });
      const out: Array<Record<string, number> | undefined> = [];
      for (let i = 0; i < 6; i++) dayEnd(s);
      for (const f of s.memory.facts) out.push(f.heard);
      return out;
    };
    expect(play()).toEqual(play());
  });

  it('no rng draw on the day end', () => {
    const s = fresh();
    s.rng = seedRng(5);
    spreading(s);
    const before = structuredClone(s.rng);
    const ctx = ctxOf(s, reg);
    spreadRumors(s, ctx);
    expect(ctx.rng.state).toEqual(before);
    expect(s.rng).toEqual(before);
  });

  it('a public fact and a fact without spread are untouched', () => {
    const s = fresh();
    const pub = addFact(s, { about: [ANN], text: 'public', tags: [], importance: 3, day: 10, knownBy: ['*'], spread: 'fast' });
    const plain = addFact(s, { about: [ANN], text: 'plain', tags: [], importance: 3, day: 10, knownBy: [ANN] });
    for (let i = 0; i < 4; i++) dayEnd(s);
    expect(s.memory.facts.find((x) => x.id === pub.id)!.heard).toBeUndefined();
    expect(known(s, plain)).toEqual([ANN]);
    expect(s.memory.facts.find((x) => x.id === plain.id)!.heard).toBeUndefined();
  });

  it('a hidden-from-commander fact spreads the same way', () => {
    const s = fresh();
    const f = spreading(s, { hiddenFromCommander: true });
    for (let i = 0; i < 4; i++) dayEnd(s);
    expect(known(s, f).sort()).toEqual(ALL);
  });
});

describe('inside the real day end', () => {
  it('the rumor step runs in dm_rumors and the day_end_step events are unchanged', () => {
    const s = fresh();
    s.slot = 'evening';
    const f = spreading(s, { importance: 4 }); // window 1
    const r = run(s, reg, { type: 'calendar/consume_slot' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'day_end_step').map((e) => e.step)).toEqual([...DAY_END_STEPS]);
    expect(ofType(r.events, 'day_end_step_failed')).toEqual([]);
    expect(r.state.day).toBe(11);
    expect(known(r.state, f)).toEqual([ANN]); // the day it happened: nobody has heard yet
    const next = endDay(r.state, reg); // the next day end carries it (window 1)
    expect(next.day).toBe(12);
    expect(known(next, f).sort()).toEqual(ALL);
  });
});
