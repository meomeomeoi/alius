import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { applyMoment, capTrust, headStartTransition, pickMoments } from '../../../src/engine/headStart/moments';
import { journalLines } from '../../../src/engine/memory/journal';
import type { CampaignState, Relation, Unit } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
type Days = 7 | 14 | 30;
type Impression = 'positive' | 'negative' | 'neutral';
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

const world = (values: Partial<Unit['values']> = {}): CampaignState => {
  const s = campaign(reg, 2);
  const u = s.squad.find((x) => x.id === ANN)!;
  u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0, ...values };
  u.defects = [];
  return s;
};
const ann = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;
const withMoments = (entries: unknown[]): Registries => ({ ...reg, headStartMoments: new Map((entries as Entry[]).map((e) => [e.id, e])) });
const pick = (s: CampaignState, r: Registries, days: Days, seed: number, impression: Impression = 'neutral', knowsCrime = false) =>
  pickMoments(s, r, ann(s), { days, seed, impression, knowsCrime });
const fixture = (id: string, over: Record<string, unknown> = {}) => ({
  id, sign: 'any', eventDelta: { type: 'listened', severity: 'minor', actor: 'commander' }, importance: 2, tags: [], fallback: 'x', description: 'x', ...over,
});

describe('pickMoments', () => {
  it('N 7 picks one, N 30 picks two, N 14 picks one or two by hash', () => {
    const s = world();
    for (const seed of SEEDS) {
      expect(pick(s, reg, 7, seed)).toHaveLength(1);
      expect(pick(s, reg, 30, seed)).toHaveLength(2);
    }
    expect(new Set(SEEDS.map((seed) => pick(s, reg, 14, seed).length))).toEqual(new Set([1, 2]));
    expect(pick(s, reg, 14, 3)).toEqual(pick(s, reg, 14, 3)); // deterministic
  });

  it('a positive impression never picks a negative moment, a negative one never a positive', () => {
    const s = world();
    for (const seed of SEEDS) {
      expect(pick(s, reg, 30, seed, 'positive').map((m) => m.sign)).not.toContain('negative');
      expect(pick(s, reg, 30, seed, 'negative').map((m) => m.sign)).not.toContain('positive');
    }
  });

  it('a neutral impression may pick any sign', () => {
    const s = world();
    const signs = new Set(SEEDS.flatMap((seed) => pick(s, reg, 30, seed, 'neutral').map((m) => m.sign)));
    expect(signs).toEqual(new Set(['positive', 'negative', 'any']));
  });

  it('night_talk needs at least 7 days, covered_for_her 14', () => {
    const s = world();
    const ids = (days: Days) => new Set(SEEDS.flatMap((seed) => pick(s, reg, days, seed, 'positive').map((m) => String(m.id))));
    expect(ids(7).has('covered_for_her')).toBe(false);
    expect(ids(7).has('night_talk')).toBe(true);
    expect(ids(14).has('covered_for_her')).toBe(true);
    const r = withMoments([fixture('late', { requires: { minDays: 14 } })]);
    expect(pick(s, r, 7, 1)).toHaveLength(0);
    expect(pick(s, r, 14, 1)).toHaveLength(1);
  });

  it('learned_the_crime only when she knows', () => {
    const s = world();
    const ids = (knows: boolean) => new Set(SEEDS.flatMap((seed) => pick(s, reg, 30, seed, 'neutral', knows).map((m) => String(m.id))));
    expect(ids(false).has('learned_the_crime')).toBe(false);
    expect(ids(true).has('learned_the_crime')).toBe(true);
  });

  it('values requirements hold', () => {
    const r = withMoments([fixture('kind', { requires: { values: { mercy: '+' } } })]);
    expect(pick(world({ mercy: 0 }), r, 7, 1)).toHaveLength(0);
    expect(pick(world({ mercy: -1 }), r, 7, 1)).toHaveLength(0);
    expect(pick(world({ mercy: 1 }), r, 7, 1)).toHaveLength(1);
    const cold = withMoments([fixture('cold', { requires: { values: { mercy: '-' } } })]);
    expect(pick(world({ mercy: -2 }), cold, 7, 1)).toHaveLength(1);
    expect(pick(world({ mercy: 2 }), cold, 7, 1)).toHaveLength(0);
  });

  it('probe-tagged entries are never picked', () => {
    const r = withMoments([fixture('probe_x', { tags: ['probe'] })]);
    for (const seed of SEEDS) expect(pick(world(), r, 30, seed)).toHaveLength(0);
  });

  it('no repeats, and fewer eligible than the count gives what there is', () => {
    const s = world();
    for (const seed of SEEDS) {
      const ids = pick(s, reg, 30, seed).map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(pick(s, withMoments([fixture('only')]), 30, 1).map((m) => m.id)).toEqual(['only']);
    expect(pick(s, withMoments([]), 30, 1)).toEqual([]);
  });
});

describe('applyMoment', () => {
  const moment = (id: string) => reg.headStartMoments.get(id)!;

  it("moves the axes by its row through the modifier chain and leaves a history line", () => {
    const s = world();
    const before = { ...s.relations[ANN] };
    applyMoment(s, reg, ANN, moment('shared_meal')); // listened, minor: trust 1, affinity 1
    const r = s.relations[ANN];
    expect(r.trust).toBe(before.trust + 1);
    expect(r.affinity).toBe(before.affinity + 1);
    expect(r.attraction).toBe(before.attraction);
    expect(r.history[r.history.length - 1]).toEqual({ day: 1, kind: 'event', type: 'listened', severity: 'minor' });
  });

  it('a unit-side moment runs with her as the actor', () => {
    const s = world();
    const trust = s.relations[ANN].trust;
    applyMoment(s, reg, ANN, moment('night_talk'));
    expect(s.relations[ANN].history.at(-1)).toMatchObject({ kind: 'event', type: 'shared_secret' });
    expect(s.relations[ANN].trust).toBeGreaterThanOrEqual(trust);
  });

  it('adds no stress and enters no state by event', () => {
    const s = world();
    const stress = ann(s).stress;
    const state = s.relations[ANN].stateId;
    const since = s.relations[ANN].stateSince;
    for (const id of reg.headStartMoments.keys()) applyMoment(s, reg, ANN, moment(id));
    expect(ann(s).stress).toBe(stress);
    expect(s.relations[ANN].stateId).toBe(state);
    expect(s.relations[ANN].stateSince).toBe(since);
  });

  it("journalLines shows the moment's journal phrase", () => {
    const s = world();
    applyMoment(s, reg, ANN, moment('shared_meal'));
    expect(journalLines(s, reg, ANN, { n: 5, evidence: false })).toEqual(['the commander listened to her (day 1)']);
  });
});

describe('capTrust', () => {
  const rel = (trust: number) => ({ trust }) as Relation;
  it('never lifts past 55', () => {
    const r = rel(61);
    capTrust(r, 40);
    expect(r.trust).toBe(55);
  });
  it('never lowers a trust that started above it', () => {
    const r = rel(60);
    capTrust(r, 58);
    expect(r.trust).toBe(58);
    const low = rel(30);
    capTrust(low, 58);
    expect(low.trust).toBe(30);
  });
});

describe('headStartTransition', () => {
  const set = (s: CampaignState, over: Partial<Relation>) => Object.assign(s.relations[ANN], over);

  it('a stranger with trust 20 or more becomes a comrade', () => {
    const s = world();
    set(s, { trust: 22, stateId: 'stranger', stateSince: -13 });
    const events = headStartTransition(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('comrade');
    expect(s.relations[ANN].stateSince).toBe(1);
    expect(events.map((e) => e.type)).toContain('relation_state_changed');
  });

  it('a stranger below 20 stays', () => {
    const s = world();
    set(s, { trust: 15, affinity: 0, stateId: 'stranger', stateSince: -13 });
    headStartTransition(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('stranger');
  });

  it('a negative impression may estrange, and stateSince is day 1', () => {
    const s = world();
    set(s, { trust: 10, affinity: -35, stateId: 'stranger', stateSince: -13 });
    headStartTransition(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('estranged');
    expect(s.relations[ANN].stateSince).toBe(1);
  });

  it('at most one transition', () => {
    const s = world();
    set(s, { trust: 50, stateId: 'stranger', stateSince: -13 });
    headStartTransition(s, reg, ANN);
    expect(s.relations[ANN].stateId).toBe('comrade'); // trusted (trust 45, 3 days) waits for the player's days
  });

  it('re-bases the loyalty band from her trust first', () => {
    const s = world();
    set(s, { trust: 5, stateId: 'stranger', stateSince: -13, loyaltyBand: 'steady' });
    headStartTransition(s, reg, ANN);
    expect(s.relations[ANN].loyaltyBand).toBe('breaking');
  });

  it('a romantic automatic target is refused', () => {
    const s = world();
    set(s, { trust: 50, stateId: 'comrade', stateSince: -5 });
    const romantic = { ...reg, relationshipStates: new Map(reg.relationshipStates) };
    romantic.relationshipStates.set('trusted', { ...reg.relationshipStates.get('trusted')!, bondTier: 'romantic' });
    headStartTransition(s, romantic, ANN);
    expect(s.relations[ANN].stateId).toBe('comrade');
    // the same unit enters it when the state is not romantic
    const plain = world();
    Object.assign(plain.relations[ANN], { trust: 50, stateId: 'comrade', stateSince: -5 });
    headStartTransition(plain, reg, ANN);
    expect(plain.relations[ANN].stateId).toBe('trusted');
  });
});
