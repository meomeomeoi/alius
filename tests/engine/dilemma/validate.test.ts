import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import type { DilemmaOption, DilemmaScale } from '../../../src/engine/dilemma/types';
import { checkDefining, dominates, effectSign, scoreOption, validateOptions } from '../../../src/engine/dilemma/validate';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import type { WorldEffect } from '../../../src/engine/world/types';
import { campaign, loadCore } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
let neutral: Unit[];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  neutral = base.squad;
});

const res = (resource: 'credits' | 'supplies' | 'plyx', amount: number): WorldEffect => ({ type: 'resource', resource, amount });
const fac = (factionId: string, amount: number): WorldEffect => ({ type: 'faction', factionId, amount });
const clock = (clockId: string, by: number): WorldEffect => ({ type: 'clock', clockId, by });
const stress = (amount: number): WorldEffect => ({ type: 'party_stress', amount });
const unitEv = (axis: string, direction: 1 | -1, severity: 'minor' | 'moderate' | 'major' = 'moderate'): WorldEffect =>
  ({ type: 'unit_event', event: 'decision_aligned', severity, targets: 'named', valueAxes: [{ axis, direction }] });
const opt = (effects: WorldEffect[], extra: Partial<DilemmaOption> = {}): DilemmaOption => ({ label: 'x', effects, magnitudes: [], ...extra });
const rules = (options: DilemmaOption[], scale: DilemmaScale = 'major', units: Unit[] = neutral) =>
  validateOptions(options, scale, units).map((r) => `${r.rule}${r.option === undefined ? '' : `@${r.option}`}`);

/** Three options that trade different things: none dominates another, each has a gain and a loss. */
const fair = (): DilemmaOption[] => [
  opt([res('credits', 40), stress(5)]),
  opt([fac('vesper', 10), res('credits', -15)]),
  opt([res('plyx', 8), clock('oversight', 1)]),
];

describe('effectSign', () => {
  it('reads gains and losses of every effect type', () => {
    expect(effectSign(res('credits', 40), neutral)).toEqual({ pos: true, neg: false, key: 'resource:credits' });
    expect(effectSign(res('plyx', -3), neutral)).toEqual({ pos: false, neg: true, key: 'resource:plyx' });
    expect(effectSign(fac('sable', -5), neutral)).toEqual({ pos: false, neg: true, key: 'faction:sable' });
    expect(effectSign(stress(5), neutral)).toEqual({ pos: false, neg: true, key: 'stress' });
    expect(effectSign(stress(-5), neutral)).toEqual({ pos: true, neg: false, key: 'stress' });
    expect(effectSign(clock('oversight', 1), neutral)).toEqual({ pos: false, neg: true, key: 'clock:oversight' });
    expect(effectSign(clock('oversight', -1), neutral)).toEqual({ pos: true, neg: false, key: 'clock:oversight' });
    expect(effectSign({ type: 'flag', flagId: 'evidence_buried' }, neutral)).toMatchObject({ pos: false, neg: false });
  });

  it('a unit_event is read through the values of the units present', () => {
    const squad = structuredClone(neutral);
    squad[0].values.mercy = 3;
    squad[1].values.mercy = -3;
    expect(effectSign(unitEv('mercy', 1), squad)).toEqual({ pos: true, neg: true, key: 'unit_event:mercy' });
    expect(effectSign(unitEv('mercy', 1), [squad[0]])).toMatchObject({ pos: true, neg: false });
    expect(effectSign(unitEv('mercy', -1), [squad[0]])).toMatchObject({ pos: false, neg: true });
    expect(effectSign(unitEv('mercy', 1), neutral)).toMatchObject({ pos: false, neg: false }); // nobody cares
    // an event without axes is read from its type
    const hurt: WorldEffect = { type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party' };
    expect(effectSign(hurt, neutral)).toMatchObject({ pos: false, neg: true, key: 'unit_event:sided_against' });
  });
});

describe('scoreOption and dominates', () => {
  it('scores five dimensions', () => {
    const squad = structuredClone(neutral);
    squad[0].values.mercy = 3;
    const s = scoreOption(opt([
      res('credits', 40), res('supplies', 3), res('plyx', 2), fac('vesper', 10), clock('oversight', 1), stress(5), unitEv('mercy', 1, 'major'),
    ]), squad);
    expect(s).toEqual({ resources: 40 + 9 + 10, factions: 20, clocks: -15, stress: -5, units: 10 });
  });

  it('a unit that holds the opposite value counts against', () => {
    const squad = structuredClone(neutral);
    squad[0].values.mercy = -3;
    expect(scoreOption(opt([unitEv('mercy', 1, 'moderate')]), squad).units).toBe(-5);
  });

  it('at least as good on every dimension dominates, equal vectors included', () => {
    const a = { resources: 10, factions: 0, clocks: 0, stress: 0, units: 0 };
    expect(dominates(a, { ...a })).toBe(true);
    expect(dominates({ ...a, units: 1 }, a)).toBe(true);
    expect(dominates(a, { ...a, units: 1 })).toBe(false);
    expect(dominates({ ...a, resources: 11, stress: -1 }, a)).toBe(false);
  });
});

describe('validateOptions', () => {
  it('a fair set passes every rule', () => {
    expect(rules(fair(), 'minor')).toEqual([]);
  });

  it('an option with only gains is rejected (1)', () => {
    const o = fair();
    o[1] = opt([fac('vesper', 10), res('plyx', 5)]);
    expect(rules(o)).toContain('1@1');
    expect(rules(o)).not.toContain('1@0');
  });

  it('an option with only losses is rejected (1)', () => {
    const o = fair();
    o[0] = opt([stress(5), res('credits', -10)]);
    expect(rules(o)).toContain('1@0');
  });

  it('gain and loss on the same resource do not count as different (1)', () => {
    const o = fair();
    o[0] = opt([res('credits', 40), res('credits', -10)]);
    expect(rules(o)).toContain('1@0');
    o[0] = opt([res('credits', 40), res('supplies', -3)]);
    expect(rules(o)).not.toContain('1@0');
  });

  it('a major dilemma that hurts no squad member is rejected, the same options pass as minor (2)', () => {
    const o = fair();
    o[0].effects.push(unitEv('mercy', 1));
    expect(rules(o, 'major').filter((r) => r.startsWith('2'))).toEqual(['2']);
    expect(rules(o, 'defining').filter((r) => r.startsWith('2'))).toEqual(['2']);
    expect(rules(o, 'minor').filter((r) => r.startsWith('2'))).toEqual([]);
    const squad = structuredClone(neutral);
    squad[0].values.mercy = -3; // she loses by this choice
    expect(rules(o, 'major', squad).filter((r) => r.startsWith('2'))).toEqual([]);
    // a plain hostile event hurts everyone present
    o[1].effects.push({ type: 'unit_event', event: 'sided_against', severity: 'minor', targets: 'party' });
    expect(rules(o, 'major').filter((r) => r.startsWith('2'))).toEqual([]);
  });

  it('an option that is at least as good everywhere is rejected (3)', () => {
    const o = fair();
    o[1] = opt([res('credits', 40), stress(5), res('supplies', 1)]); // beats option 0 on resources, ties the rest
    expect(rules(o)).toContain('3@1');
    expect(rules(o)).not.toContain('3@0');
  });

  it('two identical options are rejected (3)', () => {
    const o = fair();
    o[2] = opt(structuredClone(o[0].effects));
    expect(rules(o)).toEqual(expect.arrayContaining(['3@0', '3@2']));
  });

  it('a gated option may be better (3)', () => {
    const o = fair();
    o[1] = opt([res('credits', 40), stress(5), res('supplies', 1)], { requires: { stat: 'empathy', rank: 3 } });
    expect(rules(o)).not.toContain('3@1');
    o[1] = opt([res('credits', 40), stress(5), res('supplies', 1)], { check: { stat: 'cunning', rank: 3 } });
    expect(rules(o)).not.toContain('3@1');
    // but an ungated option that dominates a gated one is still rejected
    const dominated = fair();
    dominated[1] = opt([res('credits', 10), stress(5), res('supplies', -1)], { requires: { stat: 'empathy', rank: 3 } });
    expect(rules(dominated)).toContain('3@0');
  });
});

describe('checkDefining', () => {
  const at = (patch: Partial<NonNullable<CampaignState['dilemmas']>>, day = 20): CampaignState => {
    const s = structuredClone(base);
    s.day = day;
    s.dilemmas = { seq: 1, ...patch };
    return s;
  };

  it('a second defining dilemma inside 7 days or in the same beat is rejected (5)', () => {
    expect(checkDefining(base, 'beat_a')).toBeNull();
    expect(checkDefining(at({}), 'beat_a')).toBeNull();
    expect(checkDefining(at({ lastDefiningDay: 14 }), 'beat_a')).toMatchObject({ rule: 5 });
    expect(checkDefining(at({ lastDefiningDay: 13 }), 'beat_a')).toBeNull();
    expect(checkDefining(at({ definingBeats: ['beat_a'] }), 'beat_a')).toMatchObject({ rule: 5 });
    expect(checkDefining(at({ definingBeats: ['beat_a'] }), 'beat_b')).toBeNull();
  });
});

describe('core content', () => {
  it('every fixed block of a generating core template passes rules 1 and 3 for a neutral squad', () => {
    const generating = [...reg.dilemmaTemplates.values()].filter((t) => t.generate !== undefined);
    expect(generating.length).toBeGreaterThanOrEqual(6);
    for (const t of generating) {
      const options = (t.fixed as { options: Array<{ label: string; effects: WorldEffect[] }> }).options.map((o) => opt(o.effects));
      const bad = validateOptions(options, t.scale as DilemmaScale, neutral).filter((r) => r.rule === 1 || r.rule === 3);
      expect(bad, String(t.id)).toEqual([]);
    }
  });

  it('every generating major or defining template can hurt somebody (rule 2) for a squad that has opinions', () => {
    const squad = structuredClone(neutral);
    squad[0].values = { pragmatism: 3, autonomy: 3, ingroup: 3, mercy: 3, corporate: 3, sacrifice: 3 };
    squad[1].values = { pragmatism: -3, autonomy: -3, ingroup: -3, mercy: -3, corporate: -3, sacrifice: -3 };
    for (const t of reg.dilemmaTemplates.values()) {
      if (t.generate === undefined || t.scale === 'minor') continue;
      const options = (t.fixed as { options: Array<{ effects: WorldEffect[] }> }).options.map((o) => opt(o.effects));
      const bad = validateOptions(options, t.scale as DilemmaScale, squad).filter((r) => r.rule === 2);
      expect(bad, String(t.id)).toEqual([]);
    }
  });
});
