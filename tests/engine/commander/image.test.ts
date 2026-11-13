import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadPacks } from '../../../src/content/loader';
import { ImageConsistencySchema } from '../../../src/content/schemas';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/commander';
import { imageMultiplier } from '../../../src/engine/commander/presence';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { Archetype, CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
const UNIT = 'unit_ann';
beforeAll(async () => { reg = await loadCore(); });

const BODIES: Record<Archetype, [number, number, number]> = {
  frail: [2, 1, 1], slight: [2, 2, 2], average: [3, 3, 3], fit: [4, 3, 3], hardened: [5, 4, 4],
};
/** A campaign with a commander of the given archetype, a unit that has known him for `days` days, no defects. */
function at(archetype: Archetype, days = 0, o: { tastes?: string[]; tau?: number } = {}): CampaignState {
  const s = campaign(reg, 1);
  const [a, b, c] = BODIES[archetype];
  s.commander.body = { strength: a, endurance: b, reflexes: c };
  s.day = 1 + days;
  s.squad[0].defects = [];
  if (o.tastes) s.squad[0].commanderTastes = o.tastes;
  if (o.tau !== undefined) s.settings.firstImpressionTau = o.tau;
  return s;
}
const ev = (type: string, over: Partial<EventIntent> = {}): EventIntent =>
  ({ type, actor: 'commander', targets: [UNIT], severity: 'moderate', evidence: 'x', confidence: 1, ...over }) as EventIntent;
const mult = (s: CampaignState, type: string, over: Partial<EventIntent> = {}) => imageMultiplier(s, reg, UNIT, ev(type, over));
const extra = (m: number, w: number) => 1 + (m - 1) * w;

describe('imageMultiplier', () => {
  it("a frail commander's coerced gets 1.3 at d=0, ≈1.110 at d=7, ≈1.015 at d=21", () => {
    expect(mult(at('frail', 0), 'coerced')).toBeCloseTo(1.3, 10);
    expect(mult(at('frail', 7), 'coerced')).toBeCloseTo(1.1104, 3);
    expect(mult(at('frail', 21), 'coerced')).toBeCloseTo(1.0149, 3);
    expect(mult(at('slight', 0), 'coerced')).toBeCloseTo(1.3, 10);
  });

  it("a hardened commander's comforted gets the same curve on a gain", () => {
    for (const [d, expected] of [[0, 1.3], [7, 1.1104], [21, 1.0149]] as const) {
      expect(mult(at('hardened', d), 'comforted')).toBeCloseTo(expected, 3);
    }
    // through the delta chain: a gain grows by the multiplier
    const hard = at('hardened', 0);
    const avg = at('average', 0);
    const ratio = computeDeltas(hard, reg, UNIT, ev('comforted')).trust / computeDeltas(avg, reg, UNIT, ev('comforted')).trust;
    expect(ratio).toBeCloseTo(1.3, 6);
  });

  it("a frail commander's coerced makes a loss bigger", () => {
    const frail = computeDeltas(at('frail', 0), reg, UNIT, ev('coerced'));
    const avg = computeDeltas(at('average', 0), reg, UNIT, ev('coerced'));
    expect(avg.trust).toBeLessThan(0);
    expect(frail.trust / avg.trust).toBeCloseTo(1.3, 6);
    expect(frail.affinity / avg.affinity).toBeCloseTo(1.3, 6);
    expect(frail.stress).toBe(avg.stress); // stress is not an axis
  });

  it('attraction scales too', () => {
    const hard = computeDeltas(at('hardened', 0), reg, UNIT, ev('physical_affection'));
    const avg = computeDeltas(at('average', 0), reg, UNIT, ev('physical_affection'));
    expect(avg.attraction).toBeGreaterThan(0);
    expect(hard.attraction / avg.attraction).toBeCloseTo(1.3, 6);
  });

  it("an average commander's coerced is unchanged", () => {
    expect(mult(at('average', 0), 'coerced')).toBe(1);
    expect(mult(at('average', 0), 'comforted')).toBe(1);
  });

  it('an in-image event is unchanged', () => {
    expect(mult(at('frail', 0), 'comforted')).toBe(1);
    expect(mult(at('hardened', 0), 'coerced')).toBe(1);
  });

  it("a unit's own event is never off-image", () => {
    const s = at('frail', 0);
    expect(mult(s, 'coerced', { actor: UNIT, targets: [] })).toBe(1);
  });

  it('a matched wary_of_brutes doubles the extra part', () => {
    const s = at('hardened', 0, { tastes: ['wary_of_brutes'] });
    expect(mult(s, 'comforted')).toBeCloseTo(extra(1.3 * 1.5, 1), 10); // 1.95
    const later = at('hardened', 7, { tastes: ['wary_of_brutes'] });
    expect(mult(later, 'comforted')).toBeCloseTo(extra(1.3 * 1.5, Math.exp(-1)), 10);
  });

  it('a taste that does not match changes nothing', () => {
    expect(mult(at('frail', 0, { tastes: ['wary_of_brutes'] }), 'coerced')).toBeCloseTo(1.3, 10);
  });

  it('τ = 14 slows the decay: at d=7 the extra part is e^(−0.5)', () => {
    expect(mult(at('frail', 7, { tau: 14 }), 'coerced')).toBeCloseTo(extra(1.3, Math.exp(-0.5)), 10);
    expect(mult(at('frail', 7, { tau: 14 }), 'coerced')).toBeGreaterThan(mult(at('frail', 7), 'coerced'));
  });

  it('an old save without metDay counts from day 1', () => {
    const s = at('frail', 0);
    delete s.relations[UNIT].metDay;
    s.day = 8;
    expect(mult(s, 'coerced')).toBeCloseTo(extra(1.3, Math.exp(-1)), 10);
  });

  it('without the registry the multiplier is 1', () => {
    expect(imageMultiplier(at('frail', 0), { ...reg, imageConsistency: new Map() }, UNIT, ev('coerced'))).toBe(1);
  });
});

describe('ImageConsistencySchema and the core groups', () => {
  const group = (over: Record<string, unknown> = {}) => ({ id: 'g', archetypes: ['frail'], inImage: [], offImage: ['coerced'], ...over });

  it('an event in both lists is rejected, and so are no archetypes', () => {
    expect(ImageConsistencySchema.safeParse(group()).success).toBe(true);
    expect(ImageConsistencySchema.safeParse(group({ inImage: ['coerced'] })).success).toBe(false);
    expect(ImageConsistencySchema.safeParse(group({ archetypes: [] })).success).toBe(false);
    expect(ImageConsistencySchema.safeParse(group({ archetypes: ['giant'] })).success).toBe(false);
  });

  it('core: every archetype is in exactly one of three groups', () => {
    const all = [...reg.imageConsistency.values()].flatMap((g) => g.archetypes as string[]);
    expect(all.sort()).toEqual(['average', 'fit', 'frail', 'hardened', 'slight']);
    expect([...reg.imageConsistency.keys()].sort()).toEqual(['average_build', 'slight_build', 'strong_build']);
    expect(reg.imageConsistency.get('slight_build')!.offImage).toEqual(['coerced']);
    expect(reg.imageConsistency.get('strong_build')!.offImage).toEqual(['comforted', 'physical_affection', 'apologized']);
    expect(reg.imageConsistency.get('average_build')!.offImage).toEqual([]);
  });

  const load = async (patch: (list: Array<Record<string, unknown>>) => void) =>
    loadPacks(['content/core'], async (p) => {
      const json = JSON.parse(await readFile(p, 'utf8'));
      if (p.endsWith('/imageConsistency.json')) patch(json);
      return json;
    });

  it('an archetype in two groups is an error', async () => {
    const r = await load((list) => list.push({ id: 'extra', archetypes: ['frail'], inImage: [], offImage: [] }));
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/frail.*more than one group|more than one group.*frail/);
  });

  it('an archetype in no group is an error', async () => {
    const r = await load((list) => { list.splice(list.findIndex((g) => g.id === 'average_build'), 1); });
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/average.*no group|no group.*average/);
  });

  it('an unknown event type is a broken reference', async () => {
    const r = await load((list) => { (list[0].offImage as string[]).push('no_such_event'); });
    expect(r.errors.map((e) => JSON.stringify(e)).join('\n')).toMatch(/no_such_event/);
  });
});

describe('campaign/set_first_impression_tau', () => {
  const set = (days: unknown) => run(campaign(reg, 1), reg, { type: 'campaign/set_first_impression_tau', payload: { days } });
  it('mirrors 1–30 into the campaign settings', () => {
    expect(set(14).state.settings.firstImpressionTau).toBe(14);
    expect(set(1).state.settings.firstImpressionTau).toBe(1);
    expect(set(30).state.settings.firstImpressionTau).toBe(30);
  });
  it('rejects 0, 31, fractions and non-numbers and changes nothing', () => {
    const s = campaign(reg, 1);
    for (const bad of [0, 31, 2.5, '7', null, undefined]) {
      const r = run(s, reg, { type: 'campaign/set_first_impression_tau', payload: { days: bad } });
      expect(errors(r.events), String(bad)).toHaveLength(1);
      expect(r.state, String(bad)).toEqual(s);
    }
  });
});
