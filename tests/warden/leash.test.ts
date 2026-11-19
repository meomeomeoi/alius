import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import { leashLog } from '../../src/engine/leash/weekly';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { applyCommanderPunishment, cosignChance, leashCommander, overrideOpen, refreshWardenLeash, rollCosign, wardenOf, type Expectation } from '../../src/engine/warden';
import { fixtureCombat } from '../helpers/combat';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/leash';
import '../../src/engine/actions/scene';
import '../../src/engine/actions/combat';
import '../../src/engine/actions/dilemma';
import '../../src/engine/actions/calendar';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat' };
function swap(over: (s: CampaignState) => void = () => {}, seed = 9): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!out.ok) throw new Error(out.errors.join('; '));
  const w = wardenOf(out.state)!;
  w.satisfaction = 50;
  out.state.relations[ID.bea].affinity = 0;
  over(out.state);
  return out.state;
}
const ctxOf = (s: CampaignState, seed = 3) => ({ registries: reg, rng: new Rng(seedRng(seed)) });
const run = (s: CampaignState, a: Action) => dispatch(s, a, reg);
const err = (events: EngineEvent[]) => events.find((e) => e.type === 'error') as { message?: string } | undefined;
const types = (events: EngineEvent[]) => events.map((e) => e.type);

describe('cosignChance', () => {
  it('follows the formula and clamps to 0.1…0.95', () => {
    const s = swap();
    expect(cosignChance(s, reg, ID.ann)).toBeCloseTo(0.5);
    wardenOf(s)!.satisfaction = 100;
    expect(cosignChance(s, reg, ID.ann)).toBeCloseTo(0.7); // + 0.004 × 50
    wardenOf(s)!.satisfaction = 50;
    s.squad.find((u) => u.id === ID.bea)!.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: -1, corporate: 2, sacrifice: 0 };
    expect(cosignChance(s, reg, ID.ann)).toBeCloseTo(0.5 + 0.2 + 0.1);
    s.relations[ID.bea].affinity = 100;
    expect(cosignChance(s, reg, ID.ann)).toBeCloseTo(0.9); // + 0.001 × 100
    wardenOf(s)!.satisfaction = 100;
    expect(cosignChance(s, reg, ID.ann)).toBe(0.95);
    s.squad.find((u) => u.id === ID.bea)!.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 3, corporate: -3, sacrifice: 0 };
    s.relations[ID.bea].affinity = -100;
    wardenOf(s)!.satisfaction = 0;
    expect(cosignChance(s, reg, ID.ann)).toBe(0.1);
  });
});

describe('rollCosign', () => {
  it('the rate matches the formula over seeds', () => {
    const s = swap();
    let ok = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (rollCosign(structuredClone(s), ctxOf(s, i + 1), ID.ann, 'compel').ok) ok++;
    expect(ok / n).toBeGreaterThan(0.47);
    expect(ok / n).toBeLessThan(0.53);
  });

  it('events: leash_cosigned or leash_cosign_denied, and no chance in them', () => {
    const s = swap();
    for (let seed = 1; seed < 30; seed++) {
      const r = rollCosign(structuredClone(s), ctxOf(s, seed), ID.ann, 'compel');
      const e = r.events.find((x) => x.type === 'leash_cosigned' || x.type === 'leash_cosign_denied')!;
      expect(e.type).toBe(r.ok ? 'leash_cosigned' : 'leash_cosign_denied');
      expect(JSON.stringify(e)).not.toMatch(/chance|0\.\d/);
    }
  });

  it('a request against her is denied without a draw', () => {
    const s = swap();
    const ctx = ctxOf(s, 5);
    const r = rollCosign(s, ctx, ID.bea, 'suppress');
    expect(r.ok).toBe(false);
    expect(types(r.events)).toContain('leash_cosign_denied');
    expect(ctx.rng.state).toEqual(seedRng(5));
  });

  it('no warden in service (investigation, free, default mode): ok, no draw', () => {
    for (const mutate of [(s: CampaignState) => { s.leashswap!.status = 'investigation'; }, (s: CampaignState) => { s.leashswap!.status = 'free'; }, (s: CampaignState) => { delete s.leashswap; }]) {
      const s = swap();
      mutate(s);
      const ctx = ctxOf(s, 5);
      expect(rollCosign(s, ctx, ID.ann, 'compel')).toEqual({ ok: true, events: [] });
      expect(ctx.rng.state).toEqual(seedRng(5));
    }
  });
});

/** A scene with Ann that she refused an order in, so the squad Leash can compel her. */
function refused(seed: number, over: (s: CampaignState) => void = () => {}): CampaignState {
  const s = swap(over, seed);
  const started = run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.ann], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  started.scene!.refusals = [{ unitId: ID.ann, exchange: 1 }];
  return started;
}

describe('the co-sign on squad requests', () => {
  it('a denial spends nothing and logs a denied entry with cc warden; a co-sign lets the request run', () => {
    let denied = false;
    let signed = false;
    for (let seed = 1; seed < 80 && !(denied && signed); seed++) {
      const s = refused(seed, (x) => { wardenOf(x)!.satisfaction = 0; }); // chance 0.3
      const left = s.leash.authorizationsLeft;
      const r = run(s, { type: 'leash/compel', payload: { unitId: ID.ann } });
      expect(err(r.events)).toBeUndefined();
      if (types(r.events).includes('leash_cosign_denied')) {
        denied = true;
        expect(r.state.leash.authorizationsLeft).toBe(left);
        const entry = leashLog(r.state).at(-1)!;
        expect(entry).toMatchObject({ unitId: ID.ann, kind: 'compel', outcome: 'denied', cc: 'warden' });
        expect(r.state.scene!.refusals).toHaveLength(1); // the refusal stands
        expect(types(r.events)).not.toContain('scene_compelled');
      } else {
        signed = true;
        expect(types(r.events)).toContain('leash_cosigned');
        expect(types(r.events)).toContain('scene_compelled');
        expect(r.state.leash.authorizationsLeft).toBe(left - 1);
      }
    }
    expect(denied).toBe(true);
    expect(signed).toBe(true);
  });

  it('a request that cannot be filed throws before the warden is asked (no draw)', () => {
    const s = swap();
    const r = run(s, { type: 'leash/compel', payload: { unitId: ID.ann } }); // no scene, no refusal
    expect(err(r.events)).toBeDefined();
    expect(r.state).toBe(s);
  });

  it('a request against the warden is denied at once, whatever the seed', () => {
    const s = swap();
    const started = run(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: [ID.bea], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    started.scene!.refusals = [{ unitId: ID.bea, exchange: 1 }];
    const r = run(started, { type: 'leash/compel', payload: { unitId: ID.bea } });
    expect(types(r.events)).toContain('leash_cosign_denied');
    expect(r.state.rng).toEqual(started.rng);
    expect(leashLog(r.state).at(-1)).toMatchObject({ outcome: 'denied', cc: 'warden' });
  });

  it('no mode: the request runs as before and draws nothing extra', () => {
    const s = refused(4);
    delete s.leashswap;
    const r = run(s, { type: 'leash/compel', payload: { unitId: ID.ann } });
    expect(types(r.events)).not.toContain('leash_cosigned');
    expect(types(r.events)).toContain('scene_compelled');
  });

  it('combat/compel asks once and the denial leaves the refusal standing', () => {
    for (let seed = 1; seed < 120; seed++) {
      const s = swap((x) => { wardenOf(x)!.satisfaction = 0; }, seed);
      const cs = fixtureCombat({ squad: [{ cid: 's1', unitId: ID.ann }, { cid: 's2', unitId: ID.cat }], enemies: [{ cid: 'e1' }], cp: 3 });
      cs.phase = 'awaiting';
      cs.awaitingCid = 's2';
      cs.lastRefusal = { orderId: 'focus_fire', targetCid: 's1' };
      s.combat = cs;
      const r = run(s, { type: 'combat/compel', payload: {} });
      if (!types(r.events).includes('leash_cosign_denied')) continue;
      expect(r.state.combat!.lastRefusal).toEqual({ orderId: 'focus_fire', targetCid: 's1', cosignDenied: true });
      expect(r.state.combat!.compels ?? []).toHaveLength(0);
      expect(r.state.leash.authorizationsLeft).toBe(s.leash.authorizationsLeft);
      expect(leashLog(r.state).at(-1)).toMatchObject({ outcome: 'denied', cc: 'warden', context: 'combat' });
      const again = run(r.state, { type: 'combat/compel', payload: {} });
      expect(err(again.events)?.message).toMatch(/already denied/i);
      return;
    }
    throw new Error('never denied');
  });
});

describe('the Leash on the commander', () => {
  it('compel: compelled, one authorization used, reported', () => {
    const s = swap();
    const d = structuredClone(s);
    const events = leashCommander(d, ctxOf(d), 'compel');
    expect(wardenOf(d)!.compelled).toBe(true);
    expect(wardenOf(d)!.leashLeft).toBe(wardenOf(s)!.leashLeft - 1);
    expect(events.find((e) => e.type === 'commander_leashed')).toMatchObject({ kind: 'compel' });
  });

  it('refuses when no authorization is left', () => {
    const s = swap((x) => { wardenOf(x)!.leashLeft = 0; });
    expect(() => leashCommander(s, ctxOf(s), 'compel')).toThrow();
  });

  it('compelled accepts only COMPLY at the next override, and clears after one', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = swap((x) => {
        const w = wardenOf(x)!;
        w.expectations = [{ id: 'e1', kind: 'keep_me_close', weight: 0.5, source: 'values', known: false } as Expectation];
        w.satisfaction = 0;
      }, seed);
      const hit = run(s, { type: 'activity/do', payload: { activityId: 'train', companionId: ID.ann } });
      const ov = overrideOpen(hit.state);
      if (!ov) continue;
      const compelled = structuredClone(hit.state);
      leashCommander(compelled, ctxOf(compelled), 'compel');
      expect(err(run(compelled, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'defy' } }).events)).toBeDefined();
      const done = run(compelled, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'comply' } });
      expect(err(done.events)).toBeUndefined();
      expect(wardenOf(done.state)!.compelled).toBeUndefined();
      return;
    }
    throw new Error('no seed overrides');
  });

  it('compelled forces her pick at a major dilemma (only COMPLY); with nothing else to choose it just clears', () => {
    const open = (s: CampaignState, picksOther: boolean): void => {
      s.dilemmas = { seq: 1, open: {
        id: 'd1', templateId: 't', scale: 'major', context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ID.ann], beatId: 'b',
        options: [
          { label: 'cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'major', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
          { label: picksOther ? 'spare' : 'cut again', effects: picksOther ? [] : [{ type: 'unit_event', event: 'sided_against', severity: 'major', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
        ],
      } as never };
    };
    const s = swap((x) => { wardenOf(x)!.expectations = [{ id: 'e1', kind: 'meet_quota', weight: 0.3, source: 'values', known: false } as Expectation]; open(x, true); });
    leashCommander(s, ctxOf(s), 'compel');
    const r = run(s, { type: 'dilemma/choose', payload: { id: 'd1', index: 0 } });
    expect(err(r.events)).toBeUndefined();
    const ov = overrideOpen(r.state)!;
    expect(ov.alternative).toEqual({ kind: 'dilemma', index: 1 });
    expect(err(run(r.state, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'defy' } }).events)).toBeDefined();
    const done = run(r.state, { type: 'warden/answer', payload: { overrideId: ov.id, answer: 'comply' } });
    expect(done.events.find((e) => e.type === 'dilemma_resolved')).toMatchObject({ option: 1 });
    expect(wardenOf(done.state)!.compelled).toBeUndefined();
    // nothing else to choose: the choice stands and the compulsion is spent
    const t = swap((x) => { wardenOf(x)!.expectations = []; open(x, false); const o = x.dilemmas!.open!; o.options = [o.options![0]]; });
    leashCommander(t, ctxOf(t), 'compel');
    const only = run(t, { type: 'dilemma/choose', payload: { id: 'd1', index: 0 } });
    expect(err(only.events)).toBeUndefined();
    expect(wardenOf(only.state)!.compelled).toBeUndefined();
    expect(only.events.map((e) => e.type)).toContain('dilemma_resolved');
  });

  it('suppress ends the day and adds commander stress', () => {
    const s = swap();
    const d = structuredClone(s);
    const events = leashCommander(d, ctxOf(d), 'suppress');
    expect(d.day > s.day || d.slot === 'night').toBe(true);
    expect(d.commander.stress).toBe((s.commander.stress ?? 0) + 10);
    expect(events.find((e) => e.type === 'commander_leashed')).toMatchObject({ kind: 'suppress' });
    expect(wardenOf(d)!.leashLeft).toBe(wardenOf(s)!.leashLeft - 1);
  });

  it('the Leash punishments use it: leash_compel sets compelled', () => {
    const s = swap();
    const d = structuredClone(s);
    expect(types(dispatchPunish(d, 'leash_compel'))).toContain('commander_leashed');
    expect(wardenOf(d)!.compelled).toBe(true);
  });

  it('a suppress punishment is not picked while a scene, a fight or a run is open', async () => {
    const { pickPunishment } = await import('../../src/engine/warden');
    const s = swap((x) => { wardenOf(x)!.punishLog = [{ punishmentId: 'x', day: 1, severity: 1 }]; }); // rotation moves to the second severity-4 entry
    expect(pickPunishment(s, reg, 4)).toBe('leash_suppress');
    s.scene = {} as never;
    expect(pickPunishment(s, reg, 4)).toBe('leash_compel');
  });
});

const dispatchPunish = (d: CampaignState, id: string): EngineEvent[] => applyCommanderPunishment(d, ctxOf(d), id);

describe('leashLeft refreshes with the squad Leash', () => {
  it('refreshWardenLeash refills the week and follows the squad\'s refresh day', () => {
    const s = swap((x) => { wardenOf(x)!.leashLeft = 0; x.leash.refreshDay = 14; });
    const d = structuredClone(s);
    expect(types(refreshWardenLeash(d, reg))).toContain('warden_leash_refreshed');
    expect(wardenOf(d)!.leashLeft).toBe(2);
    expect(wardenOf(d)!.leashRefreshDay).toBe(14);
  });

  it('the day end does it on the same day as the squad Leash (and not before)', () => {
    const s = swap((x) => { wardenOf(x)!.leashLeft = 0; x.slot = 'evening'; });
    const early = run(structuredClone({ ...s, leash: { ...s.leash, refreshDay: s.day + 5 } }), { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(wardenOf(early.state)!.leashLeft).toBe(0);
    const due = run({ ...s, leash: { ...s.leash, refreshDay: s.day + 1 } }, { type: 'calendar/consume_slot', payload: { slots: 1, reason: 'test' } });
    expect(types(due.events)).toContain('leash_refreshed');
    expect(wardenOf(due.state)!.leashLeft).toBe(2);
  });

  it('nothing refreshes with no warden', () => {
    const s = swap();
    delete s.leashswap;
    expect(refreshWardenLeash(s, reg)).toEqual([]);
  });
});
