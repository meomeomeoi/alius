/**
 * P10e-e review N1 / N2 (Rulings AA and W), through real `physics/segment_end`s: her frame is never ended by its progress gauge (it lives through
 * its segments and phases to her end, or the forgotten end, as the marathon paces it), and the weight inside it takes her rise, her rest, a hard
 * landing and the buckles from the instrument's `ask_rest` inputs.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { registerPresenceTerms, resetPresenceHooks } from '../../../src/engine/physics/presence';
import type { SegmentInput } from '../../../src/engine/physics/state';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
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
  resetPresenceHooks();
});

const ANN = 'unit_ann';
function framed(activity: string, step: 'use' | 'with', realtime: boolean, contact?: string): CampaignState {
  registerFrameReader(() => 'play');
  registerPhysicsStyle((_s, id) => (id === ANN ? { primary: step === 'use' ? 'cruel' : 'affectionate' } : null));
  registerPresenceTerms((_s, _r, id) => (id === ANN ? { regardRank: step === 'use' ? 4 : 0, regardBands: 5, holdIndex: step === 'use' ? 4 : 0, holdBands: 5, hash: () => 0.5 } : null));
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'objectification', 'humiliation', 'restraint');
  s.settings.physicsRealtime = realtime;
  const d = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'activity', value: activity }, { at: 1, source: 'chip' });
  if (contact) setBlocking(d, { registries: reg }, { person: ANN, field: 'contact', value: contact, with: COMMANDER }, { at: 2, source: 'chip' });
  else setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 2, source: 'chip' });
  expect(d.scene!.physics?.sourceKind).toBe('activity');
  return d;
}
/** Plays real segments (the inputs given per segment), `spare` between phases, until the frame ends or is forgotten. */
function playOut(s: CampaignState, inputs: (beats: number) => SegmentInput[] = () => []) {
  let state = s;
  const events: ReturnType<typeof run>['events'] = [];
  let segments = 0;
  for (let i = 0; i < 2000; i++) {
    const p = state.scene?.physics;
    if (!p || p.forgotten) break;
    const r = p.marathon?.waiting
      ? run(state, reg, { type: 'physics/skip', payload: { strategy: 'spare' } })
      : p.segment.state === 'held'
        ? run(state, reg, { type: 'physics/next_segment', payload: { runId: p.id } })
        : (segments++, run(state, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: p.segment.n, inputs: inputs(p.segment.plan!.beats.length) } }));
    expect(errors(r.events)).toEqual([]);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events, segments };
}

describe('Ruling AA: her frame is not ended by its progress', () => {
  it('a reading_book frame (real time, 20-beat segments) lives through several segments and phases to the forgotten end at use', () => {
    const { state, events, segments } = playOut(framed('reading_book', 'use', true));
    expect(segments).toBeGreaterThan(5);
    expect(ofType(events, 'marathon_phase').filter((e) => e.over === true).length).toBe(6);
    expect(ofType(events, 'forgotten_end')).toHaveLength(1);
    expect(ofType(events, 'physics_outcome')).toEqual([]);
    expect(state.scene!.physics!.forgotten).toBe(true);
  });

  it('an on_comms frame at with runs its two phases and ends with her end (released at its last phase)', () => {
    const { events, segments } = playOut(framed('on_comms', 'with', true));
    expect(segments).toBeGreaterThan(2);
    expect(ofType(events, 'marathon_phase').filter((e) => e.over === true).map((e) => e.phase)).toEqual([1, 2]);
    expect(ofType(events, 'physics_outcome')).toHaveLength(1);
    expect(ofType(events, 'physics_outcome')[0]).toMatchObject({ result: 'released', sourceKind: 'activity' });
    expect(ofType(events, 'marathon_done')).toHaveLength(1);
  });
});

describe('Ruling W through physics/segment_end: the weight inside her frame', () => {
  /** The throne (human_chair inside reading_reports), its first segment running; the second's gauge set. */
  function throne(gauge: number, buckles = 0): CampaignState {
    const s = framed('reading_reports', 'with', false, 'human_chair');
    const r = run(s, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
    expect(errors(r.events)).toEqual([]);
    r.state.scene!.physics!.second!.gauge = gauge;
    if (buckles) r.state.scene!.physics!.second!.buckles = buckles;
    return r.state;
  }
  const end = (s: CampaignState, inputs: (n: number) => SegmentInput[]) => {
    const p = s.scene!.physics!;
    return run(s, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: p.segment.n, inputs: inputs(p.segment.plan!.beats.length) } });
  };
  const beats = (n: number, f: (b: number) => SegmentInput[]) => Array.from({ length: n }, (_, b) => f(b)).flat();
  const holds = (n: number) => beats(n, (b) => [{ beat: b, kind: 'hold' }]);

  it('(e) her rise: no drain and no slip, even when the commander lets go', () => {
    const held = end(throne(60), (n) => beats(n, (b) => [{ beat: b, kind: 'hold' }, { beat: b, kind: 'ask_rest', part: 'up' }]));
    expect(held.state.scene!.physics!.second!.gauge).toBe(60);
    const letGo = end(throne(60), (n) => beats(n, (b) => [{ beat: b, kind: 'ask_rest', part: 'up' }]));
    expect(errors(letGo.events)).toEqual([]);
    expect(ofType(letGo.events, 'physics_slip')).toEqual([]);
    expect(letGo.state.scene!.physics!.second!.gauge).toBe(60);
  });

  it('(c) the end of her rest gives the strength back; (f) a hard landing is charged', () => {
    const base = end(throne(50), holds).state.scene!.physics!.second!.gauge;
    const rested = end(throne(50), (n) => [...holds(n), { beat: 1, kind: 'ask_rest', part: 'rest', amount: 30 }]).state.scene!.physics!.second!.gauge;
    expect(rested).toBeCloseTo(base + 30, 6);
    const landed = end(throne(50), (n) => [...holds(n), { beat: 1, kind: 'ask_rest', part: 'charge', amount: 18 }]).state.scene!.physics!.second!.gauge;
    expect(landed).toBeCloseTo(base - 18, 6);
  });

  it('(d) at 0 the commander buckles back to 35 (the engine counts); the third buckle ends the frame', () => {
    const one = end(throne(1), () => []);
    const second = one.state.scene!.physics!.second!;
    expect(second.buckles).toBe(1);
    expect(second.gauge).toBeGreaterThan(0);
    const third = end(throne(1, 2), () => []);
    expect(ofType(third.events, 'physics_buckle')).toHaveLength(1);
    expect(ofType(third.events, 'physics_outcome')[0]).toMatchObject({ result: 'collapse', sourceKind: 'activity' });
  });
});
