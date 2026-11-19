import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/headStart';
import '../../../src/engine/actions/memory';
import { recapCommitted, recapPairs } from '../../../src/engine/headStart/recap';
import { buildCampaign, type SetupResult } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const setup = (days: number, newArrivals: string[] = []): SetupResult => ({
  commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation',
  units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)), ...(days > 0 ? { headStart: { days: days as 7, newArrivals } } : {}),
});
const build = (days = 14, newArrivals = ['cat.png']): CampaignState => {
  const out = buildCampaign(setup(days, newArrivals), reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
/** A complete answer for every stored pair; `tag` makes the texts distinct between two answers. */
const answer = (s: CampaignState, tag = 'a', source: 'model' | 'fallback' = 'model') => {
  const units = s.headStart!.units.map((u) => ({ unitId: u.unitId, moments: u.moments.map((kind) => ({ kind, text: `${tag}: ${u.unitId} remembers ${kind}.` })) }));
  return { units, chronicle: `${tag}: the squad had two weeks with the commander.`, source };
};
const send = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'head_start/recap', payload });
const headFacts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('head_start'));

describe('head_start/recap: the first application', () => {
  it('writes the facts and one chronicle entry', () => {
    const s = build();
    const pairs = recapPairs(s);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    const nextId = s.memory.nextId ?? 0;
    const chronicle = s.memory.chronicle.length;
    const r = send(s, answer(s));
    expect(errors(r.events)).toEqual([]);
    const facts = headFacts(r.state);
    expect(facts).toHaveLength(pairs.length);
    for (const [i, f] of facts.entries()) {
      expect(f.id).toMatch(/^fr/);
      expect(f.about).toEqual([pairs[i].unitId]);
      expect(f.knownBy).toEqual([pairs[i].unitId]);
      expect(f.tags).toEqual(['head_start']);
      expect(f.text).toBe(`a: ${pairs[i].unitId} remembers ${pairs[i].kind}.`);
      expect(f.importance).toBe(reg.headStartMoments.get(pairs[i].kind)!.importance);
      expect(f.hiddenFromCommander).toBeUndefined();
    }
    expect(r.state.memory.nextId).toBe(nextId + 1); // the chronicle entry's `c` id only: the facts take `fr` ids and leave the counter alone
    expect(r.state.memory.chronicle).toHaveLength(chronicle + 1);
    const entry = r.state.memory.chronicle.at(-1)!;
    expect(entry).toMatchObject({ kind: 'day', day: 1, text: 'a: the squad had two weeks with the commander.', audience: s.headStart!.units.map((u) => u.unitId) });
    expect(r.state.headStart!.recap).toEqual({ source: 'model', chronicleId: entry.id });
    const types = r.events.map((e) => e.type);
    expect(types.filter((t) => t === 'head_start_applied')).toHaveLength(1);
    expect(types.indexOf('head_start_applied')).toBeLessThan(types.indexOf('head_start_moment'));
    expect(ofType(r.events, 'head_start_moment')).toHaveLength(pairs.length);
    expect(ofType(r.events, 'head_start_applied')[0]).toMatchObject({ days: 14, units: s.headStart!.units.map((u) => u.unitId) });
  });

  it('the new arrival is outside the audience and has no fact', () => {
    const r = send(build(), answer(build()));
    expect(r.state.memory.chronicle.at(-1)!.audience).not.toContain('unit_cat');
    expect(headFacts(r.state).some((f) => f.about.includes('unit_cat'))).toBe(false);
  });

  it('a recap with a missing or extra pair is rejected, nothing changes', () => {
    const s = build();
    const full = answer(s);
    const missing = { ...full, units: full.units.map((u, i) => (i === 0 ? { ...u, moments: u.moments.slice(1) } : u)) };
    const extra = { ...full, units: [...full.units, { unitId: 'unit_cat', moments: [{ kind: 'shared_meal', text: 'x' }] }] };
    const unknownKind = { ...full, units: full.units.map((u, i) => (i === 0 ? { ...u, moments: [...u.moments.slice(1), { kind: 'no_such_kind', text: 'x' }] } : u)) };
    const dupe = { ...full, units: [...full.units, full.units[0]] };
    for (const bad of [missing, extra, unknownKind, dupe]) {
      const r = send(s, bad);
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
  });

  it('a text over 240, an empty text or a chronicle over 600 or missing is rejected', () => {
    const s = build();
    const full = answer(s);
    const long = { ...full, units: full.units.map((u, i) => (i === 0 ? { ...u, moments: u.moments.map((m, j) => (j === 0 ? { ...m, text: 'x'.repeat(TUNING.headStart.textMax + 1) } : m)) } : u)) };
    const blank = { ...full, units: full.units.map((u, i) => (i === 0 ? { ...u, moments: u.moments.map((m, j) => (j === 0 ? { ...m, text: '  ' } : m)) } : u)) };
    for (const bad of [long, blank, { ...full, chronicle: 'x'.repeat(TUNING.headStart.chronicleMax + 1) }, { ...full, chronicle: '' }, { ...full, source: 'guess' }]) {
      const r = send(s, bad);
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    expect(errors(send(s, { ...full, chronicle: 'x'.repeat(TUNING.headStart.chronicleMax) }).events)).toEqual([]);
  });

  it('a recap without a head start is rejected', () => {
    const out = buildCampaign(setup(0), reg, { desireBondDefects: false, seed: 7 });
    if (!out.ok) throw new Error('build');
    const r = send(out.state, { units: [], chronicle: 'x', source: 'model' });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(out.state);
  });

  it('is allowed after the first scene: the facts must exist', () => {
    const s = build();
    s.memory.scenes = [{ sceneId: 's1', from: 0, to: 3, summarized: true }];
    expect(errors(send(s, answer(s)).events)).toEqual([]);
  });
});

describe('head_start/recap: replacing', () => {
  it('a second recap replaces, never adds', () => {
    const first = send(build(), answer(build(), 'a')).state;
    const facts = headFacts(first).length;
    const chronicle = first.memory.chronicle.length;
    const r = send(first, answer(first, 'b', 'fallback'));
    expect(errors(r.events)).toEqual([]);
    expect(headFacts(r.state)).toHaveLength(facts);
    expect(r.state.memory.chronicle).toHaveLength(chronicle);
    expect(headFacts(r.state).every((f) => f.text.startsWith('b: '))).toBe(true);
    const entry = r.state.memory.chronicle.find((c) => c.id === first.headStart!.recap!.chronicleId)!;
    expect(entry.text).toMatch(/^b: /);
    expect(r.state.headStart!.recap).toEqual({ source: 'fallback', chronicleId: first.headStart!.recap!.chronicleId });
    expect(ofType(r.events, 'head_start_moment')).toEqual([]);
    expect(ofType(r.events, 'head_start_applied')).toEqual([]);
  });

  it('an edited fact keeps its text', () => {
    const first = send(build(), answer(build(), 'a')).state;
    const edited = headFacts(first)[0];
    const e = run(first, reg, { type: 'memory/edit', payload: { factId: edited.id, text: 'Mine.' } });
    expect(errors(e.events)).toEqual([]);
    const r = send(e.state, answer(e.state, 'b'));
    const facts = headFacts(r.state);
    expect(facts[0].text).toBe('Mine.');
    expect(facts.slice(1).every((f) => f.text.startsWith('b: '))).toBe(true);
  });

  it('is refused after the first scene, with the reason', () => {
    const first = send(build(), answer(build(), 'a')).state;
    first.memory.scenes = [{ sceneId: 's1', from: 0, to: 3, summarized: true }];
    const r = send(first, answer(first, 'b'));
    expect(errors(r.events)[0]).toMatchObject({ message: 'The first scene has started.' });
    expect(r.state).toBe(first);
  });
});

describe('recapCommitted', () => {
  it('is null on day 1 before any scene, a reason otherwise', () => {
    const s = build();
    expect(recapCommitted(s)).toBeNull();
    const open = structuredClone(s);
    open.scene = { id: 's1' } as unknown as CampaignState['scene'];
    expect(recapCommitted(open)).toBe('The first scene has started.');
    const ended = structuredClone(s);
    ended.memory.scenes = [{ sceneId: 's1', from: 0, to: 3, summarized: true }];
    expect(recapCommitted(ended)).toBe('The first scene has started.');
    const later = structuredClone(s);
    later.day = 2;
    expect(recapCommitted(later)).toBe('The first scene has started.');
  });
});

describe('recapPairs', () => {
  it('lists every (unit, kind) in squad and moment order', () => {
    const s = build(30);
    expect(recapPairs(s)).toEqual(s.headStart!.units.flatMap((u) => u.moments.map((kind) => ({ unitId: u.unitId, kind }))));
    const none = buildCampaign(setup(0), reg, { desireBondDefects: false, seed: 7 });
    if (!none.ok) throw new Error('build');
    expect(recapPairs(none.state)).toEqual([]);
  });
});
