import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import { addFact } from '../../../src/engine/memory';
import { applyFold, fallbackFold, foldDue } from '../../../src/engine/memory/fold';
import type { CampaignState, Fact } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 20;
  return s;
};
/** A fact `age` days old (the normal preset folds facts older than 7 days). */
const old = (s: CampaignState, over: Partial<Omit<Fact, 'id'>> = {}, age = 10): Fact =>
  addFact(s, { about: [ANN], text: `old fact ${s.memory.facts.length}`, tags: [], importance: 3, day: s.day - age, knownBy: [ANN], ...over });
const many = (s: CampaignState, n: number, over: Partial<Omit<Fact, 'id'>> = {}, age = 10): Fact[] => Array.from({ length: n }, () => old(s, over, age));
const ids = (fs: Fact[]): string[] => fs.map((f) => f.id);
const fold = (s: CampaignState, p: Record<string, unknown>) => run(s, reg, { type: 'memory/fold', payload: p });
const payloadFor = (s: CampaignState, over: Record<string, unknown> = {}) => {
  const due = foldDue(s)!;
  return { target: due.target, own: 'Her own memory.', shared: 'What everyone remembers.', factIds: [...due.own, ...due.shared].map((f) => f.id), ...over };
};

describe('foldDue', () => {
  it('nothing is due under the batch and under factsMax', () => {
    const s = fresh();
    many(s, 5);
    expect(foldDue(s)).toBeNull();
    expect(foldDue(fresh())).toBeNull();
  });

  it('a unit with 6 old facts is due', () => {
    const s = fresh();
    const facts = many(s, 6);
    const due = foldDue(s)!;
    expect(due.target).toBe(ANN);
    expect(ids(due.own)).toEqual(ids(facts));
    expect(due.shared).toEqual([]);
  });

  it('a fact is old only when it is older than foldAfterDays', () => {
    const s = fresh();
    many(s, 6, {}, 7); // exactly 7 days: not yet
    expect(foldDue(s)).toBeNull();
    const t = fresh();
    many(t, 6, {}, 8);
    expect(foldDue(t)?.target).toBe(ANN);
  });

  it('over factsMax the fullest target is due', () => {
    const s = fresh();
    s.memory.config = { preset: 'custom', factsMax: 40 };
    many(s, 3, { about: [ANN], knownBy: [ANN] });
    many(s, 4, { about: [BEA], knownBy: [BEA] });
    many(s, 40, { about: [CAT], knownBy: [CAT] }, 1); // recent: filler that is not foldable
    expect(s.memory.facts.length).toBeGreaterThan(40);
    expect(foldDue(s)!.target).toBe(BEA);
    // a tie goes to squad order, and the world comes last
    many(s, 1, { about: [ANN], knownBy: [ANN] });
    expect(foldDue(s)!.target).toBe(ANN);
    const w = fresh();
    w.memory.config = { preset: 'custom', factsMax: 40 };
    many(w, 3, { about: ['world'], knownBy: ['*'] });
    many(w, 3, { about: [DEE], knownBy: [DEE] });
    many(w, 40, { about: [CAT], knownBy: [CAT] }, 1);
    expect(foldDue(w)!.target).toBe(DEE);
  });

  it('under factsMax a batch of 6 decides, and the biggest batch goes first', () => {
    const s = fresh();
    many(s, 6, { about: [BEA], knownBy: [BEA] });
    many(s, 7, { about: [CAT], knownBy: [CAT] });
    expect(foldDue(s)!.target).toBe(CAT);
  });

  it('pinned and hidden facts are never due', () => {
    const s = fresh();
    const facts = many(s, 6);
    facts[0].pinned = true;
    expect(foldDue(s)).toBeNull();
    const t = fresh();
    const g = many(t, 7);
    g[0].hiddenFromCommander = true;
    g[1].pinned = true;
    expect(foldDue(t)).toBeNull(); // 5 left
  });

  it('own and shared split by knownBy', () => {
    const s = fresh();
    const mine = old(s, { text: 'a private one', knownBy: [ANN] });
    const pair = old(s, { text: 'two know', knownBy: [ANN, BEA] });
    const all = old(s, { text: 'the whole squad knows', knownBy: [ANN, BEA, CAT, DEE] });
    const pub = old(s, { text: 'public', knownBy: ['*'] });
    many(s, 2, { knownBy: [ANN] });
    const due = foldDue(s)!;
    expect(ids(due.own)).toEqual(expect.arrayContaining([mine.id, pair.id]));
    expect(ids(due.shared).sort()).toEqual([all.id, pub.id].sort());
    expect(due.own.length + due.shared.length).toBe(6);
  });

  it('a fact goes to the unit it is about and who knows it; a fact about the world to the world', () => {
    const s = fresh();
    many(s, 6, { about: ['world'], knownBy: ['*'] });
    expect(foldDue(s)!.target).toBe('*');
    const t = fresh();
    many(t, 6, { about: [], knownBy: ['*'] });
    expect(foldDue(t)!.target).toBe('*');
    // public: all of `about`; the first in squad order takes it
    const u = fresh();
    many(u, 6, { about: [CAT, BEA], knownBy: ['*'] });
    expect(foldDue(u)!.target).toBe(BEA);
    // known by only one of the two units it is about: hers
    const v = fresh();
    many(v, 6, { about: [BEA, CAT], knownBy: [CAT] });
    expect(foldDue(v)!.target).toBe(CAT);
  });

  it('a fact about a unit who is gone goes to the world, where the squad still remembers it', () => {
    const s = fresh();
    s.squad.find((u) => u.id === CAT)!.status = 'dead';
    many(s, 6, { about: [CAT], knownBy: [ANN, BEA, DEE] });
    expect(foldDue(s)!.target).toBe('*');
  });

  it('a fact about several units is folded into each unit\'s dossier, then removed', () => {
    const s = fresh();
    const multi = many(s, 6, { about: [BEA, ANN], knownBy: [ANN, BEA] });
    expect(foldDue(s)!.target).toBe(ANN); // a tie goes to squad order
    const first = fold(s, payloadFor(s));
    expect(errors(first.events)).toEqual([]);
    expect(first.state.memory.dossiers![ANN].folded).toBe(6);
    expect(first.state.memory.dossiers![BEA]).toBeUndefined();
    // still there: Bea has not had them yet
    for (const f of multi) expect(first.state.memory.facts.find((x) => x.id === f.id)!.foldedInto).toEqual([ANN]);
    const due = foldDue(first.state)!;
    expect(due.target).toBe(BEA);
    expect(ids(due.own).sort()).toEqual(ids(multi).sort());
    const second = fold(first.state, payloadFor(first.state));
    expect(errors(second.events)).toEqual([]);
    expect(second.state.memory.dossiers![BEA].folded).toBe(6);
    for (const f of multi) expect(second.state.memory.facts.some((x) => x.id === f.id)).toBe(false);
    expect(foldDue(second.state)).toBeNull();
  });

  it('a fact that some know about the world is folded into the private part of each who knows it', () => {
    const s = fresh();
    many(s, 6, { about: ['world'], knownBy: [ANN, BEA] });
    const due = foldDue(s)!;
    expect(due.target).toBe(ANN);
    expect(due.shared).toEqual([]);
    expect(due.own).toHaveLength(6);
    const a = fold(s, payloadFor(s));
    const b = fold(a.state, payloadFor(a.state));
    expect(Object.keys(b.state.memory.dossiers!).sort()).toEqual([ANN, BEA]); // nothing in the world's, whose private part no prompt carries
    expect(b.state.memory.facts).toEqual([]);
  });

  it('a fact only the commander knows is folded into the private part of the unit it is about', () => {
    const s = fresh();
    many(s, 6, { about: [BEA], knownBy: [] });
    const due = foldDue(s)!;
    expect(due.target).toBe(BEA);
    expect(due.own).toHaveLength(6);
  });

  it('a fact whose other unit died is not stuck: the next fact written sweeps it', () => {
    const s = fresh();
    const multi = many(s, 6, { about: [ANN, BEA], knownBy: [ANN, BEA] });
    const first = fold(s, payloadFor(s)).state;
    first.squad.find((u) => u.id === BEA)!.status = 'dead'; // she will never be folded into
    expect(foldDue(first)).toBeNull(); // everything living has had it
    expect(first.memory.facts).toHaveLength(6);
    addFact(first, { about: ['world'], text: 'a new fact', tags: [], importance: 3, day: first.day, knownBy: ['*'] });
    for (const f of multi) expect(first.memory.facts.some((x) => x.id === f.id)).toBe(false);
    expect(first.memory.facts.map((f) => f.text)).toEqual(['a new fact']);
  });
});

describe('applyFold and memory/fold', () => {
  it('applyFold replaces exactly the due facts and writes the dossier', () => {
    const s = fresh();
    const facts = many(s, 6);
    const keep = old(s, { about: [BEA], knownBy: [BEA] });
    const r = fold(s, payloadFor(s));
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.dossiers![ANN]).toEqual({ own: 'Her own memory.', shared: 'What everyone remembers.', day: 20, folded: 6 });
    for (const f of facts) expect(r.state.memory.facts.some((x) => x.id === f.id)).toBe(false);
    expect(r.state.memory.facts.map((f) => f.id)).toEqual([keep.id]);
    // a later fold adds to the count
    many(r.state, 6);
    const r2 = fold(r.state, payloadFor(r.state, { own: 'Newer.', shared: '' }));
    expect(r2.state.memory.dossiers![ANN]).toMatchObject({ own: 'Newer.', folded: 12 });
  });

  it('each part is cut to its cap', () => {
    const s = fresh();
    many(s, 3, { knownBy: [ANN] });
    many(s, 3, { knownBy: ['*'] });
    const r = fold(s, payloadFor(s, { own: 'o'.repeat(900), shared: 's'.repeat(900) }));
    const d = r.state.memory.dossiers![ANN];
    expect(d.own).toHaveLength(TUNING.memory.dossierOwnMax);
    expect(d.shared).toHaveLength(TUNING.memory.dossierSharedMax);
    expect([TUNING.memory.dossierOwnMax, TUNING.memory.dossierSharedMax]).toEqual([500, 400]);
  });

  it('a stale fold is refused', () => {
    const s = fresh();
    const facts = many(s, 6);
    const p = payloadFor(s);
    // a fact pinned between the due check and the answer
    const pinned = structuredClone(s);
    pinned.memory.facts.find((f) => f.id === facts[0].id)!.pinned = true;
    const a = fold(pinned, p);
    expect(errors(a.events)).toHaveLength(1);
    expect(a.state).toBe(pinned);
    // a fact added in between
    const grown = structuredClone(s);
    old(grown);
    expect(errors(fold(grown, p).events)).toHaveLength(1);
    // a payload that names too few, or a fact that is not due
    expect(errors(fold(s, { ...p, factIds: p.factIds.slice(1) }).events)).toHaveLength(1);
    expect(errors(fold(s, { ...p, factIds: [...p.factIds.slice(1), 'f999'] }).events)).toHaveLength(1);
    // the wrong target
    expect(errors(fold(s, { ...p, target: BEA }).events)).toHaveLength(1);
    // nothing due at all
    expect(errors(fold(fresh(), { target: ANN, own: 'x', shared: 'y', factIds: [] }).events)).toHaveLength(1);
  });

  it('a part with facts needs text; a part without facts may be left as it was', () => {
    const s = fresh();
    many(s, 6, { knownBy: [ANN] });
    expect(errors(fold(s, payloadFor(s, { own: '   ' })).events)).toHaveLength(1);
    s.memory.dossiers = { [ANN]: { own: 'before', shared: 'common ground', day: 1, folded: 3 } };
    const r = fold(s, payloadFor(s, { shared: '' })); // no shared facts this time
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.dossiers![ANN]).toMatchObject({ own: 'Her own memory.', shared: 'common ground', folded: 9 });
  });

  it('applyFold can be called directly on a draft', () => {
    const s = fresh();
    many(s, 6);
    applyFold(s, payloadFor(s));
    expect(s.memory.facts).toEqual([]);
  });
});

describe('fallbackFold', () => {
  const f = (text: string, day: number): Fact => ({ id: `f${day}`, about: [ANN], text, tags: [], importance: 3, day, knownBy: [ANN] });
  it('joins the part and the new texts oldest first', () => {
    expect(fallbackFold('Before.', [f('Third.', 3), f('First.', 1), f('Second.', 2)], 500)).toBe('Before. First. Second. Third.');
    expect(fallbackFold('', [f('Only.', 1)], 500)).toBe('Only.');
  });
  it('fallbackFold keeps the newest text', () => {
    const out = fallbackFold('The old part of her memory that is already long.', [f('Newest thing she did.', 9)], 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('Newest thing she did.')).toBe(true);
    expect(out.startsWith(' ')).toBe(false);
    expect(fallbackFold('x', [f('short', 1)], 500)).toBe('x short');
  });
  it('never starts in the middle of a word', () => {
    const out = fallbackFold('alpha beta gamma delta', [f('epsilon zeta', 1)], 22);
    expect(out).toBe('delta epsilon zeta');
  });
});

describe('memory/rumor_text and memory/edit_dossier', () => {
  it('rumor_text is stored once', () => {
    const s = fresh();
    const f = old(s, { spread: 'fast', knownBy: [ANN] });
    const r = run(s, reg, { type: 'memory/rumor_text', payload: { factId: f.id, text: 'They say Ann kept a photo.' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.facts[0].rumor).toEqual({ text: 'They say Ann kept a photo.' });
    expect(errors(run(r.state, reg, { type: 'memory/rumor_text', payload: { factId: f.id, text: 'Again.' } }).events)).toHaveLength(1); // once
    const plain = old(s, { text: 'not spreading' });
    expect(errors(run(s, reg, { type: 'memory/rumor_text', payload: { factId: plain.id, text: 'x' } }).events)).toHaveLength(1);
    const long = run(s, reg, { type: 'memory/rumor_text', payload: { factId: f.id, text: 'x'.repeat(400) } });
    expect(long.state.memory.facts[0].rumor!.text).toHaveLength(TUNING.memory.factTextMax);
    expect(errors(run(s, reg, { type: 'memory/rumor_text', payload: { factId: f.id, text: '  ' } }).events)).toHaveLength(1);
  });

  it('edit_dossier sets a part, cuts to the caps and creates the dossier', () => {
    const s = fresh();
    const r = run(s, reg, { type: 'memory/edit_dossier', payload: { target: BEA, own: 'o'.repeat(700) } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.dossiers![BEA]).toMatchObject({ shared: '', folded: 0 });
    expect(r.state.memory.dossiers![BEA].own).toHaveLength(500);
    const w = run(r.state, reg, { type: 'memory/edit_dossier', payload: { target: '*', shared: 'The world remembers.' } });
    expect(w.state.memory.dossiers!['*'].shared).toBe('The world remembers.');
    const cleared = run(w.state, reg, { type: 'memory/edit_dossier', payload: { target: BEA, own: '' } });
    expect(cleared.state.memory.dossiers![BEA].own).toBe('');
    for (const bad of [{ target: 'nobody', own: 'x' }, { target: BEA }, { own: 'x' }, { target: BEA, own: 5 }]) {
      expect(errors(run(s, reg, { type: 'memory/edit_dossier', payload: bad }).events), JSON.stringify(bad)).toHaveLength(1);
    }
  });
});
