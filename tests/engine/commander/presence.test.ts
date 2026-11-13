import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import {
  applyFirstImpression, firstImpressionWeight, matchedTastes, presenceOf,
} from '../../../src/engine/commander/presence';
import { BODY_STATS } from '../../../src/engine/commander/profile';
import '../../../src/engine/actions/commander';
import '../../../src/engine/actions/squad';
import { buildCampaign, initialRelation, validateSetup, validateUnitProfile, type UnitSetup } from '../../../src/engine/setup';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const withCommander = (s: CampaignState, o: { body?: [number, number, number]; expression?: number; seasoning?: number; authority?: number }): CampaignState => {
  if (o.body) s.commander.body = { strength: o.body[0], endurance: o.body[1], reflexes: o.body[2] };
  if (o.expression !== undefined) s.commander.expression = o.expression;
  if (o.seasoning !== undefined) s.commander.seasoning = o.seasoning;
  if (o.authority !== undefined) s.commander.socialStats.authority = o.authority;
  return s;
};
const unitWith = (tastes: string[] | undefined, kind: Unit['kind'] = 'named'): Pick<Unit, 'kind' | 'commanderTastes'> => ({ kind, ...(tastes ? { commanderTastes: tastes } : {}) });
const baseline = (trust = 30) => initialRelation({ trust, affinity: 0, attraction: 0, knowsCrime: false, since: 1 });
const FRAIL_GREEN = { body: [2, 1, 1] as [number, number, number], seasoning: 1, authority: 1 };
const regWithPresence = (rows: Array<[string, string, number]>): Registries => ({
  ...reg,
  presence: new Map(rows.map(([factor, key, presence]) => [`${factor}_${key}`, { id: `${factor}_${key}`, factor, key, presence } as Entry])),
});

describe('presenceOf', () => {
  it('presence of a frail green rank-1 commander is −12', () => {
    expect(presenceOf(withCommander(campaign(reg, 1), FRAIL_GREEN), reg)).toBe(-12);
  });

  it('an average, experienced rank-3 commander is +2', () => {
    expect(presenceOf(withCommander(campaign(reg, 1), { body: [3, 3, 3], seasoning: 3, authority: 3 }), reg)).toBe(2);
  });

  it('presence is clamped to ±15', () => {
    const big = regWithPresence([['archetype', 'hardened', 15], ['seasoning', '5', 15], ['authority', '5', 15]]);
    const s = withCommander(campaign(reg, 1), { body: [5, 5, 5], seasoning: 5, authority: 5 });
    expect(presenceOf(s, big)).toBe(15);
    const low = regWithPresence([['archetype', 'frail', -15], ['seasoning', '1', -15], ['authority', '1', -15]]);
    expect(presenceOf(withCommander(campaign(reg, 1), FRAIL_GREEN), low)).toBe(-15);
  });

  it('a missing row counts as 0', () => {
    expect(presenceOf(withCommander(campaign(reg, 1), FRAIL_GREEN), regWithPresence([]))).toBe(0);
  });
});

describe('firstImpressionWeight', () => {
  const at = (days: number, tau?: number): number => {
    const s = campaign(reg, 1);
    s.day = 1 + days;
    if (tau !== undefined) s.settings.firstImpressionTau = tau;
    return firstImpressionWeight(s, s.squad[0].id);
  };
  it('w(0)=1, w(7)≈0.368, w(21)≈0.050', () => {
    expect(at(0)).toBe(1);
    expect(at(7)).toBeCloseTo(0.3679, 3);
    expect(at(21)).toBeCloseTo(0.0498, 3);
  });
  it('tau comes from the setting', () => {
    expect(at(7, 14)).toBeCloseTo(Math.exp(-0.5), 5);
  });
  it('a unit the commander has not met yet weighs 1', () => {
    const s = campaign(reg, 1);
    expect(firstImpressionWeight(s, 'unit_nobody')).toBe(1);
  });
});

describe('matchedTastes', () => {
  it('matches archetypes, expression and seasoning ranges', () => {
    const s = withCommander(campaign(reg, 1), { body: [4, 3, 3], expression: 2, seasoning: 5 });
    const ids = (t: string[]) => matchedTastes(s, reg, unitWith(t)).map((e) => e.id);
    expect(ids(['respects_strength', 'wary_of_brutes', 'protective_of_frail'])).toEqual(['respects_strength', 'wary_of_brutes']);
    expect(ids(['drawn_to_feminine', 'drawn_to_masculine', 'drawn_to_androgynous'])).toEqual(['drawn_to_feminine']);
    expect(ids(['drawn_to_older', 'drawn_to_younger'])).toEqual(['drawn_to_older']);
    expect(ids(['indifferent_to_looks'])).toEqual(['indifferent_to_looks']);
  });
  it('ignores unknown ids and units without tastes', () => {
    const s = campaign(reg, 1);
    expect(matchedTastes(s, reg, unitWith(['no_such_taste']))).toEqual([]);
    expect(matchedTastes(s, reg, unitWith(undefined))).toEqual([]);
  });
});

describe('applyFirstImpression', () => {
  it('trust moves by the presence and nothing else without tastes', () => {
    const s = withCommander(campaign(reg, 1), FRAIL_GREEN);
    const rel = baseline(30);
    applyFirstImpression(s, reg, unitWith(undefined), rel);
    expect(rel.trust).toBe(18);
    expect([rel.affinity, rel.attraction]).toEqual([0, 0]);
  });

  it('a drawn_to_feminine unit gains attraction only with expression 1–2', () => {
    const attraction = (expression: number): number => {
      const rel = baseline();
      applyFirstImpression(withCommander(campaign(reg, 1), { expression }), reg, unitWith(['drawn_to_feminine']), rel);
      return rel.attraction;
    };
    expect([1, 2, 3, 4, 5].map(attraction)).toEqual([10, 10, 0, 0, 0]);
  });

  it('body and expression never change attraction without a taste', () => {
    for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) for (let c = 1; c <= 5; c++) for (let e = 1; e <= 5; e++) {
      const s = withCommander(campaign(reg, 1), { body: [a, b, c], expression: e });
      const rel = baseline();
      applyFirstImpression(s, reg, unitWith([]), rel);
      expect(rel.attraction).toBe(0);
    }
    expect(BODY_STATS).toHaveLength(3);
  });

  it('matched offsets add up and presenceMult scales the presence', () => {
    const s = withCommander(campaign(reg, 1), { body: [4, 4, 4], seasoning: 3, authority: 3 }); // fit +3, 0, authority 3 +2 = +5
    const rel = baseline(30);
    applyFirstImpression(s, reg, unitWith(['respects_strength']), rel); // trust +8, presence ×1.5 → round(7.5) = 8
    expect(rel.trust).toBe(30 + 8 + 8);
  });

  it('indifferent_to_looks cancels presence', () => {
    const s = withCommander(campaign(reg, 1), FRAIL_GREEN);
    const rel = baseline(30);
    applyFirstImpression(s, reg, unitWith(['indifferent_to_looks']), rel);
    expect(rel.trust).toBe(30);
  });

  it('axes are clamped and the loyalty band follows trust', () => {
    const s = withCommander(campaign(reg, 1), FRAIL_GREEN);
    const rel = baseline(15);
    applyFirstImpression(s, reg, unitWith(undefined), rel); // 15 − 12 = 3
    expect(rel.trust).toBe(3);
    expect(rel.loyaltyBand).toBe('breaking');
    const low = baseline(4);
    applyFirstImpression(s, reg, unitWith(['wary_of_brutes', 'respects_strength']), low);
    expect(low.trust).toBeGreaterThanOrEqual(0);
  });
});

describe('join sites', () => {
  it('buildCampaign applies the first impression to every starting unit', () => {
    const r = buildCampaign(
      { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann', { baseline: { trust: 30, affinity: 0, attraction: 0 } })],
        commander: { body: { strength: 1, endurance: 1, reflexes: 2 }, expression: 3, seasoning: 1, traits: { regular: [] } } },
      reg, { desireBondDefects: false, seed: 3 },
    );
    if (!r.ok) throw new Error(r.errors.join('; '));
    const s = r.state;
    const crimeAdjust = s.relations.unit_ann.trust - (30 + presenceOf(s, reg));
    expect(presenceOf(s, reg)).toBeLessThan(0);
    expect(Math.abs(crimeAdjust)).toBeLessThanOrEqual(10); // the crime's own starting_trust effect, nothing else
    expect(s.relations.unit_ann.metDay).toBe(1);
  });

  it('add_named applies the first impression on its join day', () => {
    const s = withCommander(campaign(reg, 2), { body: [4, 4, 4], seasoning: 3, authority: 3 });
    s.day = 6;
    s.world.incomingUnits = 1;
    const tastes = ['respects_strength', 'drawn_to_masculine'];
    const setup = unitSetup('Zed', { baseline: { trust: 20, affinity: 0, attraction: 5 }, tastes } as Partial<UnitSetup>);
    s.commander.expression = 5;
    const crime = reg.crimes.get(s.commander.crimeId!)!;
    expect(crime).toBeDefined();
    const without = run(s, reg, { type: 'squad/add_named', payload: { unit: { ...setup, tastes: [] } } }).state.relations.unit_zed;
    const r = run(s, reg, { type: 'squad/add_named', payload: { unit: setup } });
    expect(errors(r.events)).toEqual([]);
    const rel = r.state.relations.unit_zed;
    expect(rel.metDay).toBe(6);
    expect(r.state.squad.find((u) => u.id === 'unit_zed')!.commanderTastes).toEqual(tastes);
    // presence +5 (fit 3, seasoning 0, authority 3 +2) becomes round(5 × 1.5) = 8 with respects_strength, +8 trust from the taste
    expect(rel.trust - without.trust).toBe(8 + 8 - 5);
    expect(rel.attraction - without.attraction).toBe(10);
    expect(ofType(r.events, 'unit_joined')).toHaveLength(1);
  });

  it('a grunt recruit gets presence but no tastes', () => {
    const s = withCommander(campaign(reg, 2), FRAIL_GREEN);
    s.resources.credits = 200;
    const flat: Registries = regWithPresence([]);
    const withPresence = run(s, reg, { type: 'base/recruit_grunt', payload: {} });
    const noPresence = run(s, { ...reg, presence: flat.presence }, { type: 'base/recruit_grunt', payload: {} });
    expect(errors(withPresence.events)).toEqual([]);
    const idOf = (st: CampaignState) => st.squad.at(-1)!.id;
    const a = withPresence.state.relations[idOf(withPresence.state)];
    const b = noPresence.state.relations[idOf(noPresence.state)];
    expect(a.trust - b.trust).toBe(-12);
    expect(a.attraction).toBe(b.attraction);
    expect(withPresence.state.squad.at(-1)!.commanderTastes).toBeUndefined();
    expect(a.metDay).toBe(s.day);
  });
});

describe('unit tastes in a setup', () => {
  const profile = (tastes: unknown) => {
    const { baseline: _b, ...u } = unitSetup('Ann', { tastes } as Partial<UnitSetup>);
    return validateUnitProfile(u, 'Ann', reg, { desireBondDefects: false });
  };
  it('more than 3 tastes or an unknown taste is a setup error', () => {
    expect(profile(['respects_strength', 'wary_of_brutes', 'protective_of_frail', 'drawn_to_older'])).toEqual([expect.stringMatching(/at most 3 tastes/)]);
    expect(profile(['no_such_taste'])).toEqual([expect.stringMatching(/unknown taste "no_such_taste"/)]);
    expect(profile(['drawn_to_older', 'drawn_to_older'])).toEqual([expect.stringMatching(/chosen twice/)]);
    expect(profile('respects_strength')).toHaveLength(1);
  });
  it('up to 3 known tastes are valid, and an absent list is too', () => {
    expect(profile(['respects_strength', 'wary_of_brutes', 'drawn_to_older'])).toEqual([]);
    expect(profile(undefined)).toEqual([]);
    expect(validateSetup({ commanderName: 'V', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann', { tastes: ['x'] } as Partial<UnitSetup>)] }, reg, { desireBondDefects: false })
      .some((m) => m.includes('unknown taste'))).toBe(true);
  });
});
