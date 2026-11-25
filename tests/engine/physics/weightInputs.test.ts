/**
 * P10e-e Task 15 (R16, R17): weight's engine for the instrument. An `uneven` input on a beat carries the mean extra drain factor of that beat
 * (`1.2·max(0, |err| − tol/2)`, weight.html's uneven holding) and costs `drain × amount` (the beat's drain: her pressure and the steady breath
 * of a pair included); the level is the UI's judgement (a `hold` is sent only on a beat held and level), so a shift still costs as today when
 * the beat or the one before had no hold. A weight contact says which way the commander faces (`face`: up sees her and the ceiling, down the
 * floor) and whether her legs hang in view (`legs: 'hang'`); both are read by field. Old inputs resolve exactly as before.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { ContactSchema } from '../../../src/content/schemas';
import { CONTACT_FACES, contactFaceOf, herLegsOf } from '../../../src/engine/physics/occlusion';
import { resolveSegment, validInput, type ResolveEnv } from '../../../src/engine/physics/segment';
import { INPUT_KINDS, type PhysicsRun, type SegmentInput, type SegmentPlan } from '../../../src/engine/physics/state';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const mk = (over: Partial<PhysicsRun> = {}): PhysicsRun => ({
  id: 'p1', physicsId: 'weight', sourceKind: 'contact', sourceId: 'human_chair', holderId: 'unit_ann', gauge: 100, capacity: 100,
  segment: { n: 1, state: 'running' }, startedExchange: 0, taps: 0, streak: 0, extend: 0, ...over,
});
const plan = (...b: Array<Partial<SegmentPlan['beats'][number]>>): SegmentPlan => ({ beats: b.map((x) => ({ attention: 'busy' as const, ...x })) });
const four = (): SegmentPlan => plan({}, {}, {}, {});
const env = (over: Partial<ResolveEnv> = {}): ResolveEnv => ({ gaugeKind: 'capacity', interaction: 'hold', style: { primary: 'neutral' }, sealLevel: 0, band: 'noticeable', ...over });
const input = (beat: number, kind: SegmentInput['kind'], extra: Partial<SegmentInput> = {}): SegmentInput => ({ beat, kind, ...extra });
const holds = [0, 1, 2, 3].map((b) => input(b, 'hold'));
const DRAIN = TUNING.physics.weight.drain;

describe('uneven holding (R16)', () => {
  it('an uneven input drains drain × amount', () => {
    expect(INPUT_KINDS).toContain('uneven');
    expect(resolveSegment(mk(), four(), [...holds, input(1, 'uneven', { amount: 0.5 })], env()).gauge).toBe(100 - DRAIN * 4 - DRAIN * 0.5);
    // one a beat (the first counts), on as many beats as were uneven; her pressure scales it with the beat's drain
    const two = [...holds, input(1, 'uneven', { amount: 0.25 }), input(1, 'uneven', { amount: 2 }), input(3, 'uneven', { amount: 1 })];
    expect(resolveSegment(mk(), four(), two, env()).gauge).toBe(100 - DRAIN * 4 - DRAIN * 0.25 - DRAIN);
    expect(resolveSegment(mk({ pressure: 1.5 }), four(), [...holds, input(0, 'uneven', { amount: 0.5 })], env()).gauge).toBe(100 - DRAIN * 1.5 * 4.5);
    // a held breath of a pair lightens the beat's drain, and the uneven cost with it
    const steady = resolveSegment(mk(), four(), [...holds, input(0, 'uneven', { amount: 1 })], env({ steady: new Set([0]) }));
    expect(steady.gauge).toBeCloseTo(100 - DRAIN * 3 - DRAIN * 0.75 * 2, 10);
  });

  it('an uneven input with amount 0 (or none) costs nothing; it is no hold and no slip', () => {
    expect(resolveSegment(mk(), four(), [...holds, input(2, 'uneven', { amount: 0 })], env()).gauge).toBe(100 - DRAIN * 4);
    expect(resolveSegment(mk(), four(), [...holds, input(2, 'uneven')], env()).gauge).toBe(100 - DRAIN * 4);
    const alone = resolveSegment(mk(), four(), [...holds.filter((i) => i.beat !== 2), input(2, 'uneven', { amount: 0.5 })], env());
    expect(alone).toMatchObject({ slips: 1, gauge: 100 - DRAIN * 5 - DRAIN * 0.5, reliefs: 0 });
  });

  it('the wire format takes the uneven kind with an amount ≥ 0', () => {
    expect(validInput({ beat: 1, kind: 'uneven', amount: 0.31 })).toBe(true);
    expect(validInput({ beat: 1, kind: 'uneven', amount: -0.1 })).toBe(false);
  });

  it('it is weight\'s: a timing physics ignores it', () => {
    const breath = resolveSegment(mk({ physicsId: 'breath', gauge: 80, seal: 'tight' }), four(), [input(1, 'uneven', { amount: 3 })], env({ interaction: 'timing' }));
    expect(breath.gauge).toBe(80 - TUNING.physics.breath.drain * 4);
  });
});

describe('old inputs: today\'s numbers', () => {
  it('no uneven input: today\'s numbers', () => {
    expect(resolveSegment(mk(), four(), holds, env()).gauge).toBe(100 - DRAIN * 4);
    const slip = resolveSegment(mk(), four(), holds.filter((i) => i.beat !== 2), env());
    expect(slip).toMatchObject({ slips: 1, gauge: 100 - DRAIN * 5 });
    const relief = resolveSegment(mk({ gauge: 60 }), four(), [...holds, input(1, 'shift_weight')], env());
    expect(relief).toMatchObject({ gauge: 60 - DRAIN * 4 + TUNING.physics.weight.relief, reliefs: 1 });
  });

  it('a shift landing on a beat with no hold costs as today (the beat or the one before); level and held, it costs nothing', () => {
    const shifted = plan({}, {}, { shift: 20, cue: 'shift' }, {});
    expect(resolveSegment(mk(), shifted, holds, env()).gauge).toBe(100 - DRAIN * 4);
    // no hold on the shift's beat: a slip and the shift
    expect(resolveSegment(mk(), shifted, holds.filter((i) => i.beat !== 2), env()).gauge).toBe(100 - DRAIN * 5 - 20);
    // no hold on the beat before
    expect(resolveSegment(mk(), shifted, holds.filter((i) => i.beat !== 1), env()).gauge).toBe(100 - DRAIN * 5 - 20);
    // an uneven input without a tilt does not make it uneven for the shift; a held beat that ended tilted does (Ruling S), on the shift's beat or the one before
    expect(resolveSegment(mk(), shifted, [...holds, input(2, 'uneven', { amount: 0.4 })], env()).gauge).toBeCloseTo(100 - DRAIN * 4 - DRAIN * 0.4, 10);
    expect(resolveSegment(mk(), shifted, [...holds, input(2, 'uneven', { amount: 0.4, part: 'tilted' })], env()).gauge).toBeCloseTo(100 - DRAIN * 4 - DRAIN * 0.4 - 20, 10);
    expect(resolveSegment(mk(), shifted, [...holds, input(1, 'uneven', { amount: 0, part: 'tilted' })], env()).gauge).toBe(100 - DRAIN * 4 - 20);
    expect(resolveSegment(mk(), shifted, [...holds, input(3, 'uneven', { amount: 0, part: 'tilted' })], env()).gauge).toBe(100 - DRAIN * 4); // after the shift: nothing
  });

  it('Ruling S: a held but tilted beat is no slip; it costs only its uneven drain', () => {
    const r = resolveSegment(mk(), four(), [...holds, input(1, 'uneven', { amount: 0.6, part: 'tilted' })], env());
    expect(r).toMatchObject({ slips: 0 });
    expect(r.gauge).toBeCloseTo(100 - DRAIN * 4 - DRAIN * 0.6, 10);
  });
});

describe('the view of a weight contact', () => {
  it('face reads by field: up for straddled, standing_on and boot_on_chest; down for human_chair, footrest, knee_on_back and on_hands', () => {
    expect(CONTACT_FACES).toEqual(['up', 'down']);
    const face = (id: string): string => contactFaceOf(reg.blockingContacts.get(id));
    for (const id of ['straddled', 'standing_on', 'boot_on_chest']) expect(face(id), id).toBe('up');
    for (const id of ['human_chair', 'footrest', 'knee_on_back', 'on_hands']) expect(face(id), id).toBe('down');
    // read by field: any contact carrying it, whatever its id
    expect(contactFaceOf({ id: 'anything', face: 'up' } as never)).toBe('up');
    expect(contactFaceOf({ id: 'human_chair' } as never)).toBe('down'); // absent: down (the floor), whatever the id
    expect(contactFaceOf(undefined)).toBe('down');
    expect(contactFaceOf({ id: 'x', face: 'sideways' } as never)).toBe('down');
  });

  it('her legs hang in view only where the contact says so (human_chair); read by field', () => {
    expect(herLegsOf(reg.blockingContacts.get('human_chair'))).toBe('hang');
    for (const id of ['footrest', 'knee_on_back', 'on_hands', 'straddled']) expect(herLegsOf(reg.blockingContacts.get(id)), id).toBeNull();
    expect(herLegsOf({ id: 'other', legs: 'hang' } as never)).toBe('hang');
    expect(herLegsOf({ id: 'human_chair' } as never)).toBeNull();
  });

  it('the schema takes face and legs, and only their values', () => {
    const base = reg.blockingContacts.get('human_chair')!;
    expect(ContactSchema.safeParse({ ...base, face: 'down', legs: 'hang' }).success).toBe(true);
    expect(ContactSchema.safeParse({ ...base, face: 'left' }).success).toBe(false);
    expect(ContactSchema.safeParse({ ...base, legs: 'x_side' }).success).toBe(false);
  });
});
