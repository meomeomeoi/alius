import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createStaging, type StagingController } from '../../src/blocking/controller';
import { physicsLines } from '../../src/blocking/physicsDirectives';
import type { Registries } from '../../src/content/types';
import type { Action } from '../../src/engine/dispatch';
import { COMMANDER, registerFrameReader, resetBlockingHooks } from '../../src/engine/blocking';
import { registerHoldsUntil, registerPhysicsStyle, resetPhysicsHooks } from '../../src/engine/physics/style';
import type { SegmentInput } from '../../src/engine/physics/state';
import type { CampaignState } from '../../src/engine/state/types';
import { ContextBuilder } from '../../src/llm/context';
import { afterEach } from 'vitest';
import { ANN, harness, reply, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];

interface World { h: Harness; staging: StagingController; clock: { now: number }; pending: { value: boolean }; ended: number }

/** A scene with Ann in the commander's quarters, a contact with physics set and the staging controller wired to a fake clock and a fake scene. */
async function world(over: { settings?: Record<string, unknown>; talk?: string; contact?: string; mainReplies?: string[] } = {}): Promise<World> {
  registerFrameReader(() => 'play');
  const h = harness(reg, {
    settings: over.settings ?? {},
    tweak: (s) => {
      s.relations[ANN]!.stateId = 'confidant';
      s.content = { enabled: [...ON] };
      s.rng = [11, 22, 33, 44];
      if (over.talk) s.squad.find((u) => u.id === ANN)!.temperament = { talkativeness: over.talk as never, volatility: 'steady', humor: 'dry' };
    },
  });
  expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
  h.st.mainReplies = over.mainReplies ?? [];
  const clock = { now: 1_000_000 };
  const pending = { value: false };
  const w: World = { h, clock, pending, ended: 0, staging: undefined as never };
  w.staging = createStaging({
    app: { dispatch: (a: Action) => h.dispatch(a), current: () => ({ state: h.state() }), context: h.context, refreshContext: () => {} } as never,
    registries: () => reg, settings: () => h.settings, generations: h.generations,
    scene: { replyPending: () => pending.value, end: async () => { w.ended += 1; } },
    now: () => clock.now, toast: () => {},
  });
  const events = h.controller.stage({ type: 'blocking/set', payload: { person: ANN, field: 'contact', value: over.contact ?? 'footrest', with: COMMANDER } });
  w.staging.onEvents(events);
  return w;
}
const run = (w: World) => w.h.state().scene!.physics;
const tick = (w: World, ms: number, step = 1000) => {
  for (let t = 0; t < ms; t += step) {
    w.clock.now += step;
    w.staging.tick(w.clock.now);
  }
};
const holds = (n = 4): SegmentInput[] => Array.from({ length: n }, (_, beat) => ({ beat, kind: 'hold' as const }));
/** The player plays one turn-based segment: the same inputs on every beat, then the beats are used up. */
function play(w: World): void {
  for (const i of holds()) w.staging.input(i);
  w.staging.endSegment();
}

describe('the staging controller starts and ends segments', () => {
  it('a run that starts is planned and running at once (the cue pool is asked for, nothing waits for it)', async () => {
    const w = await world();
    expect(run(w)!.segment).toMatchObject({ n: 1, state: 'running' });
    expect(run(w)!.segment.plan!.beats).toHaveLength(4);
    expect(w.h.actions).toContain('physics/next_segment');
  });

  it('endSegment sends the collected inputs, and the body is held afterwards', async () => {
    const w = await world();
    const before = run(w)!.gauge;
    play(w);
    expect(run(w)!.segment.state).toBe('held');
    expect(run(w)!.gauge).toBeLessThan(before);
    expect(run(w)!.last).toBeDefined();
  });

  it('when no reply is pending, the next segment starts on the next tick', async () => {
    const w = await world();
    play(w);
    expect(run(w)!.segment).toMatchObject({ n: 1, state: 'held' });
    tick(w, 1000);
    expect(run(w)!.segment).toMatchObject({ n: 2, state: 'running' });
  });
});

describe('the latency rule', () => {
  it('held drains nothing: a segment that ended waits for the reply, and nothing moves in 60 s', async () => {
    const w = await world();
    play(w);
    w.pending.value = true;
    const gauge = run(w)!.gauge;
    const actions = w.h.actions.length;
    tick(w, 60_000);
    expect(run(w)!.segment).toMatchObject({ n: 1, state: 'held' });
    expect(run(w)!.gauge).toBe(gauge);
    expect(w.h.actions.length).toBe(actions); // not one dispatch
    w.pending.value = false;
    tick(w, 1000);
    expect(run(w)!.segment).toMatchObject({ n: 2, state: 'running' });
  });

  it('slow and fast model, same outcome (gauge, xp, slips, rng)', async () => {
    const outcome = async (slow: boolean) => {
      const w = await world();
      for (let seg = 0; seg < 2 && run(w); seg++) {
        play(w);
        if (slow) {
          w.pending.value = true;
          tick(w, 45_000); // three segments' worth of waiting for the model
          w.pending.value = false;
        }
        tick(w, 1000);
      }
      const s = w.h.state();
      return { physics: s.scene!.physics ?? null, endurance: s.commander.endurance ?? null, rng: s.rng, last: s.scene!.physics?.last ?? null };
    };
    const fast = await outcome(false);
    const slow = await outcome(true);
    expect(slow).toEqual(fast);
    expect(fast.physics).not.toBeNull();
  });

  it('silent use runs back to back: a silent holder does not wait for a reply', async () => {
    const w = await world({ talk: 'silent' });
    play(w);
    w.pending.value = true;
    tick(w, 1000);
    expect(run(w)!.segment).toMatchObject({ n: 2, state: 'running' });
    const chatty = await world({ talk: 'chatty' });
    play(chatty);
    chatty.pending.value = true;
    tick(chatty, 1000);
    expect(run(chatty)!.segment).toMatchObject({ n: 1, state: 'held' });
  });

  it('in real time the clock ends the segment after its seconds, with the inputs collected so far', async () => {
    const w = await world({ settings: { }, contact: 'footrest' });
    expect(run(w)!.segment.n).toBe(1);
    // switch to real time for the next segment
    const s = structuredClone(w.h.state());
    s.settings.physicsRealtime = true;
    w.h.set(s);
    play(w);
    tick(w, 1000);
    expect(run(w)!.segment.plan!.beats.length).toBeGreaterThan(4); // 30 s of 1.5 s beats
    w.staging.input({ beat: 0, kind: 'hold' });
    tick(w, 29_000);
    expect(run(w)!.segment.state).toBe('running');
    tick(w, 2000);
    expect(run(w)?.segment.state ?? 'ended').not.toBe('running'); // the segment ended on the clock, never waiting for anyone
    expect(w.h.actions.filter((a) => a === 'physics/segment_end')).toHaveLength(2);
  });
});

describe('the two ends', () => {
  it('a blackout ends the scene through the scene controller, once', async () => {
    registerHoldsUntil(() => 'blackout');
    const w = await world({ contact: 'smothered_armpit' });
    const s = structuredClone(w.h.state());
    s.content = { enabled: [...ON, 'breath_play'] };
    s.scene!.physics!.gauge = 5;
    s.scene!.physics!.segment.plan = { beats: [0, 1, 2, 3].map(() => ({ attention: 'busy' as const })) };
    w.h.set(s);
    w.staging.endSegment();
    expect(run(w)).toBeUndefined();
    expect(w.h.state().lastWake).toBeDefined();
    await w.staging.idle();
    expect(w.ended).toBe(1);
    tick(w, 5000);
    expect(w.ended).toBe(1);
  });

  it('the stop word ends the run and is never refused, whatever is pending', async () => {
    registerHoldsUntil(() => 'blackout');
    const w = await world();
    play(w);
    w.pending.value = true;
    const events = w.staging.stopWord();
    expect(events.some((e) => e.type === 'physics_outcome' && e.result === 'stopped')).toBe(true);
    expect(run(w)).toBeUndefined();
    expect(w.ended).toBe(0); // a stop is not a blackout
  });

  it('reset drops the clock, the inputs and the pool; nothing is dispatched after it', async () => {
    const w = await world();
    w.staging.input({ beat: 0, kind: 'hold' });
    w.staging.reset();
    const actions = w.h.actions.length;
    tick(w, 120_000);
    expect(w.h.actions.length).toBe(actions);
    expect(w.staging.cue('window_open', 0)).toBeNull();
  });
});

describe('the cue pool', () => {
  const answer = JSON.stringify({ cues: { shift: ['Her weight moves one way.', 'She rolls her hip.', 'A slow shift.'] } });

  it('is asked for once when a physics starts; the model\'s lines are used, the registry fills the rest', async () => {
    const w = await world({ mainReplies: [answer] });
    await w.staging.idle();
    expect(w.h.st.calls.filter((c) => (c.system ?? '').includes('cue')).length).toBe(1);
    const line = w.staging.cue('shift', 0)!;
    expect(['Her weight moves one way.', 'She rolls her hip.', 'A slow shift.']).toContain(line);
    expect(reg.physicsCues.get('cue_lift')!.lines).toContain(w.staging.cue('lift', 0));
  });

  it('a hostile or failed answer leaves the fallback lines in use', async () => {
    const w = await world({ mainReplies: ['nonsense'] });
    await w.staging.idle();
    expect(reg.physicsCues.get('cue_shift')!.lines).toContain(w.staging.cue('shift', 0));
  });
});

describe('the physics directive', () => {
  const FEELING = /\b(feel|feels|feeling|want|wants|love|loves|enjoy|enjoys|ashamed|afraid)\b/i;
  const stateWith = async (style: Parameters<typeof registerPhysicsStyle>[0], until: 'signal' | 'limit' | 'blackout', summary = true): Promise<CampaignState> => {
    registerPhysicsStyle(style);
    registerHoldsUntil(() => until);
    const w = await world();
    const s = structuredClone(w.h.state());
    if (summary) s.scene!.physics!.last = { caught: 2, missed: 1, falseTaken: 1, slips: 1, gasps: 1, reliefs: 1, noise: 1, cues: [], warning: true, move: 'press' };
    return s;
  };

  it('names her rhythm, what she expects and the last stretch; no line states what the commander feels', async () => {
    for (const style of ['neutral', 'affectionate', 'cold', 'ritual', 'clinical', 'possessive', 'playful', 'cruel', 'obsessive', 'drill', 'regal', 'vindictive'] as const) {
      for (const until of ['signal', 'limit', 'blackout'] as const) {
        const s = await stateWith(() => ({ primary: style }), until);
        const lines = physicsLines(s, reg)!;
        expect(lines, `${style} ${until}`).not.toBeNull();
        expect(lines.id).toBe(`physics:${s.scene!.physics!.physicsId}`);
        expect(lines.text).not.toMatch(FEELING);
        expect(lines.text).not.toMatch(/\b(he|him|his)\b/i);
        expect(lines.text).toContain('Ann');
        resetPhysicsHooks();
      }
    }
  });

  it('is derived: absent without a run, set while one runs, and gone when it ends', async () => {
    const s = await stateWith(() => ({ primary: 'cruel' }), 'limit');
    expect(physicsLines(s, reg)!.text).toMatch(/short and hard/);
    expect(physicsLines(s, reg)!.text).toMatch(/ignores the first tap/);
    expect(physicsLines(s, reg)!.text).toMatch(/2 openings caught/);
    delete s.scene!.physics;
    expect(physicsLines(s, reg)).toBeNull();
    expect(physicsLines({ ...s, scene: undefined } as never, reg)).toBeNull();
    const b = new ContextBuilder();
    void b;
    void vi;
    void reply;
  });
});

describe('a marathon under the controller', () => {
  async function marathonWorld(): Promise<World> {
    const w = await world();
    const s = structuredClone(w.h.state());
    delete s.scene!.physics;
    s.scene!.physicsCount = 0;
    w.h.set(s);
    w.staging.onEvents(w.h.dispatch({ type: 'physics/start', payload: { physicsId: 'weight', sourceKind: 'contact', sourceId: 'footrest', holderId: ANN, duration: { hours: 2 } } }));
    return w;
  }

  it('between two phases nothing starts by itself: it waits for the strategy, whatever the clock does', async () => {
    const w = await marathonWorld();
    for (let i = 0; i < 2; i++) { play(w); tick(w, 1000); }
    expect(run(w)!.marathon).toMatchObject({ waiting: true });
    tick(w, 120_000);
    expect(run(w)!.segment.state).toBe('held');
    expect(run(w)!.marathon!.phase).toBe(1);
    const events = w.staging.skip('spare');
    expect(events.some((e) => e.type === 'marathon_phase' && e.phase === 2)).toBe(true);
    tick(w, 1000);
    expect(run(w)!.segment.state).toBe('running');
  });

  it('a marathon that runs its time out ends the scene, once; one cut short by the stop word does not', async () => {
    const w = await marathonWorld();
    for (let guard = 0; guard < 40 && run(w); guard++) {
      if (run(w)!.marathon!.waiting) w.staging.skip('spare');
      else if (run(w)!.segment.state === 'running') play(w);
      else tick(w, 1000);
    }
    expect(run(w)).toBeUndefined();
    await w.staging.idle();
    expect(w.ended).toBe(1);
    tick(w, 5000);
    expect(w.ended).toBe(1);
    const stopped = await marathonWorld();
    play(stopped);
    stopped.staging.stopWord();
    await stopped.staging.idle();
    expect(stopped.ended).toBe(0);
  });
});
