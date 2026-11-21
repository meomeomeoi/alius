import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, blockingOf } from '../../../src/engine/blocking';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { liveSources } from '../../../src/engine/moments/live';
import { forgetChance } from '../../../src/engine/physics/boundary';
import { conditionRankDelta, conditionsOf, expireConditions, setCondition } from '../../../src/engine/physics/conditions';
import { registerHoldsUntil, registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { socialRank } from '../../../src/engine/social';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ContextBuilder } from '../../../src/llm/context';
import { clearSceneDirectives, registerSceneContext } from '../../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { enable } from '../../helpers/bonds';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
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
const ON = ['worship', 'restraint', 'service', 'objectification', 'humiliation'];
const quiet = { beats: [{ attention: 'busy' as const }, { attention: 'busy' as const }, { attention: 'busy' as const }, { attention: 'busy' as const }] };

/** A scene with a running segment of `contact`, `gauge` left, and a quiet plan (nothing to catch). */
function running(over: { contact?: string; gauge?: number; slot?: CampaignState['slot']; on?: string[]; activity?: string } = {}): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...(over.on ?? ON));
  if (over.slot) s.slot = over.slot;
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: over.contact ?? 'smothered_armpit', with: COMMANDER }, { at: 3, source: 'chip' });
  if (over.activity) setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: over.activity }, { at: 3, source: 'chip' });
  const r = run(st, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
  const p = r.scene!.physics!;
  p.segment.plan = quiet;
  p.seal = 'tight';
  if (over.gauge !== undefined) p.gauge = over.gauge;
  return r;
}
const endSeg = (s: CampaignState, seed = 1, inputs: unknown[] = []) => {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  return run(d, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs } });
};
const holds = [0, 1, 2, 3].map((beat) => ({ beat, kind: 'hold' }));

describe('her moves at the boundary', () => {
  it('falls asleep only at night or after rest: her activity turns sleeping for 1–3 exchanges, and her_absence is live', () => {
    const asleepIn = (s: CampaignState): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) if (blockingOf(endSeg(s, seed).state.scene, ANN).activity === 'sleeping') n++;
      return n;
    };
    const day = running({ gauge: 90 });
    expect(asleepIn(day)).toBe(0); // by day, and she is paying attention
    const night = running({ gauge: 90, slot: 'night' });
    const nightSleeps = asleepIn(night);
    expect(nightSleeps).toBeGreaterThan(200 * 0.2); // 1 − 0.92⁴ ≈ 0.28
    expect(nightSleeps).toBeLessThan(200 * 0.36);
    const resting = running({ gauge: 90, activity: 'idle' });
    expect(asleepIn(resting)).toBeGreaterThan(30);
    const sleeper = (() => { for (let seed = 1; seed < 200; seed++) { const r = endSeg(night, seed); if (blockingOf(r.state.scene, ANN).activity === 'sleeping') return r; } throw new Error('nobody slept'); })();
    const until = sleeper.state.scene!.sleepUntil![ANN]!;
    expect(until - sleeper.state.scene!.exchanges).toBeGreaterThanOrEqual(1);
    expect(until - sleeper.state.scene!.exchanges).toBeLessThanOrEqual(3);
    expect(ofType(sleeper.events, 'physics_segment').find((e) => e.phase === 'end')).toMatchObject({ move: 'asleep' });
    expect(liveSources(sleeper.state, reg).map((x) => x.sourceId)).toContain('her_absence');
    // she wakes after those exchanges
    let w = sleeper.state;
    for (let i = 0; i < 3; i++) w = run(w, reg, { type: 'scene/exchange', payload: {} }).state;
    expect(blockingOf(w.scene, ANN).activity).toBeUndefined();
    expect(w.scene!.sleepUntil).toBeUndefined();
  });

  it('forgets to let go: 0.10, +0.15 for a cruel holder, +0.002 per Impunity point above 50', () => {
    const s = running({ gauge: 70 });
    const impunity = impunityOf(s, reg, ANN)!.value;
    expect(forgetChance(s, reg, ANN)).toBeCloseTo(0.10 + 0.002 * Math.max(0, impunity - 50), 6);
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    expect(forgetChance(s, reg, ANN)).toBeCloseTo(0.25 + 0.002 * Math.max(0, impunity - 50), 6);
    s.relations[ANN]!.trust = 5; // the number moves with her view of the commander
    const bold = forgetChance(s, reg, ANN);
    expect(bold).toBeGreaterThanOrEqual(0.25);
    // a release that was due: ~25 % of seeds she forgets (the hold goes on, one segment longer)
    let forgot = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = endSeg(s, seed);
      if (r.state.scene!.physics) {
        forgot++;
        expect(r.state.scene!.physics.extend).toBeGreaterThanOrEqual(1);
        expect(ofType(r.events, 'physics_segment').find((e) => e.phase === 'end')).toMatchObject({ move: 'forgets' });
      } else expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'released' });
    }
    expect(forgot / 400).toBeGreaterThan(forgetChance(s, reg, ANN) - 0.07);
    expect(forgot / 400).toBeLessThan(forgetChance(s, reg, ANN) + 0.07);
  });

  it('draws nothing when no move can be made (day, attentive, nothing due)', () => {
    const s = running({ contact: 'footrest', gauge: 90 });
    const r = endSeg(s, 5, holds);
    expect(r.state.rng).toEqual(seedRng(5));
  });

  it('a cruel holder presses when the commander kept up; a gentle one lifts at the warning', () => {
    registerPhysicsStyle(() => ({ primary: 'cruel' }));
    const pressed = endSeg(running({ contact: 'footrest', gauge: 100 }), 2, holds).state.scene!.physics!;
    expect(pressed.pressure).toBeGreaterThan(1);
    resetPhysicsHooks();
    registerPhysicsStyle(() => ({ primary: 'affectionate' }));
    const w = running({ contact: 'footrest', gauge: 70 });
    w.scene!.physics!.pressure = 1.25;
    const lifted = endSeg(w, 2, holds).state.scene!.physics!;
    expect(lifted.pressure).toBeLessThan(1.25);
  });
});

describe('the ends of a hold', () => {
  it('collapse at 0 for any physics that is not a blackout (a slip, and release)', () => {
    const r = endSeg(running({ contact: 'footrest', gauge: 3 }), 3);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'collapse' });
    expect(ofType(r.events, 'physics_slip').some((e) => e.kind === 'collapse')).toBe(true);
    expect(r.state.scene!.physics).toBeUndefined();
  });

  it('a blackout needs breath_play and a holder who goes to blackout: the scene is cut, a slot is lost, dizzy, stress +5, a wake card', () => {
    registerHoldsUntil(() => 'blackout');
    const s = running({ gauge: 10, on: [...ON, 'breath_play'] });
    s.commander.stress = 10;
    const r = endSeg(s, 4);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'blackout' });
    expect(ofType(r.events, 'blackout')[0]).toMatchObject({ unitId: ANN });
    expect(r.state.scene!.extraSlots).toBe(TUNING.physics.blackout.slots);
    expect(conditionsOf(r.state).map((c) => c.id)).toEqual(['dizzy']);
    expect(r.state.commander.stress).toBe(10 + TUNING.physics.blackout.stress);
    expect(r.state.lastWake).toMatchObject({ unitId: ANN, day: s.day, slot: s.slot });
    expect(r.state.scene!.physics).toBeUndefined();
    // every social rank is one lower while dizzy
    const ranks = (st: CampaignState) => (['authority', 'insight', 'empathy', 'cunning'] as const).map((k) => socialRank(st, k));
    const base = structuredClone(r.state);
    base.commander.conditions = [];
    expect(conditionRankDelta(r.state)).toBe(-1);
    ranks(r.state).forEach((v, i) => expect(v).toBe(Math.max(1, ranks(base)[i]! - 1)));
  });

  it('without breath_play the same holder acts as a limit holder: the limit is broken, no blackout', () => {
    registerHoldsUntil(() => 'blackout');
    const r = endSeg(running({ gauge: 10 }), 4);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ result: 'limit_broken' });
    expect(ofType(r.events, 'blackout')).toEqual([]);
    expect(conditionsOf(r.state)).toEqual([]);
    expect(r.state.scene!.extraSlots).toBeUndefined();
  });

  it('a hold that was endured pays the xp and her practice; a collapse does not', () => {
    const ok = endSeg(running({ gauge: 70 }), 9); // 14 % left: she lets go (or forgets: pick a seed where she lets go)
    const done = ok.state.scene!.physics === undefined ? ok : endSeg(running({ gauge: 70 }), 10);
    if (done.state.scene!.physics === undefined) {
      expect(done.state.commander.endurance!.breath!.xp).toBe(TUNING.physics.endurance.hold);
      expect(done.state.relations[ANN]!.herSkill!.practice.reading).toBe(1);
    }
    const bad = endSeg(running({ contact: 'footrest', gauge: 3 }), 3);
    expect(bad.state.commander.endurance?.weight?.xp ?? 0).toBe(0);
  });
});

describe('the physics memory rules', () => {
  const facts = (s: CampaignState, ...events: Array<Record<string, unknown> & { type: string }>) => {
    const d = structuredClone(s);
    rememberEvents(d, events, reg);
    return d.memory.facts.filter((f) => f.tags.includes('physics'));
  };
  const base = () => running();

  it('blackout and a broken limit are facts of the pair (importance 4); caught is one at 3; a release is not', () => {
    const outcome = (result: string) => ({ type: 'physics_outcome', runId: 'p1', physicsId: 'breath', holderId: ANN, result });
    expect(facts(base(), outcome('blackout'))).toMatchObject([{ about: [ANN], knownBy: [ANN], importance: 4, tags: ['physics', 'blackout'] }]);
    expect(facts(base(), outcome('limit_broken'))).toMatchObject([{ importance: 4, tags: ['physics', 'limit_broken'] }]);
    expect(facts(base(), { type: 'physics_caught', runId: 'p1', holderId: ANN })).toMatchObject([{ importance: 3, tags: ['physics', 'caught'] }]);
    for (const r of ['released', 'checked', 'stopped', 'collapse']) expect(facts(base(), outcome(r))).toEqual([]);
    expect(facts(base(), outcome('blackout'))[0]!.text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('end to end: a broken limit written by the segment itself', () => {
    registerHoldsUntil(() => 'limit');
    const r = endSeg(running({ gauge: 10 }), 6);
    expect(r.state.memory.facts.filter((f) => f.tags.includes('limit_broken'))).toHaveLength(1);
  });
});

describe('the commander\'s conditions', () => {
  it('dizzy lasts until the day ends and stiff until the next slot', () => {
    const s = campaign(reg, 4);
    s.day = 3;
    s.slot = 'morning';
    setCondition(s, reg, 'dizzy', { day: 3 });
    setCondition(s, reg, 'stiff', { day: 3, slot: 'morning' });
    expect(conditionsOf(s).map((c) => c.id)).toEqual(['dizzy', 'stiff']);
    expect(expireConditions(s)).toEqual([]);
    s.slot = 'afternoon';
    expect(expireConditions(s)).toEqual([{ type: 'condition_ended', id: 'stiff' }]);
    expect(conditionsOf(s).map((c) => c.id)).toEqual(['dizzy']);
    s.slot = 'night';
    expect(expireConditions(s)).toEqual([]);
    s.day = 4;
    s.slot = 'morning';
    expect(expireConditions(s)).toEqual([{ type: 'condition_ended', id: 'dizzy' }]);
    expect(conditionsOf(s)).toEqual([]);
  });

  it('dizzy expires with the day in play: the rank is back the next morning', () => {
    let s = campaign(reg, 4);
    const before = socialRank(s, 'authority');
    setCondition(s, reg, 'dizzy', { day: s.day });
    expect(socialRank(s, 'authority')).toBe(Math.max(1, before - 1));
    s = endDay(s, reg);
    expect(conditionsOf(s)).toEqual([]);
    expect(socialRank(s, 'authority')).toBe(before);
  });

  it('setting a condition again replaces it, applies its stress once, and an unknown id is refused', () => {
    const s = campaign(reg, 4);
    s.commander.stress = 0;
    const first = setCondition(s, reg, 'dizzy', { day: 1 });
    expect(first).toEqual([{ type: 'commander_stress_changed', delta: 5, source: 'condition' }, { type: 'condition_set', id: 'dizzy', until: { day: 1 } }]); // the stress is an event like every other change of it
    expect(s.commander.stress).toBe(5);
    const again = setCondition(s, reg, 'dizzy', { day: 2 });
    expect(again).toEqual([{ type: 'condition_set', id: 'dizzy', until: { day: 2 } }]); // replaced: no second stress
    expect(s.commander.stress).toBe(5);
    expect(conditionsOf(s)).toHaveLength(1);
    expect(conditionsOf(s)[0]!.until).toEqual({ day: 2 });
    expect(() => setCondition(s, reg, 'nonsense', { day: 1 })).toThrow();
  });

  it('the commander line names a condition by its prompt hint, with no pronoun', () => {
    const s = running();
    setCondition(s, reg, 'dizzy', { day: s.day });
    const b = new ContextBuilder();
    registerSceneContext(b, { registries: () => reg, settings: () => ({ ...DEFAULT_SETTINGS }) });
    const text = b.build(s, 5000).block;
    expect(text).toContain(String(reg.commanderConditions.get('dizzy')!.promptHint));
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
    const none = running();
    expect(b.build(none, 5000).block).not.toContain('dizzy');
    clearSceneDirectives(b);
  });
});

describe('a wake card that was never closed does not come back (review)', () => {
  it('a new scene clears `lastWake`: the card of an old blackout is not shown at the end of another scene', () => {
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    s.lastWake = { day: 1, slot: 'night', unitId: ANN };
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastWake).toBeUndefined();
  });
});

describe('the end of the scene spends the extra slots', () => {
  it('scene/end consumes extraSlots after its own slot, and the wake card carries the day and slot she came to', () => {
    const s = running();
    s.scene!.extraSlots = 1;
    s.scene!.consumesSlot = true;
    s.lastWake = { day: s.day, slot: s.slot, unitId: ANN };
    s.scene!.blackout = true;
    setCondition(s, reg, 'dizzy', { day: s.day });
    const before = { day: s.day, slot: s.slot };
    const r = run(s, reg, { type: 'scene/end', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(before.slot).toBe('morning');
    expect(r.state.slot).toBe('evening'); // the scene's slot and one more
    expect(r.state.lastWake).toMatchObject({ unitId: ANN, day: before.day, slot: 'evening' });
    expect(conditionsOf(r.state)).toMatchObject([{ id: 'dizzy', until: { day: before.day } }]); // dizzy lasts until the day she came to ends
  });

  it('wake_seen clears the card', () => {
    const s = running();
    s.lastWake = { day: 1, slot: 'morning', unitId: ANN };
    const r = run(s, reg, { type: 'physics/wake_seen', payload: {} });
    expect(r.state.lastWake).toBeUndefined();
  });
});
