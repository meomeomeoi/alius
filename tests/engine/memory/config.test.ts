import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import { addFact, nextId, retrieveFacts } from '../../../src/engine/memory';
import { MEMORY_PRESETS, MEMORY_RANGES, memoryConfig } from '../../../src/engine/memory/config';
import { migrate } from '../../../src/engine/state/migrations';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const draft = (over: Partial<Omit<Fact, 'id'>> = {}): Omit<Fact, 'id'> => ({
  about: [ANN], text: 'She keeps a photo.', tags: [], importance: 3, day: 10, knownBy: ['*'], ...over,
});
const configure = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'memory/configure', payload });

describe('memory config', () => {
  it('absent config reads the normal preset', () => {
    const c = memoryConfig(fresh());
    expect(c).toMatchObject({ preset: 'normal', factsMax: 160, retrievalK: 6, memoryTokens: 550, recencyBase: 0.8, rumorMode: 'plain', hideScenesAfter: 0 });
  });

  it('configure short and long set the preset values', () => {
    const num = (s: CampaignState) => {
      const c = memoryConfig(s);
      return [c.factsMax, c.foldAfterDays, c.recencyBase, c.retrievalK, c.memoryTokens, c.journalLines, c.dmLines, c.chronicleDays];
    };
    const short = configure(fresh(), { preset: 'short' });
    expect(errors(short.events)).toEqual([]);
    expect(num(short.state)).toEqual([80, 4, 0.7, 5, 350, 2, 2, 1]);
    expect(memoryConfig(short.state).preset).toBe('short');
    const long = configure(short.state, { preset: 'long' });
    expect(num(long.state)).toEqual([320, 14, 0.9, 8, 900, 5, 5, 3]);
    expect(num(configure(long.state, { preset: 'normal' }).state)).toEqual([160, 7, 0.8, 6, 550, 3, 3, 2]);
    expect(MEMORY_PRESETS.long.factsMax).toBe(320);
  });

  it('a preset change keeps the rumor mode and the hiding the player chose', () => {
    let s = configure(fresh(), { preset: 'normal', rumorMode: 'model', hideScenesAfter: 3 }).state;
    expect(memoryConfig(s)).toMatchObject({ rumorMode: 'model', hideScenesAfter: 3 });
    s = configure(s, { preset: 'long' }).state;
    expect(memoryConfig(s)).toMatchObject({ preset: 'long', rumorMode: 'model', hideScenesAfter: 3, factsMax: 320 });
  });

  it('custom clamps every field to its range', () => {
    const low = configure(fresh(), {
      preset: 'custom', factsMax: -5, foldAfterDays: 0, recencyBase: 0, retrievalK: 0, memoryTokens: 1, journalLines: -1, dmLines: -1, chronicleDays: -1, hideScenesAfter: -9, factTextMax: -9,
    });
    const high = configure(fresh(), {
      preset: 'custom', factsMax: 1e9, foldAfterDays: 1e9, recencyBase: 5, retrievalK: 1e9, memoryTokens: 1e9, journalLines: 1e9, dmLines: 1e9, chronicleDays: 1e9, hideScenesAfter: 1e9, factTextMax: 1e9,
    });
    for (const [field, [min, max]] of Object.entries(MEMORY_RANGES)) {
      expect(memoryConfig(low.state)[field as keyof typeof MEMORY_RANGES], field).toBe(min);
      expect(memoryConfig(high.state)[field as keyof typeof MEMORY_RANGES], field).toBe(max);
    }
    expect(memoryConfig(low.state).preset).toBe('custom');
  });

  it('custom keeps the fields it was not given and refuses a bad payload', () => {
    const s = configure(fresh(), { preset: 'custom', retrievalK: 9 }).state;
    expect(memoryConfig(s)).toMatchObject({ preset: 'custom', retrievalK: 9, factsMax: 160, memoryTokens: 550 });
    for (const bad of [null, {}, { preset: 'huge' }, { preset: 'custom', rumorMode: 'loud' }, { preset: 'custom', factsMax: 'many' }, { preset: 'short', factsMax: 100 }]) {
      const r = configure(fresh(), bad);
      expect(errors(r.events), JSON.stringify(bad)).toHaveLength(1);
    }
  });

  it('retrieveFacts uses retrievalK and recencyBase of the config', () => {
    let s = fresh();
    for (let i = 0; i < 10; i++) addFact(s, draft({ text: `fact ${i}`, day: 10 }));
    expect(retrieveFacts(s, { participants: [ANN], tags: [] })).toHaveLength(6);
    s = configure(s, { preset: 'short' }).state;
    expect(retrieveFacts(s, { participants: [ANN], tags: [] })).toHaveLength(5);
    expect(retrieveFacts(s, { participants: [ANN], tags: [] }, 2)).toHaveLength(2);
    // recency: old fact 'A' (importance 3, 10 days old) against a new one of importance 1, nothing else equal
    const t = fresh();
    addFact(t, draft({ text: 'A old', day: 0, importance: 3, about: [BEA] }));
    addFact(t, draft({ text: 'B new', day: 10, importance: 1, about: [BEA] }));
    // normal 0.8: A = 3 + 3·0.8^10 = 3.32, B = 1 + 3 = 4 → B first; long 0.9: A = 3 + 3·0.9^10 = 4.05 → A first
    expect(retrieveFacts(t, { participants: [BEA], tags: [] }).map((f) => f.text[0])).toEqual(['B', 'A']);
    const long = configure(t, { preset: 'long' }).state;
    expect(retrieveFacts(long, { participants: [BEA], tags: [] }).map((f) => f.text[0])).toEqual(['A', 'B']);
  });

  it('a pinned fact outranks an equal unpinned one', () => {
    const s = fresh();
    addFact(s, draft({ text: 'first', importance: 3 }));
    addFact(s, draft({ text: 'second', importance: 3 })); // the newer one wins a tie
    expect(retrieveFacts(s, { participants: [ANN], tags: [] })[0].text).toBe('second');
    const id = s.memory.facts[0].id;
    const pinned = run(s, reg, { type: 'memory/pin', payload: { factId: id, pinned: true } }).state;
    expect(retrieveFacts(pinned, { participants: [ANN], tags: [] })[0].text).toBe('first');
  });

  it('pruning starts only past factsMax × 1.25 and never drops a pinned fact', () => {
    const s = configure(fresh(), { preset: 'short' }).state; // factsMax 80, ceiling 100
    for (let i = 0; i < 100; i++) addFact(s, draft({ text: `fact number ${i}`, importance: i === 3 ? 5 : 1, day: i }));
    expect(s.memory.facts).toHaveLength(100); // past 80 but not past 100: nothing deleted
    addFact(s, draft({ text: 'fact number 100', importance: 1, day: 100 }));
    expect(s.memory.facts).toHaveLength(100);
    expect(s.memory.facts.some((f) => f.text === 'fact number 0')).toBe(false); // the oldest of the least important went
    expect(s.memory.facts.some((f) => f.text === 'fact number 3')).toBe(true); // importance 5 stays
    const pin = s.memory.facts.find((f) => f.text === 'fact number 1')!;
    pin.pinned = true;
    for (let i = 101; i < 140; i++) addFact(s, draft({ text: `fact number ${i}`, importance: 1, day: i }));
    expect(s.memory.facts).toHaveLength(100);
    expect(s.memory.facts.some((f) => f.text === 'fact number 1')).toBe(true);
  });

  it('pin, forget and edit change only that fact; edit marks edited and cuts to factTextMax', () => {
    const s = fresh();
    addFact(s, draft({ text: 'one' }));
    addFact(s, draft({ text: 'two' }));
    const [a, b] = s.memory.facts.map((f) => f.id);
    const pinned = run(s, reg, { type: 'memory/pin', payload: { factId: a, pinned: true } }).state;
    expect(pinned.memory.facts.find((f) => f.id === a)!.pinned).toBe(true);
    expect(pinned.memory.facts.find((f) => f.id === b)!.pinned).toBeUndefined();
    const unpinned = run(pinned, reg, { type: 'memory/pin', payload: { factId: a, pinned: false } }).state;
    expect(unpinned.memory.facts.find((f) => f.id === a)!.pinned).toBeUndefined();
    const edited = run(s, reg, { type: 'memory/edit', payload: { factId: b, text: `  ${'x'.repeat(300)}  ` } }).state;
    const eb = edited.memory.facts.find((f) => f.id === b)!;
    expect(eb.text).toHaveLength(200);
    expect(eb.edited).toBe(true);
    expect(edited.memory.facts.find((f) => f.id === a)).toEqual(s.memory.facts[0]);
    const gone = run(s, reg, { type: 'memory/forget', payload: { factId: a } }).state;
    expect(gone.memory.facts.map((f) => f.id)).toEqual([b]);
    expect(errors(run(s, reg, { type: 'memory/edit', payload: { factId: b, text: '   ' } }).events)).toHaveLength(1);
  });

  it('forget of an unknown fact throws', () => {
    const r = run(fresh(), reg, { type: 'memory/forget', payload: { factId: 'nope' } });
    expect(errors(r.events)).toHaveLength(1);
    expect(errors(run(fresh(), reg, { type: 'memory/pin', payload: { factId: 'nope', pinned: true } }).events)).toHaveLength(1);
    expect(errors(run(fresh(), reg, { type: 'memory/edit', payload: { factId: 'nope', text: 'x' } }).events)).toHaveLength(1);
  });

  it('a remembered fact takes an fr id and leaves memory.nextId alone', () => {
    const s = fresh();
    expect(nextId(s, 'f')).toBe('f1');
    const a = addFact(s, draft({ text: 'rule fact one' }), { remembered: true });
    const b = addFact(s, draft({ text: 'rule fact two', pinned: true, hiddenFromCommander: true, spread: 'fast' }), { remembered: true });
    expect([a.id, b.id]).toEqual(['fr1', 'fr2']);
    expect(s.memory.nextId).toBe(1);
    expect(s.memory.nextRememberId).toBe(2);
    expect(b).toMatchObject({ pinned: true, hiddenFromCommander: true, spread: 'fast' });
    expect(addFact(s, draft({ text: 'plain' })).id).toBe('f2');
  });

  it('an old save loads and reads normal', () => {
    const r = migrate(JSON.parse(readFileSync('tests/fixtures/campaign-v0.json', 'utf8')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    expect(s.memory.config).toBeUndefined();
    for (let i = 0; i < 120; i++) addFact(s, draft({ text: `old fact ${i}`, about: ['world'], day: 1 }));
    expect(s.memory.facts).toHaveLength(120);
    expect(memoryConfig(s).preset).toBe('normal');
    expect(retrieveFacts(s, { participants: [], tags: [] })).toHaveLength(6);
  });
});
