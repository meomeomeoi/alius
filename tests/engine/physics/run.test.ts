import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyPhysicsDirectives } from '../../../src/blocking/physicsDirectives';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, hasSource, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { holdsUntilOf, registerHoldsUntil, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { ContextBuilder } from '../../../src/llm/context';
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
const ctx = () => ({ registries: reg });
const ON = ['worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation'];

function scene(on: string[] = ON): CampaignState {
  registerFrameReader(() => 'play'); // the contacts are dynamic
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
/** Sets a change on a clone and returns the state and the events. */
function put(s: CampaignState, c: BlockingChange) {
  const d = structuredClone(s);
  const events = setBlocking(d, ctx(), c, { at: 3, source: 'chip' });
  return { state: d, events };
}
const SMOTHER: BlockingChange = { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER };
const CHAIR: BlockingChange = { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER };
const smothered = (on?: string[]) => put(scene(on), SMOTHER).state;

describe('a run starts from a contact or an item with physics', () => {
  it('a contact with physics starts a run (held, no segment yet) with the neutral stand-ins, and draws nothing', () => {
    const s = scene();
    const { state, events } = put(s, SMOTHER);
    const p = state.scene!.physics!;
    expect(p).toMatchObject({ id: 'p1', physicsId: 'breath', sourceKind: 'contact', sourceId: 'smothered_armpit', holderId: ANN, gauge: 100, capacity: 100, segment: { n: 0, state: 'held' }, taps: 0, streak: 0, extend: 0 });
    expect(ofType(events, 'physics_started')[0]).toMatchObject({ runId: 'p1', physicsId: 'breath', holderId: ANN, sourceKind: 'contact', sourceId: 'smothered_armpit' });
    expect(ofType(events, 'blocking_changed')).toHaveLength(1);
    expect(state.rng).toEqual(s.rng);
    expect(state.scene!.physicsCount).toBe(1);
    expect(['leaky', 'firm']).toContain(p.seal); // the contact's seal range, picked by her style
    expect(holdsUntilOf(state, ANN)).toBe('signal');
  });

  it('an item with physics starts one too (the pair is the holder)', () => {
    const s = scene(['restraint', 'humiliation']);
    const { state } = put(s, { person: COMMANDER, field: 'worn', value: 'ring_gag' });
    expect(state.scene!.physics).toMatchObject({ physicsId: 'jaw', sourceKind: 'item', sourceId: 'ring_gag', holderId: ANN, gauge: 0 });
  });

  it('the gauge starts where the physics says: a capacity full, a fill empty, dirt at 100', () => {
    expect(put(scene(), CHAIR).state.scene!.physics).toMatchObject({ physicsId: 'weight', gauge: 100 });
    const gulpless = put(scene(), { person: ANN, field: 'contact', value: 'boot_worship', with: COMMANDER });
    expect(gulpless.state.scene!.physics).toMatchObject({ physicsId: 'tongue_work', gauge: 100 });
  });

  it('an interaction switched off in settings: the contact applies, no run', () => {
    const s = scene();
    s.settings.physicsInteractions = { timing: false, hold: true, decision: true, order: true, passive: true, gesture: true, inhale: true };
    const { state, events } = put(s, SMOTHER);
    expect(state.scene!.physics).toBeUndefined();
    expect(ofType(events, 'physics_started')).toEqual([]);
    expect(hasSource(state.scene, 'contact', 'smothered_armpit')).toBe(true);
  });

  it('a contact with no physics starts nothing; only one run per scene', () => {
    const s = scene();
    s.content = { enabled: [...ON, 'humiliation'] };
    expect(put(s, { person: ANN, field: 'contact', value: 'holding_hands', with: COMMANDER, direction: 'from' }).state.scene!.physics).toBeUndefined();
    const first = put(s, SMOTHER).state;
    const second = put(first, { person: COMMANDER, field: 'worn', value: 'ring_gag' }).state;
    expect(second.scene!.physics).toMatchObject({ physicsId: 'breath', sourceId: 'smothered_armpit' }); // the first stays
  });

  it('removing the source ends the run (released); a replaced contact does too', () => {
    const s = smothered();
    const removed = put(s, { person: COMMANDER, field: 'removed', value: 'smothered_armpit' });
    expect(removed.state.scene!.physics).toBeUndefined();
    expect(ofType(removed.events, 'physics_outcome')[0]).toMatchObject({ runId: 'p1', result: 'released', physicsId: 'breath' });
    const replaced = put(s, CHAIR);
    expect(ofType(replaced.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
    expect(replaced.state.scene!.physics).toMatchObject({ physicsId: 'weight', id: 'p2' }); // and the new contact's physics starts
  });

  it('physics/start: the explicit form checks the source, the holder and the gates', () => {
    const s = put(scene(), CHAIR).state;
    delete s.scene!.physics;
    const ok = run(s, reg, { type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN, duration: { hours: 2 } } });
    expect(errors(ok.events)).toEqual([]);
    expect(ok.state.scene!.physics).toMatchObject({ physicsId: 'weight' });
    for (const bad of [{ physicsId: 'nonsense' }, { sourceId: 'nothing' }, { holderId: 'unit_bea' }, { physicsId: 'breath' }]) {
      expect(errors(run(s, reg, { type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN, ...bad } }).events), JSON.stringify(bad)).not.toEqual([]);
    }
    expect(errors(run(ok.state, reg, { type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN } }).events)).not.toEqual([]); // one at a time
  });
});

describe('the tap follows what she holds the commander until', () => {
  const tap = (s: CampaignState) => run(s, reg, { type: 'physics/signal', payload: {} });

  it('signal releases', () => {
    const r = tap(smothered());
    expect(ofType(r.events, 'physics_signal')[0]).toMatchObject({ holdsUntil: 'signal', released: true });
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
    expect(r.state.scene!.physics).toBeUndefined();
    expect(hasSource(r.state.scene, 'contact', 'smothered_armpit')).toBe(false); // the hold is over: so is the contact
  });

  it('limit ignores the first tap and releases at the second', () => {
    registerHoldsUntil(() => 'limit');
    const first = tap(smothered());
    expect(ofType(first.events, 'physics_signal')[0]).toMatchObject({ holdsUntil: 'limit', released: false, ignored: true });
    expect(first.state.scene!.physics!.taps).toBe(1);
    const second = tap(first.state);
    expect(ofType(second.events, 'physics_signal')[0]).toMatchObject({ released: true });
    expect(second.state.scene!.physics).toBeUndefined();
  });

  it('blackout without breath_play acts as limit; with it, the tap is ignored', () => {
    registerHoldsUntil(() => 'blackout');
    const without = tap(smothered());
    expect(ofType(without.events, 'physics_signal')[0]).toMatchObject({ holdsUntil: 'limit', released: false });
    expect(tap(without.state).state.scene!.physics).toBeUndefined();
    const withPlay = smothered([...ON, 'breath_play']);
    const a = tap(withPlay);
    expect(ofType(a.events, 'physics_signal')[0]).toMatchObject({ holdsUntil: 'blackout', released: false, ignored: true });
    expect(tap(a.state).state.scene!.physics).toBeDefined(); // however often
  });

  it('a tap with no run is refused', () => {
    expect(errors(tap(scene()).events)).not.toEqual([]);
  });
});

describe('the stop word always works', () => {
  const stop = (s: CampaignState) => run(s, reg, { type: 'physics/stop_word', payload: {} });
  const states = (): Record<string, CampaignState> => {
    const held = smothered();
    const running = structuredClone(held);
    running.scene!.physics!.segment = { n: 1, state: 'running', plan: { beats: [{ attention: 'watching' }, { attention: 'busy' }] } };
    const marathon = structuredClone(held);
    (marathon.scene!.physics as { duration?: unknown }).duration = 'unknown';
    return { held, running, marathon };
  };

  it('at every point and at each holdsUntil: the run ends (stopped), the contact is removed, blocking:stop is set', () => {
    for (const until of ['signal', 'limit', 'blackout'] as const) {
      resetPhysicsHooks();
      registerHoldsUntil(() => until);
      for (const [where, s] of Object.entries(states())) {
        const r = stop(s);
        expect(errors(r.events), `${where} ${until}`).toEqual([]);
        expect(ofType(r.events, 'physics_outcome')[0], `${where} ${until}`).toMatchObject({ result: 'stopped', runId: 'p1' });
        expect(r.state.scene!.physics).toBeUndefined();
        expect(hasSource(r.state.scene, 'contact', 'smothered_armpit')).toBe(false);
        const b = new ContextBuilder();
        expect(applyPhysicsDirectives(b, r.events, r.state, reg)).toBe(true);
        expect(b.build(r.state, 4000).directives).toContain('The commander used the stop word. She stops what she is doing now');
        b.onReplyReceived();
        expect(b.build(r.state, 4000).directives).not.toContain('stop word'); // one reply only
      }
    }
  });

  it('an item: it is taken off', () => {
    const s = put(scene(['restraint', 'humiliation']), { person: COMMANDER, field: 'worn', value: 'ring_gag' }).state;
    const r = stop(s);
    expect(hasSource(r.state.scene, 'item', 'ring_gag')).toBe(false);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', physicsId: 'jaw' });
  });

  it('with no run it still ends the contact; with nothing to stop it is refused', () => {
    const s = put(scene(), { person: ANN, field: 'contact', value: 'holding_hands', with: COMMANDER, direction: 'from' }).state;
    const r = stop(s);
    expect(hasSource(r.state.scene, 'contact', 'holding_hands')).toBe(false);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', runId: null });
    expect(errors(stop(scene()).events)).not.toEqual([]);
  });
});

describe('a category switched off mid-scene', () => {
  it('ends the run on the tagged contact (physics_outcome stopped) and takes the contact away', () => {
    const s = smothered();
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ON.filter((c) => c !== 'restraint') } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.physics).toBeUndefined();
    expect(hasSource(r.state.scene, 'contact', 'smothered_armpit')).toBe(false);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'stopped', runId: 'p1', physicsId: 'breath' });
    expect(ofType(r.events, 'content_changed')).toHaveLength(1);
  });

  it('a category that does not touch the source leaves the run', () => {
    const r = run(smothered(), reg, { type: 'content/set_categories', payload: { enabled: ON.filter((c) => c !== 'service') } });
    expect(r.state.scene!.physics).toBeDefined();
  });
});

describe('no draw before a run', () => {
  it('starting, tapping and stopping draw nothing', () => {
    const s = scene();
    const a = put(s, SMOTHER).state;
    expect(a.rng).toEqual(s.rng);
    expect(run(a, reg, { type: 'physics/signal', payload: {} }).state.rng).toEqual(s.rng);
    expect(run(a, reg, { type: 'physics/stop_word', payload: {} }).state.rng).toEqual(s.rng);
  });
});
