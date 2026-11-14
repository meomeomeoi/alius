import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { loyaltyDayStep } from '../../../src/engine/loyalty/desertion';
import { loyalUnits, mutinyReady, mutinyTrigger, sympathizers } from '../../../src/engine/loyalty/mutiny';
import { loyaltyRecord } from '../../../src/engine/loyalty/state';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA, CAT, DEE] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4, { crimeId: 'purge' });
  base.day = 10;
  for (const u of base.squad) {
    setRelation(base, u.id, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady', stateSince: 1 });
    u.defects = [{ id: 'echo_bleed', arc: 'manage' }];
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  }
  base.leash.authorizationsLeft = 3;
});

const unit = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const clone = (seed = 1): CampaignState => {
  const s = structuredClone(base);
  s.rng = seedRng(seed);
  return s;
};
const step = (s: CampaignState) => loyaltyDayStep(s, ctxOf(s, reg));
const act = (s: CampaignState, type: string, payload?: unknown) => run(s, reg, { type, payload });

/** Ann despises the commander for `inState` days, was Leashed `triggerAgo` days ago and has given two warning signs. */
function brewing(opts: { seed?: number; inState?: number; triggerAgo?: number | null; signs?: 0 | 1 | 2; state?: string } = {}): CampaignState {
  const s = clone(opts.seed);
  const state = opts.state ?? 'despises';
  setRelation(s, ANN, { trust: 5, affinity: -70, stateId: state, band: 'breaking', stateSince: s.day - (opts.inState ?? 5) });
  const rec = loyaltyRecord(s, ANN);
  if (opts.triggerAgo !== null) rec.trigger = { kind: 'leash', day: s.day - (opts.triggerAgo ?? 1) };
  const n = opts.signs ?? 2;
  for (let i = 0; i < n; i++) rec.signs.push({ day: s.day - (n - i), about: 'mutiny', kind: 'fact', signId: i === 0 ? 'sign_mutiny_fact_1' : 'sign_mutiny_fact_2' });
  return s;
}
/** Two low-Trust wavering unit with Ann: the sympathizers; Dee stays loyal. */
function withSympathizers(s: CampaignState, trusts: Record<string, number> = { [BEA]: 10, [CAT]: 5 }): CampaignState {
  for (const [id, trust] of Object.entries(trusts)) setRelation(s, id, { trust, band: 'wavering' });
  return s;
}
/** The open night mutiny, as the day step would leave it. */
function opened(s: CampaignState): CampaignState {
  const entry = { id: 'n_m', unitId: ANN, kind: 'mutiny', priority: 100, framing: 'f', ignore: { event: 'dismissed', severity: 'moderate' as const }, expiresDay: s.day + 2 };
  s.calendar.nightEvent = entry;
  s.slot = 'night';
  s.disloyalty = { ...(s.disloyalty ?? { units: {} }), open: { kind: 'mutiny', unitId: ANN, day: s.day, at: 'night', nightEntryId: entry.id, sympathizers: sympathizers(s, ANN) } };
  return s;
}
const fightPayload = (s: CampaignState, ids?: string[], over: Record<string, unknown> = {}) => {
  const f = ids ?? loyalUnits(s, ANN);
  return { formation: { front: f.slice(0, 2), back: f.slice(2) }, coverId: f[0], ...over };
};

describe('conditions', () => {
  it('no mutiny from estranged, however low the numbers', () => {
    const s = brewing({ state: 'estranged' });
    expect(mutinyReady(s, reg, ANN)).toBe(false);
    let started = 0;
    for (let i = 0; i < 300; i++) {
      s.day += 1;
      started += ofType(step(s), 'mutiny_started').length;
      delete s.disloyalty?.open;
      s.calendar.nightEventsQueue = [];
      delete s.calendar.nightEvent;
      setRelation(s, ANN, { trust: 0, affinity: -45, stateId: 'estranged', band: 'breaking' });
      loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
    }
    expect(started).toBe(0);
  });

  it('none within 2 days of entering despises', () => {
    expect(mutinyReady(brewing({ inState: 1 }), reg, ANN)).toBe(false);
    expect(mutinyReady(brewing({ inState: 2 }), reg, ANN)).toBe(true);
    expect(mutinyReady(brewing({ inState: 9 }), reg, ANN)).toBe(true);
  });

  it('none without a trigger in the last 3 days', () => {
    expect(mutinyReady(brewing({ triggerAgo: null }), reg, ANN)).toBe(false);
    expect(mutinyReady(brewing({ triggerAgo: 4 }), reg, ANN)).toBe(false);
    expect(mutinyReady(brewing({ triggerAgo: 3 }), reg, ANN)).toBe(true);
    expect(mutinyReady(brewing({ triggerAgo: 0 }), reg, ANN)).toBe(true);
  });

  it('none before two signs, and the signs come on different days', () => {
    expect(mutinyReady(brewing({ signs: 0 }), reg, ANN)).toBe(false);
    expect(mutinyReady(brewing({ signs: 1 }), reg, ANN)).toBe(false);
    const s = brewing({ signs: 0 });
    s.day += 1;
    step(s);
    expect(loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny')).toHaveLength(1);
    step(s); // the same day again: no second sign
    expect(loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny')).toHaveLength(1);
    expect(mutinyReady(s, reg, ANN)).toBe(false);
    s.day += 1;
    step(s);
    const signs = loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny');
    expect(signs.map((x) => reg.loyaltySigns.get(x.signId)!.level)).toEqual([1, 2]);
    expect(new Set(signs.map((x) => x.day)).size).toBe(2);
    expect(mutinyReady(s, reg, ANN)).toBe(true);
  });

  it('a Leash use on her is a trigger', () => {
    const s = clone();
    setRelation(s, ANN, { trust: 60 });
    expect(mutinyTrigger(s, ANN)).toBeNull();
    const sc = act(s, 'scene/start', { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 }).state;
    sc.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    const after = act(sc, 'leash/compel', { unitId: ANN, context: 'scene' }).state;
    expect(mutinyTrigger(after, ANN)).toEqual({ kind: 'leash', day: after.day });
  });

  it('betrayals in her history are triggers inside the window and at major or worse', () => {
    const s = clone();
    const hist = (type: string, severity: 'minor' | 'moderate' | 'major' | 'extreme', ago: number) =>
      s.relations[ANN].history.push({ day: s.day - ago, kind: 'event', type, severity });
    hist('lied_detected', 'moderate', 0);
    expect(mutinyTrigger(s, ANN)).toBeNull();
    hist('praised', 'extreme', 0);
    expect(mutinyTrigger(s, ANN)).toBeNull();
    hist('broke_promise', 'major', 5);
    expect(mutinyTrigger(s, ANN)).toBeNull();
    hist('broke_promise', 'major', 2);
    expect(mutinyTrigger(s, ANN)).toEqual({ kind: 'betrayal', day: s.day - 2 });
  });

  it('obsessed needs an extreme trigger', () => {
    const major = brewing({ state: 'obsessed', triggerAgo: null, inState: 0 });
    major.relations[ANN].history.push({ day: major.day, kind: 'event', type: 'decision_violated', severity: 'major' });
    expect(mutinyReady(major, reg, ANN)).toBe(false);
    const extreme = brewing({ state: 'obsessed', triggerAgo: null, inState: 0 });
    extreme.relations[ANN].history.push({ day: extreme.day, kind: 'event', type: 'decision_violated', severity: 'extreme' });
    expect(mutinyReady(extreme, reg, ANN)).toBe(true);
    // a Leash use counts as extreme
    expect(mutinyReady(brewing({ state: 'obsessed', inState: 0 }), reg, ANN)).toBe(true);
  });

  it('only a named living unit can mutiny', () => {
    const grunt = brewing();
    unit(grunt).kind = 'grunt';
    expect(mutinyReady(grunt, reg, ANN)).toBe(false);
    const dead = brewing();
    unit(dead).status = 'dead';
    expect(mutinyReady(dead, reg, ANN)).toBe(false);
  });

  it('a ready unit starts a mutiny on about half of the days', () => {
    let started = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = withSympathizers(brewing({ seed }));
      s.day += 1;
      loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
      if (ofType(step(s), 'mutiny_started').length > 0) started += 1;
    }
    expect(started).toBeGreaterThan(8);
    expect(started).toBeLessThan(32);
  });

  it('the day step queues the night entry, opens the confrontation and names the sympathizers', () => {
    let hit: { s: CampaignState; events: ReturnType<typeof step> } | undefined;
    for (let seed = 1; seed <= 60 && !hit; seed++) {
      const s = withSympathizers(brewing({ seed }));
      s.day += 1;
      loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
      const events = step(s);
      if (ofType(events, 'mutiny_started').length > 0) hit = { s, events };
    }
    const { s, events } = hit!;
    expect(ofType(events, 'mutiny_started')).toEqual([{ type: 'mutiny_started', unitId: ANN, sympathizers: [CAT, BEA] }]);
    const entry = s.calendar.nightEventsQueue.find((n) => n.kind === 'mutiny')!;
    expect(entry).toMatchObject({ unitId: ANN, priority: 100, expiresDay: s.day + 2 });
    expect(s.disloyalty!.open).toEqual({ kind: 'mutiny', unitId: ANN, day: s.day, at: 'night', nightEntryId: entry.id, sympathizers: [CAT, BEA] });
  });

  it('300 seeded days never start a mutiny outside these conditions', () => {
    const cases: Array<[string, (s: CampaignState) => void]> = [
      ['no trigger', (s) => { delete loyaltyRecord(s, ANN).trigger; }],
      ['trigger too old', (s) => { loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day - 4 }; }],
      ['just entered despises', (s) => { s.relations[ANN].stateSince = s.day - 1; }],
      ['a steady unit', (s) => { setRelation(s, ANN, { trust: 60, affinity: 20, stateId: 'comrade', band: 'steady' }); }],
    ];
    for (const [name, tweak] of cases) {
      const s = brewing({ seed: 7 });
      let started = 0;
      for (let i = 0; i < 300; i++) {
        s.day += 1;
        setRelation(s, ANN, { trust: 5, affinity: -70, stateId: 'despises', band: 'breaking', stateSince: s.day - 5 });
        loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
        loyaltyRecord(s, ANN).signs = [];
        tweak(s);
        s.relations[ANN].history = [];
        started += ofType(step(s), 'mutiny_started').length;
        delete s.disloyalty?.open;
        s.calendar.nightEventsQueue = [];
      }
      expect(started, name).toBe(0);
    }
  });
});

describe('the encounter', () => {
  it('sympathizers are other named active units with a loosened loyalty and Trust under 20, at most two, the lowest Trust first', () => {
    const s = withSympathizers(clone(), { [BEA]: 10, [CAT]: 5, [DEE]: 15 });
    expect(sympathizers(s, ANN)).toEqual([CAT, BEA]);
    setRelation(s, BEA, { band: 'steady' }); // steady: not a sympathizer however low the Trust
    expect(sympathizers(s, ANN)).toEqual([CAT, DEE]);
    setRelation(s, CAT, { trust: 25, band: 'wavering' }); // Trust too high
    expect(sympathizers(s, ANN)).toEqual([DEE]);
    unit(s, DEE).status = 'injured'; // not active
    expect(sympathizers(s, ANN)).toEqual([]);
  });

  it('she and at most two low-Trust wavering units fight the rest with the commander exposed', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10, [CAT]: 5, [DEE]: 15 }));
    expect(s.disloyalty!.open!.sympathizers).toEqual([CAT, BEA]);
    expect(loyalUnits(s, ANN)).toEqual([DEE]);
    const r = act(s, 'loyalty/fight', fightPayload(s));
    expect(errors(r.events)).toEqual([]);
    const cs = r.state.combat ?? undefined;
    const open = r.state.disloyalty!.open!;
    const encounter = cs ? cs.encounter : undefined;
    // the fight may already be over in one dispatch (auto is off, so it waits for the squad)
    expect(cs).toBeDefined();
    expect(encounter).toMatchObject({ enemies: [], exposesCommander: true, danger: 0, mutineers: [{ unitId: ANN }, { unitId: CAT }, { unitId: BEA }] });
    expect(cs!.commander).toBeDefined();
    expect(cs!.combatants.filter((c) => c.side === 'squad').map((c) => c.unitId)).toEqual([DEE]);
    expect(open.combatId).toBe(cs!.id);
  });

  it('fight with a mutineer in the formation, an unfit unit or no cover is refused', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10 }));
    for (const [name, p] of [
      ['a mutineer', fightPayload(s, [CAT, ANN])],
      ['a sympathizer', fightPayload(s, [CAT, BEA])],
      ['nobody', fightPayload(s, [])],
      ['no cover', { formation: { front: [CAT], back: [] } }],
    ] as Array<[string, unknown]>) {
      const r = act(s, 'loyalty/fight', p);
      expect(errors(r.events), name).toHaveLength(1);
      expect(r.state, name).toBe(s);
    }
    const injured = structuredClone(s);
    unit(injured, CAT).status = 'injured';
    expect(errors(act(injured, 'loyalty/fight', fightPayload(s, [CAT])).events)).toHaveLength(1);
  });

  it('with no loyal unit only suppress and yield work', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10, [CAT]: 5 }));
    unit(s, DEE).status = 'injured';
    expect(loyalUnits(s, ANN)).toEqual([]);
    expect(errors(act(s, 'loyalty/fight', fightPayload(s, [DEE])).events)).toHaveLength(1);
    const yielded = act(s, 'loyalty/yield');
    expect(errors(yielded.events)).toEqual([]);
    expect(yielded.state.disloyalty!.open).toBeUndefined();
    expect(errors(act(s, 'leash/suppress', { unitId: ANN }).events)).toEqual([]);
    // with a loyal unit around, yielding is not an option
    const able = opened(withSympathizers(brewing(), { [BEA]: 10, [CAT]: 5 }));
    expect(errors(act(able, 'loyalty/yield').events)).toHaveLength(1);
  });
});

describe('outcomes', () => {
  const auto = (s: CampaignState) => act(s, 'combat/auto', { on: true }).state;
  /** The mutiny fight, played to its end (not yet resolved). */
  function fought(s: CampaignState, how: 'auto' | 'retreat' = 'auto'): CampaignState {
    const started = act(s, 'loyalty/fight', fightPayload(s));
    expect(errors(started.events)).toEqual([]);
    return how === 'auto' ? auto(started.state) : act(started.state, 'combat/retreat').state;
  }
  /** Ann as the stronger side: she wins. */
  const strong = (s: CampaignState): CampaignState => {
    const a = unit(s);
    a.baseStats = { hp: 900, atk: 200, def: 60, spd: 30, crit: 10 };
    a.currentHp = 900;
    return s;
  };
  const weak = (s: CampaignState): CampaignState => {
    const a = unit(s);
    a.baseStats = { hp: 20, atk: 2, def: 0, spd: 1, crit: 0 };
    a.currentHp = 20;
    return s;
  };

  it('a won fight subdues: she stays, resentful, injured, and may be terminated', () => {
    const s = opened(withSympathizers(weak(brewing()), { [BEA]: 10 }));
    const over = fought(s);
    expect(over.combat).toBeUndefined();
    expect(over.lastCombat!.outcome).toBe('won');
    expect(over.lastCombat!.mutineers!.map((m) => m.unitId)).toEqual([ANN, BEA]);
    const r = act(over, 'loyalty/resolve_mutiny');
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    for (const id of [ANN, BEA]) {
      expect(unit(after, id)).toMatchObject({ status: 'injured', currentHp: 1, injuryDays: 2 });
    }
    expect(unit(after).status).not.toBe('deserted');
    expect(after.relations[ANN].stateId).toBe('resentful');
    expect(after.disloyalty!.units[ANN].cause).toEqual({ kind: 'attack', day: s.day });
    expect(after.disloyalty!.open).toBeUndefined();
    expect(ofType(r.events, 'mutiny_subdued')).toEqual([{ type: 'mutiny_subdued', unitId: ANN, sympathizers: [BEA] }]);
    expect(after.slot).toBe('morning'); // an answer at night ends the night
    // she can now be terminated (the oversight roll may still deny)
    const t = act(after, 'leash/terminate', { unitId: ANN });
    expect(errors(t.events)).toEqual([]);
  });

  it('a lost fight lets her escape hostile and injures the commander', () => {
    const s = opened(withSympathizers(strong(brewing()), { [BEA]: 10 }));
    const over = fought(s);
    expect(over.lastCombat!.outcome).toBe('lost');
    const r = act(over, 'loyalty/resolve_mutiny');
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    for (const id of [ANN, BEA]) {
      expect(unit(after, id).status).toBe('deserted');
      expect(after.disloyalty!.units[id]).toMatchObject({ stance: 'hostile', desertedDay: s.day });
      expect(after.roster.activeIds).not.toContain(id);
    }
    expect((after.commander.injuredUntilDay ?? 0)).toBeGreaterThan(s.day);
    expect(ofType(r.events, 'mutiny_escaped')).toEqual([{ type: 'mutiny_escaped', unitId: ANN, sympathizers: [BEA], how: 'defeat' }]);
    expect(after.disloyalty!.open).toBeUndefined();
  });

  it('a retreat counts as an escape', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10 }));
    const over = fought(s, 'retreat');
    expect(over.lastCombat!.outcome).toBe('retreated');
    const r = act(over, 'loyalty/resolve_mutiny');
    expect(errors(r.events)).toEqual([]);
    expect(unit(r.state).status).toBe('deserted');
    expect(ofType(r.events, 'mutiny_escaped')[0]).toMatchObject({ how: 'retreat' });
  });

  it('suppress stops the attack before it starts', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10 }));
    const r = act(s, 'leash/suppress', { unitId: ANN });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.disloyalty!.open).toBeUndefined();
    expect(unit(r.state).status).toBe('active');
    expect(r.state.disloyalty!.units[ANN].cause).toBeUndefined();
    expect(r.state.combat).toBeUndefined();
    expect(r.state.leash.log).toMatchObject([{ kind: 'suppress', context: 'mutiny' }]);
  });

  it('yielding lets them go and injures the commander', () => {
    const s = opened(withSympathizers(brewing(), { [BEA]: 10 }));
    for (const id of [CAT, DEE]) unit(s, id).status = 'injured';
    const r = act(s, 'loyalty/yield');
    expect(errors(r.events)).toEqual([]);
    expect(unit(r.state).status).toBe('deserted');
    expect(unit(r.state, BEA).status).toBe('deserted');
    expect((r.state.commander.injuredUntilDay ?? 0)).toBeGreaterThan(s.day);
    expect(ofType(r.events, 'mutiny_escaped')).toMatchObject([{ unitId: ANN, how: 'yield' }]);
  });

  it('a mutiny result is resolved once', () => {
    const s = opened(withSympathizers(weak(brewing()), { [BEA]: 10 }));
    const over = fought(s);
    const first = act(over, 'loyalty/resolve_mutiny');
    expect(errors(first.events)).toEqual([]);
    const again = act(first.state, 'loyalty/resolve_mutiny');
    expect(again.state).toBe(first.state);
    expect(errors(again.events)).toHaveLength(1);
  });

  it('resolving needs the fight to have been played and to be over', () => {
    const s = opened(withSympathizers(weak(brewing()), { [BEA]: 10 }));
    expect(errors(act(s, 'loyalty/resolve_mutiny').events)).toHaveLength(1);
    const running = act(s, 'loyalty/fight', fightPayload(s)).state;
    expect(errors(act(running, 'loyalty/resolve_mutiny').events)).toHaveLength(1);
    // an older fight's result does not count
    const stale = structuredClone(fought(s));
    stale.lastCombat!.id = 'cmb_other';
    expect(errors(act(stale, 'loyalty/resolve_mutiny').events)).toHaveLength(1);
  });

  it('the state round-trips through JSON between fight and resolve', () => {
    const s = opened(withSympathizers(weak(brewing()), { [BEA]: 10 }));
    const over = JSON.parse(JSON.stringify(fought(s))) as CampaignState;
    const r = act(over, 'loyalty/resolve_mutiny');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].stateId).toBe('resentful');
    // and mid-fight too
    const mid = JSON.parse(JSON.stringify(act(s, 'loyalty/fight', fightPayload(s)).state)) as CampaignState;
    expect(mid.combat).toBeDefined();
    expect(mid.disloyalty!.open!.combatId).toBe(mid.combat!.id);
  });

  it('an unanswered mutiny is resolved by the next day end: yielding without a fight, resolving a finished one', () => {
    const idle = opened(withSympathizers(brewing(), { [BEA]: 10 }));
    delete idle.calendar.nightEvent;
    idle.slot = 'morning';
    idle.day += 1;
    const events = step(idle);
    expect(unit(idle).status).toBe('deserted');
    expect(ofType(events, 'mutiny_escaped')).toMatchObject([{ unitId: ANN, how: 'yield' }]);

    const over = fought(opened(withSympathizers(weak(brewing()), { [BEA]: 10 })));
    delete over.calendar.nightEvent;
    over.slot = 'morning';
    over.day += 1;
    expect(ofType(step(over), 'mutiny_subdued')).toHaveLength(1);
    expect(over.disloyalty!.open).toBeUndefined();
  });
});

describe('mutiny follows disposition (P8)', () => {
  const at = (level: string, s: CampaignState): CampaignState => {
    s.world.options = { ...(s.world.options ?? {}), disposition: level };
    return s;
  };
  /** The first 400 day steps with a fresh trigger each day: how many days a mutiny started. */
  const started = (make: (seed: number) => CampaignState): number => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = withSympathizers(make(seed));
      for (let i = 0; i < 10; i++) {
        s.day += 1;
        loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
        if (ofType(step(s), 'mutiny_started').length > 0) { n += 1; break; }
        delete s.disloyalty?.open;
      }
    }
    return n;
  };

  it('guarded keeps the P6 numbers', () => {
    expect(mutinyReady(at('guarded', brewing({ inState: 1 })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('guarded', brewing({ inState: 2 })), reg, ANN)).toBe(true);
    expect(mutinyReady(at('guarded', brewing({ signs: 1 })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('guarded', brewing({ state: 'resentful' })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('prickly', brewing({ state: 'resentful' })), reg, ANN)).toBe(false);
  });

  it('mutiny is impossible at kind even when despises with a trigger and signs', () => {
    const ready = brewing();
    expect(mutinyReady(at('guarded', structuredClone(ready)), reg, ANN)).toBe(true);
    expect(mutinyReady(at('kind', ready), reg, ANN)).toBe(false);
    expect(mutinyReady(at('kind', brewing({ state: 'obsessed', inState: 0 })), reg, ANN)).toBe(false); // the obsessed path is off too
    expect(started((seed) => at('kind', brewing({ seed })))).toBe(0);
    expect(started((seed) => at('guarded', brewing({ seed })))).toBeGreaterThan(10);
  });

  it('kind clears the leftover warning signs instead of building towards a mutiny', () => {
    const s = at('kind', brewing());
    s.day += 1;
    step(s);
    expect(loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny')).toEqual([]);
  });

  it('resentful cannot mutiny at prickly and can at volatile', () => {
    expect(mutinyReady(at('prickly', brewing({ state: 'resentful' })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('volatile', brewing({ state: 'resentful' })), reg, ANN)).toBe(true);
    expect(mutinyReady(at('hazardous', brewing({ state: 'resentful' })), reg, ANN)).toBe(true);
    // one day step while she is still resentful: no mutiny at prickly (the step may later move her to despises, which is a different state)
    for (let seed = 1; seed <= 30; seed++) {
      const s = withSympathizers(at('prickly', brewing({ seed, state: 'resentful' })));
      s.day += 1;
      loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
      const before = s.relations[ANN].stateId;
      const ev = ofType(step(s), 'mutiny_started');
      if (before === 'resentful' && s.relations[ANN].stateId === 'resentful') expect(ev, `seed ${seed}`).toEqual([]);
    }
    // a listed state still needs a trigger, like despises today
    expect(mutinyReady(at('volatile', brewing({ state: 'resentful', triggerAgo: null })), reg, ANN)).toBe(false);
    // and an unlisted state (estranged) never mutinies
    expect(mutinyReady(at('hazardous', brewing({ state: 'estranged' })), reg, ANN)).toBe(false);
  });

  it('hazardous mutinies after one sign a day old and one day in state', () => {
    expect(mutinyReady(at('volatile', brewing({ inState: 1, signs: 1 })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('hazardous', brewing({ inState: 1, signs: 1 })), reg, ANN)).toBe(true);
    expect(mutinyReady(at('hazardous', brewing({ inState: 0, signs: 1 })), reg, ANN)).toBe(false);
    expect(mutinyReady(at('hazardous', brewing({ inState: 1, signs: 0 })), reg, ANN)).toBe(false);
  });

  it('hazardous: the day step leaves one sign, and the unit may strike the next day', () => {
    const s = withSympathizers(at('hazardous', brewing({ inState: 1, signs: 0 })));
    loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
    expect(ofType(step(s), 'mutiny_started')).toEqual([]); // the first sign is only a warning
    const signs = loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny');
    expect(signs).toHaveLength(1);
    s.day += 1;
    loyaltyRecord(s, ANN).trigger = { kind: 'leash', day: s.day };
    step(s);
    expect(loyaltyRecord(s, ANN).signs.filter((x) => x.about === 'mutiny')).toHaveLength(1); // no second sign is needed
    expect(mutinyReady(s, reg, ANN)).toBe(true);
  });

  it('a unit\'s own offset moves only her mutiny rules', () => {
    const s = at('guarded', brewing({ state: 'resentful' }));
    unit(s).dispositionOffset = 2; // volatile
    expect(mutinyReady(s, reg, ANN)).toBe(true);
    const kindUnit = at('guarded', brewing());
    unit(kindUnit).dispositionOffset = -1; // kind
    expect(mutinyReady(kindUnit, reg, ANN)).toBe(false);
  });
});
