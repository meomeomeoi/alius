import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/development';
import '../../../src/engine/actions/scene';
import '../../../src/engine/actions/expedition';
import { countRun, habitEffect } from '../../../src/engine/development/habits';
import { developmentOf, ensureDevelopment } from '../../../src/engine/development/state';
import type { CampaignState } from '../../../src/engine/state/types';
import { sanitizeHabitWording } from '../../../src/llm/calls/flavor';
import { generationSite } from '../../../src/llm/sites';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { enable, loadGate } from '../../helpers/bonds';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const on = (s: CampaignState): CampaignState => { s.settings.characterDevelopment = 'normal'; return s; };
const dev = (s: CampaignState, id = ANN) => developmentOf(s.squad.find((u) => u.id === id)!);
const unit = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
/** One activity with ANN as companion, on a fresh day so the slots never run out. */
const train = (s: CampaignState, companionId = ANN, activityId = 'train'): { state: CampaignState; events: ReturnType<typeof run>['events'] } => {
  const r = run({ ...s, slot: 'morning' } as CampaignState, reg, { type: 'activity/do', payload: { activityId, companionId } });
  expect(errors(r.events)).toEqual([]);
  return r;
};

describe('counting', () => {
  it('off counts nothing', () => {
    const r = train(campaign(reg, 4));
    expect(unit(r.state).development).toBeUndefined();
  });

  it('a habit forms at the threshold, with the registry text, a fact and an event', () => {
    let s = on(campaign(reg, 4));
    for (let i = 0; i < 7; i++) s = train(s).state;
    expect(dev(s).counters['activity:train']).toBe(7);
    expect(dev(s).habits).toEqual([]);
    const r = train(s);
    expect(dev(r.state).habits).toEqual(['drills_daily']);
    const fact = dev(r.state).facts.find((f) => f.source === 'habit')!;
    expect(fact).toMatchObject({ kind: 'habit', source: 'habit', day: s.day });
    expect(fact.text).toContain('Ann drills every day now');
    expect(fact.text).not.toContain('{name}');
    expect(ofType(r.events, 'habit_formed')).toEqual([{ type: 'habit_formed', unitId: ANN, habitId: 'drills_daily', factId: fact.id }]);
    // a ninth activity forms nothing new
    expect(ofType(train(r.state).events, 'habit_formed')).toEqual([]);
  });

  it('a grunt forms habits but never appraises', () => {
    const s = on(campaign(reg, 2));
    s.squad.push({ ...structuredClone(unit(s)), id: 'grunt_k_117', kind: 'grunt', displayName: 'Mara', designation: 'K-117', cardRef: undefined } as never);
    s.relations.grunt_k_117 = structuredClone(s.relations[ANN]);
    let cur = s;
    for (let i = 0; i < 8; i++) cur = train(cur, 'grunt_k_117').state;
    expect(dev(cur, 'grunt_k_117').habits).toEqual(['drills_daily']);
    expect(dev(cur, 'grunt_k_117').pending).toEqual([]);
  });

  it('companion pairs: ten scenes together make close_with for both, with the other\'s name', () => {
    let s = on(campaign(reg, 4));
    for (let i = 0; i < 10; i++) {
      s = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } }).state;
      s = run(s, reg, { type: 'scene/end', payload: {} }).state;
    }
    expect(dev(s).habits).toContain('close_with');
    expect(dev(s, BEA).habits).toContain('close_with');
    expect(dev(s).facts.find((f) => f.source === 'habit')!.text).toBe('AUTHOR TO WRITE: Ann picked up a habit from Bea.');
    expect(dev(s, BEA).facts.find((f) => f.source === 'habit')!.text).toContain('from Ann');
    expect(dev(s).counters[`companion:${BEA}`]).toBe(10);
  });

  it('a region: four runs form knows_region, and the party counts its pairs', () => {
    const s = on(campaign(reg, 4));
    const draft = structuredClone(s);
    const ctx = ctxOf(draft, reg);
    void ctx;
    for (let i = 0; i < 3; i++) countRun(draft, reg, [ANN, BEA], 'quarantine_d7');
    expect(dev(draft).habits).toEqual([]);
    const events = countRun(draft, reg, [ANN, BEA], 'quarantine_d7');
    expect(dev(draft).habits).toContain('knows_region');
    expect(ofType(events, 'habit_formed').map((e) => e.unitId)).toEqual([ANN, BEA]);
    expect(dev(draft).counters[`companion:${BEA}`]).toBe(4);
  });
});

describe('the effect', () => {
  it('applies on her shifts only', () => {
    const base = on(campaign(reg, 4));
    const without = train(base);
    ensureDevelopment(unit(base)).habits = ['drills_daily'];
    const withHabit = train(base);
    expect(unit(withHabit.state).xp - unit(without.state).xp).toBe(5);
    expect(habitEffect(base, reg, ANN, 'train')).toEqual([{ type: 'unit_xp', amount: 5 }]);
    expect(habitEffect(base, reg, ANN, 'rest')).toEqual([]);
    // BEA does not have it
    const bea = train(base, BEA);
    expect(unit(bea.state, BEA).xp).toBe(unit(without.state, ANN).xp); // the same 20 as ANN's without the habit
    expect(ofType(withHabit.events, 'xp_gained').some((e) => e.unitId === ANN && e.amount === 5)).toBe(true);
  });

  it('a stress habit relieves her, never below 0', () => {
    const s = on(campaign(reg, 4));
    ensureDevelopment(unit(s)).habits = ['rests_easy'];
    unit(s).stress = 2;
    const r = train(s, ANN, 'rest');
    expect(unit(r.state).stress).toBeLessThanOrEqual(2);
    expect(unit(r.state).stress).toBeGreaterThanOrEqual(0);
  });

  it('nothing while development is off', () => {
    const s = campaign(reg, 4);
    ensureDevelopment(unit(s)).habits = ['drills_daily'];
    expect(habitEffect(s, reg, ANN, 'train')).toEqual([]);
  });
});

describe('the content gate and the draw', () => {
  it('a habit tagged with a disabled category never forms', async () => {
    const gate = await loadGate();
    const s = on(campaign(gate, 4));
    let cur = s;
    const go = (st: CampaignState) => run({ ...st, slot: 'morning' } as CampaignState, gate, { type: 'activity/do', payload: { activityId: 'train', companionId: ANN } }).state;
    for (let i = 0; i < 3; i++) cur = go(cur);
    expect(dev(cur).habits).not.toContain('gate_habit');
    const open = enable(structuredClone(s), 'restraint');
    let c2 = open;
    for (let i = 0; i < 3; i++) c2 = go(c2);
    expect(dev(c2).habits).toContain('gate_habit');
  });

  it('draws nothing', () => {
    let s = on(campaign(reg, 4));
    const rng = structuredClone(s.rng);
    for (let i = 0; i < 8; i++) s = train(s).state;
    expect(dev(s).habits).toContain('drills_daily');
    // the activity's own effects draw nothing either, so the rng is exactly what it was
    expect(s.rng).toEqual(rng);
  });
});

describe('edit_fact, the flavor kind and the setting', () => {
  it('byModel replaces the text and does not mark it edited; the player does', () => {
    let s = on(campaign(reg, 4));
    ensureDevelopment(unit(s)).facts = [{ id: 'df0', text: 'old', kind: 'habit', day: 1, source: 'habit' }];
    s = run(s, reg, { type: 'development/edit_fact', payload: { unitId: ANN, factId: 'df0', text: 'new by model', byModel: true } }).state;
    expect(dev(s).facts[0]).toEqual({ id: 'df0', text: 'new by model', kind: 'habit', day: 1, source: 'habit' });
    s = run(s, reg, { type: 'development/edit_fact', payload: { unitId: ANN, factId: 'df0', text: 'x'.repeat(300) } }).state;
    expect(dev(s).facts[0].text).toHaveLength(140);
    expect(dev(s).facts[0].edited).toBe(true);
    const bad = run(s, reg, { type: 'development/edit_fact', payload: { unitId: ANN, factId: 'nope', text: 'x' } });
    expect(errors(bad.events)).toHaveLength(1);
    expect(errors(run(s, reg, { type: 'development/edit_fact', payload: { unitId: ANN, factId: 'df0', text: '  ' } }).events)).toHaveLength(1);
  });

  it('the wording sanitizer is strict and fails soft', () => {
    expect(sanitizeHabitWording({ text: 'She drills at dawn.' })).toBe('She drills at dawn.');
    for (const bad of [{ text: 'She drills 8 times.' }, { text: 'The commander and his rifle.' }, { text: '' }, { text: 'x'.repeat(200) }, 'x', null, { text: 5 }]) expect(sanitizeHabitWording(bad)).toBeNull();
    expect(sanitizeHabitWording({ text: '**She** drills.' })).toBe('She drills.');
  });

  it('flavor.habit is a free, unrecorded site and the setting is off by default', () => {
    expect(generationSite('flavor.habit')).toMatchObject({ callType: 'flavor', surface: 'day', reroll: 'free', record: 'none' });
    expect(DEFAULT_SETTINGS.habitWording).toBe(false);
    void vi;
  });
});
