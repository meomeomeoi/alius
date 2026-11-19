import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { dispatch, type EngineEvent } from '../../src/engine/dispatch';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { wardenOf, type Expectation } from '../../src/engine/warden';
import { overrideInput } from '../../src/engine/warden';
import { wardenDirectives } from '../../src/warden/directives';
import { sanitizeIntentOutput, getCallTypeInput } from './intentHelper';
import { loadCore, unitSetup } from '../helpers/world';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ID = { ann: 'unit_ann', bea: 'unit_bea' };
const ex = (id: string, kind: Expectation['kind'], weight = 0.5, over: Partial<Expectation> = {}): Expectation => ({ id, kind, weight, source: 'values', known: false, ...over });
function swap(): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 5 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  const w = wardenOf(out.state)!;
  w.expectations = [ex('x1', 'meet_quota', 0.5), ex('x2', 'personal', 0.5, { text: 'Never leave a window open.' })];
  return out.state;
}
const inScene = (s: CampaignState, ids: string[]): CampaignState => dispatch(s, { type: 'scene/start', payload: { locationId: 'comms_room', participants: ids, origin: 'event', consumesSlot: false, startIndex: 0 } }, reg).state;
const apply = (s: CampaignState, events: unknown[]) => dispatch(s, { type: 'intents/apply', payload: { channel: 'scene', intents: { events } } }, reg);
const ev = (type: string, severity: string, over: Record<string, unknown> = {}) => ({ type, actor: 'commander', targets: [ID.bea], severity, evidence: 'she says so', confidence: 1, expectationId: 'x1', ...over });
const types = (events: EngineEvent[]) => events.map((e) => e.type);

describe('expectation_broken / expectation_kept', () => {
  it.each([['minor', 5], ['moderate', 10], ['major', 15], ['extreme', 15]])('broken (%s): satisfaction −%i, defiance +%i, the expectation is learned', (severity, n) => {
    const s = inScene(swap(), [ID.bea]);
    const before = wardenOf(s)!;
    before.satisfaction = 60;
    const r = apply(s, [ev('expectation_broken', severity)]);
    expect(r.events.find((e) => e.type === 'error')).toBeUndefined();
    const w = wardenOf(r.state)!;
    expect(w.satisfaction).toBe(60 - n);
    expect(w.defiance).toBe(n);
    expect(w.expectations.find((x) => x.id === 'x1')!.known).toBe(true);
    expect(types(r.events)).toContain('expectation_learned');
  });

  it.each([['minor', 3], ['moderate', 5], ['major', 8]])('kept (%s): satisfaction +%i, defiance unchanged', (severity, n) => {
    const s = inScene(swap(), [ID.bea]);
    wardenOf(s)!.satisfaction = 60;
    const r = apply(s, [ev('expectation_kept', severity)]);
    const w = wardenOf(r.state)!;
    expect(w.satisfaction).toBe(60 + n);
    expect(w.defiance).toBe(0);
    expect(w.expectations.find((x) => x.id === 'x1')!.known).toBe(true);
  });

  it('is clamped to 0–100', () => {
    const s = inScene(swap(), [ID.bea]);
    wardenOf(s)!.satisfaction = 98;
    expect(wardenOf(apply(s, [ev('expectation_kept', 'major')]).state)!.satisfaction).toBe(100);
    wardenOf(s)!.satisfaction = 2;
    wardenOf(s)!.defiance = 95;
    const w = wardenOf(apply(s, [ev('expectation_broken', 'major')]).state)!;
    expect(w.satisfaction).toBe(0);
    expect(w.defiance).toBeLessThanOrEqual(100);
  });

  it('an unknown expectation id, or the warden not present, changes nothing', () => {
    const s = inScene(swap(), [ID.bea]);
    const w0 = structuredClone(wardenOf(s)!);
    expect(wardenOf(apply(s, [ev('expectation_broken', 'major', { expectationId: 'x9' })]).state)).toEqual(w0);
    const away = inScene(swap(), [ID.ann]);
    const w1 = structuredClone(wardenOf(away)!);
    const r = apply(away, [ev('expectation_broken', 'major', { targets: [ID.ann] })]);
    expect(wardenOf(r.state)).toEqual(w1);
  });

  it('moves her relation through the event row (journal)', () => {
    const s = inScene(swap(), [ID.bea]);
    const r = apply(s, [ev('expectation_broken', 'major')]);
    expect(r.state.relations[ID.bea].trust).toBeLessThan(s.relations[ID.bea].trust);
    expect(reg.eventDeltas.get('expectation_broken')!.journal).toMatch(/\S/);
    expect(reg.eventDeltas.get('expectation_kept')!.journal).toMatch(/\S/);
  });
});

describe('the extraction input', () => {
  it('lists the warden\'s expectations (known and unknown, with their text) only while she is present', () => {
    const s = inScene(swap(), [ID.bea]);
    const input = getCallTypeInput(s, reg, [ID.bea]);
    expect(input.expectations!.map((x) => x.id)).toEqual(['x1', 'x2']);
    expect(input.expectations![1].text).toBe('Never leave a window open.');
    expect(input.expectations![0].text).toMatch(/\S/); // the registry's description of the kind
    expect(getCallTypeInput(inScene(swap(), [ID.ann]), reg, [ID.ann]).expectations).toBeUndefined();
    expect(overrideInput(s, reg, [ID.bea])).toEqual({});
  });

  it('the types are offered only with expectations listed, and sanitized against the list', () => {
    const raw = { events: [ev('expectation_broken', 'minor', { confidence: 0.9 })] };
    const base = { participants: [ID.bea], squad: [{ id: ID.bea }], minConfidence: 0.5, romance: false };
    expect(sanitizeIntentOutput(raw, base).intents.events).toHaveLength(0);
    expect(sanitizeIntentOutput(raw, { ...base, expectations: ['x1'] }).intents.events[0]).toMatchObject({ type: 'expectation_broken', expectationId: 'x1' });
    expect(sanitizeIntentOutput(raw, { ...base, expectations: ['x2'] }).intents.events).toHaveLength(0);
  });
});

describe('warden:romance', () => {
  const romantic = (): string => String([...reg.relationshipStates.values()].find((st) => st.bondTier === 'romantic')!.id);

  it('appears only while she is in a romantic-tier state and in the scene, and has no commander pronoun', () => {
    const s = inScene(swap(), [ID.bea]);
    expect(wardenDirectives(s, reg).some((d) => d.id === 'warden:romance')).toBe(false);
    s.relations[ID.bea].stateId = romantic();
    const d = wardenDirectives(s, reg).find((x) => x.id === 'warden:romance')!;
    expect(d.text).toContain('Bea holds the commander\'s controller');
    expect(d.text).not.toMatch(/\b(he|him|his)\b/i);
    expect(d.expiresAfter).toBe('scene');
    const away = inScene(swap(), [ID.ann]);
    away.relations[ID.bea].stateId = romantic();
    expect(wardenDirectives(away, reg).some((x) => x.id === 'warden:romance')).toBe(false);
  });
});
