import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { interceptEditor } from '../../../src/engine/personal/intercept';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { pressureGate } from '../../../src/engine/personal/gates';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable, withBond } from '../../helpers/bonds';
import { campaign, ctxOf, errors, loadCore, ofType, run, setRecord, setRelation } from '../../helpers/discipline';
import { withOptions } from '../../helpers/power';
import '../../../src/engine/actions/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

/** Ann is a dominant lover with an imported profile (level 4 access), jealousy_games on. */
function fresh(over: { categories?: string[]; ownLimits?: string[] } = {}): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) u.defects = [];
  withBond(s, ANN, { leadStyle: 'dominant', ownLimits: { categories: over.ownLimits ?? [] } });
  setRelation(s, ANN, { stateId: 'lover', affinity: 70, trust: 60 });
  enable(s, ...(over.categories ?? ['jealousy_games']));
  return s;
}

/** The first seed whose intercept roll hits (the roll is seeded; the chance is 0.3). */
function hitting(s: CampaignState, payload: Record<string, unknown> = { channel: 'dm', toUnitId: BEA }) {
  for (let seed = 1; seed <= 200; seed++) {
    const t = structuredClone(s);
    t.rng = seedRng(seed);
    const r = run(t, reg, { type: 'device/intercept', payload });
    if (ofType(r.events, 'device_intercept')[0]?.hit === true) return { state: t, after: r.state, events: r.events, seed };
  }
  throw new Error('no seed hit');
}

describe('who edits', () => {
  it('no editor: no draw', () => {
    const s = campaign(reg, 4);
    const r = run(s, reg, { type: 'device/intercept', payload: { channel: 'dm', toUnitId: BEA } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'device_intercept')).toEqual([{ type: 'device_intercept', hit: false }]);
    expect(r.state.rng).toEqual(s.rng);
    expect(r.state.personal).toBeUndefined();
  });

  it('a dominant lover with jealousy_games on intercepts a DM to another soldier, never one to herself', () => {
    const s = fresh();
    expect(interceptEditor(s, reg, 'dm', BEA)).toBe(ANN);
    expect(interceptEditor(s, reg, 'dm', ANN)).toBeNull();
    expect(interceptEditor(s, reg, 'leash')).toBe(ANN);
    expect(interceptEditor(s, reg, 'recruit')).toBe(ANN);
    const h = hitting(s);
    const hit = ofType(h.events, 'device_intercept')[0];
    expect(hit).toMatchObject({ type: 'device_intercept', hit: true, unitId: ANN });
    expect(h.after.personal!.intercepts!.open).toMatchObject({ id: hit.interceptId, unitId: ANN, channel: 'dm', toUnitId: BEA, day: s.day, status: 'open' });
    expect(h.after.personal!.intercepts!.log).toEqual([{ unitId: ANN, day: s.day }]);
  });

  it('with jealousy_games off, or as her own limit, she never intercepts', () => {
    expect(interceptEditor(fresh({ categories: [] }), reg, 'dm', BEA)).toBeNull();
    expect(interceptEditor(fresh({ ownLimits: ['jealousy_games'] }), reg, 'dm', BEA)).toBeNull();
    expect(pressureGate(fresh(), reg, ANN, 'intercept')).toBeNull();
    expect(pressureGate(fresh({ categories: [] }), reg, ANN, 'intercept')).toEqual(expect.any(String));
    expect(pressureGate(fresh({ ownLimits: ['jealousy_games'] }), reg, ANN, 'intercept')).toEqual(expect.any(String));
  });

  it('picks the highest Impunity; ties go to squad order', () => {
    const s = fresh();
    withBond(s, BEA, { leadStyle: 'dominant' });
    setRelation(s, BEA, { stateId: 'lover', affinity: 70, trust: 60 });
    setRecord(s, ANN, 0);
    setRecord(s, BEA, 0);
    expect(impunityOf(s, reg, ANN)!.value).toBe(impunityOf(s, reg, BEA)!.value);
    expect(interceptEditor(s, reg, 'leash')).toBe(ANN);
    setRecord(s, BEA, 10);
    expect(interceptEditor(s, reg, 'leash')).toBe(BEA);
    // a DM to Bea is edited by Ann, the only other one
    expect(interceptEditor(s, reg, 'dm', BEA)).toBe(ANN);
  });

  it('at most one intercept a day per unit', () => {
    const h = hitting(fresh());
    const s = structuredClone(h.after);
    // still open: no new roll, no draw
    const again = run(s, reg, { type: 'device/intercept', payload: { channel: 'dm', toUnitId: BEA } });
    expect(ofType(again.events, 'device_intercept')).toEqual([{ type: 'device_intercept', hit: false }]);
    expect(again.state.rng).toEqual(s.rng);
    // closed, but she has edited today: nobody else qualifies
    const id = s.personal!.intercepts!.open!.id;
    const closed = run(s, reg, { type: 'device/resolve_intercept', payload: { id, keep: true } }).state;
    expect(interceptEditor(closed, reg, 'leash')).toBeNull();
    // the next day she may again
    const next = structuredClone(closed);
    next.day += 1;
    expect(interceptEditor(next, reg, 'leash')).toBe(ANN);
  });

  const rate = (s: CampaignState): number => {
    let hits = 0;
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const t = structuredClone(s);
      t.rng = seedRng(seed * 7919);
      if (ofType(run(t, reg, { type: 'device/intercept', payload: { channel: 'leash' } }).events, 'device_intercept')[0].hit === true) hits++;
    }
    return hits / N;
  };

  it('the base chance is 0.3', () => {
    expect(rate(fresh())).toBeGreaterThan(TUNING.personal.intercept.chance - 0.08);
    expect(rate(fresh())).toBeLessThan(TUNING.personal.intercept.chance + 0.08);
  });

  it('a high-assertiveness squad and a possessive unit hit more often, and the chance is capped', () => {
    const base = rate(fresh());
    expect(rate(withOptions(fresh(), { squad_assertiveness: 'high' }))).toBeGreaterThan(base + 0.05);
    const heavy = fresh();
    heavy.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }, { id: 'dominance_drive', arc: 'manage' }];
    const capped = rate(withOptions(heavy, { squad_assertiveness: 'high' }));
    expect(capped).toBeGreaterThan(base + 0.1);
    expect(capped).toBeLessThan(TUNING.personal.intercept.cap + 0.08);
  });
});

describe('KEEP and REVERT', () => {
  const open = (): { s: CampaignState; id: string } => {
    const h = hitting(fresh());
    return { s: h.after, id: h.after.personal!.intercepts!.open!.id };
  };
  const resolve = (s: CampaignState, id: string, keep: boolean) => run(s, reg, { type: 'device/resolve_intercept', payload: { id, keep } });

  it('KEEP closes it and dm/send stores editedBy once; a second send with the same id throws', () => {
    const { s, id } = open();
    const kept = resolve(s, id, true);
    expect(errors(kept.events)).toEqual([]);
    expect(ofType(kept.events, 'intercept_resolved')).toEqual([{ type: 'intercept_resolved', id, unitId: ANN, channel: 'dm', keep: true }]);
    expect(kept.state.relations[ANN]).toEqual(s.relations[ANN]); // no deltas
    const sent = run(kept.state, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'Edited text.', interceptId: id } });
    expect(errors(sent.events)).toEqual([]);
    expect(sent.state.dms[BEA].at(-1)).toMatchObject({ from: 'commander', text: 'Edited text.', editedBy: ANN });
    expect(sent.state.personal!.intercepts!.open).toBeUndefined();
    const twice = run(sent.state, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'Again.', interceptId: id } });
    expect(errors(twice.events)[0]).toMatchObject({ message: 'That edit is not waiting to be sent.' });
    expect(twice.state).toEqual(sent.state);
  });

  it('dm/send with an interceptId needs a kept edit of today for that recipient', () => {
    const { s, id } = open();
    // not kept yet
    expect(errors(run(s, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'x', interceptId: id } }).events)).toHaveLength(1);
    const kept = resolve(s, id, true).state;
    // a different recipient
    expect(errors(run(kept, reg, { type: 'dm/send', payload: { unitId: CAT, text: 'x', interceptId: id } }).events)).toHaveLength(1);
    // another day
    const old = structuredClone(kept);
    old.day += 1;
    expect(errors(run(old, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'x', interceptId: id } }).events)).toHaveLength(1);
    // a plain send is never touched
    const plain = run(kept, reg, { type: 'dm/send', payload: { unitId: BEA, text: 'Plain.' } });
    expect(plain.state.dms[BEA].at(-1)!.editedBy).toBeUndefined();
    expect(plain.state.personal!.intercepts!.open!.id).toBe(id);
  });

  it('REVERT applies overrode_her moderate and record +3', () => {
    const { s, id } = open();
    const before = s.relations[ANN];
    const r = resolve(s, id, false);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'intercept_resolved')).toEqual([{ type: 'intercept_resolved', id, unitId: ANN, channel: 'dm', keep: false }]);
    expect(r.state.relations[ANN].history.filter((h) => h.kind === 'event').at(-1)).toMatchObject({ type: 'overrode_her', severity: 'moderate' });
    expect(r.state.relations[ANN].trust).toBeLessThan(before.trust);
    expect(r.state.relations[ANN].affinity).toBeLessThan(before.affinity);
    expect((r.state.relations[ANN].impunityRecord ?? 0) - (before.impunityRecord ?? 0)).toBe(TUNING.personal.overrideRecord);
    expect(ofType(r.events, 'impunity_changed')).toEqual([{ type: 'impunity_changed', unitId: ANN, delta: 3, reason: 'override' }]);
    expect(r.state.personal!.intercepts!.open).toBeUndefined();
  });

  it('REVERT is amplified by her pressureMult', () => {
    const plain = open();
    const heavy = open();
    heavy.s.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    const a = resolve(plain.s, plain.id, false).state.relations[ANN];
    const b = resolve(heavy.s, heavy.id, false).state.relations[ANN];
    expect(plain.s.relations[ANN].affinity - b.affinity).toBeGreaterThan(plain.s.relations[ANN].affinity - a.affinity);
  });

  it('a Leash or recruit intercept KEEP files nothing; REVERT lets it through', () => {
    for (const channel of ['leash', 'recruit'] as const) {
      const h = hitting(fresh(), { channel });
      const id = h.after.personal!.intercepts!.open!.id;
      expect(h.after.personal!.intercepts!.open).toMatchObject({ channel });
      expect(h.after.personal!.intercepts!.open!.toUnitId).toBeUndefined();
      const leashBefore = JSON.stringify(h.after.leash);
      const kept = resolve(h.after, id, true);
      expect(kept.state.personal!.intercepts!.open).toBeUndefined(); // nothing waits to be sent
      expect(JSON.stringify(kept.state.leash)).toBe(leashBefore);
      expect(kept.state.relations[ANN]).toEqual(h.after.relations[ANN]);
      const reverted = resolve(h.after, id, false);
      expect(JSON.stringify(reverted.state.leash)).toBe(leashBefore);
      expect(ofType(reverted.events, 'impunity_changed')).toHaveLength(1);
    }
  });

  it('resolving an unknown id throws and changes nothing', () => {
    const { s } = open();
    const r = resolve(s, 'nope', true);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
  });

  it('an open intercept survives a reload and closes once', () => {
    const { s, id } = open();
    const reloaded = JSON.parse(JSON.stringify(s)) as CampaignState;
    expect(reloaded.personal!.intercepts!.open!.id).toBe(id);
    const kept = resolve(reloaded, id, true);
    expect(errors(kept.events)).toEqual([]);
    const second = resolve(kept.state, id, true);
    expect(errors(second.events)[0]).toMatchObject({ message: expect.stringContaining('not waiting') });
    const third = resolve(kept.state, id, false);
    expect(errors(third.events)).toHaveLength(1);
    expect(third.state).toEqual(kept.state);
  });
});

describe('housekeeping', () => {
  it('switching jealousy_games off drops an open intercept with no deltas', () => {
    const h = hitting(fresh());
    const before = structuredClone(h.after.relations);
    const r = run(h.after, reg, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.personal!.intercepts!.open).toBeUndefined();
    expect(r.state.relations).toEqual(before);
    expect(r.state.personal!.intercepts!.log).toEqual(h.after.personal!.intercepts!.log); // she still edited today
  });

  it('switching another category off leaves it open', () => {
    const h = hitting(fresh({ categories: ['jealousy_games', 'humiliation'] }));
    const r = run(h.after, reg, { type: 'content/set_categories', payload: { enabled: ['jealousy_games'] } });
    expect(r.state.personal!.intercepts!.open).toBeDefined();
  });

  it('the day step drops a pending intercept with no effect and trims the log', () => {
    const h = hitting(fresh());
    const s = structuredClone(h.after);
    s.personal!.intercepts!.log.push({ unitId: BEA, day: s.day - 30 });
    const before = structuredClone(s.relations);
    const events = personalDayStep(s, ctxOf(s, reg));
    expect(events.filter((e) => e.type === 'error')).toEqual([]);
    expect(s.personal!.intercepts!.open).toBeUndefined();
    expect(s.personal!.intercepts!.log).toEqual([{ unitId: ANN, day: h.after.day }]);
    expect(s.relations).toEqual(before);
  });
});
