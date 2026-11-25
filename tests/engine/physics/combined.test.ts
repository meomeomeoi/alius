import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, hasSource, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { mergeInputs } from '../../../src/engine/physics/combined';
import { registerHoldsUntil, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PlannedBeat, SegmentInput } from '../../../src/engine/physics/state';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation', 'explicit_scenes', 'pain_rough'];
const beat = (over: Partial<PlannedBeat> = {}): PlannedBeat => ({ attention: 'busy', ...over });
const input = (b: number, kind: SegmentInput['kind']): SegmentInput => ({ beat: b, kind });

/** A scene with `contact` set and its first segment running over `plan` (four beats, all `busy` unless given). */
function combined(contact: string, plan: PlannedBeat[] = [beat(), beat(), beat(), beat()]): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
  r.scene!.physics!.segment.plan = { beats: plan };
  return r;
}
const end = (s: CampaignState, inputs: SegmentInput[], seed = 1) => {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  return run(d, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs } });
};

describe('a second physics', () => {
  it('starts with the first when the contact names two, and carries its own gauge', () => {
    const s = combined('between_thighs');
    expect(s.scene!.physics).toMatchObject({ physicsId: 'breath', second: { physicsId: 'weight', gauge: 100, capacity: 100 } });
    expect(combined('smothered_armpit').scene!.physics!.second).toMatchObject({ physicsId: 'saturation', gauge: 0 });
    expect(combined('under_her_seat').scene!.physics!.second).toMatchObject({ physicsId: 'her_activity', gauge: 0 });
    expect(combined('footrest').scene!.physics!.second).toBeUndefined();
  });

  it('is left out when its interaction is switched off or its category is not allowed', () => {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, ...ON);
    s.settings.physicsInteractions = { timing: true, hold: false, decision: true, order: true, passive: true, gesture: true, inhale: true };
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'between_thighs', with: COMMANDER }, { at: 3, source: 'chip' });
    expect(st.scene!.physics).toMatchObject({ physicsId: 'breath' });
    expect(st.scene!.physics!.second).toBeUndefined();
  });

  it('physics/start takes an explicit second (her escalation adds one), and refuses one the source does not have', () => {
    const s = combined('under_her_seat');
    delete s.scene!.physics;
    const ok = run(s, reg, { type: 'physics/start', payload: { physicsId: 'breath', sourceKind: 'contact', sourceId: 'under_her_seat', holderId: ANN, second: 'her_activity' } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.scene!.physics!.second!.physicsId).toBe('her_activity');
    expect(errors(run(s, reg, { type: 'physics/start', payload: { physicsId: 'breath', sourceKind: 'contact', sourceId: 'under_her_seat', holderId: ANN, second: 'jaw' } }).events)).not.toEqual([]);
  });
});

describe('the inputs merge by rule', () => {
  const plan = { beats: [beat(), beat({ opening: { widthMs: 500 } }), beat(), beat()] };
  it('each input goes to the physics that owns it', () => {
    const m = mergeInputs('timing', 'hold', plan, [input(0, 'breathe'), input(1, 'hold'), input(2, 'shift_weight'), input(3, 'part')]);
    expect(m.main.map((i) => i.kind)).toEqual(['breathe']);
    expect(m.second.map((i) => i.kind)).toEqual(['hold', 'shift_weight']);
    expect(m.notices).toBe(0);
  });

  it('timing + hold: the beats where the breath was held are the steady ones', () => {
    const m = mergeInputs('timing', 'hold', plan, [input(0, 'breathe'), input(2, 'gap_breath')]);
    expect(m.steady).toEqual([1, 3]);
    expect(mergeInputs('hold', 'passive', plan, []).steady).toEqual([]); // no conflict
  });

  it('timing + decision: a mouth breath in a real opening counts as a catch and is noticed; elsewhere it is only a relief', () => {
    const m = mergeInputs('timing', 'decision', plan, [input(1, 'mouth_breath'), input(3, 'mouth_breath')]);
    expect(m.main.map((i) => [i.beat, i.kind])).toEqual([[1, 'breathe']]);
    expect(m.second.map((i) => i.beat)).toEqual([1, 3]);
    expect(m.notices).toBe(1);
    const falsePlan = { beats: [beat({ opening: { widthMs: 500, false: true } })] };
    expect(mergeInputs('timing', 'decision', falsePlan, [input(0, 'mouth_breath')]).notices).toBe(0); // a false opening is no opening
  });
});

describe('breath + weight', () => {
  it('a held breath steadies the weight: 25 % less drain on the beats with no breath', () => {
    const s = combined('between_thighs');
    s.scene!.physics!.seal = 'tight';
    const holds = [0, 1, 2, 3].map((b) => input(b, 'hold'));
    const r = end(s, [...holds, input(0, 'breathe'), input(1, 'breathe')]);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.physics!.second!.gauge).toBeCloseTo(100 - (8 + 8 + 6 + 6), 6);
    const all = end(s, [...holds, ...[0, 1, 2, 3].map((b) => input(b, 'breathe'))]);
    expect(all.state.scene!.physics!.second!.gauge).toBe(100 - 32);
    const none = end(s, holds);
    expect(none.state.scene!.physics!.second!.gauge).toBe(100 - 24);
  });

  it('N1: a tilted held beat with a shift resolves on the weight as in a single run: the tilt\'s drain and the shift\'s charge both land', () => {
    const plan = [beat(), beat(), beat({ shift: 20, cue: 'shift' }), beat()];
    const s = combined('between_thighs', plan);
    s.scene!.physics!.seal = 'tight';
    const breaths = [0, 1, 2, 3].map((b) => input(b, 'breathe')); // breathing every beat: no steady beat, the weight's drain is its own
    const holds = [0, 1, 2, 3].map((b) => input(b, 'hold'));
    const tilt: SegmentInput = { beat: 2, kind: 'uneven', amount: 0.5, part: 'tilted' };
    expect(mergeInputs('timing', 'hold', { beats: plan }, [...holds, tilt]).second).toContainEqual(tilt);
    const r = end(s, [...breaths, ...holds, tilt]);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.physics!.second!.gauge).toBeCloseTo(100 - 32 - 8 * 0.5 - 20, 6);
    expect(r.state.scene!.physics!.last!.slips).toBe(0);
    // the same beats alone, a weight run of its own
    const single = combined('human_chair', plan);
    const w = end(single, [...holds, tilt]);
    expect(w.state.scene!.physics!.gauge).toBeCloseTo(r.state.scene!.physics!.second!.gauge, 6);
  });

  it('a slip in either is a slip of the run: the weight slipped, the hold lasts longer, the noise is a creak', () => {
    const s = combined('between_thighs');
    s.scene!.physics!.seal = 'tight';
    const r = end(s, [input(0, 'hold'), input(1, 'hold')]); // beats 2 and 3 have no hold
    expect(r.state.scene!.physics!.last!.slips).toBe(2);
    expect(r.state.scene!.physics!.extend).toBe(1);
    expect(ofType(r.events, 'physics_slip')[0]).toMatchObject({ count: 2 });
    expect(ofType(r.events, 'physics_noise').map((e) => e.kind)).toContain('creak');
  });

  it('either gauge spent ends the run by what she holds the commander until', () => {
    const s = combined('between_thighs');
    s.scene!.physics!.seal = 'tight';
    s.scene!.physics!.second!.gauge = 5;
    const r = end(s, [0, 1, 2, 3].map((b) => input(b, 'hold')));
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'collapse', physicsId: 'breath' });
    expect(r.state.scene!.physics).toBeUndefined();
  });

  it('only the air goes to blackout: a blackout holder whose weight gives out acts as a limit holder', () => {
    registerHoldsUntil(() => 'blackout');
    const s = combined('between_thighs');
    s.content = { enabled: [...ON, 'breath_play'] };
    s.scene!.physics!.seal = 'tight';
    s.scene!.physics!.second!.gauge = 5;
    const r = end(s, [0, 1, 2, 3].map((b) => input(b, 'hold')));
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'limit_broken' });
    expect(ofType(r.events, 'blackout')).toEqual([]);
  });
});

describe('breath + saturation', () => {
  const plan = [beat(), beat({ opening: { widthMs: 500 }, cue: 'window_open' }), beat(), beat()];
  it('a mouth breath in an opening is caught and lowers the saturation, and she may notice (0.6)', () => {
    const s = combined('smothered_armpit', plan);
    s.scene!.physics!.seal = 'tight';
    let noticed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = end(s, [input(1, 'mouth_breath')], seed);
      const p = r.state.scene!.physics!;
      expect(p.last!.caught).toBe(1);
      expect(p.second!.gauge).toBe(40 - 20); // four beats of 10, a relief of 20
      if (ofType(r.events, 'physics_caught').length > 0) noticed++;
    }
    expect(noticed / 200).toBeGreaterThan(0.5);
    expect(noticed / 200).toBeLessThan(0.7);
  });

  it('outside an opening it is an ordinary relief rolled by her attention', () => {
    const s = combined('smothered_armpit', plan.map((b) => ({ ...b, attention: 'busy' as const })));
    s.scene!.physics!.seal = 'tight';
    let caught = 0;
    for (let seed = 1; seed <= 300; seed++) if (ofType(end(s, [input(3, 'mouth_breath')], seed).events, 'physics_caught').length > 0) caught++;
    expect(caught / 300).toBeLessThan(0.2); // busy: 0.08
  });
});

describe('her task + breath', () => {
  it('the progress and the air both move', () => {
    const s = combined('under_her_seat');
    s.scene!.physics!.seal = 'tight';
    const r = end(s, []);
    expect(r.state.scene!.physics!.second!.gauge).toBe(20);
    expect(r.state.scene!.physics!.gauge).toBeLessThan(100);
  });
  it('a finished task of hers ends the hold: released', () => {
    const s = combined('under_her_seat');
    s.scene!.physics!.seal = 'tight';
    s.scene!.physics!.second!.gauge = 90;
    const r = end(s, []);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
  });
});

describe('the stop word', () => {
  it('ends both at once and takes the contact', () => {
    const s = combined('between_thighs');
    const r = run(s, reg, { type: 'physics/stop_word', payload: {} });
    expect(r.state.scene!.physics).toBeUndefined();
    expect(ofType(r.events, 'physics_outcome')).toHaveLength(1);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', secondId: 'weight' });
    expect(hasSource(r.state.scene, 'contact', 'between_thighs')).toBe(false);
  });
});
