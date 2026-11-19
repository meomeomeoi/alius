import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RESERVED_EVENT_TYPES } from '../../src/content/schemas';
import type { Registries } from '../../src/content/types';
import { openRecords, recordFor } from '../../src/engine/generations';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import '../../src/engine/actions/calendar';
import '../../src/engine/actions/generations';
import { endDay } from '../helpers/loyalty';
import { campaign, errors, loadCore, ofType, run, stubExpedition } from '../helpers/world';

let core: Registries;
let base: CampaignState;
beforeAll(async () => {
  core = await loadCore();
  base = campaign(core, 4);
  base.day = 5;
});

const failed = (over: Record<string, unknown> = {}) => ({
  siteId: 'expedition.recap', key: 'r1', reason: 'refused', detail: 'the model said no', attempts: 2, at: 1000, budgetMult: 1, ...over,
});
const fail = (s: CampaignState, over: Record<string, unknown> = {}) => run(s, core, { type: 'generation/failed', payload: failed(over) });

describe('generation records', () => {
  it('a failure writes one record with no text beyond detail', () => {
    const r = fail(base, { detail: 'x'.repeat(400), raw: 'THE PROMPT AND THE RAW TEXT', prompt: 'secret', fallbackApplied: true });
    expect(errors(r.events)).toEqual([]);
    const list = r.state.generations!.records;
    expect(list).toHaveLength(1);
    expect(list[0].detail).toHaveLength(TUNING.generation.detailMax);
    expect(list[0]).toEqual({
      id: 'g1', siteId: 'expedition.recap', key: 'r1', reason: 'refused', detail: 'x'.repeat(160), attempts: 2, day: 5, slot: base.slot,
      at: 1000, budgetMult: 1, fallbackApplied: true, status: 'open',
    });
    expect(JSON.stringify(r.state.generations)).not.toMatch(/SECRET|PROMPT|RAW TEXT/i);
    expect(ofType(r.events, 'generation_failed')).toEqual([{ type: 'generation_failed', id: 'g1', siteId: 'expedition.recap', key: 'r1', reason: 'refused' }]);
  });

  it('a quiet failure is marked quiet, and a bad reason is refused', () => {
    expect(fail(base, { quiet: true }).state.generations!.records[0].quiet).toBe(true);
    const bad = fail(base, { reason: 'because' });
    expect(errors(bad.events)).toHaveLength(1);
    expect(bad.state.generations).toBeUndefined();
    expect(errors(fail(base, { attempts: 0 }).events)).toHaveLength(1);
  });

  it('the same key updates, not duplicates', () => {
    let s = fail(base, { attempts: 2, reason: 'refused', at: 1000 }).state;
    const again = fail(s, { attempts: 1, reason: 'truncated', at: 2000, detail: 'cut', budgetMult: 2 });
    s = again.state;
    expect(s.generations!.records).toHaveLength(1);
    expect(s.generations!.records[0]).toMatchObject({ id: 'g1', attempts: 3, reason: 'truncated', at: 2000, detail: 'cut', budgetMult: 2 });
    expect(s.generations!.seq).toBe(1);
    expect(ofType(again.events, 'generation_failed')[0]).toMatchObject({ id: 'g1', reason: 'truncated' });
    s = fail(s, { key: 'r2' }).state;
    expect(s.generations!.records.map((r) => r.id)).toEqual(['g1', 'g2']);
  });

  it('cap 20 drops the oldest', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    let s = base;
    for (let i = 0; i < 21; i++) s = fail(s, { key: `k${i}` }).state;
    expect(s.generations!.records).toHaveLength(TUNING.generation.maxRecords);
    expect(s.generations!.records[0].key).toBe('k1');
    expect(s.generations!.records[19].key).toBe('k20');
    expect(s.generations!.seq).toBe(21);
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('close by site and key closes every open match', () => {
    let s = fail(base, { siteId: 'a.one', key: 'k' }).state;
    s = fail(s, { siteId: 'a.one', key: 'other' }).state;
    s = fail(s, { siteId: 'b.two', key: 'k' }).state;
    s.generations!.records.push({ ...s.generations!.records[0], id: 'g9' }); // a second open match
    const r = run(s, core, { type: 'generation/close', payload: { siteId: 'a.one', key: 'k', outcome: 'applied' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.generations!.records.map((x) => x.id)).toEqual(['g2', 'g3']);
    expect(ofType(r.events, 'generation_closed').map((e) => e.id)).toEqual(['g1', 'g9']);
    expect(ofType(r.events, 'generation_closed')[0]).toMatchObject({ outcome: 'applied', siteId: 'a.one', key: 'k' });
  });

  it('close by id, a close that matches nothing changes nothing', () => {
    const s = fail(base).state;
    const none = run(s, core, { type: 'generation/close', payload: { id: 'g77', outcome: 'dropped' } });
    expect(none.state).toEqual(s);
    expect(none.events).toEqual([]);
    const gone = run(s, core, { type: 'generation/close', payload: { id: 'g1', outcome: 'kept_fallback' } });
    expect(gone.state.generations!.records).toEqual([]);
    expect(ofType(gone.events, 'generation_closed')).toHaveLength(1);
    expect(errors(run(s, core, { type: 'generation/close', payload: { id: 'g1', outcome: 'whatever' } }).events)).toHaveLength(1);
    expect(errors(run(s, core, { type: 'generation/close', payload: { outcome: 'dropped' } }).events)).toHaveLength(1);
  });

  it('expire keeps the record a day, the sweep removes it after', () => {
    let s = fail(base).state;
    s.slot = 'evening';
    const ex = run(s, core, { type: 'generation/expire', payload: { id: 'g1', why: 'The scene was closed. '.repeat(20) } });
    expect(errors(ex.events)).toEqual([]);
    s = ex.state;
    const rec = s.generations!.records[0];
    expect(rec).toMatchObject({ status: 'expired', reason: 'expired', expiredDay: 5 });
    expect(rec.expiredWhy!.length).toBeLessThanOrEqual(TUNING.generation.detailMax);
    expect(ofType(ex.events, 'generation_expired')).toHaveLength(1);
    expect(openRecords(s)).toEqual([]);
    expect(recordFor(s, 'expedition.recap', 'r1')?.id).toBe('g1');

    s = endDay(s, core); // the end of day 5: it was shown the rest of that day
    expect(s.day).toBe(6);
    expect(s.generations!.records).toHaveLength(1);
    s.slot = 'evening';
    s = endDay(s, core); // the end of day 6: and all of the next
    expect(s.day).toBe(7);
    expect(s.generations!.records).toEqual([]);
  });

  it('the sweep leaves open records alone and writes nothing without any', () => {
    let s = fail(base).state;
    s.slot = 'evening';
    s = endDay(s, core);
    expect(s.generations!.records).toHaveLength(1);
    const plain = campaign(core, 4);
    plain.slot = 'evening';
    expect(endDay(plain, core).generations).toBeUndefined();
  });

  it('allowed in combat, in an expedition and on an ended campaign', () => {
    const combat = structuredClone(base);
    combat.combat = {} as never;
    const out = structuredClone(base);
    stubExpedition(out);
    const ended = structuredClone(base);
    ended.ended = { day: 5, cause: 'terminated' } as never;
    for (const s of [combat, out, ended]) {
      const a = fail(s);
      expect(errors(a.events)).toEqual([]);
      const e = run(a.state, core, { type: 'generation/expire', payload: { id: 'g1', why: 'later' } });
      expect(errors(e.events)).toEqual([]);
      expect(errors(run(e.state, core, { type: 'generation/close', payload: { id: 'g1', outcome: 'dropped' } }).events)).toEqual([]);
    }
    // the guards still hold for everything else
    expect(errors(run(ended, core, { type: 'calendar/consume_slot' }).events)[0]).toMatchObject({ code: 'campaign_ended' });
  });

  it('no rng draw', () => {
    const before = structuredClone(base.rng);
    let s = fail(base).state;
    expect(s.rng).toEqual(before);
    s = run(s, core, { type: 'generation/expire', payload: { id: 'g1', why: 'w' } }).state;
    expect(s.rng).toEqual(before);
    s = run(s, core, { type: 'generation/close', payload: { id: 'g1', outcome: 'dropped' } }).state;
    expect(s.rng).toEqual(before);
  });

  it('old save without generations reads none', () => {
    expect((base as { generations?: unknown }).generations).toBeUndefined();
    expect(openRecords(base)).toEqual([]);
    expect(recordFor(base, 'x', 'y')).toBeUndefined();
    expect(run(base, core, { type: 'generation/close', payload: { siteId: 'x', key: 'y', outcome: 'applied' } }).events).toEqual([]);
  });

  it('openRecords filters by site; the events are reserved names', () => {
    let s = fail(base, { siteId: 'a.one' }).state;
    s = fail(s, { siteId: 'b.two' }).state;
    expect(openRecords(s, { siteId: 'b.two' }).map((r) => r.id)).toEqual(['g2']);
    for (const t of ['generation_failed', 'generation_closed', 'generation_expired']) expect(RESERVED_EVENT_TYPES).toContain(t);
  });
});
