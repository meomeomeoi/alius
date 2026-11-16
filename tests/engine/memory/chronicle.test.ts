import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { addChronicle, applyCompaction, compactionDue } from '../../../src/engine/memory';
import { MEMORY_PRESETS } from '../../../src/engine/memory/config';
import { recentLines, recordSceneRange } from '../../../src/engine/memory/scenes';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState, ChronicleEntry } from '../../../src/engine/state/types';
import { endExpedition } from '../../../src/engine/world/expedition';
import { proposeBeat } from '../../../src/engine/world/spine';
import { registerAction } from '../../../src/engine/dispatch';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';

registerAction('expedition/test_end', (d, _p, ctx) => endExpedition(d, ctx, 'retreated'));

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  return s;
};
const sceneWith = (participants: string[], endPayload: unknown = {}): CampaignState => {
  const started = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 7 } });
  expect(errors(started.events)).toEqual([]);
  const ended = run(started.state, reg, { type: 'scene/end', payload: endPayload });
  expect(errors(ended.events)).toEqual([]);
  return ended.state;
};

describe('audience of a new chronicle line', () => {
  it('a private scene line gets its participants; a group scene of the whole squad gets *', () => {
    expect(sceneWith([ANN]).memory.chronicle.at(-1)!.audience).toEqual([ANN]);
    expect(sceneWith([ANN, BEA]).memory.chronicle.at(-1)!.audience).toEqual([ANN, BEA]);
    expect(sceneWith([ANN, BEA, CAT, DEE]).memory.chronicle.at(-1)!.audience).toBe('*');
  });

  it('the whole squad means every living named unit', () => {
    const s = fresh();
    s.squad.find((u) => u.id === DEE)!.status = 'dead';
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA, CAT], origin: 'event', startIndex: 1 } });
    const ended = run(started.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.memory.chronicle.at(-1)!.audience).toBe('*');
  });

  it('an expedition line gets the party; spine and Leash lines get *', () => {
    const { state, mission } = withMission(reg, campaign(reg, 4));
    const d = depart(reg, state, mission.id);
    d.expedition!.party = [ANN, BEA];
    const after = run(d, reg, { type: 'expedition/test_end', payload: {} }).state;
    const line = after.memory.chronicle.find((c) => c.text.startsWith('Expedition to'))!;
    expect(line.audience).toEqual([ANN, BEA]);

    const s = fresh();
    proposeBeat(s, ctxOf(s, reg), 'beat_1', 'The first sample waits in the east wing.');
    expect(s.memory.chronicle.find((c) => c.text.startsWith('The first sample'))!.audience).toBe('*');

    const t = fresh();
    for (const u of t.squad) {
      setRelation(t, u.id, { trust: 50, affinity: 20, stateId: 'comrade' });
      u.defects = [{ id: 'echo_bleed', arc: 'manage' }];
    }
    t.leash.authorizationsLeft = 3;
    (t.disloyalty ??= { units: {} }).units[ANN] = { signs: [], attempts: 0, cause: { kind: 'attack', day: 1 } } as never;
    let done: CampaignState | undefined;
    for (let seed = 1; seed <= 80 && !done; seed++) {
      const u = structuredClone(t);
      u.rng = seedRng(seed);
      const r = run(u, reg, { type: 'leash/terminate', payload: { unitId: ANN } });
      if (ofType(r.events, 'unit_terminated').length === 1) done = r.state;
    }
    expect(done).toBeDefined();
    expect(done!.memory.chronicle.find((c) => /terminated through the Leash/.test(c.text))!.audience).toBe('*');
  });
});

describe('compaction by audience', () => {
  const line = (s: CampaignState, text: string, audience?: ChronicleEntry['audience'], day = 5): void => {
    addChronicle(s, { kind: 'scene', day, text, ...(audience !== undefined ? { audience } : {}) });
  };
  const due = (s: CampaignState) => compactionDue(s);
  const apply = (s: CampaignState, text: string): ChronicleEntry => {
    const d = due(s)!;
    return applyCompaction(s, { kind: d.kind, day: d.day, ...(d.toDay !== undefined ? { toDay: d.toDay } : {}), ...(d.audience !== undefined ? { audience: d.audience } : {}), text });
  };

  it('compaction never merges two audiences; the result inherits it', () => {
    const s = fresh();
    s.day = 10;
    line(s, 'a', [ANN]);
    line(s, 'b', [ANN]);
    line(s, 'c', '*');
    line(s, 'd'); // before P3b: no audience
    line(s, 'e', [BEA, ANN]);
    line(s, 'f', [ANN, BEA]); // the same audience in another order

    const first = due(s)!;
    expect(first).toMatchObject({ kind: 'day', day: 5, audience: [ANN] });
    expect(first.entries.map((e) => e.text)).toEqual(['a', 'b']);
    const a = apply(s, 'A+B');
    expect(a).toMatchObject({ kind: 'day', day: 5, audience: [ANN], text: 'A+B' });

    expect(due(s)).toMatchObject({ kind: 'day', day: 5, audience: '*' });
    expect(apply(s, 'C').audience).toBe('*');
    expect(due(s)!.audience).toBeUndefined(); // the entry without audience is its own group
    expect('audience' in apply(s, 'D')).toBe(false);
    const pair = due(s)!;
    expect(pair.entries.map((e) => e.text)).toEqual(['e', 'f']); // a set, not an order
    expect([...(apply(s, 'E+F').audience as string[])].sort()).toEqual([ANN, BEA]);

    // the day entries of the week are compacted by audience too (the week is over at day 10)
    const days = s.memory.chronicle.filter((e) => e.kind === 'day');
    expect(days).toHaveLength(4);
    const seen: Array<ChronicleEntry['audience']> = [];
    for (let guard = 0; guard < 8; guard++) {
      const d = due(s);
      if (!d) break;
      expect(d.kind).toBe('week');
      expect(d.entries.length).toBeGreaterThan(0);
      seen.push(apply(s, `week ${seen.length}`).audience);
    }
    expect(seen).toHaveLength(4);
    expect(s.memory.chronicle.map((e) => e.kind)).toEqual(['week', 'week', 'week', 'week']);
  });

  it('a compaction names its audience or it is refused', () => {
    const s = fresh();
    s.day = 10;
    line(s, 'a', [ANN]);
    line(s, 'c', '*');
    const d = due(s)!;
    expect(() => applyCompaction(s, { kind: 'day', day: d.day, text: 'no audience given' })).toThrow(/not due/);
    expect(() => applyCompaction(s, { kind: 'day', day: d.day, audience: '*', text: 'the wrong group' })).toThrow(/not due/);
    expect(() => applyCompaction(s, { kind: 'day', day: d.day, audience: [BEA], text: 'the wrong people' })).toThrow(/not due/);
    expect(s.memory.chronicle).toHaveLength(2);
    const ok = run(s, reg, { type: 'memory/compact', payload: { kind: 'day', day: d.day, audience: [ANN], text: 'ok' } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.memory.chronicle.find((e) => e.text === 'ok')!.audience).toEqual([ANN]);
    expect(errors(run(s, reg, { type: 'memory/compact', payload: { kind: 'day', day: d.day, audience: 7, text: 'bad' } }).events)).toHaveLength(1);
  });

  it('lines without an audience compact exactly as before', () => {
    const s = fresh();
    s.day = 10;
    line(s, 'x');
    line(s, 'y');
    expect(due(s)).toMatchObject({ kind: 'day', day: 5 });
    expect(due(s)!.entries).toHaveLength(2);
    expect(apply(s, 'XY')).toMatchObject({ kind: 'day', day: 5, text: 'XY' });
  });
});

describe('recentLines', () => {
  const cfg = (preset: 'short' | 'normal' | 'long' = 'normal') => MEMORY_PRESETS[preset];
  const put = (s: CampaignState, over: Partial<ChronicleEntry>): void => {
    addChronicle(s, { kind: 'scene', day: s.day, text: 'line', ...over });
  };

  it('an old entry without audience never reaches recentLines', () => {
    const s = fresh();
    s.day = 10;
    put(s, { text: 'written before P3b', day: 10 });
    put(s, { text: 'a day entry before P3b', kind: 'day', day: 9 });
    expect(recentLines(s, [ANN], cfg())).toEqual([]);
    expect(recentLines(s, 'public', cfg())).toEqual([]);
    expect(recentLines(s, [], cfg())).toEqual([]);
  });

  it('recentLines respects chronicleDays and the audience', () => {
    const s = fresh();
    s.day = 10;
    put(s, { text: 'three days ago', day: 7, audience: '*' });
    put(s, { text: 'two days ago', kind: 'day', day: 8, audience: '*' });
    put(s, { text: 'yesterday, Ann only', kind: 'day', day: 9, audience: [ANN] });
    put(s, { text: 'today, Ann and Bea', day: 10, audience: [ANN, BEA] });
    put(s, { text: 'today, everyone', day: 10, audience: '*' });
    // normal: 2 days back and today
    expect(recentLines(s, [ANN], cfg())).toEqual(['Day 8: two days ago', 'Day 9: yesterday, Ann only', 'Day 10: today, Ann and Bea', 'Day 10: today, everyone']);
    // a second unit present: only what includes both
    expect(recentLines(s, [ANN, BEA], cfg())).toEqual(['Day 8: two days ago', 'Day 10: today, Ann and Bea', 'Day 10: today, everyone']);
    expect(recentLines(s, [ANN, CAT], cfg())).toEqual(['Day 8: two days ago', 'Day 10: today, everyone']);
    // public: only '*'
    expect(recentLines(s, 'public', cfg())).toEqual(['Day 8: two days ago', 'Day 10: today, everyone']);
    // short: yesterday and today; long: three days back
    expect(recentLines(s, 'public', cfg('short'))).toEqual(['Day 10: today, everyone']);
    expect(recentLines(s, 'public', cfg('long'))).toEqual(['Day 7: three days ago', 'Day 8: two days ago', 'Day 10: today, everyone']);
  });

  it('the newest week entry is added (long: two), whatever its age', () => {
    const s = fresh();
    s.day = 40;
    put(s, { kind: 'week', day: 1, toDay: 7, text: 'week one', audience: '*' });
    put(s, { kind: 'week', day: 8, toDay: 14, text: 'week two', audience: '*' });
    put(s, { kind: 'week', day: 15, toDay: 21, text: 'week three, Ann only', audience: [ANN] });
    put(s, { kind: 'week', day: 22, toDay: 28, text: 'week four, no audience' });
    expect(recentLines(s, [ANN], cfg())).toEqual(['Days 15–21: week three, Ann only']);
    expect(recentLines(s, 'public', cfg())).toEqual(['Days 8–14: week two']);
    expect(recentLines(s, 'public', cfg('long'))).toEqual(['Days 1–7: week one', 'Days 8–14: week two']);
  });
});

describe('scene ranges', () => {
  it('scene/end records the range and summarized', () => {
    const withSummary = sceneWith([ANN], { endIndex: 12, summary: { chronicle: 'Ann talked it through.', facts: [] } });
    expect(withSummary.memory.scenes).toEqual([{ sceneId: 's1', from: 7, to: 12, summarized: true }]);
    const without = sceneWith([ANN], { endIndex: 9 });
    expect(without.memory.scenes).toEqual([{ sceneId: 's1', from: 7, to: 9, summarized: false }]);
  });

  it('no range without a usable endIndex', () => {
    for (const endIndex of [undefined, 'x', 3, -1, 1.5]) {
      expect(sceneWith([ANN], { endIndex }).memory.scenes, String(endIndex)).toBeUndefined();
    }
    expect(sceneWith([ANN], { endIndex: 7 }).memory.scenes).toEqual([{ sceneId: 's1', from: 7, to: 7, summarized: false }]);
  });

  it('scene/end keeps the last 50 ended scenes', () => {
    const s = fresh();
    for (let i = 0; i < 60; i++) recordSceneRange(s, { sceneId: `s${i}`, from: i * 10, to: i * 10 + 5, summarized: i % 2 === 0 });
    expect(s.memory.scenes).toHaveLength(50);
    expect(s.memory.scenes![0].sceneId).toBe('s10');
    expect(s.memory.scenes!.at(-1)!.sceneId).toBe('s59');
  });
});
