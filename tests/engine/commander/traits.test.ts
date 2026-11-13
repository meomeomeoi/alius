import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/commander';
import { hasTraitEffect, traitEffects, traitIds } from '../../../src/engine/commander/traits';
import type { CommanderSetup } from '../../../src/engine/commander/profile';
import { applyFirstImpression } from '../../../src/engine/commander/presence';
import { buildCampaign } from '../../../src/engine/setup';
import { initialRelation } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const commander = (regular: string[], over: Partial<CommanderSetup> = {}, special?: string): CommanderSetup => ({
  body: { strength: 3, endurance: 3, reflexes: 2 }, expression: 3, seasoning: 3, traits: { regular, ...(special ? { special } : {}) }, ...over,
});
const build = (c: CommanderSetup, units = [unitSetup('Ann')], crimeId = 'mutiny'): CampaignState => {
  const r = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId, units, commander: c }, reg, { desireBondDefects: false, seed: 5 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const plain = (crimeId = 'mutiny') => build(commander([]), [unitSetup('Ann')], crimeId);

describe('trait readers', () => {
  it('traitIds, traitEffects and hasTraitEffect read the commander', () => {
    const s = build(commander(['old_wound', 'insomniac'], {}, 'vow_of_distance'));
    expect(traitIds(s)).toEqual(['old_wound', 'insomniac', 'vow_of_distance']);
    expect(traitEffects(s, reg, 'crisis_hp')).toEqual([{ type: 'crisis_hp', amount: -10 }]);
    expect(traitEffects(s, reg, 'sleepless_rank')).toEqual([{ type: 'sleepless_rank', stat: 'empathy', amount: -1 }]);
    expect(hasTraitEffect(s, reg, 'night_slot')).toBe(true);
    expect(hasTraitEffect(s, reg, 'no_romance')).toBe(true);
    expect(hasTraitEffect(s, reg, 'taste_attraction')).toBe(false);
  });

  it('a commander without P7 fields has no traits; unknown ids are skipped', () => {
    const s = campaign(reg, 1);
    delete s.commander.traits;
    expect(traitIds(s)).toEqual([]);
    expect(traitEffects(s, reg, 'night_slot')).toEqual([]);
    s.commander.traits = { regular: ['gone_from_the_pack'] };
    expect(traitEffects(s, reg, 'night_slot')).toEqual([]);
  });
});

describe('start-time effects', () => {
  it('field_medic starts Empathy at rank 2', () => {
    expect(plain().commander.socialStats.empathy).toBe(1);
    expect(build(commander(['field_medic'])).commander.socialStats.empathy).toBe(2);
  });

  it('social_rank never lowers a rank a start or crime already gave', () => {
    const s = build(commander(['street_raised']));
    expect(s.commander.socialStats.cunning).toBeGreaterThanOrEqual(2);
    const high = buildCampaign({ commanderName: 'V', startId: 'start_vesper', crimeId: 'mutiny', units: [], commander: commander(['field_medic']) }, reg, { desireBondDefects: false, seed: 5 });
    expect(high.ok).toBe(true);
  });

  it('old_wound starts one seasoning higher, capped at 5', () => {
    expect(build(commander(['old_wound'])).commander.seasoning).toBe(4);
    expect(build(commander(['old_wound'], { seasoning: 5 })).commander.seasoning).toBe(5);
  });

  it('street_raised lowers own corporation standing by 10, corporate_polish raises it by 10', () => {
    const own = (s: CampaignState) => s.world.factions[s.commander.corporationId!];
    const base = own(plain());
    expect(own(build(commander(['street_raised'])))).toBe(base - 10);
    expect(own(build(commander(['corporate_polish'])))).toBe(base + 10);
  });
});

describe('join-time effects', () => {
  const units = [
    unitSetup('Ann', { values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: -1, sacrifice: 0 } }),
    unitSetup('Bea', { values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 1, sacrifice: 0 } }),
    unitSetup('Cat'),
  ];
  const trust = (s: CampaignState) => ['unit_ann', 'unit_bea', 'unit_cat'].map((id) => s.relations[id].trust);

  it('corporate_polish lowers starting trust only for corporate − units', () => {
    const without = trust(build(commander([]), units));
    const withTrait = trust(build(commander(['corporate_polish']), units));
    expect(withTrait.map((t, i) => t - without[i])).toEqual([-10, 0, 0]);
  });

  it('pretty_face adds attraction only with a matched drawn_to taste', () => {
    const attraction = (traits: string[], expression: number, tastes: string[]): number => {
      const s = build(commander(traits, { expression }), [unitSetup('Ann', { tastes } as never)]);
      return s.relations.unit_ann.attraction;
    };
    const base = attraction([], 2, ['drawn_to_feminine']);
    expect(attraction(['pretty_face'], 2, ['drawn_to_feminine'])).toBe(base + 10);
    expect(attraction(['pretty_face'], 4, ['drawn_to_feminine'])).toBe(attraction([], 4, ['drawn_to_feminine'])); // taste not matched
    expect(attraction(['pretty_face'], 2, [])).toBe(attraction([], 2, [])); // no taste
    expect(attraction(['pretty_face'], 2, ['respects_strength'])).toBe(attraction([], 2, ['respects_strength'])); // not a drawn_to taste
  });

  it('a trait\'s join effects reach a later unit through applyFirstImpression', () => {
    const s = build(commander(['corporate_polish']));
    const rel = initialRelation({ trust: 40, affinity: 0, attraction: 0, knowsCrime: false });
    applyFirstImpression(s, reg, { commanderTastes: [], values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: -2, sacrifice: 0 } }, rel);
    const plainRel = initialRelation({ trust: 40, affinity: 0, attraction: 0, knowsCrime: false });
    applyFirstImpression(plain(), reg, { commanderTastes: [] }, plainRel);
    expect(rel.trust - plainRel.trust).toBe(-10); // same presence, only the trait's starting_trust differs
  });
});

describe('commander/set_profile applies start-time effects once', () => {
  it('the review modal\'s traits take effect and the file is closed', () => {
    const s0 = campaign(reg, 2);
    for (const k of ['body', 'bodyXp', 'expression', 'seasoning', 'traits', 'archetype', 'fileReviewed'] as const) delete s0.commander[k];
    const seeded = run(s0, reg, { type: 'commander/seed', payload: {} }).state;
    const own = seeded.commander.corporationId!;
    const standing = seeded.world.factions[own];
    const r = run(seeded, reg, { type: 'commander/set_profile', payload: { commander: commander(['street_raised', 'old_wound']) } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.commander.traits).toEqual({ regular: ['street_raised', 'old_wound'] });
    expect(r.state.commander.seasoning).toBe(4);
    expect(r.state.commander.socialStats.cunning).toBeGreaterThanOrEqual(2);
    expect(r.state.world.factions[own]).toBe(standing - 10);
    // existing units keep their Trust: join-time effects only touch later joiners
    expect(r.state.relations.unit_ann.trust).toBe(seeded.relations.unit_ann.trust);
  });

  it('an invalid trait set changes nothing', () => {
    const s0 = campaign(reg, 1);
    s0.commander.fileReviewed = false;
    const r = run(s0, reg, { type: 'commander/set_profile', payload: { commander: commander(['insomniac', 'old_wound', 'bookish']) } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s0);
  });
});
