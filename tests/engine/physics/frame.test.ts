/**
 * P10e-e Task 21 (R24, R27): her frame starts from the blocking (her activity with a `frame`, the commander placed by her), as a marathon of
 * her activity's hours; the stillness inside reports `relieve` / `fidget` with their loudness, a noise of loudness × her ears × (1 − cover).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { resolveEnvOf, resolveSegment } from '../../../src/engine/physics/segment';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { frameOf } from '../../../src/engine/physics/presence';
import type { PhysicsRun, SegmentPlan } from '../../../src/engine/physics/state';
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
const ON = ['worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation'];

function scene(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
function put(s: CampaignState, c: BlockingChange, source: 'chip' | 'reading' = 'chip') {
  const d = structuredClone(s);
  const events = setBlocking(d, { registries: reg }, c, { at: 3, source });
  return { state: d, events };
}
const READING: BlockingChange = { person: ANN, field: 'activity', value: 'reading_book' };
const BESIDE: BlockingChange = { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN };

describe('her frame starts from the blocking (R24)', () => {
  it('the twelve activities of ACTS carry a frame (and the throne\'s holding_audience, 24b), read by field', () => {
    const framed = [...reg.blockingActivities.values()].filter((a) => frameOf(a) !== null).map((a) => a.id).sort();
    expect(framed).toEqual(['chatting_on_pda', 'cleaning_weapon', 'drinking', 'holding_audience', 'mending_clothes', 'music', 'on_comms', 'playing_cards', 'reading_book', 'reading_reports', 'sketching', 'sleeping', 'writing_report']);
    expect(frameOf(reg.blockingActivities.get('reading_book'))).toMatchObject({ absorb: -0.35, hear: 0.9, light: 'lamp', unit: 'pages', total: 160, per: [6, 13], legs: 'swing' });
  });

  it('she reading a book, the commander placed beside her (an anchor of hers) → physics_started her_activity from the activity, a marathon of unknown length', () => {
    const a = put(scene(), READING).state;
    const { state, events } = put(a, BESIDE);
    const started = ofType(events, 'physics_started')[0];
    expect(started).toMatchObject({ physicsId: 'her_activity', sourceKind: 'activity', sourceId: 'reading_book', holderId: ANN, duration: 'unknown' });
    expect(state.scene!.physics).toMatchObject({ sourceKind: 'activity', sourceId: 'reading_book', duration: 'unknown' });
    expect(state.scene!.physics!.marathon).toMatchObject({ hours: 'unknown', phase: 1 });
    expect(state.rng).toEqual(a.rng); // nothing drawn
  });

  it('a posture she set (a reading, not the player\'s chip) places the commander; the player\'s own chip does not', () => {
    const a = put(scene(), READING).state;
    const KNEEL: BlockingChange = { person: COMMANDER, field: 'posture', value: 'kneeling_upright' };
    expect(ofType(put(a, KNEEL, 'reading').events, 'physics_started')[0]).toMatchObject({ physicsId: 'her_activity', sourceKind: 'activity' });
    expect(ofType(put(a, KNEEL, 'chip').events, 'physics_started')).toEqual([]);
  });

  it('an activity with hours runs that marathon; one without a frame starts nothing', () => {
    const comms = put(put(scene(), { person: ANN, field: 'activity', value: 'on_comms' }).state, BESIDE);
    expect(ofType(comms.events, 'physics_started')[0]).toMatchObject({ duration: { hours: 1 } });
    const idle = put(put(scene(), { person: ANN, field: 'activity', value: 'idle' }).state, BESIDE);
    expect(ofType(idle.events, 'physics_started')).toEqual([]);
    expect(idle.state.scene!.physics).toBeUndefined();
  });

  it('a scene without the blocking live starts nothing', () => {
    resetBlockingHooks(); // no frame reader: the blocking is not live
    const s = campaign(reg, 4); // no bond of hers: no tier, so the blocking is not live
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const d = structuredClone(r.state);
    try {
      setBlocking(d, { registries: reg }, READING, { at: 3, source: 'chip' });
      setBlocking(d, { registries: reg }, BESIDE, { at: 3, source: 'chip' });
    } catch {
      // the gate refuses the blocking: nothing to start either way
    }
    expect(d.scene!.physics).toBeUndefined();
  });

  it('her activity changing ends the frame (her activity is not taken away when it ends)', () => {
    const framed = put(put(scene(), READING).state, BESIDE).state;
    const { state, events } = put(framed, { person: ANN, field: 'activity', value: 'idle' });
    expect(ofType(events, 'physics_outcome')[0]).toMatchObject({ physicsId: 'her_activity', result: 'released', sourceKind: 'activity' });
    expect(state.scene!.blocking![ANN]!.activity).toBe('idle');
  });

  it('the stop word ends the frame and leaves her at her activity', () => {
    const framed = put(put(scene(), READING).state, BESIDE).state;
    const r = run(framed, reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', sourceKind: 'activity' });
    expect(r.state.scene!.physics).toBeUndefined();
    expect(r.state.scene!.blocking![ANN]!.activity).toBe('reading_book');
  });
});

describe('the stillness inside: relieve and fidget (R27)', () => {
  const four = (): SegmentPlan => ({ beats: [0, 1, 2, 3].map(() => ({ attention: 'busy' as const })) });
  function framedRun(): { s: CampaignState; p: PhysicsRun } {
    const s = put(put(scene(), READING).state, BESIDE).state;
    return { s, p: s.scene!.physics! };
  }

  it('a relief and a fidget are P15a reliefs (cheatRoll decides), and a noise of loudness × her ears × (1 − cover)', () => {
    const { s, p } = framedRun();
    const env = resolveEnvOf(s, reg, p);
    expect(env.hear).toBe(0.9);
    const r = resolveSegment(p, four(), [{ beat: 1, kind: 'relieve', amount: 0.7 }, { beat: 2, kind: 'fidget', amount: 0.28 }], env);
    expect(r.reliefs).toBe(2);
    expect(r.reliefInputs).toEqual([{ beat: 1, kind: 'relieve' }, { beat: 2, kind: 'fidget' }]);
    expect(r.frameNoise).toBeCloseTo(0.7 * 0.9 + 0.28 * 0.9, 6);
    expect(r.gauge).toBe(20); // her clock runs on as before
  });

  it('a loud relief is noise; one covered by her speech is not', () => {
    const { s, p } = framedRun();
    const go = (cover: number) => {
      const started = run(s, reg, { type: 'physics/next_segment', payload: { runId: p.id } }).state;
      const beats = started.scene!.physics!.segment.plan!.beats.length;
      const r = run(started, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: 1, inputs: [{ beat: Math.min(1, beats - 1), kind: 'relieve', amount: 0.7, cover }] } });
      expect(errors(r.events)).toEqual([]);
      return ofType(r.events, 'physics_noise');
    };
    expect(go(0)[0]).toMatchObject({ kind: 'rustle' });
    expect((go(0)[0] as unknown as { loudness: number }).loudness).toBeCloseTo(0.63, 6);
    expect(go(0.75)).toEqual([]); // 0.7 × 0.9 × 0.25 = 0.16, under TUNING.physics.frameQuiet (0.2): her speech covered it
  });

  it('old inputs resolve as before: a passive segment without relieve or fidget has no frame noise', () => {
    const { s, p } = framedRun();
    const r = resolveSegment(p, four(), [], resolveEnvOf(s, reg, p));
    expect(r.frameNoise).toBeUndefined();
    expect(r.reliefs).toBe(0);
  });
});
