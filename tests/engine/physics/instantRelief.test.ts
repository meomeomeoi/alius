/**
 * P10e-e Ruling AE (final review I1): weight's own shift and scent's mouth breath on the instrument path are decided when they are made, as
 * the prototypes do (Rulings Y, AC, AD extended): `physics/relief` draws once with the prototype's chance (weight.html `CAUGHT[att]`,
 * saturation.html `NOTICED[att] × loud`), and the segment input it goes with is marked, so the segment's `cheatRoll` never rolls it again.
 * Unmarked inputs (the card, turn-based) resolve and roll as before. Also: Minor 4 (the running directive names a relief only once she caught
 * it, in every run) and Minor 6 (a relief between segments reads the attention shown, not `busy`).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { physicsLines } from '../../../src/blocking/physicsDirectives';
import { frameRelief, instrumentRelief, physicsInput, resolveSegment, type ResolveEnv } from '../../../src/engine/physics/segment';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { PhysicsRun, SegmentInput, SegmentPlan } from '../../../src/engine/physics/state';
import type { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable } from '../../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../../helpers/loyalty';
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
const W = TUNING.physics.weight;
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });
const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'weight', sourceKind: 'contact', sourceId: 'human_chair', holderId: ANN, gauge: 100, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const plan = (n: number, attention: 'watching' | 'glancing' | 'busy' = 'watching'): SegmentPlan => ({ beats: Array.from({ length: n }, () => ({ attention })) });
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'hold', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });

/** An rng that records the chance it was asked and answers as given. */
function chanceRng(yes: boolean): Rng & { asked: number[] } {
  const r = { asked: [] as number[], chance: (p: number) => { r.asked.push(p); return yes; }, float: () => { throw new Error('no float'); }, int: () => { throw new Error('no int'); }, pick: () => { throw new Error('no pick'); } };
  return r as unknown as Rng & { asked: number[] };
}

/** A live run of the given physics on Ann (the scene of shoeInputs, its physics swapped), one segment running with her attention. */
function live(physicsId: string, attention: 'watching' | 'glancing' | 'busy' = 'watching'): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'humiliation');
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'boot_worship', with: COMMANDER }, { at: 1, source: 'engine' });
  const r = st.scene!.physics!;
  r.physicsId = physicsId;
  r.gauge = physicsId === 'saturation' ? 0 : 50;
  r.segment = { n: 1, state: 'running', plan: plan(4, attention) };
  return st;
}

describe('weight: her catch of the commander\'s own shift, at once (Ruling AE)', () => {
  it('one draw with weight.html\'s CAUGHT[her planned attention]; caught: physics_caught and the tally', () => {
    for (const [attention, p] of [['watching', 0.6], ['glancing', 0.25], ['busy', 0.08]] as const) {
      const s = live('weight', attention);
      const rng = chanceRng(true);
      const ev = instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'shift_weight', beat: 1 });
      expect(rng.asked).toEqual([p]);
      expect(ev.map((e) => e.type)).toEqual(['physics_cheat', 'physics_caught']);
      expect(ev[1]).toMatchObject({ kind: 'shift_weight', beat: 1, holderId: ANN });
      expect(s.scene!.physics!.tally).toMatchObject({ cheatsCaught: 1 });
      expect(s.scene!.physics!.segment.caughtNow).toBe(1);
    }
    const s = live('weight');
    const no = chanceRng(false);
    expect(instrumentRelief(s, { registries: reg, rng: no }, { runId: s.scene!.physics!.id, kind: 'shift_weight', beat: 0 }).map((e) => e.type)).toEqual(['physics_cheat']);
    expect(s.scene!.physics!.tally?.cheatsCaught).toBeUndefined();
  });

  it('her frame, she is out (part away): nothing is caught and nothing is drawn; a non-hold run is refused', () => {
    const s = live('weight');
    const rng = chanceRng(true);
    expect(instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'shift_weight', beat: 0, part: 'away' }).map((e) => e.type)).toEqual(['physics_cheat']);
    expect(rng.asked).toEqual([]);
    const t = live('tongue_work');
    expect(() => instrumentRelief(t, { registries: reg, rng }, { runId: t.scene!.physics!.id, kind: 'shift_weight', beat: 0 })).toThrow(/hold/);
    expect(() => instrumentRelief(t, { registries: reg, rng }, { runId: 'p9', kind: 'shift_weight', beat: 0 })).toThrow(/Stale/);
  });

  it('the marked input resolves without a roll: free is the relief, caught is 10 off and her lean (1.5 for 3 beats); unmarked as before', () => {
    const holds = [0, 1, 2, 3, 4, 5].map((b) => input(b, 'hold'));
    const base = resolveSegment(mk(), plan(6), holds, env());
    const free = resolveSegment(mk(), plan(6), [...holds, input(1, 'shift_weight', { part: 'free' })], env());
    expect(free.gauge).toBe(base.gauge + W.relief);
    expect(free.reliefInputs).toEqual([]);
    const caught = resolveSegment(mk(), plan(6), [...holds, input(1, 'shift_weight', { part: 'caught' })], env());
    // beats 2, 3, 4 drain at 1.5 instead of 1
    expect(caught.gauge).toBeCloseTo(base.gauge - W.caught - 3 * W.drain * (W.caughtLean.pressure - 1), 6);
    expect(caught.reliefInputs).toEqual([]);
    const old = resolveSegment(mk(), plan(6), [...holds, input(1, 'shift_weight')], env());
    expect(old.gauge).toBe(base.gauge + W.relief);
    expect(old.reliefInputs).toEqual([{ beat: 1, kind: 'shift_weight' }]);
  });

  it('the segment\'s end draws nothing for a marked shift (the card\'s unmarked one is still rolled once)', () => {
    const s = live('weight');
    const r = s.scene!.physics!;
    const quiet = chanceRng(false);
    physicsInput(s, { registries: reg, rng: quiet }, r.id, 1, [0, 1, 2, 3].map((b) => input(b, 'hold')).concat([input(1, 'shift_weight', { part: 'free' })]));
    expect(quiet.asked).toEqual([]);
    const t = live('weight');
    const card = chanceRng(false);
    physicsInput(t, { registries: reg, rng: card }, t.scene!.physics!.id, 1, [0, 1, 2, 3].map((b) => input(b, 'hold')).concat([input(1, 'shift_weight')]));
    expect(card.asked).toHaveLength(1);
  });
});

describe('scent: her hearing of a blown word, at once (Ruling AE)', () => {
  it('one draw per word with saturation.html\'s NOTICED[att] × loud (0.25 short, 0.6 long)', () => {
    const s = live('saturation', 'watching');
    const rng = chanceRng(false);
    instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'mouth_breath', beat: 0, amount: 0.25 });
    instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'mouth_breath', beat: 0, amount: 0.6 });
    expect(rng.asked).toEqual([0.6 * 0.25, 0.6 * 0.6]);
    const yes = chanceRng(true);
    const ev = instrumentRelief(s, { registries: reg, rng: yes }, { runId: s.scene!.physics!.id, kind: 'mouth_breath', beat: 2, amount: 0.6 });
    expect(ev.map((e) => e.type)).toEqual(['physics_cheat', 'physics_caught']);
    expect(() => instrumentRelief(s, { registries: reg, rng: yes }, { runId: s.scene!.physics!.id, kind: 'mouth_breath', beat: 0 })).toThrow(/loudness/);
  });

  it('a decided mouth breath costs its words and is never rolled again at the segment\'s end', () => {
    const decided = resolveSegment(mk({ physicsId: 'saturation', gauge: 50 }), plan(4), [input(0, 'inhale', { amount: 2 }), input(1, 'mouth_breath', { amount: 1, part: 'decided' })], env({ gaugeKind: 'fill', interaction: 'decision', head: 10 }));
    expect(decided.reliefInputs).toEqual([]);
    expect(decided.reliefs).toBe(1);
    const s = live('saturation');
    const r = s.scene!.physics!;
    const quiet = chanceRng(false);
    physicsInput(s, { registries: reg, rng: quiet }, r.id, 1, [input(0, 'inhale', { amount: 2 }), input(1, 'mouth_breath', { amount: 1, part: 'decided' })]);
    expect(quiet.asked).toEqual([]);
  });
});

describe('the attention between segments (Minor 6) and the running directive (Minor 4)', () => {
  it('a relief while the run is held reads the attention the instrument shows, not busy', () => {
    const s = live('weight');
    s.scene!.physics!.segment = { n: 1, state: 'held' };
    const rng = chanceRng(false);
    instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'shift_weight', beat: 0, attention: 'watching' });
    instrumentRelief(s, { registries: reg, rng }, { runId: s.scene!.physics!.id, kind: 'shift_weight', beat: 0 });
    expect(rng.asked).toEqual([0.6, 0.08]); // the attention shown; with none, busy
  });

  it('her frame\'s relief between segments reads the attention shown too', () => {
    const s = live('her_activity');
    const r = s.scene!.physics!;
    r.sourceKind = 'activity';
    r.sourceId = 'reading_book';
    r.segment = { n: 1, state: 'held' };
    const rng = chanceRng(false);
    frameRelief(s, { registries: reg, rng }, { runId: r.id, kind: 'relieve', amount: 0, part: 'seen', attention: 'watching' });
    expect(rng.asked).toEqual([TUNING.physics.gaze.caught.watching]);
  });

  it('the directive says a relief only once she caught it in the stretch (at its end or at once)', () => {
    const s = live('weight');
    const r = s.scene!.physics!;
    r.capacity = 200;
    r.gauge = 200;
    const ev = physicsInput(s, { registries: reg, rng: chanceRng(false) }, r.id, 1, [0, 1, 2, 3].map((b) => input(b, 'hold')).concat([input(1, 'shift_weight', { part: 'free' })]));
    expect(ev.find((e) => e.type === 'physics_outcome')).toBeUndefined();
    expect(s.scene!.physics!.last?.reliefs).toBe(1);
    expect(physicsLines(s, reg)!.text).not.toContain('relief');
    // the next stretch: she caught one at once
    s.scene!.physics!.segment = { n: 2, state: 'running', plan: plan(4) };
    instrumentRelief(s, { registries: reg, rng: chanceRng(true) }, { runId: r.id, kind: 'shift_weight', beat: 0 });
    physicsInput(s, { registries: reg, rng: chanceRng(false) }, r.id, 2, [0, 1, 2, 3].map((b) => input(b, 'hold')).concat([input(0, 'shift_weight', { part: 'caught' })]));
    expect(s.scene!.physics!.last?.cheats).toBe(1);
    expect(physicsLines(s, reg)!.text).toContain('a relief taken');
  });
});
