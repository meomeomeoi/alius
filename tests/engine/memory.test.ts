import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import {
  addChronicle, addFact, applyCompaction, compactionDue, factsVisibleTo, fallbackCompaction, nextId, openPromises,
  recordPromise, retrieveFacts, revealCrime,
} from '../../src/engine/memory';
import type { CampaignState, Fact } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, ofType } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const fact = (over: Partial<Omit<Fact, 'id'>> = {}): Omit<Fact, 'id'> => ({
  about: [ANN], text: 'She keeps a photo.', tags: [], importance: 3, day: 10, knownBy: [ANN], ...over,
});

describe('ids', () => {
  it('nextId counts up across prefixes', () => {
    const s = fresh();
    expect([nextId(s, 'f'), nextId(s, 'p'), nextId(s, 'f')]).toEqual(['f1', 'p2', 'f3']);
    expect(s.memory.nextId).toBe(3);
  });
});

describe('facts', () => {
  it('fact text is capped and tags normalized', () => {
    const s = fresh();
    const f = addFact(s, fact({ text: `  ${'x'.repeat(500)}  `, tags: ['Honest Talk!', 'honest talk', '', 'Photo'] }));
    expect(f.text).toHaveLength(TUNING.memory.factTextMax);
    expect(f.tags).toEqual(['honest talk', 'photo']);
    expect(f.id).toBe('f1');
    expect(s.memory.facts).toEqual([f]);
  });
  it('duplicate facts merge knownBy', () => {
    const s = fresh();
    const a = addFact(s, fact({ knownBy: [ANN] }));
    const b = addFact(s, fact({ text: '  she KEEPS a photo. ', knownBy: [BEA] }));
    expect(b.id).toBe(a.id);
    expect(s.memory.facts).toHaveLength(1);
    expect(s.memory.facts[0].knownBy.sort()).toEqual([ANN, BEA]);
    addFact(s, fact({ about: [BEA] }));
    expect(s.memory.facts).toHaveLength(2);
  });
  it('a fact known only by A is invisible to B and to the pair A+B', () => {
    const s = fresh();
    addFact(s, fact({ knownBy: [ANN] }));
    expect(factsVisibleTo(s, [ANN])).toHaveLength(1);
    expect(factsVisibleTo(s, [BEA])).toHaveLength(0);
    expect(factsVisibleTo(s, [ANN, BEA])).toHaveLength(0);
    expect(retrieveFacts(s, { participants: [BEA], tags: [] })).toHaveLength(0);
    expect(retrieveFacts(s, { participants: [ANN, BEA], tags: [] })).toHaveLength(0);
  });
  it('public facts are visible to everyone', () => {
    const s = fresh();
    addFact(s, fact({ about: 'world' as never, text: 'The gate is rusted.', knownBy: ['*'] }));
    expect(factsVisibleTo(s, [ANN, BEA, CAT])).toHaveLength(1);
  });
  it('retrieval scores participants ×3, tags ×2, importance and recency', () => {
    const s = fresh();
    s.day = 12;
    const add = (text: string, over: Partial<Omit<Fact, 'id'>>) => addFact(s, fact({ text, knownBy: ['*'], ...over }));
    add('A about Ann, old', { about: [ANN], importance: 1, day: 2 });
    add('B tagged', { about: ['world' as never], tags: ['tea'], importance: 3, day: 12 });
    add('C about Ann and Bea', { about: [ANN, BEA], importance: 2, day: 10 });
    add('D important', { about: ['world' as never], importance: 5, day: 11 });
    // scores with participants [ANN, BEA], tags [tea], day 12:
    // A: 3·1 + 0 + 1 + 3·0.8^10 = 4.32   B: 0 + 2 + 3 + 3·1 = 8   C: 3·2 + 0 + 2 + 3·0.8^2 = 9.92   D: 5 + 3·0.8 = 7.4
    const out = retrieveFacts(s, { participants: [ANN, BEA], tags: ['Tea'] });
    expect(out.map((f) => f.text.split(' ')[0])).toEqual(['C', 'B', 'D', 'A']);
  });
  it('ties go to the newer fact, and retrieval returns at most k', () => {
    const s = fresh();
    for (let i = 0; i < 10; i++) addFact(s, fact({ text: `fact ${i}`, knownBy: ['*'], about: [ANN], day: 10 }));
    const out = retrieveFacts(s, { participants: [ANN], tags: [] });
    expect(out).toHaveLength(TUNING.memory.retrievalK);
    expect(out[0].text).toBe('fact 9');
    expect(retrieveFacts(s, { participants: [ANN], tags: [] }, 2)).toHaveLength(2);
  });
});

describe('promises', () => {
  const made = (s: CampaignState, text: string, to = ANN) => recordPromise(s, { by: 'commander', to, text, kind: 'made' }, s.day);
  it('made opens a promise', () => {
    const s = fresh();
    const r = made(s, 'I will bring you the medicine');
    expect(r.event).toBeNull();
    expect(s.memory.promises).toEqual([{ id: 'p1', by: 'commander', to: ANN, text: 'I will bring you the medicine', status: 'open', day: 10 }]);
    expect(openPromises(s, [ANN])).toHaveLength(1);
    expect(openPromises(s, [BEA])).toHaveLength(0);
  });
  it('made then kept closes the matching promise and yields kept_promise', () => {
    const s = fresh();
    made(s, 'I will bring you the medicine');
    made(s, 'We will talk about your sister tomorrow');
    const r = recordPromise(s, { by: 'commander', to: ANN, text: 'I did bring you the medicine', kind: 'kept' }, 11);
    expect(s.memory.promises!.map((p) => p.status)).toEqual(['kept', 'open']);
    expect(r.event).toMatchObject({ type: 'kept_promise', actor: 'commander', targets: [ANN], severity: 'moderate' });
    expect(openPromises(s, [ANN])).toHaveLength(1);
  });
  it('broken without a text match closes the newest open promise', () => {
    const s = fresh();
    made(s, 'first promise');
    made(s, 'second promise');
    const r = recordPromise(s, { by: 'commander', to: ANN, text: 'zzz', kind: 'broken' }, 11);
    expect(s.memory.promises!.map((p) => p.status)).toEqual(['open', 'broken']);
    expect(r.event).toMatchObject({ type: 'broke_promise' });
  });
  it('kept with nothing open changes nothing', () => {
    const s = fresh();
    const r = recordPromise(s, { by: 'commander', to: ANN, text: 'x', kind: 'kept' }, 10);
    expect(r).toEqual({ event: null });
    expect(s.memory.promises ?? []).toEqual([]);
  });
  it('a promise by a unit is recorded but moves no relation', () => {
    const s = fresh();
    recordPromise(s, { by: ANN, to: 'commander', text: 'I will be there', kind: 'made' }, 10);
    const r = recordPromise(s, { by: ANN, to: 'commander', text: 'was there', kind: 'kept' }, 11);
    expect(r.event).toBeNull();
    expect(s.memory.promises![0].status).toBe('kept');
  });
});

describe('chronicle', () => {
  const scene = (s: CampaignState, day: number, text: string) => addChronicle(s, { kind: 'scene', day, text });
  it('addChronicle gives ids', () => {
    const s = fresh();
    expect(scene(s, 9, 'a').id).toBe('c1');
  });
  it('day compaction collects yesterday\'s scene lines, not today\'s', () => {
    const s = fresh();
    scene(s, 8, 'old 1');
    scene(s, 8, 'old 2');
    scene(s, 9, 'next');
    scene(s, 10, 'today');
    const due = compactionDue(s)!;
    expect(due).toMatchObject({ kind: 'day', day: 8 });
    expect(due.entries.map((e) => e.text)).toEqual(['old 1', 'old 2']);
  });
  it('nothing is due when only today has lines', () => {
    const s = fresh();
    scene(s, 10, 'today');
    expect(compactionDue(s)).toBeNull();
  });
  it('week compaction needs seven past day entries', () => {
    const s = fresh();
    s.day = 20;
    for (let d = 1; d <= 6; d++) addChronicle(s, { kind: 'day', day: d, text: `day ${d}` });
    expect(compactionDue(s)).toBeNull();
    addChronicle(s, { kind: 'day', day: 7, text: 'day 7' });
    const due = compactionDue(s)!;
    expect(due).toMatchObject({ kind: 'week', day: 1, toDay: 7 });
    expect(due.entries).toHaveLength(7);
  });
  it('a week that is not over is not compacted', () => {
    const s = fresh();
    s.day = 7;
    for (let d = 1; d <= 7; d++) addChronicle(s, { kind: 'day', day: d, text: `day ${d}` });
    expect(compactionDue(s)).toBeNull();
  });
  it('applyCompaction replaces exactly those entries', () => {
    const s = fresh();
    scene(s, 8, 'old 1');
    scene(s, 9, 'other day');
    scene(s, 8, 'old 2');
    applyCompaction(s, { kind: 'day', day: 8, text: 'Day 8 summary' });
    expect(s.memory.chronicle.map((e) => `${e.kind}:${e.day}:${e.text}`)).toEqual(['day:8:Day 8 summary', 'scene:9:other day']);
  });
  it('applyCompaction refuses a mismatch', () => {
    const s = fresh();
    scene(s, 8, 'x');
    expect(() => applyCompaction(s, { kind: 'day', day: 7, text: 'y' })).toThrow(/not due/);
    expect(() => applyCompaction(s, { kind: 'week', day: 8, text: 'y' })).toThrow(/not due/);
    expect(s.memory.chronicle).toHaveLength(1);
  });
  it('day entries then weeks: a full cycle', () => {
    const s = fresh();
    s.day = 30;
    for (let d = 1; d <= 7; d++) scene(s, d, `line ${d}`);
    for (let i = 0; i < 7; i++) {
      const due = compactionDue(s)!;
      expect(due.kind).toBe('day');
      applyCompaction(s, { kind: due.kind, day: due.day, text: `D${due.day}` });
    }
    const week = compactionDue(s)!;
    expect(week).toMatchObject({ kind: 'week', day: 1, toDay: 7 });
    applyCompaction(s, { kind: 'week', day: 1, toDay: 7, text: 'Week 1' });
    expect(s.memory.chronicle.map((e) => e.kind)).toEqual(['week']);
    expect(compactionDue(s)).toBeNull();
  });
  it('fallback joins and truncates', () => {
    const lines = [{ id: 'c1', kind: 'scene' as const, day: 1, text: 'a'.repeat(300) }, { id: 'c2', kind: 'scene' as const, day: 1, text: 'b'.repeat(300) }];
    const out = fallbackCompaction(lines);
    expect(out).toHaveLength(400);
    expect(out.startsWith('aaa')).toBe(true);
    expect(fallbackCompaction([lines[0]].map((l) => ({ ...l, text: 'short' })))).toBe('short');
  });
});

describe('crime discovery', () => {
  // mutiny crime reactions are read from content, not hard-coded
  const reactions = () => reg.crimes.get('mutiny')!.valueReactions as Array<{ axis: keyof ReturnType<typeof unitValues>; sign: '+' | '-'; weight: number }>;
  const unitValues = () => ({ pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 });
  function aligned(s: CampaignState, id: string, wantPositive: boolean): { trust: number; affinity: number } {
    const r = reactions()[0];
    const u = s.squad.find((x) => x.id === id)!;
    u.values = unitValues();
    u.values[r.axis] = r.sign === '+' ? 3 : -3;
    return { trust: r.weight * TUNING.relations.crime.trustPerWeight * (wantPositive ? 1 : 1), affinity: r.weight * TUNING.relations.crime.affinityPerWeight };
  }
  const prep = (): CampaignState => {
    const s = fresh();
    for (const u of s.squad) {
      u.values = unitValues();
      s.relations[u.id].flags = [];
      s.relations[u.id].trust = 50;
      s.relations[u.id].affinity = 50;
    }
    return s;
  };
  // only the first reaction axis is set on the unit; the other axes are 0 so they do not match
  it('crime revealed sets knows_crime and applies value reactions once', () => {
    const s = prep();
    const first = reactions()[0];
    const expected = aligned(s, ANN, true);
    const events = revealCrime(s, reg, [ANN]);
    const rel = s.relations[ANN];
    expect(rel.flags).toEqual(expect.arrayContaining(['knows_crime', 'crime_reaction_done']));
    expect(rel.trust).toBe(Math.min(100, Math.max(0, 50 + expected.trust)));
    expect(rel.affinity).toBe(50 + expected.affinity);
    expect(ofType(events, 'crime_known')).toEqual([{ type: 'crime_known', unitId: ANN }]);
    expect(first.weight).not.toBe(0);
  });
  it('crime revealed twice changes nothing the second time', () => {
    const s = prep();
    aligned(s, ANN, true);
    revealCrime(s, reg, [ANN]);
    const after = structuredClone(s);
    expect(revealCrime(s, reg, [ANN])).toEqual([]);
    expect(s).toEqual(after);
  });
  it('a unit who already knew the crime is not touched', () => {
    const s = prep();
    aligned(s, ANN, true);
    s.relations[ANN].flags = ['knows_crime'];
    const before = structuredClone(s.relations[ANN]);
    expect(revealCrime(s, reg, [ANN])).toEqual([]);
    expect(s.relations[ANN]).toEqual(before);
  });
  it('values of 0 or the wrong sign do not react', () => {
    const s = prep();
    revealCrime(s, reg, [BEA]);
    expect(s.relations[BEA].trust).toBe(50);
    expect(s.relations[BEA].affinity).toBe(50);
    expect(s.relations[BEA].flags).toEqual(expect.arrayContaining(['knows_crime', 'crime_reaction_done']));
  });
  it('a grunt only gets the trust part', () => {
    const s = prep();
    aligned(s, ANN, true);
    s.squad.find((u) => u.id === ANN)!.kind = 'grunt';
    revealCrime(s, reg, [ANN]);
    expect(s.relations[ANN].affinity).toBe(50);
    expect(s.relations[ANN].trust).not.toBe(50);
  });
  it('a campaign without a crime only sets the flag', () => {
    const s = prep();
    s.commander.crimeId = null;
    revealCrime(s, reg, [ANN]);
    expect(s.relations[ANN].flags).toContain('knows_crime');
    expect(s.relations[ANN].trust).toBe(50);
  });
  it('unknown units are ignored', () => {
    expect(revealCrime(prep(), reg, ['ghost'])).toEqual([]);
  });
});
