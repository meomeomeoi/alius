/**
 * P10e-e Task 23 (R28): her frame in `use` ends forgotten: the last phase over, she leaves and the commander stays posed (`forgotten_end`);
 * `physics/get_up` ends it (after "stay", her offence `hold_defied`), `physics/found` when a visitor of the frame comes in (`found_posed`).
 * The stop word always ends it. The digest sentence carries no uncaught relief.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { physicsDirective, tallySentence } from '../../../src/blocking/physicsDirectives';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { registerPresenceTerms, resetPresenceHooks } from '../../../src/engine/physics/presence';
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

/** Her frame on comms (one hour: two phases), her presence forced to `use` (or `with`). */
function framed(step: 'use' | 'with'): CampaignState {
  registerFrameReader(() => 'play');
  registerPhysicsStyle((_s, id) => (id === ANN ? { primary: step === 'use' ? 'cruel' : 'affectionate' } : null));
  registerPresenceTerms((_s, _r, id) => (id === ANN ? { regardRank: step === 'use' ? 4 : 0, regardBands: 5, holdIndex: step === 'use' ? 4 : 0, holdBands: 5, hash: () => 0.5 } : null));
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service');
  const d = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'activity', value: 'on_comms' }, { at: 1, source: 'chip' });
  setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 2, source: 'chip' });
  expect(d.scene!.physics?.sourceKind).toBe('activity');
  return d;
}

/** Plays the frame to its last boundary (empty segments, `spare` between phases); returns the state and every event. */
function playOut(s: CampaignState): { state: CampaignState; events: ReturnType<typeof run>['events'] } {
  let state = s;
  const all: ReturnType<typeof run>['events'] = [];
  for (let i = 0; i < 400; i++) {
    const p = state.scene?.physics;
    if (!p || p.forgotten) break;
    const step = p.marathon?.waiting
      ? run(state, reg, { type: 'physics/skip', payload: { strategy: 'spare' } })
      : p.segment.state === 'held'
        ? run(state, reg, { type: 'physics/next_segment', payload: { runId: p.id } })
        : run(state, reg, { type: 'physics/segment_end', payload: { runId: p.id, segment: p.segment.n, inputs: [] } });
    expect(errors(step.events)).toEqual([]);
    all.push(...step.events);
    state = step.state;
  }
  return { state, events: all };
}

describe('the forgotten end (R28)', () => {
  it('in use the end is forgotten and the commander stays posed', () => {
    const { state, events } = playOut(framed('use'));
    expect(ofType(events, 'forgotten_end')).toEqual([{ type: 'forgotten_end', runId: 'p1', holderId: ANN }]);
    expect(ofType(events, 'physics_outcome')).toEqual([]);
    expect(state.scene!.physics).toMatchObject({ forgotten: true, segment: { state: 'held' } });
    expect(state.scene!.blocking![COMMANDER]!.anchor).toEqual({ id: 'beside_her', relTo: ANN });
    // nothing more is planned: the body waits posed
    expect(errors(run(state, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).events).length).toBeGreaterThan(0);
  });

  it('with her presence `with` the last phase ends as before (released)', () => {
    const { events } = playOut(framed('with'));
    expect(ofType(events, 'forgotten_end')).toEqual([]);
    expect(ofType(events, 'physics_outcome')[0]).toMatchObject({ result: 'released', sourceKind: 'activity' });
  });

  it('get_up after "stay" ends the frame and is her offence hold_defied (through the practices, once)', () => {
    const { state } = playOut(framed('use'));
    const r = run(state, reg, { type: 'physics/get_up', payload: { runId: 'p1' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'physics_got_up')).toEqual([{ type: 'physics_got_up', runId: 'p1', holderId: ANN, stayed: true }]);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
    expect(r.state.scene!.physics).toBeUndefined();
    // a get up with no forgotten frame is refused
    expect(errors(run(framed('use'), reg, { type: 'physics/get_up', payload: { runId: 'p1' } }).events).length).toBeGreaterThan(0);
  });

  it('a visitor of the frame finds the commander posed: found_posed, and the frame ends', () => {
    const { state } = playOut(framed('use'));
    const finder = state.squad.find((u) => u.id !== ANN && u.kind === 'named')!.id;
    const r = run(state, reg, { type: 'physics/found', payload: { runId: 'p1', finderId: finder } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'found_posed')).toEqual([{ type: 'found_posed', runId: 'p1', holderId: ANN, finderId: finder }]);
    expect(r.state.scene!.physics).toBeUndefined();
    expect(errors(run(state, reg, { type: 'physics/found', payload: { runId: 'p1', finderId: ANN } }).events).length).toBeGreaterThan(0); // she is no finder
  });

  it('the stop word ends the forgotten end at once', () => {
    const { state } = playOut(framed('use'));
    const r = run(state, reg, { type: 'physics/stop_word', payload: {} });
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped' });
    expect(r.state.scene!.physics).toBeUndefined();
  });
});

describe('her hour\'s digest (R28)', () => {
  it('the sentence carries only what she perceived: a caught relief or fidget, never an uncaught one', () => {
    const passive = reg.contactPhysics.get('her_activity');
    expect(tallySentence({ cheatsCaught: 2 }, passive)).toBe('Over the whole hold: she noticed the commander move twice.');
    expect(tallySentence({}, passive)).toBe('');
    const d = physicsDirective({ type: 'physics_outcome', runId: 'p1', physicsId: 'her_activity', holderId: ANN, result: 'released', segments: 4, sourceKind: 'activity', sourceId: 'on_comms', tally: { cheatsCaught: 1 } }, framed('with'), reg)!;
    expect(d.text).toMatch(/noticed the commander move once/);
    expect(d.text).not.toMatch(/relie|fidget|unnoticed|\bhe\b|\bhis\b/i);
  });
});
