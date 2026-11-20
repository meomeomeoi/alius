import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineCtx, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import {
  addDefiance, answerOverride, remoteDayStep, remoteExpectations, rollCosign, rollOverride, rollVerdict, startRemoval, verdictChance, wardenDayStep, wardenOf,
} from '../../src/engine/warden';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/calendar';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat', dee: 'unit_dee' };
function swap(over: (s: CampaignState) => void = () => {}, deathRule: 'rewind_day' | 'campaign_end' = 'rewind_day'): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule, warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  over(out.state);
  return out.state;
}
class Fixed extends Rng {
  constructor(state: ReturnType<typeof seedRng>, private readonly answer: boolean) { super(state); }
  override chance(): boolean { return this.answer; }
}
const fixed = (answer: boolean, seed = 3): EngineCtx => ({ registries: reg, rng: new Fixed(seedRng(seed), answer) });
const real = (seed = 3): EngineCtx => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const types = (events: EngineEvent[]) => events.map((e) => e.type);
const count = (events: EngineEvent[], type: string) => events.filter((e) => e.type === type).length;
const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const clock = (s: CampaignState) => s.world.clocks.find((c) => c.id === 'investigation');
const mission = (status: 'completed' | 'failed', outcomeDay: number) => ({ id: `m${status}${outcomeDay}`, status, outcomeDay } as never);

describe('the investigation clock', () => {
  it('fills by a segment a day and the verdict rolls once, on the day it fills', () => {
    const s = swap();
    startRemoval(s, real(), 'death'); // 4 segments
    const log: EngineEvent[][] = [];
    for (let i = 0; i < 6; i++) { log.push(wardenDayStep(s, fixed(true))); s.day += 1; }
    expect(clock(s)?.filled).toBeUndefined(); // the clock is closed with the verdict
    expect(log.map((e) => count(e, 'verdict'))).toEqual([0, 0, 0, 1, 0, 0]);
    expect(log.map((e) => count(e, 'clock_advanced'))).toEqual([1, 1, 1, 1, 0, 0]);
    expect(s.leashswap!.status).toBe('free');
  });

  it('a hack investigation (10 segments) waits ten day ends', () => {
    const s = swap();
    startRemoval(s, real(), 'hack');
    let verdictDay = 0;
    for (let i = 1; i <= 12; i++) { if (count(wardenDayStep(s, fixed(true)), 'verdict') > 0) verdictDay = i; s.day += 1; }
    expect(verdictDay).toBe(10);
  });

  it('runs inside the real day end (director_tick)', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    s.slot = 'evening';
    const r = dispatch(s, { type: 'calendar/consume_slot', payload: {} }, reg);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    expect(count(r.events, 'clock_advanced')).toBeGreaterThanOrEqual(1);
    expect(clock(r.state)?.filled).toBe(1);
  });

  it('nothing happens outside the investigation', () => {
    const s = swap();
    expect(wardenDayStep(s, real()).some((e) => e.type === 'verdict' || e.type === 'clock_advanced')).toBe(false);
  });
});

describe('cleared', () => {
  it('frees the commander: no warden, no co-sign, flag watched, remote control over', () => {
    const s = swap();
    startRemoval(s, real(), 'report');
    const events = rollVerdict(s, fixed(true));
    expect(events).toEqual([{ type: 'verdict', outcome: 'cleared' }]);
    const ls = s.leashswap!;
    expect(ls.status).toBe('free');
    expect(ls.remote).toBeUndefined();
    expect(ls.removal).toBeUndefined();
    expect(ls.warden).toBeUndefined();
    expect(wardenOf(s)).toBeNull();
    expect(s.commander.flags).toContain('commander_watched');
    expect(clock(s)).toBeUndefined();
    const ctx = real();
    const rng = ctx.rng.state;
    expect(rollCosign(s, ctx, ID.ann, 'compel')).toEqual({ ok: true, events: [] });
    expect(ctx.rng.state).toEqual(rng);
    expect(remoteExpectations(s)).toEqual([]);
  });

  it('a second verdict does nothing', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    rollVerdict(s, fixed(true));
    expect(rollVerdict(s, fixed(true))).toEqual([]);
  });
});

describe('convicted', () => {
  it('assigns a new warden by the corporate ordering, not the one who was removed, with satisfaction 40', () => {
    const s = swap((x) => {
      unit(x, ID.bea).values.corporate = 2; // the removed warden would win the ordering
      unit(x, ID.cat).values.corporate = 1;
      unit(x, ID.dee).values.corporate = 2;
    });
    startRemoval(s, real(), 'hack'); // she stays in the squad, still active
    expect(unit(s, ID.bea).status).toBe('active');
    const events = rollVerdict(s, fixed(false));
    expect(events.find((e) => e.type === 'verdict')).toMatchObject({ outcome: 'convicted' });
    expect(events.find((e) => e.type === 'warden_assigned')).toMatchObject({ unitId: ID.dee, assignedBy: 'oversight' });
    const w = wardenOf(s)!;
    expect(w.unitId).toBe(ID.dee);
    expect(w.satisfaction).toBe(40);
    expect(w.assignedBy).toBe('oversight');
    expect(w.agenda).toBe('fallback');
    expect(w.expectations.length).toBeGreaterThan(0);
    expect(s.leashswap!.status).toBe('held');
    expect(s.leashswap!.remote).toBeUndefined();
    expect(s.commander.flags).toContain('commander_convicted');
    expect(clock(s)).toBeUndefined();
    expect(s.ended).toBeUndefined();
  });

  it('convicted with no eligible unit executes and ends the campaign (also under rewind_day)', () => {
    for (const rule of ['rewind_day', 'campaign_end'] as const) {
      const s = swap((x) => { for (const id of [ID.ann, ID.cat, ID.dee]) unit(x, id).status = 'deserted'; }, rule);
      startRemoval(s, real(), 'hack');
      const events = rollVerdict(s, fixed(false));
      expect(types(events)).toEqual(expect.arrayContaining(['verdict', 'commander_died', 'campaign_ended']));
      expect(events.find((e) => e.type === 'commander_died')).toMatchObject({ rule: 'campaign_end', cause: 'executed' });
      expect(s.ended).toMatchObject({ cause: 'executed' });
    }
  });

  it('a new warden can be removed again: a second investigation opens', () => {
    const s = swap();
    startRemoval(s, real(), 'hack');
    rollVerdict(s, fixed(false));
    expect(wardenOf(s)).not.toBeNull();
    expect(startRemoval(s, real(), 'death')).not.toEqual([]);
    expect(clock(s)).toMatchObject({ segments: 4, filled: 0 });
  });
});

describe('remote control', () => {
  it('fixed expectations: quota 0.6 and obedience 0.4, all known', () => {
    const s = swap();
    expect(remoteExpectations(s)).toEqual([]);
    startRemoval(s, real(), 'hack');
    const list = remoteExpectations(s);
    expect(list.map((x) => [x.kind, x.weight, x.known])).toEqual([['meet_quota', 0.6, true], ['obey_oversight', 0.4, true]]);
  });

  it('a mission failed in the day that ends costs a pain burst', () => {
    const s = swap();
    s.content = { enabled: ['physical_discipline_shown'] };
    startRemoval(s, real(), 'death');
    s.missions.completed.push(mission('failed', s.day));
    const stress = s.commander.stress ?? 0;
    const events = remoteDayStep(s, real());
    expect(events.find((e) => e.type === 'commander_punished')).toMatchObject({ severity: 3, remote: true });
    expect((s.commander.stress ?? 0)).toBeGreaterThan(stress);
  });

  it('with physical discipline switched off a failed mission costs no pain burst (P9d gate)', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    s.missions.completed.push(mission('failed', s.day));
    expect(remoteDayStep(s, real()).filter((e) => e.type === 'commander_punished')).toEqual([]);
  });

  it('a quota window of 7 days with no mission completed costs a reprimand, once per window', () => {
    const s = swap();
    startRemoval(s, real(), 'death');
    const start = s.day;
    const hits: number[] = [];
    for (let d = 1; d <= 14; d++) {
      s.day = start + d;
      if (remoteDayStep(s, real()).some((e) => e.type === 'commander_punished')) hits.push(d);
    }
    expect(hits).toEqual([7, 14]);
    const t = swap();
    startRemoval(t, real(), 'death');
    t.day = t.day + 7;
    t.missions.completed.push(mission('completed', t.day - 2));
    expect(remoteDayStep(t, real())).toEqual([]);
  });

  it('never overrides and never negotiates: no draw, no override, no defiance', () => {
    const s = swap();
    startRemoval(s, real(), 'hack');
    const ctx = real();
    const rng = ctx.rng.state;
    expect(rollOverride(s, ctx, { kind: 'activity', activityId: 'rest' })).toBeNull();
    expect(() => answerOverride(s, ctx, 'ov1', 'comply')).toThrow(/no override/i);
    expect(addDefiance(s, ctx, 40)).toEqual([]);
    expect(ctx.rng.state).toEqual(rng);
  });

  it('the remote directive names oversight and gives the commander no pronoun', async () => {
    const { wardenDirectives } = await import('../../src/warden/directives');
    const s = swap();
    startRemoval(s, real(), 'hack');
    const d = wardenDirectives(s, reg).find((x) => x.id === 'warden:remote');
    expect(d).toBeDefined();
    expect(d!.text).toMatch(/oversight/i);
    expect(d!.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    expect(wardenDirectives(swap(), reg).find((x) => x.id === 'warden:remote')).toBeUndefined();
  });
});

describe('verdictChance', () => {
  it('is clamp(base + 0.05 × (Cunning − 1) − 0.15 × discovered + 0.05 × allies, 0.1, 0.9) with base 0.6 / 0.75 / 0.4', () => {
    const at = (route: 'hack' | 'report' | 'death', over: (s: CampaignState) => void = () => {}) => {
      const s = swap((x) => { x.commander.socialStats.cunning = 1; over(x); });
      startRemoval(s, real(), route);
      return verdictChance(s, reg);
    };
    expect(at('hack')).toBeCloseTo(0.6, 6);
    expect(at('report')).toBeCloseTo(0.75, 6);
    expect(at('death')).toBeCloseTo(0.4, 6);
    expect(at('death', (x) => { x.commander.socialStats.cunning = 3; })).toBeCloseTo(0.5, 6);
    expect(at('death', (x) => { x.leashswap!.intrigue.discovered = 2; })).toBeCloseTo(0.25, 6);
    expect(at('hack', (x) => { x.relations[ID.ann].flags.push('warden_ally'); x.relations[ID.cat].flags.push('warden_ally'); })).toBeCloseTo(0.7, 6);
    expect(at('report', (x) => { x.commander.socialStats.cunning = 5; x.relations[ID.ann].flags.push('warden_ally'); x.relations[ID.cat].flags.push('warden_ally'); })).toBe(0.9);
    expect(at('death', (x) => { x.leashswap!.intrigue.discovered = 1; x.commander.socialStats.cunning = 1; })).toBeCloseTo(0.25, 6);
  });

  it('the verdict rate matches the formula over seeds', () => {
    const s = swap();
    startRemoval(s, real(), 'hack'); // 0.6 with Cunning 1
    const N = 2000;
    let cleared = 0;
    for (let i = 0; i < N; i++) {
      const d = structuredClone(s);
      if (rollVerdict(d, real(1000 + i)).some((e) => e.type === 'verdict' && e.outcome === 'cleared')) cleared++;
    }
    expect(cleared / N).toBeGreaterThan(0.57);
    expect(cleared / N).toBeLessThan(0.63);
  });

  it('no event carries the verdict chance', () => {
    const s = swap();
    startRemoval(s, real(), 'hack');
    const text = JSON.stringify(rollVerdict(s, real())).toLowerCase();
    expect(text).not.toContain('chance');
  });
});
