import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { actLines, physicsDirective } from '../../../src/blocking/physicsDirectives';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { ACT_KINDS, actsFor, countedTarget } from '../../../src/engine/physics/acts';
import { resolveSegment } from '../../../src/engine/physics/segment';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun } from '../../../src/engine/physics/state';
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
const ON = ['worship', 'bodily_fluids', 'humiliation'];

/** The commander at Ann's feet (a mouth contact) with no hold running. */
function worship(contact = 'foot_worship', on: string[] = ON, target: string | undefined = 'feet'): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...on);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'contact', value: contact, with: ANN, direction: 'to', ...(target ? { target } : {}) }, { at: 3, source: 'chip' });
  delete st.scene!.physics; // a hold of its own would be in the way of the act
  return st;
}
const act = (s: CampaignState, kind: string, seed = 1) => {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  return run(d, reg, { type: 'physics/act', payload: { kind } });
};

describe('which acts a contact offers', () => {
  it('only a mouth contact has any; pet needs pet play', () => {
    expect(actsFor(worship(), reg)).toEqual(['kiss', 'counted', 'long', 'lick', 'mouth']);
    expect(actsFor(worship('foot_worship', [...ON, 'pet_play']), reg)).toEqual(['kiss', 'counted', 'long', 'lick', 'pet', 'mouth']);
    const hands = worship('holding_hands', ON, '');
    expect(actsFor(hands, reg)).toEqual([]);
    expect(actsFor(campaign(reg, 4), reg)).toEqual([]);
    expect(ACT_KINDS).toEqual(['kiss', 'counted', 'long', 'lick', 'pet', 'mouth']);
  });

  it('without worship there is no mouth contact to offer them on', () => {
    const s = worship();
    s.content = { enabled: [] };
    expect(actsFor(s, reg)).toEqual([]);
    expect(errors(act(s, 'kiss').events)).not.toEqual([]);
  });

  it('is refused for an unknown kind, with no contact, and while a hold is running', () => {
    const s = worship();
    expect(errors(act(s, 'sing').events)).not.toEqual([]);
    expect(errors(run(campaign(reg, 4), reg, { type: 'physics/act', payload: { kind: 'kiss' } }).events)).not.toEqual([]);
    const running = structuredClone(s);
    running.scene!.physics = { id: 'p1' } as never;
    expect(errors(act(running, 'kiss').events)[0]).toMatchObject({ message: expect.stringMatching(/running/) });
  });
});

describe('a kiss', () => {
  it('is a discrete act with her reaction in the directive for one reply, and it draws nothing', () => {
    const s = worship();
    const r = act(s, 'kiss', 5);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'mouth_act')[0]).toMatchObject({ kind: 'kiss', unitId: ANN });
    expect(r.state.scene!.physics).toBeUndefined();
    expect(r.state.scene!.act).toBeUndefined();
    expect(r.state.rng).toEqual(seedRng(5));
    const d = physicsDirective(ofType(r.events, 'mouth_act')[0]!, r.state, reg)!;
    expect(d).toMatchObject({ id: 'physics:act', expiresAfter: 'next_reply' });
    expect(d.text).toContain('Ann');
    expect(d.text).not.toMatch(/\b(he|him|his|feel|feels|love|loves)\b/i);
  });

  it('every act exposes the taste kinds of its contact: a session of tolerance and a seeking step, per kind', () => {
    for (const kind of ['kiss', 'counted', 'lick']) {
      const r = act(worship(), kind);
      expect(r.state.commander.stimuli!.taste_salt, kind).toMatchObject({ exposure: 1, tolerance: 22 });
      expect(r.state.commander.stimuli!.taste_salt!.seek, kind).toBeGreaterThan(0);
      expect(r.state.commander.stimuli!.scent_feet, kind).toBeUndefined(); // an act is the mouth's: only the tastes
    }
    const boots = worship('boot_worship', ON, 'boots');
    expect(Object.keys(act(boots, 'kiss').state.commander.stimuli!).sort()).toEqual(['taste_dirt', 'taste_polish']);
  });
});

describe('an act that has no contact any more (review I3)', () => {
  it('the stop word ends the counted kisses, and the model is told nothing of them', () => {
    const a = act(worship(), 'counted');
    expect(errors(a.events)).toEqual([]);
    expect(a.state.scene!.act).toBeDefined();
    const stopped = run(a.state, reg, { type: 'physics/stop_word', payload: {} });
    expect(errors(stopped.events)).toEqual([]);
    expect(stopped.state.scene!.act).toBeUndefined();
    expect(actLines(stopped.state, reg)).toBeNull();
  });

  it('removing the mouth contact (a chip) ends them too', () => {
    const a = act(worship(), 'counted').state;
    const d = structuredClone(a);
    setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'removed', value: 'foot_worship' }, { at: 5, source: 'chip' });
    expect(d.scene!.act).toBeUndefined();
  });
});

describe('counted kisses', () => {
  it('she sets the number by a hash: ten to a hundred by tens, stable for the same scene and exchange', () => {
    const s = worship();
    const n = countedTarget(s);
    expect(n % 10).toBe(0);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(100);
    expect(countedTarget(s)).toBe(n);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const t = structuredClone(s);
      t.scene!.exchanges = i;
      seen.add(countedTarget(t));
    }
    expect(seen.size).toBeGreaterThan(4);
    const r = act(s, 'counted');
    expect(r.state.scene!.act).toMatchObject({ kind: 'counted', n, tries: 0 });
    expect(ofType(r.events, 'mouth_act')[0]).toMatchObject({ kind: 'counted', n });
  });

  it('the right number finishes it; a wrong one restarts the count (the number stays)', () => {
    const started = act(worship(), 'counted').state;
    const n = started.scene!.act!.n!;
    const wrong = run(started, reg, { type: 'physics/act_finish', payload: { typed: n + 1 } });
    expect(errors(wrong.events)).toEqual([]);
    expect(ofType(wrong.events, 'mouth_act_restart')[0]).toMatchObject({ n, tries: 1 });
    expect(wrong.state.scene!.act).toMatchObject({ kind: 'counted', n, tries: 1 });
    const right = run(wrong.state, reg, { type: 'physics/act_finish', payload: { typed: n } });
    expect(ofType(right.events, 'mouth_act_done')[0]).toMatchObject({ kind: 'counted', n, tries: 1 });
    expect(right.state.scene!.act).toBeUndefined();
    expect(errors(run(right.state, reg, { type: 'physics/act_finish', payload: { typed: n } }).events)).not.toEqual([]); // nothing to finish
    expect(errors(run(started, reg, { type: 'physics/act_finish', payload: { typed: 'many' } }).events)).not.toEqual([]);
  });

  it('while counting, the directive says how many she asked for; and another act cannot start', () => {
    const started = act(worship(), 'counted').state;
    const n = started.scene!.act!.n!;
    const text = refreshText(started);
    expect(text).toContain(`${n}`);
    expect(errors(act(started, 'kiss').events)).not.toEqual([]);
  });
});

const refreshText = (s: CampaignState): string => actLines(s, reg)!.text;

describe('the acts that run a physics', () => {
  const started = (kind: string, on = ON): PhysicsRun => {
    const r = act(worship('foot_worship', on), kind);
    expect(errors(r.events), kind).toEqual([]);
    return r.state.scene!.physics!;
  };

  it('lick runs tongue work with a dryness gauge; mouth runs the jaw; long runs a hold; pet runs timing', () => {
    expect(started('lick')).toMatchObject({ physicsId: 'tongue_work', act: 'lick', dryness: 0, sourceKind: 'contact', sourceId: 'foot_worship', holderId: ANN });
    expect(started('mouth')).toMatchObject({ physicsId: 'jaw', act: 'mouth' });
    expect(started('long')).toMatchObject({ physicsId: 'weight', act: 'long' });
    expect(started('pet', [...ON, 'pet_play'])).toMatchObject({ act: 'pet' });
    expect(reg.contactPhysics.get(started('pet', [...ON, 'pet_play']).physicsId)!.interaction).toBe('timing');
    expect(started('lick').second).toBeUndefined();
  });

  it('pet gives her a window on every beat', () => {
    const r = act(worship('foot_worship', [...ON, 'pet_play']), 'pet').state;
    const n = run(r, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state.scene!.physics!.segment.plan!;
    expect(n.beats.every((b) => b.opening !== undefined)).toBe(true);
  });

  it('licking dries the mouth: +6 a beat, and at 100 a right order takes off 8 only', () => {
    const mk = (dryness: number): PhysicsRun => ({ id: 'p1', physicsId: 'tongue_work', sourceKind: 'contact', sourceId: 'x', holderId: ANN, gauge: 100, capacity: 100, segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, act: 'lick', dryness });
    const plan = { beats: [{ attention: 'busy' as const, part: 'toes' }, { attention: 'busy' as const, part: 'heel' }] };
    const env = { gaugeKind: 'dirt' as const, interaction: 'order' as const, style: { primary: 'neutral' as const }, sealLevel: 0, band: 'noticeable' as const };
    const wet = resolveSegment(mk(0), plan, [{ beat: 0, kind: 'part', part: 'toes' }], env);
    expect(wet.gauge).toBe(85);
    expect(wet.dryness).toBe(12);
    const dry = resolveSegment(mk(100), plan, [{ beat: 0, kind: 'part', part: 'toes' }], env);
    expect(dry.gauge).toBe(92);
    expect(dry.dryness).toBe(100);
    expect(resolveSegment({ ...mk(0), act: undefined, dryness: undefined }, plan, [], env).dryness).toBeUndefined();
  });

  it('the run goes through a segment and ends like any other; dryness is kept', () => {
    const s = act(worship(), 'lick').state;
    const a = run(s, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
    const b = run(a, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [] } });
    expect(errors(b.events)).toEqual([]);
    expect(b.state.scene!.physics!.dryness).toBe(24);
  });
});
