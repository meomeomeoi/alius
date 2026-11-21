import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { attentionCue, attentionPlan, cheatRoll, noiseOf, segmentNoise } from '../../../src/engine/physics/gaze';
import { weighted } from '../../../src/engine/moments/fire';
import { resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun } from '../../../src/engine/physics/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { allReadings } from '../../helpers/analyze';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
  registerCoreProviders();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];
const share = (xs: string[], v: string): number => xs.filter((x) => x === v).length / xs.length;

/** A footrest hold with a running segment whose beats are all `watching`, and a relief input on beat 1. */
function cheating(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
  r.scene!.physics!.segment.plan = { beats: [0, 1, 2, 3].map(() => ({ attention: 'watching' as const })) };
  return r;
}

describe('her attention', () => {
  const plan = (activity: string | undefined, n = 4000, style = { primary: 'neutral' as const }) => attentionPlan(n, activity, style, new Rng(seedRng(3)));

  it('follows her activity: reading reports is mostly busy, attending mostly watching', () => {
    const busy = plan(reg.blockingActivities.get('reading_reports')!.attention as string);
    expect(share(busy, 'busy')).toBeGreaterThan(0.5);
    expect(share(busy, 'watching')).toBeLessThan(0.2);
    const attending = plan(reg.blockingActivities.get('attending')!.attention as string);
    expect(share(attending, 'watching')).toBeGreaterThan(0.6);
    expect(share(plan('divided'), 'glancing')).toBeGreaterThan(0.3);
    expect(share(plan('none'), 'busy')).toBe(1);
    expect(plan(undefined)).toEqual(plan('on_commander')); // no activity reads as attending
  });

  it('a clinical holder is always watching and draws nothing', () => {
    const rng = new Rng(seedRng(3));
    expect(attentionPlan(6, 'elsewhere', { primary: 'clinical' }, rng)).toEqual(Array(6).fill('watching'));
    expect(rng.state).toEqual(seedRng(3));
  });

  it('is read from signs: a cue where it changes, none for a glance', () => {
    expect(attentionCue(undefined, 'watching')).toBe('watch');
    expect(attentionCue('watching', 'busy')).toBe('look_away');
    expect(attentionCue('busy', 'busy')).toBeNull();
    expect(attentionCue('busy', 'glancing')).toBeNull();
  });
});

describe('relief inputs', () => {
  const mk = (physicsId: string, over: Partial<PhysicsRun> = {}): PhysicsRun => ({
    id: 'p1', physicsId, sourceKind: 'contact', sourceId: 'x', holderId: ANN, gauge: 50, capacity: 100, segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
  });
  const plan = { beats: [0, 1, 2, 3].map(() => ({ attention: 'busy' as const })) };
  const env = (o: Partial<ResolveEnv>): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'hold', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...o });
  it('restore: +15 strength, −20 saturation, +5 air only when leaky', () => {
    const w = resolveSegment(mk('weight', { gauge: 20 }), { beats: [{ attention: 'busy' }] }, [{ beat: 0, kind: 'hold' }, { beat: 0, kind: 'shift_weight' }], env({}));
    expect(w.gauge).toBe(20 - 8 + 15);
    const s = resolveSegment(mk('saturation', { gauge: 60 }), { beats: [{ attention: 'busy' }] }, [{ beat: 0, kind: 'mouth_breath' }], env({ gaugeKind: 'fill', interaction: 'decision' }));
    expect(s.gauge).toBe(60 + 10 - 20);
    const leaky = resolveSegment(mk('breath', { seal: 'leaky' }), plan, [{ beat: 0, kind: 'gap_breath' }], env({ gaugeKind: 'capacity', interaction: 'timing' }));
    const firm = resolveSegment(mk('breath', { seal: 'firm' }), plan, [{ beat: 0, kind: 'gap_breath' }], env({ gaugeKind: 'capacity', interaction: 'timing' }));
    expect(leaky.reliefs).toBe(1);
    expect(firm.reliefs).toBe(0);
  });
});

describe('caught', () => {
  it('rates (10 000 draws): watching 0.6, glancing 0.25, busy 0.08; a reading of 3 makes it × 1.3', () => {
    const rate = (a: 'watching' | 'glancing' | 'busy', reading: number): number => {
      const rng = new Rng(seedRng(17));
      let n = 0;
      for (let i = 0; i < 10_000; i++) if (cheatRoll(rng, a, reading)) n++;
      return n / 10_000;
    };
    expect(rate('watching', 0)).toBeCloseTo(0.6, 1);
    expect(rate('glancing', 0)).toBeCloseTo(0.25, 1);
    expect(rate('busy', 0)).toBeCloseTo(0.08, 1);
    expect(rate('glancing', 3)).toBeCloseTo(0.25 * 1.3, 1);
    expect(rate('busy', 3)).toBeGreaterThan(rate('busy', 0));
    expect(TUNING.physics.gaze.caught).toEqual({ watching: 0.6, glancing: 0.25, busy: 0.08 });
  });

  const holds = [0, 1, 2, 3].map((beat) => ({ beat, kind: 'hold' }));
  const end = (s: CampaignState, seed: number, inputs: unknown[]) => {
    const d = structuredClone(s);
    d.rng = seedRng(seed);
    return run(d, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs } });
  };

  it('a relief input is rolled once and a catch is a double slip that fires the rule', () => {
    const s = cheating();
    const inputs = [...holds, { beat: 1, kind: 'shift_weight' }];
    let caught: ReturnType<typeof end> | undefined;
    let free: ReturnType<typeof end> | undefined;
    for (let seed = 1; seed < 100 && !(caught && free); seed++) {
      const r = end(s, seed, inputs);
      expect(errors(r.events)).toEqual([]);
      expect(ofType(r.events, 'physics_cheat')).toHaveLength(1);
      if (ofType(r.events, 'physics_caught').length > 0) caught ??= r;
      else free ??= r;
    }
    expect(caught && free).toBeTruthy();
    expect(ofType(caught!.events, 'physics_caught')[0]).toMatchObject({ holderId: ANN, kind: 'shift_weight', beat: 1 });
    expect(caught!.state.scene!.physics!.last!.slips).toBe(2);
    expect(free!.state.scene!.physics!.last!.slips).toBe(0);
    expect(caught!.state.memory.facts.some((f) => f.tags.includes('caught') && f.about.includes(ANN))).toBe(true);
    expect(free!.state.memory.facts.some((f) => f.tags.includes('caught'))).toBe(false);
    expect(caught!.state.scene!.physics!.extend).toBeGreaterThan(free!.state.scene!.physics!.extend); // a slip makes the hold last
  });

  it('no relief input, no draw for the gaze: the rng is the moment pass\'s alone', () => {
    const s = cheating();
    const r = end(s, 5, holds);
    expect(ofType(r.events, 'physics_cheat')).toEqual([]);
    expect(r.state.rng).toEqual(seedRng(5));
  });

  it('reading makes her catch more: the same seeds, more catches at level 3', () => {
    const s = cheating();
    const inputs = [...holds, { beat: 1, kind: 'shift_weight' }];
    const catches = (st: CampaignState) => Array.from({ length: 200 }, (_, i) => ofType(end(st, i + 1, inputs).events, 'physics_caught').length).reduce((a, b) => a + b, 0);
    const base = catches(s);
    const skilled = structuredClone(s);
    skilled.relations[ANN]!.herSkill = { seal: 0, weight: 0, reading: 3, swing: 0, rhythm: 0, practice: {} };
    expect(catches(skilled)).toBeGreaterThan(base);
  });
});

describe('noise', () => {
  it('every slip is a sound and loudness is 1 × (1 − stillness), which reads 0', () => {
    expect(noiseOf('miss')).toEqual({ loudness: 1, kind: 'gasp' });
    expect(noiseOf('slip')).toEqual({ loudness: 1, kind: 'creak' });
    expect(noiseOf('relief')).toEqual({ loudness: 1, kind: 'rustle' });
    expect(noiseOf('spill')).toEqual({ loudness: 1, kind: 'cough' });
    expect(noiseOf('slip', 0.5).loudness).toBe(0.5);
    expect(segmentNoise({ gasps: 1, slips: 2, reliefs: 1 }, 'hold')).toEqual([{ kind: 'gasp', loudness: 1 }, { kind: 'creak', loudness: 2 }, { kind: 'rustle', loudness: 1 }]);
    expect(segmentNoise({ gasps: 0, slips: 1, reliefs: 0 }, 'timing')).toEqual([{ kind: 'cough', loudness: 1 }]);
    expect(segmentNoise({ gasps: 0, slips: 0, reliefs: 0 }, 'hold')).toEqual([]);
  });

  it('a segment says so: physics_noise per kind, summed into the summary', () => {
    registerFrameReader(() => 'play');
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    enable(s, ...ON);
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER }, { at: 3, source: 'chip' });
    const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
    const out = run(r, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [{ beat: 0, kind: 'hold' }] } }); // three beats without hold
    expect(ofType(out.events, 'physics_noise')).toEqual([{ type: 'physics_noise', runId: 'p1', holderId: ANN, kind: 'creak', loudness: 3 }]);
    expect(out.state.scene!.physics!.last!.noise).toBe(3);
  });

  it('noise raises a visitor source\'s weight (and only a visitor source\'s)', () => {
    const s = campaign(reg, 4);
    s.scene = { physics: { last: { noise: 1 } } } as never;
    const rows = [{ sourceId: 'third_party', unitId: ANN, weight: 1 }, { sourceId: 'remote', unitId: ANN, weight: 1 }];
    expect(weighted(s, reg, rows)).toEqual([{ sourceId: 'third_party', unitId: ANN, weight: 2 }, { sourceId: 'remote', unitId: ANN, weight: 1 }]);
    (s.scene as { physics: { last: { noise: number } } }).physics.last.noise = 0;
    expect(weighted(s, reg, rows)).toEqual(rows);
  });
});

describe('her attention is never read', () => {
  it('no reading, directive or panel text names it', () => {
    const s = cheating();
    const text = allReadings({ registries: reg, state: s, settings: DEFAULT_SETTINGS }, ANN);
    expect(text).not.toMatch(/watching|glancing|attention|busy/i);
  });
});
