import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { installCraftHooks, rhythmLevel, stillnessShare } from '../../../src/engine/craft/hooks';
import { noiseOf, segmentNoise } from '../../../src/engine/physics/gaze';
import { registerRhythmKnown, registerStillness, resetPhysicsHooks, rhythmKnownOf, stillnessOf } from '../../../src/engine/physics/style';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { loadCore, run } from '../../helpers/world';
import { ANN, holdScene, startWeight, world } from '../craft/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => { installCraftHooks(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

describe('the hooks read 0 until something is learnt', () => {
  it('with nothing registered, or nothing written, stillness and her rhythm are 0', () => {
    resetPhysicsHooks();
    const s = world(reg, 'play');
    expect(stillnessOf(s, ANN)).toBe(0);
    expect(rhythmKnownOf(s, ANN)).toBe(0);
    installCraftHooks();
    expect(stillnessOf(s, ANN)).toBe(0);
    expect(rhythmKnownOf(s, ANN)).toBe(0);
    expect(noiseOf('slip', stillnessOf(s, ANN))).toEqual({ loudness: 1, kind: 'creak' });
  });

  it('a reader that answers null has nothing to say, and the first answer wins', () => {
    resetPhysicsHooks();
    const s = world(reg, 'play');
    registerStillness(() => null, 'a');
    expect(stillnessOf(s, ANN)).toBe(0);
    registerStillness(() => 0.3, 'b');
    registerStillness(() => 0.5, 'c');
    expect(stillnessOf(s, ANN)).toBe(0.3);
    registerRhythmKnown(() => 2, 'r');
    expect(rhythmKnownOf(s, ANN)).toBe(2);
    registerRhythmKnown(() => 4, 'r'); // the same key replaces it
    expect(rhythmKnownOf(s, ANN)).toBe(4);
  });

  it('installing twice does not stack', () => {
    installCraftHooks();
    installCraftHooks();
    const s = world(reg, 'play');
    s.commander.craft = { stillness: { xp: 90, level: 2, lastDay: s.day } };
    expect(stillnessOf(s, ANN)).toBeCloseTo(0.2);
  });
});

describe('stillness', () => {
  it('one level lowers the loudness by 10 %, five by 50 %', () => {
    const s = world(reg, 'play');
    for (const [level, share] of [[1, 0.1], [2, 0.2], [5, 0.5]] as const) {
      s.commander.craft = { stillness: { xp: 0, level, lastDay: s.day } };
      expect(stillnessShare(s)).toBeCloseTo(share);
      expect(noiseOf('slip', stillnessOf(s, ANN)).loudness).toBeCloseTo(1 - share);
      expect(segmentNoise({ gasps: 0, slips: 2, reliefs: 0 }, 'hold', stillnessOf(s, ANN))[0]!.loudness).toBeCloseTo(2 * (1 - share));
    }
  });

  it('a slip in a real run is quieter, and nothing else of the run moves', () => {
    const play = (level: number): { loud: number; state: CampaignState } => {
      const s = holdScene(reg);
      if (level > 0) s.commander.craft = { stillness: { xp: 0, level, lastDay: s.day } };
      let cur = startWeight(s, reg);
      cur.rng = seedRng(3);
      const a = run(cur, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
      const b = run(a.state, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [] } }); // nothing held: she slips
      const noise = b.events.filter((e) => e.type === 'physics_noise');
      expect(noise.length).toBeGreaterThan(0);
      return { loud: noise.reduce((n, e) => n + Number(e.loudness), 0), state: b.state };
    };
    const quiet = play(2), plain = play(0);
    expect(quiet.loud).toBeCloseTo(plain.loud * 0.8);
    expect(quiet.state.scene!.physics!.gauge).toBe(plain.state.scene!.physics!.gauge); // the same hold, only quieter
  });

  it('the reflex of a stimulus is quieter too', () => {
    const s = world(reg, 'play');
    s.commander.craft = { stillness: { xp: 0, level: 3, lastDay: s.day } };
    expect(noiseOf('reflex', stillnessOf(s, ANN)).loudness).toBeCloseTo(0.7);
  });
});

describe('her rhythm', () => {
  it('the levels the commander knows are those of the xp of the pair', () => {
    const s = world(reg, 'play');
    expect(rhythmLevel(s, ANN)).toBe(0);
    s.relations[ANN].craft = { rhythm: { xp: 90, day: s.day } };
    expect(rhythmLevel(s, ANN)).toBe(2);
    expect(rhythmKnownOf(s, ANN)).toBe(2);
  });

  it('each level widens her openings by 5 %, and moves nothing else of the plan', () => {
    const plan = (xp: number) => {
      const s = holdScene(reg);
      setBlocking(s, { registries: reg }, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, { at: 4, source: 'chip' });
      delete s.scene!.physics;
      s.scene!.physicsCount = 0;
      if (xp > 0) s.relations[ANN].craft = { rhythm: { xp, day: s.day } };
      const started = run(s, reg, { type: 'physics/start', payload: { physicsId: 'breath', sourceKind: 'contact', sourceId: 'smothered_armpit', holderId: ANN } });
      expect(started.events.filter((e) => e.type === 'error')).toEqual([]);
      const cur = started.state;
      cur.rng = seedRng(5);
      const a = run(cur, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } });
      return a.state.scene!.physics!.segment.plan!.beats;
    };
    const base = plan(0), known = plan(90); // level 2
    const open = (beats: ReturnType<typeof plan>) => beats.map((b, i) => (b.opening ? [i, b.opening.widthMs, b.opening.false === true] : null)).filter((x) => x !== null) as Array<[number, number, boolean]>;
    expect(open(base).length).toBeGreaterThan(0);
    expect(open(known).map(([i, , f]) => [i, f])).toEqual(open(base).map(([i, , f]) => [i, f])); // the same openings in the same places
    open(base).forEach(([, w], k) => expect(open(known)[k]![1]).toBeCloseTo(w * 1.1, 6));
    expect(known.map((b) => b.attention)).toEqual(base.map((b) => b.attention));
    // level 0 is the plan itself: nothing is multiplied
    expect(plan(0)).toEqual(base);
  });
});
