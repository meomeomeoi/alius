import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type Action, type EngineEvent } from '../../src/engine/dispatch';
import { Rng, seedRng } from '../../src/engine/rng';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import {
  answerOverride, argueChance, overrideChance, overrideOpen, rollOverride, wardenOf, wardenSource, type Expectation, type ExpectationKind,
} from '../../src/engine/warden';
import { fixtureCombat } from '../helpers/combat';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/combat';
import '../../src/engine/actions/dilemma';
import '../../src/engine/actions/expedition';
import '../../src/engine/actions/base';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); quiet = { ...reg, commanderPunishments: new Map() }; });

const ex = (kind: ExpectationKind, weight: number): Expectation => ({ id: `e_${kind}`, kind, weight, source: 'values', known: false });
const ID = { ann: 'unit_ann', bea: 'unit_bea', cat: 'unit_cat', dee: 'unit_dee' };
function swap(list: Expectation[] = [ex('keep_me_close', 0.5)], seed = 7): CampaignState {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat', 'Dee'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed });
  if (!r.ok) throw new Error(r.errors.join('; '));
  const w = wardenOf(r.state)!;
  w.expectations = list;
  w.satisfaction = 60;
  r.state.relations[w.unitId].affinity = 0;
  return r.state;
}
const run = (s: CampaignState, a: Action) => dispatch(s, a, reg);
const err = (events: EngineEvent[]) => events.find((e) => e.type === 'error') as { message?: string } | undefined;
const ok = (r: { state: CampaignState; events: EngineEvent[] }) => { expect(err(r.events)).toBeUndefined(); return r; };
const train = (companionId = ID.ann): Action => ({ type: 'activity/do', payload: { activityId: 'train', companionId } });
/** The registries with no commander punishment, so a DEFY's own numbers can be read without the punishment roll that follows it. */
let quiet: Registries;
const answer = (s: CampaignState, a: 'comply' | 'argue' | 'defy', r: Registries = reg) => dispatch(s, { type: 'warden/answer', payload: { overrideId: overrideOpen(s)?.id ?? 'none', answer: a } }, r);

describe('overrideChance', () => {
  it('matches the formula and caps at 0.9', () => {
    const s = swap();
    const src = wardenSource(s)!;
    expect(overrideChance(0.5, src)).toBeCloseTo(0.4); // 0.5 × 0.4 × 1 × 2
    s.relations[ID.bea].affinity = 100;
    expect(overrideChance(0.5, wardenSource(s)!)).toBeCloseTo(0.2); // leniency 0.5
    s.relations[ID.bea].affinity = -50;
    expect(overrideChance(0.5, wardenSource(s)!)).toBeCloseTo(0.4); // no leniency below 0
    wardenOf(s)!.satisfaction = 0;
    expect(overrideChance(1, wardenSource(s)!)).toBe(0.9);
  });

  it('wardenSource is null without a warden', () => {
    const s = swap();
    delete s.leashswap;
    expect(wardenSource(s)).toBeNull();
  });
});

describe('the roll', () => {
  it('hits at the chance over seeds', () => {
    let hits = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const s = swap(undefined, 1000 + i);
      const ctx = { registries: reg, rng: new Rng(seedRng(i + 1)) };
      if (rollOverride(s, ctx, { kind: 'activity', activityId: 'train', companionId: ID.ann })) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.37);
    expect(hits / n).toBeLessThan(0.43);
  });

  it('no conflict: no draw; no mode: no draw; a day of obedience: no draw', () => {
    const s = swap();
    const ctx = () => ({ registries: reg, rng: new Rng(seedRng(5)) });
    const c1 = ctx();
    expect(rollOverride(s, c1, { kind: 'activity', activityId: 'train' })).toBeNull();
    expect(c1.rng.state).toEqual(seedRng(5));
    const plain = swap();
    delete plain.leashswap;
    const c2 = ctx();
    expect(rollOverride(plain, c2, { kind: 'activity', activityId: 'train', companionId: ID.ann })).toBeNull();
    expect(c2.rng.state).toEqual(seedRng(5));
    const obey = swap();
    obey.personal = { obedience: { who: 'unit', unitId: ID.bea, day: obey.day } } as never;
    const c3 = ctx();
    expect(rollOverride(obey, c3, { kind: 'activity', activityId: 'train', companionId: ID.ann })).toBeNull();
    expect(c3.rng.state).toEqual(seedRng(5));
  });

  it('an order that is hers to give is never overridden (her as the only companion)', () => {
    const s = swap([ex('meet_quota', 1)]);
    s.missions.offered.push({ id: 'm1', deadlineDay: s.day + 1 } as never);
    const ctx = { registries: reg, rng: new Rng(seedRng(5)) };
    expect(rollOverride(s, ctx, { kind: 'activity', activityId: 'rest', companionId: ID.bea })).toBeNull();
    expect(ctx.rng.state).toEqual(seedRng(5));
  });
});

/** The first seed (state rng) at which the train order is overridden; the tests then know a hit is waiting. */
function overridden(list?: Expectation[], mutate: (s: CampaignState) => void = () => {}): CampaignState {
  for (let seed = 1; seed < 200; seed++) {
    const s = swap(list, seed);
    mutate(s);
    const r = run(s, train());
    if (overrideOpen(r.state)) return r.state;
  }
  throw new Error('no seed overrides');
}

describe('a hit', () => {
  it('runs nothing and spends no slot; the expectation becomes known', () => {
    const before = swap();
    const s = overridden();
    const w = wardenOf(s)!;
    expect(s.slot).toBe(before.slot);
    expect(s.day).toBe(before.day);
    expect(s.resources).toEqual(before.resources);
    expect(w.expectations[0].known).toBe(true);
    expect(w.overrideFired).toBe(true);
    expect(overrideOpen(s)).toMatchObject({ expectationId: 'e_keep_me_close', context: 'base', alternative: { kind: 'activity', activityId: 'train', companionId: ID.bea } });
    expect(overrideOpen(s)!.altLabel).toContain('Bea');
  });

  it('emits warden_override with the expectation and the context (and expectation_learned)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const r = run(swap(undefined, seed), train());
      const e = r.events.find((x) => x.type === 'warden_override');
      if (!e) continue;
      expect(e).toMatchObject({ expectationId: 'e_keep_me_close', context: 'base' });
      expect(r.events.map((x) => x.type)).toContain('expectation_learned');
      return;
    }
    throw new Error('no seed overrides');
  });

  it('a second order while one waits is refused until it is answered', () => {
    const s = overridden();
    expect(err(run(s, train(ID.cat)).events)?.message).toMatch(/answer it first/i);
    expect(err(run(s, { type: 'roster/set_active', payload: { activeIds: [ID.ann] } }).events)?.message).toMatch(/answer it first/i);
  });
});

describe('answers', () => {
  it('COMPLY runs the alternative exactly once: slot spent once, satisfaction +4, defiance −3 floored at 0', () => {
    const s = overridden();
    const w0 = wardenOf(s)!;
    w0.defiance = 2;
    const r = ok(answer(s, 'comply'));
    const w = wardenOf(r.state)!;
    expect(w.satisfaction).toBe(64);
    expect(w.defiance).toBe(0);
    expect(w.override).toBeUndefined();
    expect(r.events.filter((e) => e.type === 'activity_done')).toHaveLength(1);
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: ID.bea });
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['warden_complied', 'override_answered']));
    expect(err(answer(r.state, 'comply').events)?.message).toBe('There is no override to answer.');
  });

  it('DEFY runs the order once: defiance +round(30w), satisfaction −round(20w)', () => {
    const s = overridden();
    const r = ok(answer(s, 'defy', quiet));
    const w = wardenOf(r.state)!;
    expect(w.defiance).toBe(15); // 30 × 0.5
    expect(w.satisfaction).toBe(50); // 60 − 20 × 0.5
    expect(r.events.filter((e) => e.type === 'activity_done')).toHaveLength(1);
    expect(r.events.find((e) => e.type === 'activity_done')).toMatchObject({ companionId: ID.ann });
    expect(r.events.map((e) => e.type)).toContain('warden_defied');
    expect(w.override).toBeUndefined();
  });

  it('DEFY is a major event at weight 0.4 or more and moderate below', () => {
    const light = overridden([ex('keep_me_close', 0.3)], (s) => { wardenOf(s)!.satisfaction = 0; });
    const heavy = overridden([ex('keep_me_close', 0.5)]);
    const sev = (s: CampaignState) => answer(s, 'defy').events.find((e) => e.type === 'warden_defied') as { severity?: string } | undefined;
    expect(sev(light)?.severity).toBe('moderate');
    expect(sev(heavy)?.severity).toBe('major');
  });

  it('an override of a past slot is dropped', () => {
    const s = overridden();
    const id = overrideOpen(s)!.id;
    s.slot = s.slot === 'morning' ? 'afternoon' : 'morning';
    expect(overrideOpen(s)).toBeNull();
    const r = run(s, { type: 'warden/answer', payload: { overrideId: id, answer: 'defy' } });
    expect(err(r.events)?.message).toBe('There is no override to answer.');
    expect(r.state).toBe(s);
    // and a new order is no longer blocked by the stale one
    expect(err(run(s, { type: 'activity/do', payload: { activityId: 'rest' } }).events)).toBeUndefined();
  });

  it('a wrong id is refused and nothing runs', () => {
    const s = overridden();
    const r = run(s, { type: 'warden/answer', payload: { overrideId: 'ov999', answer: 'comply' } });
    expect(err(r.events)?.message).toBe('There is no override to answer.');
    expect(r.state).toBe(s);
  });

  it('a bad answer is refused', () => {
    const s = overridden();
    expect(err(run(s, { type: 'warden/answer', payload: { overrideId: overrideOpen(s)!.id, answer: 'sulk' } }).events)).toBeDefined();
  });

})

describe('roster and expedition', () => {
  it('a roster order is overridden and COMPLY sets her list', () => {
    for (let seed = 1; seed < 200; seed++) {
      const st = swap([ex('keep_me_close', 0.5)], seed);
      wardenOf(st)!.satisfaction = 0;
      const hit = run(st, { type: 'roster/set_active', payload: { activeIds: [ID.ann, ID.cat, ID.dee] } });
      if (!overrideOpen(hit.state)) continue;
      expect(overrideOpen(hit.state)!.context).toBe('base');
      const done = ok(answer(hit.state, 'comply'));
      expect(done.state.roster.activeIds).toContain(ID.bea);
      const defied = ok(answer(hit.state, 'defy'));
      expect(defied.state.roster.activeIds).toEqual([ID.ann, ID.cat, ID.dee]);
      return;
    }
    throw new Error('no seed overrides');
  });

  it('wardenChecked skips the roll entirely', () => {
    const st = swap([ex('keep_me_close', 1)], 3);
    wardenOf(st)!.satisfaction = 0;
    const r = run(st, { type: 'roster/set_active', payload: { activeIds: [ID.ann], wardenChecked: true } });
    expect(err(r.events)).toBeUndefined();
    expect(r.state.roster.activeIds).toEqual([ID.ann]);
    expect(r.state.rng).toEqual(st.rng); // no draw
  });
});

describe('dilemmas', () => {
  const open = (s: CampaignState, scale: 'minor' | 'major' | 'defining'): void => {
    s.dilemmas = { seq: 1, open: {
      id: 'd1', templateId: 't', scale, context: 'base', day: s.day, status: 'presented', attempts: 0, units: [ID.ann], beatId: 'b',
      options: [
        { label: 'cut', effects: [{ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party', valueAxes: [{ axis: 'mercy', direction: -1 }] }], magnitudes: [] },
        { label: 'spare', effects: [], magnitudes: [] },
      ],
    } as never };
  };
  const choose = (s: CampaignState, index: number): Action => ({ type: 'dilemma/choose', payload: { id: 'd1', index } });

  it('a minor dilemma is never overridden (no draw)', () => {
    const s = swap([ex('no_civilian_harm', 1)]);
    wardenOf(s)!.satisfaction = 0;
    open(s, 'minor');
    const r = ok(run(s, choose(s, 0)));
    expect(overrideOpen(r.state)).toBeNull();
    expect(r.events.map((e) => e.type)).toContain('dilemma_resolved');
    expect(r.state.rng).toEqual(s.rng);
  });

  it('a major one is; COMPLY chooses her pick; DEFY chooses the commander\'s', () => {
    for (let seed = 1; seed < 100; seed++) {
      const s = swap([ex('no_civilian_harm', 1)], seed);
      wardenOf(s)!.satisfaction = 0;
      open(s, 'major');
      const hit = run(s, choose(s, 0));
      if (!overrideOpen(hit.state)) continue;
      expect(overrideOpen(hit.state)!.context).toBe('dilemma');
      expect(hit.state.dilemmas!.open!.status).toBe('presented'); // still waiting
      const comply = ok(answer(hit.state, 'comply'));
      expect(comply.events.find((e) => e.type === 'dilemma_resolved')).toMatchObject({ option: 1 });
      const defy = ok(answer(hit.state, 'defy'));
      expect(defy.events.find((e) => e.type === 'dilemma_resolved')).toMatchObject({ option: 0 });
      // a dilemma answered elsewhere drops the override
      const gone = structuredClone(hit.state);
      delete gone.dilemmas!.open;
      expect(overrideOpen(gone)).toBeNull();
      return;
    }
    throw new Error('no seed overrides');
  });
});

describe('combat', () => {
  function inCombat(seed: number): CampaignState {
    const s = swap([ex('obey_oversight', 0.5)], seed);
    wardenOf(s)!.satisfaction = 0;
    const cs = fixtureCombat({ squad: [{ cid: 's1', unitId: ID.ann }, { cid: 's2', unitId: ID.bea }], enemies: [{ cid: 'e1' }], cp: 3 });
    cs.phase = 'awaiting';
    cs.awaitingCid = 's1';
    s.combat = cs;
    return s;
  }
  const order: Action = { type: 'combat/order', payload: { orderId: 'fall_back', targetCid: 's1' } };

  it('hold spends no CP; ARGUE: a win runs the order, a loss holds, no defiance either way', () => {
    let won = 0;
    let lost = 0;
    for (let seed = 1; seed < 300 && (won === 0 || lost === 0); seed++) {
      const s = inCombat(seed);
      const hit = run(s, order);
      if (!overrideOpen(hit.state)) continue;
      expect(hit.state.combat!.cp).toBe(3); // nothing was spent
      expect(overrideOpen(hit.state)!.context).toBe('combat');
      for (let k = 0; k < 40; k++) {
        const t = structuredClone(hit.state);
        t.rng = seedRng(seed * 100 + k);
        const r = answer(t, 'argue');
        if (err(r.events)) continue;
        const roll = r.events.find((e) => e.type === 'override_argue_roll') as unknown as { won: boolean };
        expect(wardenOf(r.state)!.defiance).toBe(0);
        expect(wardenOf(r.state)!.satisfaction).toBe(0);
        if (roll.won) { won++; expect(r.state.combat!.cp).toBeLessThan(3); } else { lost++; expect(r.state.combat!.cp).toBe(3); }
      }
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });

  it('argueChance follows her rank against the commander\'s better of Authority and Empathy', () => {
    const s = swap();
    s.commander.socialStats = { authority: 2, insight: 1, empathy: 3, cunning: 1 };
    // satisfaction 60 → herRank round(3 + 0/100) = 3; rank 3 → 0.5
    expect(argueChance(s, reg)).toBeCloseTo(0.5);
    wardenOf(s)!.satisfaction = 40; // herRank 4 → 0.5 + 0.12 × (3 − 4)
    expect(argueChance(s, reg)).toBeCloseTo(0.38);
    s.relations[ID.bea].affinity = 100; // herRank round(4 + 1) = 5
    expect(argueChance(s, reg)).toBeCloseTo(0.26);
  });

  it('DEFY in combat runs the order with defiance', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = inCombat(seed);
      const hit = run(s, order);
      if (!overrideOpen(hit.state)) continue;
      const r = ok(answer(hit.state, 'defy', quiet));
      expect(wardenOf(r.state)!.defiance).toBe(15);
      expect(r.state.combat!.cp).toBeLessThan(3);
      return;
    }
    throw new Error('no seed overrides');
  });

  it('an override of a finished combat is dropped', () => {
    for (let seed = 1; seed < 300; seed++) {
      const s = inCombat(seed);
      const hit = run(s, order);
      if (!overrideOpen(hit.state)) continue;
      const over = structuredClone(hit.state);
      delete over.combat;
      expect(overrideOpen(over)).toBeNull();
      return;
    }
    throw new Error('no seed overrides');
  });

  it('she is not standing: no draw', () => {
    const s = inCombat(1);
    s.combat!.combatants.find((c) => c.unitId === ID.bea)!.downed = true;
    s.combat!.combatants.find((c) => c.unitId === ID.bea)!.hp = 0;
    const ctx = { registries: reg, rng: new Rng(seedRng(5)) };
    expect(rollOverride(s, ctx, { kind: 'combat_order', orderId: 'fall_back', targetCid: 's1' })).toBeNull();
    expect(ctx.rng.state).toEqual(seedRng(5));
  });
});

describe('answerOverride', () => {
  it('while compelled only COMPLY is accepted', () => {
    const s = overridden();
    wardenOf(s)!.compelled = true;
    expect(err(answer(s, 'defy').events)).toBeDefined();
    expect(err(answer(s, 'argue').events)).toBeDefined();
    const r = ok(answer(s, 'comply'));
    expect(wardenOf(r.state)!.compelled).toBeUndefined();
  });

  it('argue outside combat is refused after an argued scene, otherwise it returns nothing and keeps the override', () => {
    const s = overridden();
    const r = ok(answer(s, 'argue'));
    expect(overrideOpen(r.state)).not.toBeNull();
    wardenOf(s)!.override!.argued = true;
    expect(err(answer(s, 'argue').events)).toBeDefined();
  });

  it('answerOverride is pure engine: it can be called on a draft', () => {
    const s = overridden();
    const d = structuredClone(s);
    const events = answerOverride(d, { registries: reg, rng: new Rng(d.rng) }, overrideOpen(d)!.id, 'comply');
    expect(events.map((e) => e.type)).toContain('override_answered');
  });
});
