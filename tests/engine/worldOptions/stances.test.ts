import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { generateGrunt, gruntRelation } from '../../../src/engine/grunts';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import type { EventIntent } from '../../../src/engine/relations/intents';
import { Rng, seedRng } from '../../../src/engine/rng';
import { buildCampaign, type UnitSetup } from '../../../src/engine/setup';
import type { CampaignState, WorldStance } from '../../../src/engine/state/types';
import { effectiveValues, rollGruntStances, stanceEffects, stanceOf } from '../../../src/engine/worldOptions';
import { campaign, loadCore, unitSetup } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
});

const shares = (strength: 1 | 2 = 1): WorldStance => ({ stance: 'shares', strength, reason: 'r' });
const opposes = (strength: 1 | 2 = 1): WorldStance => ({ stance: 'opposes', strength, reason: 'r' });
/** A world with the options set, Ann holding `annStances` and Bea none; the commander's expression and the day are set too. */
function world(options: Record<string, string>, annStances?: Record<string, WorldStance>, o: { expression?: number; day?: number } = {}): CampaignState {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), ...options };
  if (annStances) s.squad[0].worldStances = annStances;
  s.commander.expression = o.expression ?? 3;
  if (o.day !== undefined) s.day = o.day;
  return s;
}
const ev = (type: string, severity: EventIntent['severity'] = 'major', over: Partial<EventIntent> = {}): EventIntent => ({
  type: type as EventIntent['type'], actor: 'commander', targets: [ANN, BEA], severity, evidence: 'x', confidence: 1, ...over,
});
const MACHISMO = { gender_norms: 'corporate_machismo' };

describe('stanceOf', () => {
  it('is null under a neutral choice and the stored stance (or indifferent) under a non-neutral one', () => {
    const u = { worldStances: { gender_norms: shares(2) } };
    expect(stanceOf(world({}), reg, u, 'gender_norms')).toBeNull();
    expect(stanceOf(world({ offspec_stigma: 'tolerated' }), reg, u, 'offspec_stigma')).toBeNull();
    expect(stanceOf(world(MACHISMO), reg, u, 'gender_norms')).toEqual(shares(2));
    expect(stanceOf(world(MACHISMO), reg, {}, 'gender_norms')).toMatchObject({ stance: 'indifferent', strength: 1 });
    expect(stanceOf(world({ offspec_stigma: 'scorned' }), reg, {}, 'offspec_stigma')).toMatchObject({ stance: 'indifferent' });
  });
  it('is null for an option that does not set stances', () => {
    expect(stanceOf(world({ oversight: 'brutal' }), reg, { worldStances: { oversight: shares() } }, 'oversight')).toBeNull();
    expect(stanceOf(world({}), reg, {}, 'ghost')).toBeNull();
  });
  it('stanceEffects collects the registry effects of her stances by type', () => {
    const s = world({ ...MACHISMO, offspec_stigma: 'hunted' });
    const u = { worldStances: { gender_norms: shares(2), offspec_stigma: opposes(1) } };
    expect(stanceEffects(s, reg, u, 'gain_damp')).toEqual([{ type: 'gain_damp', pctPerStep: 16 }]);
    expect(stanceEffects(s, reg, u, 'value_shift')).toEqual([{ type: 'value_shift', axis: 'corporate', amount: -1 }]);
    expect(stanceEffects(s, reg, {}, 'gain_damp')).toEqual([]);
  });
});

describe('an indifferent unit is unaffected', () => {
  it('an indifferent unit\'s deltas are unchanged under machismo and hunted', () => {
    const plain = world({}, undefined, { expression: 1 });
    const harsh = world({ ...MACHISMO, offspec_stigma: 'hunted' }, undefined, { expression: 1 });
    for (const [type, sev] of [['praised', 'major'], ['insulted', 'major'], ['mocked_defect', 'moderate'], ['protected', 'minor'], ['decision_violated', 'major']] as const) {
      const e = ev(type, sev, { valueAxes: [{ axis: 'corporate', direction: 1 }] });
      expect(computeDeltas(harsh, reg, ANN, e), type).toEqual(computeDeltas(plain, reg, ANN, e));
    }
  });

  it('stances do nothing under indifferent / tolerated', () => {
    const stances = { gender_norms: shares(2), offspec_stigma: shares(2) };
    const withStances = world({}, stances, { expression: 1 });
    const without = world({}, undefined, { expression: 1 });
    for (const type of ['praised', 'mocked_defect', 'insulted'] as const) {
      expect(computeDeltas(withStances, reg, ANN, ev(type)), type).toEqual(computeDeltas(without, reg, ANN, ev(type)));
    }
  });
});

describe('gender norms: a shares unit', () => {
  const damped = (day: number, strength: 1 | 2 = 1, expression = 1) => {
    const s = world(MACHISMO, { gender_norms: shares(strength) }, { expression, day });
    const a = computeDeltas(s, reg, ANN, ev('praised'));
    const b = computeDeltas(s, reg, BEA, ev('praised'));
    return { a, b };
  };

  it('a shares unit\'s Trust gain is damped by 1 − 0.08·d_norm·w(d) at d = 0, 7, 21', () => {
    // expression 1 against norm 5: 4 steps; metDay is 1, so d = day − 1; τ = 7 days
    for (const d of [0, 7, 21]) {
      const { a, b } = damped(1 + d);
      const w = Math.exp(-d / 7);
      const factor = 1 - 0.08 * 4 * w;
      expect(b.trust).toBeGreaterThan(0);
      expect(a.trust / b.trust, `trust d=${d}`).toBeCloseTo(factor, 9);
      expect(a.affinity / b.affinity, `affinity d=${d}`).toBeCloseTo(factor, 9);
    }
    // the three values really are three different numbers
    expect(new Set([0, 7, 21].map((d) => damped(1 + d).a.trust.toFixed(6))).size).toBe(3);
  });

  it('strength 2 doubles the percentage; the damping never takes more than 80%', () => {
    const { a, b } = damped(1, 2);
    expect(a.trust / b.trust).toBeCloseTo(1 - 0.16 * 4, 9);
    const big = world(MACHISMO, { gender_norms: { stance: 'shares', strength: 2, reason: '' } }, { expression: 1, day: 1 });
    // an artificial table with a huge percentage is capped at 0.8
    const r2: Registries = { ...reg, stanceEffects: new Map(reg.stanceEffects) };
    r2.stanceEffects.set('gender_shares_2', { ...reg.stanceEffects.get('gender_shares_2')!, effects: [{ type: 'gain_damp', pctPerStep: 100 }] } as never);
    expect(computeDeltas(big, r2, ANN, ev('praised')).trust / computeDeltas(big, r2, BEA, ev('praised')).trust).toBeCloseTo(0.2, 9);
  });

  it('only commander gains are damped: losses, the unit\'s own events and a commander at the norm are not', () => {
    const s = world(MACHISMO, { gender_norms: shares() }, { expression: 1, day: 1 });
    expect(computeDeltas(s, reg, ANN, ev('insulted'))).toEqual(computeDeltas(s, reg, BEA, ev('insulted')));
    const own = ev('praised', 'major', { actor: ANN, targets: [ANN] });
    expect(computeDeltas(s, reg, ANN, own).trust).toBeCloseTo(computeDeltas(s, reg, BEA, { ...own, actor: BEA, targets: [BEA] }).trust, 9);
    const atNorm = world(MACHISMO, { gender_norms: shares() }, { expression: 5, day: 1 });
    expect(computeDeltas(atNorm, reg, ANN, ev('praised'))).toEqual(computeDeltas(atNorm, reg, BEA, ev('praised')));
  });

  it('an opposes unit is not damped', () => {
    const s = world(MACHISMO, { gender_norms: opposes() }, { expression: 1, day: 1 });
    expect(computeDeltas(s, reg, ANN, ev('praised'))).toEqual(computeDeltas(s, reg, BEA, ev('praised')));
  });
});

describe('start offsets at the join', () => {
  const build = (options: Record<string, string>, expression: number, stances: Record<string, WorldStance> | undefined, plain = true) => {
    const units: UnitSetup[] = [
      unitSetup('Ann', { baseline: { trust: 40, affinity: 0, attraction: 0 }, ...(stances ? { worldStances: stances } : {}) }),
      ...(plain ? [unitSetup('Bea', { baseline: { trust: 40, affinity: 0, attraction: 0 } })] : []),
    ];
    const r = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units, world: { options },
      commander: { body: { strength: 3, endurance: 3, reflexes: 3 }, expression, seasoning: 3, traits: { regular: [] } },
    }, reg, { desireBondDefects: false, seed: 11 });
    if (!r.ok) throw new Error(r.errors.join('; '));
    return r.state.relations;
  };
  const diff = (rel: ReturnType<typeof build>) => ({ trust: rel.unit_ann.trust - rel.unit_bea.trust, affinity: rel.unit_ann.affinity - rel.unit_bea.affinity });

  it('shares starts lower by distance', () => {
    expect(diff(build(MACHISMO, 1, { gender_norms: shares() }))).toEqual({ trust: -8, affinity: -4 });   // 4 steps × (−2, −1)
    expect(diff(build(MACHISMO, 3, { gender_norms: shares() }))).toEqual({ trust: -4, affinity: -2 });   // 2 steps
    expect(diff(build(MACHISMO, 5, { gender_norms: shares() }))).toEqual({ trust: 0, affinity: 0 });
    expect(diff(build(MACHISMO, 1, { gender_norms: shares(2) }))).toEqual({ trust: -16, affinity: -8 });
  });

  it('opposes gets the affinity bonus only at 2 steps or more', () => {
    expect(diff(build(MACHISMO, 1, { gender_norms: opposes() }))).toEqual({ trust: 0, affinity: 2 });
    expect(diff(build(MACHISMO, 3, { gender_norms: opposes() }))).toEqual({ trust: 0, affinity: 2 });
    expect(diff(build(MACHISMO, 4, { gender_norms: opposes() }))).toEqual({ trust: 0, affinity: 0 });
    expect(diff(build(MACHISMO, 1, { gender_norms: opposes(2) }))).toEqual({ trust: 0, affinity: 4 });
  });

  it('nothing happens in an indifferent world, and the stigma stances have no start offset', () => {
    expect(diff(build({}, 1, { gender_norms: shares(2), offspec_stigma: opposes(2) }))).toEqual({ trust: 0, affinity: 0 });
    expect(diff(build({ offspec_stigma: 'hunted' }, 1, { offspec_stigma: shares(2) }))).toEqual({ trust: 0, affinity: 0 });
  });

  it('the band is re-based after the stance offset', () => {
    const rel = build(MACHISMO, 1, { gender_norms: shares(2) });
    expect(rel.unit_ann.trust).toBe(rel.unit_bea.trust - 16);
    expect(['steady', 'wavering', 'breaking']).toContain(rel.unit_ann.loyaltyBand);
    if (rel.unit_ann.trust < 25) expect(rel.unit_ann.loyaltyBand).not.toBe('steady');
  });
});

describe('off-spec stigma stances', () => {
  const scorned = (stances: Record<string, WorldStance>) => world({ offspec_stigma: 'scorned' }, stances, { day: 1 });

  it('offspec shares: mocked_defect adds 3 stress per strength', () => {
    const plain = computeDeltas(scorned({}), reg, BEA, ev('mocked_defect')).stress;
    expect(computeDeltas(scorned({ offspec_stigma: shares(1) }), reg, ANN, ev('mocked_defect')).stress).toBe(plain + 3);
    expect(computeDeltas(scorned({ offspec_stigma: shares(2) }), reg, ANN, ev('mocked_defect')).stress).toBe(plain + 6);
    expect(computeDeltas(scorned({ offspec_stigma: shares(1) }), reg, ANN, ev('insulted')).stress).toBe(computeDeltas(scorned({}), reg, BEA, ev('insulted')).stress + 3);
    // other events are not contempt
    expect(computeDeltas(scorned({ offspec_stigma: shares(2) }), reg, ANN, ev('praised')).stress).toBe(0);
    expect(computeDeltas(scorned({ offspec_stigma: opposes(2) }), reg, ANN, ev('mocked_defect')).stress).toBe(plain);
  });

  it('offspec opposes: a decision against corporate lands as if corporate were one lower', () => {
    const s = scorned({ offspec_stigma: opposes(1) });
    s.squad[0].values = { ...s.squad[0].values, corporate: 2 };
    s.squad[1].values = { ...s.squad[1].values, corporate: 1 };
    const e = ev('decision_aligned', 'major', { valueAxes: [{ axis: 'corporate', direction: 1 }] });
    expect(computeDeltas(s, reg, ANN, e)).toEqual(computeDeltas(s, reg, BEA, e));
    expect(effectiveValues(s, reg, s.squad[0]).corporate).toBe(1);
    expect(effectiveValues(s, reg, s.squad[1]).corporate).toBe(1); // Bea holds no stance
    // the stored value is untouched, and the shift is clamped to −3
    expect(s.squad[0].values.corporate).toBe(2);
    s.squad[0].values.corporate = -3;
    expect(effectiveValues(s, reg, s.squad[0]).corporate).toBe(-3);
  });

  it('with the stigma neutral the value is untouched', () => {
    const s = world({}, { offspec_stigma: opposes(2) });
    s.squad[0].values.corporate = 2;
    expect(effectiveValues(s, reg, s.squad[0]).corporate).toBe(2);
  });
});

describe('grunts', () => {
  const draws = (options: Record<string, string>, seed: number) => {
    const s = world(options);
    const rng = new Rng(seedRng(seed));
    const before = rng.state;
    const r = rollGruntStances(s, reg, rng);
    return { r, moved: JSON.stringify(rng.state) !== JSON.stringify(before) };
  };

  it('grunts roll a stance under hunted and make no draw under tolerated', () => {
    const t = draws({}, 3);
    expect(t.r).toBeUndefined();
    expect(t.moved).toBe(false);
    const h = draws({ offspec_stigma: 'hunted' }, 3);
    expect(h.moved).toBe(true);
    expect(h.r).toEqual({ offspec_stigma: { stance: expect.stringMatching(/^(shares|indifferent|opposes)$/), strength: 1, reason: '' } });
    expect(Object.keys(h.r!)).toEqual(['offspec_stigma']); // gender_norms is neutral: no key
  });

  it('the roll follows the choice\'s weights (hunted 2/3/5)', () => {
    const counts = { shares: 0, indifferent: 0, opposes: 0 };
    for (let seed = 1; seed <= 600; seed++) counts[draws({ offspec_stigma: 'hunted' }, seed).r!.offspec_stigma.stance] += 1;
    expect(counts.shares / 600).toBeGreaterThan(0.14);
    expect(counts.shares / 600).toBeLessThan(0.27);
    expect(counts.opposes / 600).toBeGreaterThan(0.43);
    expect(counts.opposes / 600).toBeLessThan(0.57);
    expect(counts.indifferent / 600).toBeGreaterThan(0.23);
  });

  it('both squad options roll when both are non-neutral, in option order', () => {
    const h = draws({ ...MACHISMO, offspec_stigma: 'scorned' }, 5);
    expect(Object.keys(h.r!)).toEqual(['gender_norms', 'offspec_stigma']);
  });

  it('generateGrunt carries the rolled stances; under the defaults it is the P7 grunt, rng untouched by P8', () => {
    const plain = generateGrunt(world({}), reg, new Rng(seedRng(9)));
    expect(plain.worldStances).toBeUndefined();
    const withStance = generateGrunt(world({ offspec_stigma: 'hunted' }), reg, new Rng(seedRng(9)));
    expect(withStance.worldStances).toBeDefined();
    const { worldStances: _w, ...rest } = withStance;
    expect(rest).toEqual(plain); // everything else is drawn first, so only the stance differs
  });

  it('a grunt\'s stance moves her start under machismo', () => {
    const s = world(MACHISMO, undefined, { expression: 1 });
    const g = generateGrunt(s, reg, new Rng(seedRng(4)));
    const plain = gruntRelation(s, reg, g);
    const shared = gruntRelation(s, reg, { ...g, worldStances: { gender_norms: shares(1) } });
    expect(shared.trust).toBe(plain.trust - 8);
  });
});
