import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { lessonDue, lessonRow, lessonWay, noteSlips, slipKey, slipOf } from '../../../src/engine/craft/lesson';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { ANN, BEA, holdScene, unitOf } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const ctx = () => ({ registries: reg });
const slip = (over: Record<string, unknown> = {}) => ({ type: 'physics_slip', runId: 'p1', kind: 'slip', count: 1, holderId: ANN, physicsId: 'weight', ...over });
const styleOf = (s: CampaignState, style: string): CampaignState => { unitOf(s, ANN).bond!.practice!.style = { primary: style as never }; return s; };
const xpOf = (s: CampaignState, physics = 'weight'): number => s.commander.endurance?.[physics]?.xp ?? 0;
const HALF = TUNING.craft.xp.lesson * TUNING.craft.xp.phase;

describe('the lesson rows', () => {
  it('the most specific row wins: kind and interaction, then one, then neither', () => {
    expect(lessonRow(reg, { type: 'physics_slip', holderId: ANN, kind: 'slip', physicsId: 'weight' })).toMatchObject({ point: 'hands' });
    expect(lessonRow(reg, { type: 'physics_slip', holderId: ANN, kind: 'slip', physicsId: 'breath' })).toMatchObject({ point: 'windows' });
    expect(lessonRow(reg, { type: 'physics_slip', holderId: ANN, kind: 'reflex' })).toMatchObject({ point: 'reflex' });
    expect(lessonRow(reg, { type: 'physics_slip', holderId: ANN, kind: 'collapse', physicsId: 'weight' })).toMatchObject({ point: 'limit' });
    expect(lessonRow(reg, { type: 'posture_slip', holderId: ANN })).toMatchObject({ point: 'posture' });
    expect(lessonRow(reg, { type: 'physics_slip', holderId: ANN, kind: 'unheard_of' })).toBeUndefined();
  });

  it('reads an event as a slip, with the run\'s physics when the event does not name it', () => {
    const s = holdScene(reg);
    expect(slipOf(s, slip())).toEqual({ type: 'physics_slip', holderId: ANN, kind: 'slip', physicsId: 'weight' });
    expect(slipOf(s, { type: 'physics_noise', holderId: ANN })).toBeNull();
    expect(slipOf(s, { type: 'posture_slip', holderId: ANN })).toEqual({ type: 'posture_slip', holderId: ANN });
    expect(slipKey(reg, { type: 'physics_slip', holderId: ANN, physicsId: 'weight' })).toBe('endurance:weight');
    expect(slipKey(reg, { type: 'physics_slip', holderId: ANN, physicsId: 'tongue_work' })).toBe('stillness');
    expect(slipKey(reg, { type: 'physics_slip', holderId: ANN, kind: 'reflex' })).toBe('stillness');
    expect(slipKey(reg, { type: 'posture_slip', holderId: ANN })).toBe('posture');
  });
});

describe('who names the point', () => {
  const way = (style: string, key = 'k') => lessonWay(styleOf(holdScene(reg), style), ANN, key);

  it('drill, ritual and clinical always, playful as a joke, cruel never', () => {
    for (const st of ['drill', 'ritual', 'clinical']) for (const k of ['a', 'b', 'c', 'd']) expect(way(st, k), st).toBe('plain');
    for (const k of ['a', 'b', 'c', 'd']) expect(way('playful', k)).toBe('joke');
    for (const k of ['a', 'b', 'c', 'd']) expect(way('cruel', k)).toBeNull();
  });

  it('cold sometimes (about two in five), the rest by a hash (about half), and the answer is stable', () => {
    const rate = (style: string) => {
      const s = styleOf(holdScene(reg), style);
      let hits = 0;
      for (let i = 0; i < 400; i++) if (lessonWay(s, ANN, `k${i}`) !== null) hits++;
      return hits / 400;
    };
    expect(rate('cold')).toBeGreaterThan(0.3);
    expect(rate('cold')).toBeLessThan(0.5);
    expect(rate('possessive')).toBeGreaterThan(0.4);
    expect(rate('possessive')).toBeLessThan(0.6);
    expect(way('cold', 'x')).toBe(way('cold', 'x'));
  });

  it('lessonDue also needs a row for the slip and a craft-live holder', () => {
    const s = styleOf(holdScene(reg), 'drill');
    expect(lessonDue(s, reg, ANN, { type: 'physics_slip', holderId: ANN, kind: 'slip', physicsId: 'weight' })).toBe(true);
    expect(lessonDue(s, reg, ANN, { type: 'physics_slip', holderId: ANN, kind: 'unheard_of' })).toBe(false);
    expect(lessonDue(s, reg, BEA, { type: 'physics_slip', holderId: BEA, kind: 'slip', physicsId: 'weight' })).toBe(false);
    s.relations[ANN].dynamic!.frame = 'equal';
    expect(lessonDue(s, reg, ANN, { type: 'physics_slip', holderId: ANN, kind: 'slip', physicsId: 'weight' })).toBe(false);
  });
});

describe('a slip teaches only when she follows it up', () => {
  it('with neither a punishment nor a named point it pays nothing', () => {
    const s = styleOf(holdScene(reg), 'cruel');
    expect(noteSlips(s, ctx(), [slip()])).toEqual([]);
    expect(xpOf(s)).toBe(0);
    expect(s.relations[ANN].craft!.slips).toEqual([{ key: 'endurance:weight', scene: s.scene!.id, day: s.day, run: 'p1' }]);
    expect(noteSlips(s, ctx(), [{ type: 'scene_exchange' }])).toEqual([]);
    expect(xpOf(s)).toBe(0);
  });

  it('her punishment in the same scene pays half the clean xp for each slip that waited, once', () => {
    const s = styleOf(holdScene(reg), 'cruel');
    noteSlips(s, ctx(), [slip(), slip({ kind: 'collapse' })]);
    const ev = noteSlips(s, ctx(), [{ type: 'punishment_issued', punishmentId: 'pp1', unitId: ANN, holderId: ANN }]);
    expect(ev.filter((e) => e.type === 'lesson')).toEqual([
      { type: 'lesson', unitId: ANN, key: 'endurance:weight', xp: HALF, via: 'punished' },
      { type: 'lesson', unitId: ANN, key: 'endurance:weight', xp: HALF, via: 'punished' },
    ]);
    expect(xpOf(s)).toBe(2 * HALF);
    expect(s.relations[ANN].craft!.slips).toBeUndefined();
    expect(noteSlips(s, ctx(), [{ type: 'punishment_issued', punishmentId: 'pp2', unitId: ANN, holderId: ANN }])).toEqual([]); // nothing waits now
    expect(xpOf(s)).toBe(2 * HALF);
  });

  it('half is half of a clean phase', () => {
    expect(HALF).toBe(1.5);
  });

  it('her naming the point pays at once and keeps the point for her next reply', () => {
    const s = styleOf(holdScene(reg), 'drill');
    s.scene!.exchanges = 4;
    const ev = noteSlips(s, ctx(), [slip()]);
    expect(ev[0]).toEqual({ type: 'lesson', unitId: ANN, key: 'endurance:weight', xp: HALF, via: 'named' });
    expect(xpOf(s)).toBe(HALF);
    expect(s.relations[ANN].craft!.slips).toBeUndefined();
    expect(s.relations[ANN].craft!.lesson).toMatchObject({ point: 'hands', scene: s.scene!.id, exchange: 4 });
    expect(s.relations[ANN].craft!.lesson!.joke).toBeUndefined();
    // a later punishment does not pay the same slip twice
    expect(noteSlips(s, ctx(), [{ type: 'punishment_issued', unitId: ANN, holderId: ANN }])).toEqual([]);
    expect(xpOf(s)).toBe(HALF);
  });

  it('a playful holder jokes it', () => {
    const s = styleOf(holdScene(reg), 'playful');
    noteSlips(s, ctx(), [slip({ physicsId: 'breath' })]);
    expect(s.relations[ANN].craft!.lesson).toMatchObject({ point: 'windows', joke: true });
  });

  it('a posture slip teaches the posture', () => {
    const s = styleOf(holdScene(reg), 'ritual');
    const ev = noteSlips(s, ctx(), [{ type: 'posture_slip', unitId: ANN, holderId: ANN, callId: 'pc1', postureId: 'kneeling_upright' }]);
    expect(ev[0]).toMatchObject({ type: 'lesson', key: 'posture' });
    expect(s.commander.craft!.posture.xp).toBe(HALF);
  });

  it('a slip with no row waits for a punishment all the same, and the slips of another scene are swept', () => {
    const s = styleOf(holdScene(reg), 'drill');
    noteSlips(s, ctx(), [slip({ kind: 'unheard_of' })]);
    expect(s.relations[ANN].craft!.slips).toHaveLength(1);
    const later = structuredClone(s);
    later.scene!.id = 'another_scene';
    noteSlips(later, ctx(), []);
    expect(later.relations[ANN].craft!.slips).toBeUndefined();
    const next = structuredClone(s);
    next.day += 1;
    noteSlips(next, ctx(), []);
    expect(next.relations[ANN].craft!.slips).toBeUndefined();
    const ev = noteSlips(s, ctx(), [{ type: 'punishment_issued', unitId: ANN, holderId: ANN }]);
    expect(ev.filter((e) => e.type === 'lesson')).toHaveLength(1);
  });

  it('the lessons of one posture hold never pay more than its clean hold (xp.posture); another hold starts again', () => {
    const s = styleOf(holdScene(reg), 'drill');
    const pslip = (runId: string) => ({ type: 'posture_slip', unitId: ANN, holderId: ANN, runId, presetId: 'kneel_upright', point: 'arms' });
    let paid = 0;
    for (let i = 0; i < 9; i++) paid += noteSlips(s, ctx(), [pslip('pr1')]).filter((e) => e.type === 'lesson').reduce((a, e) => a + Number(e.xp), 0);
    expect(paid).toBe(TUNING.craft.xp.posture);
    expect(s.commander.craft!.posture.xp).toBe(TUNING.craft.xp.posture);
    expect(noteSlips(s, ctx(), [pslip('pr1')]).filter((e) => e.type === 'lesson')).toEqual([]);
    expect(noteSlips(s, ctx(), [pslip('pr2')]).filter((e) => e.type === 'lesson')).toHaveLength(1); // a new hold has its own
  });

  it('the lessons of one physics run never pay more than a clean segment of it; waiting slips paid by a punishment obey the same cap', () => {
    const s = styleOf(holdScene(reg), 'drill');
    let paid = 0;
    for (let i = 0; i < 6; i++) paid += noteSlips(s, ctx(), [slip({ runId: 'p1', kind: 'reflex' })]).filter((e) => e.type === 'lesson').reduce((a, e) => a + Number(e.xp), 0);
    expect(paid).toBe(TUNING.craft.xp.phase); // one segment's clean xp: the run had not played another
    const c = styleOf(holdScene(reg), 'cruel');
    noteSlips(c, ctx(), [slip(), slip({ kind: 'collapse' }), slip({ kind: 'skip' }), slip({ kind: 'slip' })]);
    const ev = noteSlips(c, ctx(), [{ type: 'punishment_issued', unitId: ANN, holderId: ANN }]).filter((e) => e.type === 'lesson');
    expect(ev.reduce((a, e) => a + Number(e.xp), 0)).toBe(TUNING.craft.xp.phase);
    expect(xpOf(c)).toBe(TUNING.craft.xp.phase);
  });

  it('writes nothing for a holder who is not craft-live, who is not in the scene, or without a scene', () => {
    const eq = holdScene(reg);
    eq.relations[ANN].dynamic!.frame = 'equal';
    expect(noteSlips(eq, ctx(), [slip()])).toEqual([]);
    expect(eq.relations[ANN].craft).toBeUndefined();
    const out = styleOf(holdScene(reg), 'drill');
    out.scene!.participants = [BEA];
    expect(noteSlips(out, ctx(), [slip()])).toEqual([]);
    expect(out.relations[ANN].craft).toBeUndefined();
    const none = styleOf(holdScene(reg), 'drill');
    delete none.scene;
    expect(noteSlips(none, ctx(), [slip()])).toEqual([]);
  });

  it('draws nothing', () => {
    const s = styleOf(holdScene(reg), 'cold');
    const before = JSON.stringify(s.rng);
    const next = vi.spyOn(Rng.prototype as unknown as { next: () => number }, 'next');
    noteSlips(s, ctx(), [slip(), slip({ kind: 'reflex' })]);
    noteSlips(s, ctx(), [{ type: 'punishment_issued', unitId: ANN, holderId: ANN }]);
    expect(next).not.toHaveBeenCalled();
    next.mockRestore();
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});
